"""Render the two original lobby arrangements. Requires NumPy and FFmpeg."""

import argparse
import subprocess
from pathlib import Path

import numpy as np

RATE = 24000
TAU = 2 * np.pi
OUTPUT = Path(__file__).resolve().parents[1] / 'src' / 'audio'


def render(highlights):
    bpm = 88 if highlights else 80
    beat = 60 / bpm
    mix = np.zeros(round(RATE * beat * 64))
    rng = np.random.default_rng(22 if highlights else 19)
    chords = ((62, 66, 69, 73), (59, 62, 66, 69), (55, 59, 62, 66), (57, 61, 64, 69))
    motifs = ((78, 76, 73, 74), (78, 74, 76, 69), (71, 74, 78, 76), (73, 69, 71, 76))

    def add(at, wave, level):
        start = round(at * beat * RATE) % len(mix)
        end = min(len(mix) - start, len(wave))
        mix[start:start + end] += wave[:end] * level
        mix[:len(wave) - end] += wave[end:] * level

    def note(at, midi, beats, level, kind):
        time = np.arange(round(beats * beat * RATE)) / RATE
        phase = TAU * 440 * 2 ** ((midi - 69) / 12) * time
        if kind == 'pad':
            wave = np.sin(phase) + .36 * np.sin(phase * 1.003) + .17 * np.sin(phase * 2)
            attack, release, decay = .22, .35, .55
        elif kind == 'bass':
            wave = np.sin(phase) + .26 * np.sin(2 * phase)
            attack, release, decay = .013, .08, .2
        else:
            wave = np.sin(phase + .55 * np.sin(phase * 2) * np.exp(-time * 7)) + .16 * np.sin(phase * 2)
            attack, release, decay = .008, .13, 1.7
        env = np.minimum(time / attack, 1) * np.minimum((len(time) / RATE - time) / release, 1)
        add(at, wave * env * np.exp(-decay * time), level)

    for bar in range(16):
        chord = chords[bar % 4]
        start = bar * 4
        for pitch in chord[1:]:
            note(start, pitch, 4.32, .037, 'pad')
        note(start, chord[0] - 24, 1.7, .14, 'bass')
        note(start + 2.5, chord[0] - 12, .9, .075, 'bass')
        steps = (0, .5, 1.5, 2, 2.75, 3.5) if highlights else (0, 1.25, 2, 3.25)
        for index, step in enumerate(steps):
            note(start + step, chord[(index + bar // 4) % 4] + 12, 1.16, .09, 'keys')
        if 3 <= bar <= 13:
            for index, step in enumerate((.5, 1.5, 2.75, 3.5) if highlights else (.5, 2, 3.25)):
                note(start + step, motifs[bar % 4][index], .92, .051, 'keys')
        time = np.arange(round(.18 * RATE)) / RATE
        kick = np.sin(TAU * (53 * time + 2.3 * (1 - np.exp(-time * 37)))) * np.exp(-time * 24)
        for step in ((0, 2, 3.5) if highlights else (0, 2.5)):
            add(start + step, kick, .102 if highlights else .067)
        noise = rng.standard_normal(len(time))
        brush = (noise - np.roll(noise, 1)) * np.exp(-time * 70)
        for step in ((.5, 1, 1.5, 2.5, 3, 3.5) if highlights else (1.5, 3.5)):
            add(start + step, brush, .024 if highlights else .011)

    mix = mix + .14 * np.roll(mix, round(RATE * beat * .75)) + .07 * np.roll(mix, round(RATE * beat * 1.5))
    mix = np.tanh(mix * (.115 / np.sqrt(np.mean(mix ** 2))))
    return np.asarray(mix * 32767, dtype='<i2')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    args = parser.parse_args()
    for name, highlights in [('lobby-warmup', False), ('lobby-highlights', True)]:
        subprocess.run([args.ffmpeg, '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(RATE), '-ac', '1',
                        '-i', '-', '-c:a', 'libmp3lame', '-b:a', '64k', str(OUTPUT / (name + '.mp3'))],
                       input=render(highlights).tobytes(), check=True)
