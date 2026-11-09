#!/usr/bin/env python3
"""Rebuild NET-2 material Foley; source is a CC0 cloth tear, not a net recording.
Download https://bigsoundbank.com/UPLOAD/bwf-en/0013.wav to
artifacts/net-2/audio-source/0013.wav before running. Requires ffmpeg.
"""
from pathlib import Path
import hashlib
import subprocess

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'artifacts/net-2/audio-source/0013.wav'
SOURCE_SHA256 = '7427de6e911d52a966c8a1106c160358f8703e71689637b7e86add909a8ff91e'

if __name__ == '__main__':
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError('Cloth source SHA256 mismatch')
    for name, start, duration, low in [('net-mesh', .103, .16, 3400), ('net-tape', .795, .22, 2600)]:
        output = ROOT / 'src/audio' / (name + '.wav')
        filters = f'highpass=f=130,lowpass=f={low},afade=t=in:d=0.002,afade=t=out:st={duration-.06}:d=0.06,alimiter=limit=0.8:level=false'
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(start),
                        '-t', str(duration), '-i', str(SOURCE), '-ac', '1', '-ar', '22050',
                        '-af', filters, '-c:a', 'pcm_s16le', str(output)], check=True)
        print(output.name, hashlib.sha256(output.read_bytes()).hexdigest())
