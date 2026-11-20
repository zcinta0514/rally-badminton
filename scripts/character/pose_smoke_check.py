"""Validate local CPU pose inference on an official sample; not a badminton quality test."""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import time
import mediapipe as mp
import numpy as np
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--model', required=True, type=Path)
parser.add_argument('--image', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
vision = mp.tasks.vision
options = vision.PoseLandmarkerOptions(
    base_options=mp.tasks.BaseOptions(model_asset_buffer=args.model.read_bytes()),
    running_mode=vision.RunningMode.IMAGE,
    num_poses=1,
)
started = time.perf_counter()
with vision.PoseLandmarker.create_from_options(options) as detector:
    with Image.open(args.image) as source:
        pixels = np.asarray(source.convert('RGB')).copy()
    result = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=pixels))
elapsed = time.perf_counter() - started
def encode(poses):
    return [[{key: getattr(p, key, None) for key in ('x', 'y', 'z', 'visibility', 'presence')} for p in pose] for pose in poses]
report = {
    'mediapipe': importlib.metadata.version('mediapipe'),
    'modelSha256': hashlib.sha256(args.model.read_bytes()).hexdigest(),
    'imageSha256': hashlib.sha256(args.image.read_bytes()).hexdigest(),
    'secondsIncludingStartup': elapsed,
    'poseCount': len(result.pose_landmarks),
    'landmarks': encode(result.pose_landmarks),
    'worldLandmarks': encode(result.pose_world_landmarks),
    'scope': 'Single official image CPU smoke check; no badminton, temporal stability or motion retargeting verified.'
}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')
if len(result.pose_landmarks) != 1 or len(result.pose_landmarks[0]) != 33:
    raise RuntimeError('Expected one person with 33 landmarks in the official sample')
print(json.dumps({k: v for k, v in report.items() if k not in ('landmarks', 'worldLandmarks')}, indent=2))
