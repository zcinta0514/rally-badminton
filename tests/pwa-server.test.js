import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createServer } from '../server/index.js';

async function setup(t, options = {}) {
  const app = createServer(options); await app.listen();
  t.after(() => app.close()); return app;
}
async function accepts(url, origin) {
  const ws = new WebSocket(url.replace('http', 'ws') + '/ws', { origin });
  return new Promise(resolve => {
    ws.once('open', () => { ws.close(); resolve(true); });
    ws.once('error', () => resolve(false));
  });
}
test('PWA manifest, complete asset inventory and worker are served without exposing repository files', async t => {
  const app = await setup(t);
  const response = await fetch(app.url + '/manifest.webmanifest');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /manifest\+json/);
  const manifest = await response.json();
  assert.equal(manifest.display, 'standalone');
  const worker = await fetch(app.url + '/sw.js');
  assert.equal(worker.status, 200);
  assert.match(worker.headers.get('cache-control'), /no-cache/);
  assert.equal(worker.headers.get('service-worker-allowed'), '/');
  const source = await worker.text();
  for (const asset of ['/vendor/three.module.js','/vendor/three.core.js','/src/main.js','/shared/game.js','/runtime-config.js']) assert.ok(source.includes(asset));
  for (const icon of manifest.icons) assert.equal((await fetch(app.url + icon.src)).status, 200);
  for (const file of ['/package.json','/scripts/build-pwa.js','/server/index.js','/.env']) assert.equal((await fetch(app.url + file)).status, 404);
});
test('WebSocket origins compare scheme as well as host', async t => {
  const app = await setup(t);
  assert.equal(await accepts(app.url, app.url), true);
  assert.equal(await accepts(app.url, app.url.replace('http:', 'https:')), false);
  assert.equal(await accepts(app.url, 'https://evil.example'), false);
  assert.equal(await accepts(app.url, 'null'), false);
});
test('HTTPS reverse proxy and split client origins require explicit full origin allowlist', async t => {
  const app = await setup(t, {allowedOrigins: ['https://rally.example', 'https://play.example'], wsUrl: 'wss://rally.example/ws'});
  assert.equal(await accepts(app.url, 'https://rally.example'), true);
  assert.equal(await accepts(app.url, 'https://play.example'), true);
  assert.equal(await accepts(app.url, 'http://rally.example'), false);
  assert.equal(await accepts(app.url, app.url), false);
  const config = await (await fetch(app.url + '/runtime-config.js')).text();
  assert.match(config, /wss:\/\/rally\.example\/ws/);
});
test('invalid public origin or endpoint fails startup instead of silently weakening the guard', () => {
  assert.throws(() => createServer({allowedOrigins: ['*']}), /origin/i);
  assert.throws(() => createServer({allowedOrigins: ['https://play.example/path']}), /origin/i);
  assert.throws(() => createServer({wsUrl: 'https://rally.example/ws'}), /WebSocket/i);
  assert.throws(() => createServer({wsUrl: 'wss://user:password@rally.example/ws'}), /WebSocket/i);
});
test('public mode can reject non-browser clients with missing Origin', async t => {
  const app=await setup(t,{allowMissingOrigin:false});
  assert.equal(await accepts(app.url,undefined),false);
  assert.equal(await accepts(app.url,app.url),true);
});
