"""Extract MediaPipe landmarks from a local video using the CHAR-00 pose environment."""
import argparse
from collections import deque
from contextlib import closing
from fractions import Fraction
import hashlib
import json
import os
from pathlib import Path
from queue import Empty, SimpleQueue
import re
import struct
import subprocess
import sys
import tempfile
from threading import Thread

import imageio_ffmpeg
import mediapipe as mp
import numpy as np


TIME_BASE = re.compile(r"config in time_base: (\d+)/(\d+)")
FRAME_TIMING = re.compile(r"\bn:\s*(\d+)\s+pts:\s*(-?\d+)\s")


def collect_timing(stderr, timings, messages):
    """Drain FFmpeg's second pipe while the main thread reads decoded images."""
    time_base = None
    try:
        for raw in stderr:
            line = raw.decode("utf-8", errors="replace").strip()
            if not line.startswith("[Parsed_showinfo_"):
                messages.append(line[:500])
                continue
            if match := TIME_BASE.search(line):
                time_base = Fraction(int(match[1]), int(match[2]))
            if match := FRAME_TIMING.search(line):
                if not time_base:
                    raise ValueError("missing video time base")
                timings.put((int(match[1]), int(match[2]), time_base))
    except Exception as error:
        timings.put(error)
        # Keep draining so an invalid metadata line cannot block the decoder.
        for _ in stderr:
            pass
    finally:
        timings.put(None)


def decode_frames(ffmpeg, video):
    command = [
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "info", "-nostats",
        "-xerror", "-copyts", "-protocol_whitelist", "file", "-err_detect", "explode",
        "-i", str(video), "-map", "0:V:0", "-vf", "showinfo=checksum=0",
        "-fps_mode", "passthrough", "-c:v", "ppm", "-f", "image2pipe", "pipe:1",
    ]
    with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as process:
        timings = SimpleQueue()
        messages = deque(maxlen=18)
        reader = Thread(target=collect_timing, args=(process.stderr, timings, messages))
        reader.start()
        frame_index = 0
        try:
            while magic := process.stdout.readline(16):
                if magic != b"P6\n":
                    raise ValueError("FFmpeg returned an invalid RGB frame header")
                width, height = map(int, process.stdout.readline(64).split())
                if width < 1 or height < 1 or process.stdout.readline(16) != b"255\n":
                    raise ValueError("FFmpeg returned invalid RGB frame dimensions or depth")
                size = width * height * 3
                pixels = process.stdout.read(size)
                if len(pixels) != size:
                    raise ValueError("FFmpeg returned a partial RGB frame")
                try:
                    timing = timings.get(timeout=15)
                except Empty as error:
                    raise ValueError(f"FFmpeg timed out reporting presentation timing for frame {frame_index}") from error
                if isinstance(timing, Exception):
                    raise ValueError(f"FFmpeg timing error: {timing}")
                if timing is None or timing[0] != frame_index:
                    raise ValueError(f"FFmpeg is missing matching presentation timing for frame {frame_index}")
                _, pts, time_base = timing
                yield pts, time_base, np.frombuffer(pixels, dtype=np.uint8).reshape(height, width, 3)
                frame_index += 1

            code = process.wait()
            reader.join()
            if code:
                detail = "\n".join(messages)
                raise ValueError(f"FFmpeg decode failed after {frame_index} complete frames (exit {code}).\n{detail}")
            if timings.get() is not None:
                raise ValueError("FFmpeg reported presentation timestamps without corresponding decoded frames")
            if not frame_index:
                raise ValueError("FFmpeg decoded zero video frames")
        finally:
            if process.poll() is None:
                process.kill()
            reader.join()


def encode_poses(poses):
    fields = ("x", "y", "z", "visibility", "presence")
    return [[{field: getattr(point, field) for field in fields} for point in pose] for pose in poses]


def check_mp4_bounds(video):
    """Detect partial MP4/MOV boxes, including packet-aligned truncation."""
    with video.open("rb") as source:
        if video.suffix.lower() not in {".mp4", ".mov", ".m4v", ".3gp", ".3g2", ".qt"}:
            if source.read(8)[4:] != b"ftyp":
                return
        end = os.fstat(source.fileno()).st_size
        offset = 0
        while offset < end:
            source.seek(offset)
            header = source.read(8)
            if len(header) != 8:
                raise ValueError(f"Incomplete MP4 box header at byte {offset}")
            size, box_type = struct.unpack(">I4s", header)
            header_size = 8
            if size == 0:
                # The format explicitly permits an open-ended box to reach EOF.
                break
            if size == 1:
                extended = source.read(8)
                if len(extended) != 8:
                    raise ValueError(f"Incomplete MP4 extended box size at byte {offset}")
                size, = struct.unpack(">Q", extended)
                header_size = 16
            if size < header_size:
                raise ValueError(f"Invalid MP4 box size at byte {offset}")
            if offset + size > end:
                raise ValueError(f"The declared MP4 box exceeds file length at byte {offset} ({box_type!r})")
            offset += size


def extract(video, model, output):
    video, model, output = (path.resolve() for path in (video, model, output))
    if not video.is_file():
        raise ValueError(f"Video file does not exist: {video}")
    if output in (video, model):
        raise ValueError("Output path must differ from the video and the model")

    model_bytes = model.read_bytes()
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    with video.open("rb") as source:
        video_sha256 = hashlib.file_digest(source, "sha256").hexdigest()
    metadata = {
        "schemaVersion": 1,
        "mode": "VIDEO",
        "mediapipe": mp.__version__,
        "ffmpeg": imageio_ffmpeg.get_ffmpeg_version(),
        "videoName": video.name,
        "videoSha256": video_sha256,
        "modelSha256": hashlib.sha256(model_bytes).hexdigest(),
        "maxPoses": 1,
        "confidenceThresholds": {"detection": 0.5, "presence": 0.5, "tracking": 0.5},
        "decodePolicy": (
            "Decodes the first video stream, rejects FFmpeg errors, and checks declared MP4/MOV "
            "box sizes. A file without a declared extent can present an early EOF as a clean end."
        ),
        "timestampPolicy": (
            "sourcePts × sourceTimeBase is the decoded stream presentation time in seconds. "
            "timestampMs uses that origin. inferenceTimestampMs is rebased to the first frame, "
            "rounded to milliseconds, then advanced when necessary for strict monotonicity."
        ),
        "landmarkPolicy": (
            "Landmark arrays use MediaPipe's 33-point order. x and y in landmarks are normalized "
            "by decoded image dimensions. visibility and presence are per-landmark scores. "
            "Empty arrays record frames with no detection."
        ),
        "identityPolicy": "Pose arrays describe each frame. The detector supplies no stable person IDs.",
        "worldLandmarkPolicy": (
            "worldLandmarks are monocular body-relative estimates in meters with the hip midpoint "
            "as origin. They provide neither global motion trajectory nor retargeted animation."
        ),
    }
    vision = mp.tasks.vision
    options = vision.PoseLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_buffer=model_bytes),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    frame_count = detected_count = 0
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=output.parent, prefix=".video-pose-",
            suffix=".tmp", delete=False,
        ) as report:
            temporary_path = Path(report.name)
            # Stream the frame array so memory usage does not grow with clip duration.
            report.write(json.dumps(metadata, ensure_ascii=False)[:-1] + ', "frames": [\n')
            previous_time = first_time = None
            last_inference_ms = -1
            with vision.PoseLandmarker.create_from_options(options) as detector:
                with closing(decode_frames(ffmpeg, video)) as decoded:
                    for index, (pts, time_base, pixels) in enumerate(decoded):
                        timestamp = pts * time_base
                        if index == 0:
                            first_time = timestamp
                        elif timestamp < previous_time:
                            raise ValueError(f"Video presentation time went backwards at frame {index}")
                        inference_ms = max(round((timestamp - first_time) * 1000), last_inference_ms + 1)
                        result = detector.detect_for_video(
                            mp.Image(image_format=mp.ImageFormat.SRGB, data=pixels), inference_ms,
                        )
                        pose_count = len(result.pose_landmarks)
                        frame = {
                            "frameIndex": index,
                            "sourcePts": pts,
                            "sourceTimeBase": [time_base.numerator, time_base.denominator],
                            "timestampMs": float(timestamp * 1000),
                            "inferenceTimestampMs": inference_ms,
                            "width": pixels.shape[1],
                            "height": pixels.shape[0],
                            "poseCount": pose_count,
                            "landmarks": encode_poses(result.pose_landmarks),
                            "worldLandmarks": encode_poses(result.pose_world_landmarks),
                        }
                        if index:
                            report.write(",\n")
                        json.dump(frame, report, allow_nan=False)
                        previous_time, last_inference_ms = timestamp, inference_ms
                        frame_count += 1
                        detected_count += bool(pose_count)
            # FFmpeg can report success on EOF between complete packets of a cut MP4.
            check_mp4_bounds(video)
            report.write(f'\n], "frameCount": {frame_count}, "detectedFrameCount": {detected_count}' + "}\n")
        os.replace(temporary_path, output)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)

    return {"frameCount": frame_count, "detectedFrameCount": detected_count}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", required=True, type=Path, help="Local video file")
    parser.add_argument("--model", required=True, type=Path, help="MediaPipe Pose Landmarker .task file")
    parser.add_argument("--output", required=True, type=Path, help="Landmark JSON to write")
    args = parser.parse_args()
    try:
        summary = extract(args.video, args.model, args.output)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"video_pose: {error}", file=sys.stderr)
        return 1
    print(json.dumps(summary))
    return 0


if __name__ == "__main__":
    sys.exit(main())
