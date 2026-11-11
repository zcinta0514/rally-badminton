"""Exercise the CLI with real FFmpeg decoding and local MediaPipe inference."""
import argparse
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

import imageio_ffmpeg
from PIL import Image


CLI = Path(__file__).with_name("video_pose.py")
PTS_MS = [300, 400, 600, 900, 1300, 1800, 2400, 3100]


def make_fixture(sample, video):
    """Encode a still followed by blank frames with deliberately uneven PTS."""
    size = (640, 428)
    with Image.open(sample) as image:
        image = image.convert("RGB")
        image.thumbnail(size)
        still = Image.new("RGB", size)
        still.paste(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
    frames = still.tobytes() * 4 + bytes(size[0] * size[1] * 3) * 4
    subprocess.run(
        [
            imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error",
            "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", "640x428",
            "-framerate", "10", "-i", "pipe:0", "-vf", "setpts=N*(N+1)/2+3",
            "-fps_mode", "passthrough", "-enc_time_base", "1/1000", "-c:v", "libx264",
            "-pix_fmt", "yuv420p", "-g", "1", "-movflags", "+faststart", str(video),
        ],
        input=frames, check=True, capture_output=True, timeout=30,
    )


class VideoPoseTest(unittest.TestCase):
    model = None
    sample = None
    evidence = None

    @classmethod
    def setUpClass(cls):
        if cls.model is None or cls.sample is None:
            raise unittest.SkipTest("Run directly with --model and --sample to exercise the CLI")
        temp = tempfile.TemporaryDirectory(prefix="rally-pose-")
        cls.addClassCleanup(temp.cleanup)
        cls.root = Path(temp.name) / "测试 输入"
        cls.root.mkdir()
        cls.video = cls.root / "官方姿态 静止样例.mp4"
        make_fixture(cls.sample, cls.video)

    def run_cli(self, video, output):
        return subprocess.run(
            [sys.executable, "-X", "utf8", str(CLI), "--model", str(self.model),
             "--video", str(video), "--output", str(output)],
            capture_output=True, encoding="utf-8", errors="replace", timeout=45,
        )

    def test_real_vfr_decode_and_video_inference(self):
        output = self.root / "姿态结果.json"
        run = self.run_cli(self.video, output)
        self.assertEqual(run.returncode, 0, run.stderr)
        report = json.loads(output.read_text(encoding="utf-8"))
        frames = report["frames"]
        self.assertEqual(report["mode"], "VIDEO")
        self.assertEqual(report["frameCount"], 8)
        self.assertEqual(report["detectedFrameCount"], 4)
        self.assertEqual([f["frameIndex"] for f in frames], list(range(8)))
        self.assertEqual([f["timestampMs"] for f in frames], PTS_MS)
        self.assertEqual([f["inferenceTimestampMs"] for f in frames], [t - 300 for t in PTS_MS])
        self.assertEqual([f["poseCount"] for f in frames], [1] * 4 + [0] * 4)
        for frame in frames:
            self.assertEqual((frame["width"], frame["height"]), (640, 428))
            self.assertEqual(
                frame["sourcePts"] * Fraction(*frame["sourceTimeBase"]) * 1000,
                frame["timestampMs"],
            )
            for kind in ("landmarks", "worldLandmarks"):
                self.assertEqual(len(frame[kind]), frame["poseCount"])
                for pose in frame[kind]:
                    self.assertEqual(len(pose), 33)
                    for point in pose:
                        self.assertEqual(set(point), {"x", "y", "z", "visibility", "presence"})
                        for key in ("visibility", "presence"):
                            self.assertGreaterEqual(point[key], 0.0)
                            self.assertLessEqual(point[key], 1.0)
        if self.evidence:
            self.evidence.parent.mkdir(parents=True, exist_ok=True)
            evidence = {
                "scope": "Synthetic video of four repeated official stills and four blank frames. "
                         "Only decode, timestamp and inference plumbing were exercised.",
                "fixtureSource": "https://storage.googleapis.com/mediapipe-assets/pose.jpg",
                "fixtureSourceSha256": hashlib.sha256(self.sample.read_bytes()).hexdigest(),
                "fixtureCodec": "H.264 in fast-start MP4",
                "fixturePresentationTimesMs": PTS_MS,
                "report": report,
            }
            self.evidence.write_text(
                json.dumps(evidence, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8",
            )

    def test_missing_video_fails_without_output(self):
        output = self.root / "missing.json"
        run = self.run_cli(self.root / "absent.mp4", output)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("Video file", run.stderr)
        self.assertFalse(output.exists())
        self.assertEqual(run.stdout, "")

    def test_corrupt_video_leaves_existing_output_unchanged(self):
        corrupt = self.root / "corrupt.mp4"
        corrupt.write_bytes(b"not a video")
        output = self.root / "existing.json"
        output.write_text('{"previous":true}', encoding="utf-8")
        run = self.run_cli(corrupt, output)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("FFmpeg", run.stderr)
        self.assertEqual(output.read_text(encoding="utf-8"), '{"previous":true}')
        self.assertEqual(run.stdout, "")

    def test_truncated_video_fails_after_valid_frames_without_output(self):
        truncated = self.root / "truncated.mp4"
        source = self.video.read_bytes()
        truncated.write_bytes(source[:len(source) // 2])
        output = self.root / "truncated.json"
        run = self.run_cli(truncated, output)
        self.assertNotEqual(run.returncode, 0)
        self.assertRegex(run.stderr, r"FFmpeg decode failed after [1-9]\d* complete frames")
        self.assertFalse(output.exists())
        self.assertEqual(run.stdout, "")

    def test_packet_boundary_truncation_fails_even_when_ffmpeg_succeeds(self):
        source = self.video.read_bytes()
        sample_size_table = source.index(b"stsz") + 8
        default_size, sample_count = struct.unpack_from(">II", source, sample_size_table)
        self.assertEqual((default_size, sample_count), (0, 8))
        four_sizes = struct.unpack_from(">4I", source, sample_size_table + 8)
        media_data = source.index(b"mdat") + 4
        truncated = self.root / "boundary.mp4"
        truncated.write_bytes(source[:media_data + sum(four_sizes)])
        output = self.root / "boundary.json"
        run = self.run_cli(truncated, output)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("declared MP4 box exceeds file length", run.stderr)
        self.assertFalse(output.exists())
        self.assertEqual(run.stdout, "")

    def test_cannot_replace_input_video(self):
        before = self.video.read_bytes()
        run = self.run_cli(self.video, self.video)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("Output path", run.stderr)
        self.assertEqual(self.video.read_bytes(), before)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True, type=Path, help="MediaPipe Pose Landmarker model")
    parser.add_argument("--sample", required=True, type=Path, help="Official MediaPipe pose.jpg")
    parser.add_argument("--evidence", type=Path, help="Optional JSON report from the synthetic fixture")
    args = parser.parse_args()
    VideoPoseTest.model = args.model
    VideoPoseTest.sample = args.sample
    VideoPoseTest.evidence = args.evidence
    unittest.main(argv=[sys.argv[0]], verbosity=2)
