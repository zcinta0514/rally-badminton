// Rasterize the project's existing vector brand into PNG without dependencies.
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { projectRoot } from './build-pwa.js';
import path from 'node:path';
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function inside(x, y, points) {
  let value = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if (((a[1] > y) !== (b[1] > y)) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) value = !value;
  }
  return value;
}
function png(size) {
  const raw = Buffer.alloc(size * (1 + size * 3));
  const polygons = [[[8,29],[23,7],[29,7],[14,29]], [[19,29],[31,11],[36,11],[24,29]]];
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    let white = 0;
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      const x = (((col + (sx + .5) / 3) / size * 128) - 26) / 2;
      const y = (((row + (sy + .5) / 3) / size * 128) - 24) / 2;
      if ((x-10)**2 + (y-32)**2 < 16 || polygons.some(points => inside(x,y,points))) white++;
    }
    const at = row * (size * 3 + 1) + 1 + col * 3;
    for (let channel = 0; channel < 3; channel++) raw[at + channel] = Math.round([0,134,80][channel] * (1 - white/9) + 255 * white/9);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
await mkdir(path.join(projectRoot, 'icons'), { recursive: true });
for (const [file, size] of [['rally-192.png',192],['rally-512.png',512],['apple-touch-icon.png',180]]) await writeFile(path.join(projectRoot, 'icons', file), png(size));
