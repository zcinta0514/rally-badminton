# Third-party notices

The original game code, procedural models, generated icons, and any synthesized
audio in this repository are provided under the MIT license in `LICENSE`.
The recorded WAV sounds in `src/audio/` are CC0 1.0 Universal; their source
credits, license URLs and processing details are in `src/audio/LICENSE.txt`.
The project does not include NBA 2K models, commercial motion capture packs,
or other extracted game assets. Procedural animation is not motion capture.

| Dependency | Version | Upstream | Installed MIT license |
| --- | --- | --- | --- |
| Three.js | 0.185.1 | https://github.com/mrdoob/three.js | `node_modules/three/LICENSE` |
| ws | 8.21.3 | https://github.com/websockets/ws | `node_modules/ws/LICENSE` |
| PeerJS | 1.5.5 | https://github.com/peers/peerjs | `node_modules/peerjs/LICENSE` |

`npm ci` installs these notices with the dependencies. The static build also
ships the complete Three.js license as `vendor/three.LICENSE.txt`. The ws
package runs on the server and is not included in the browser bundle. Retain
upstream notices when redistributing installed dependencies or server images.
The browser build also includes PeerJS and its notice at `vendor/peerjs.LICENSE.txt`.
The bundled dependencies' notices are retained in `vendor/peerjs-dependencies.LICENSE.txt`.
PeerJS uses its public PeerServer Cloud for connection signaling; this is an
external service, not a private API key bundled with the game. Match simulation
and game data run between the connected players' browsers.

## Recorded game audio

All recordings below are available under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
The [BigSoundBank license statement](https://bigsoundbank.com/licenses.html) and
individual source pages were verified on 2026-09-09. Credits are retained even
though CC0 does not require attribution. The build includes `src/audio/LICENSE.txt`.

| Game files | Original recording and recordist | Source |
| --- | --- | --- |
| `hit-1.wav`, `hit-2.wav`, `smash-1.wav` | Badminton: racket shuttlecock — Joseph SARDIN | https://bigsoundbank.com/badminton-racket-shuttlecock-s0537.html |
| `squeak-1.wav`, `squeak-2.wav` | Gnashing basketball (indoor shoe friction) — ThibaudVaerman | https://bigsoundbank.com/grincements-basket-s0938.html |
| `step-1.wav` | Man Footsteps on the Wooden Floor — DavidGreck | https://bigsoundbank.com/man-footsteps-on-the-wooden-floor-s0165.html |
| `applause.wav` | Applause #1 — Dorian CLAIR | https://bigsoundbank.com/applause-1-s2363.html |
| `cheer.wav` | Shouts and Applauses of Teens #1 — DenisChardonnet | https://bigsoundbank.com/shouts-and-applauses-of-teens-1-s0236.html |

Edits: short isolated crops, mono downmix where needed, DC/low-rumble removal,
edge fades, peak normalization and PCM16 resampling. The generic wooden-floor
footstep also has a gentle low-pass filter. No synthetic tones or pitch shifts
were added. The strongest real badminton take serves as the game's smash sound;
the source does not label its individual stroke types. The shoe friction and
generic studio footstep are not claimed to be recordings of a badminton match.
`scripts/prepare-recorded-audio.py` records exact crops and original hashes.
