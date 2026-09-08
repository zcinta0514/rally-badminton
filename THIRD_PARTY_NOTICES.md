# Third-party notices

The original game code, procedural models, generated icons, and synthesized
audio in this repository are provided under the MIT license in `LICENSE`.
The project does not include NBA 2K models, commercial motion capture packs,
or other extracted game assets. Procedural animation is not motion capture.

| Dependency | Version | Upstream | Installed MIT license |
| --- | --- | --- | --- |
| Three.js | 0.185.1 | https://github.com/mrdoob/three.js | `node_modules/three/LICENSE` |
| ws | 8.21.3 | https://github.com/websockets/ws | `node_modules/ws/LICENSE` |

`npm ci` installs these notices with the dependencies. The static build also
ships the complete Three.js license as `vendor/three.LICENSE.txt`. The ws
package runs on the server and is not included in the browser bundle. Retain
upstream notices when redistributing installed dependencies or server images.
