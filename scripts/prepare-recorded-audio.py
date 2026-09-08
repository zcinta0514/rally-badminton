"""Reproduce the recorded game sounds; not part of the application build.

Requires Python, NumPy and SciPy. Put the four original BWF files in
artifacts/audio-sources/ using the direct URLs in src/audio/LICENSE.txt, then run
    python scripts/prepare-recorded-audio.py
The script checks original file hashes and makes compact mono PCM16 WAV clips.
It does not synthesize or pitch-shift any sound.
"""

from pathlib import Path
import hashlib
import json
import math
import wave

import numpy as np
from scipy.signal import butter, lfilter, resample_poly

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'artifacts' / 'audio-sources'
OUTPUT = ROOT / 'src' / 'audio'
HASHES = {
    '0537': '8c367226acc6dd64b26527aa0b1c31146270165f956698d912a95d47cf3a4a2a',
    '0165': 'ed4009d9d94b0aa8d87b2ec6209c72edbe8d1ae45b667f2e9a723d3096addad8',
    '2363': '4463eecdc564dbf3bcab063d069e30aae9c115d3d7943d1b6b5ffa1e05699cea',
    '0236': '13deb4e0731d149f9b2db3feca864e1a71351e4e3a74d797e8b1084f95315556',
}

# filename, original, crop start/end seconds, output Hz, peak, fade in/out sec,
# high-pass Hz, optional low-pass Hz. The strongest badminton take is assigned
# to smash in the game; the recordist did not label separate stroke types.
CLIPS = [
    ('hit-1.wav', '0537', .105, .395, 44100, .78, .001, .035, 75, None),
    ('hit-2.wav', '0537', 5.680, 5.970, 44100, .78, .001, .035, 75, None),
    ('smash-1.wav', '0537', 2.760, 3.090, 44100, .90, .001, .040, 75, None),
    ('step-1.wav', '0165', 3.530, 3.790, 44100, .55, .002, .050, 60, 3000),
    ('applause.wav', '2363', .670, 1.470, 22050, .68, .040, .200, 110, None),
    ('cheer.wav', '0236', .005, 1.105, 22050, .74, .015, .230, 100, None),
]


def read_pcm(path):
    with wave.open(str(path), 'rb') as original:
        rate = original.getframerate()
        width = original.getsampwidth()
        channels = original.getnchannels()
        raw = original.readframes(original.getnframes())
    if width == 3:
        data = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        data = data[:, 0] | (data[:, 1] << 8) | (data[:, 2] << 16)
        data = ((data ^ 0x800000) - 0x800000).astype(np.float64) / 8388608
    elif width == 2:
        data = np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768
    else:
        raise ValueError(f'Unsupported source PCM width: {width}')
    return rate, data.reshape(-1, channels).mean(axis=1)


def main():
    recordings = {}
    for ident, digest in HASHES.items():
        path = SOURCES / f'{ident}.wav'
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError(f'Original recording changed: {path.name}')
        recordings[ident] = read_pcm(path)

    OUTPUT.mkdir(parents=True, exist_ok=True)
    report = []
    for name, ident, start, end, rate, peak, fade_in, fade_out, high, low in CLIPS:
        source_rate, original = recordings[ident]
        samples = original[round(start * source_rate):round(end * source_rate)].copy()
        samples -= samples.mean()
        # Gentle rumble removal; an optional low-pass softens the footstep only.
        b, a = butter(2, high / (source_rate / 2), btype='highpass')
        samples = lfilter(b, a, samples)
        if low:
            b, a = butter(2, low / (source_rate / 2), btype='lowpass')
            samples = lfilter(b, a, samples)
        divisor = math.gcd(rate, source_rate)
        samples = resample_poly(samples, rate // divisor, source_rate // divisor)
        # Match the declared duration exactly (polyphase rounding can add one
        # output frame); the edge fades finish within the playback duration.
        samples = samples[:round((end - start) * rate)]
        fade_in_frames, fade_out_frames = round(fade_in * rate), round(fade_out * rate)
        samples[:fade_in_frames] *= np.linspace(0, 1, fade_in_frames)
        samples[-fade_out_frames:] *= np.linspace(1, 0, fade_out_frames)
        samples *= peak / np.max(np.abs(samples))
        pcm = np.rint(samples * 32767).astype('<i2')
        with wave.open(str(OUTPUT / name), 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(rate)
            wav.writeframes(pcm.tobytes())
        report.append({
            'file': name,
            'source': f'{ident}.wav',
            'crop_seconds': [start, end],
            'sample_rate': rate,
            'duration_seconds': round(len(pcm) / rate, 6),
            'bytes': (OUTPUT / name).stat().st_size,
            'peak_dbfs': round(20 * math.log10(np.max(np.abs(pcm.astype(float))) / 32768), 2),
            'clipped_samples': int(np.sum(np.abs(pcm.astype(np.int32)) >= 32767)),
            'sha256': hashlib.sha256((OUTPUT / name).read_bytes()).hexdigest(),
        })
    (SOURCES / 'processed-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))
    print('Total audio bytes:', sum(item['bytes'] for item in report))


if __name__ == '__main__':
    main()
