import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { createServer } from '../server/index.js';

const token = 'test-private-feedback-token-at-least-32-characters';
const auth = { Authorization: `Bearer ${token}` };
const payload = (overrides = {}) => ({ id: randomUUID(), category: 'controls', content: '杀球时希望落点更清楚。', contact: '', context: { version: 'build-a', platform: 'Android', mode: 'practice' }, ...overrides });
async function setup(t, options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'rally-feedback-'));
  const file = path.join(dir, 'feedback.json');
  const app = createServer({ feedbackPath: file, feedbackAdminToken: token, ...options });
  await app.listen();
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  return { app, file, dir };
}
const post = (app, body, headers = {}) => fetch(`${app.url}/api/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const list = (app, suffix = '', headers = auth) => fetch(`${app.url}/api/feedback${suffix}`, { headers });

test('feedback is explicitly disabled until private storage and administrator token are configured', async t => {
  const app = createServer(); await app.listen(); t.after(() => app.close());
  assert.equal((await post(app, payload())).status, 503);
});

test('feedback persists before success, deduplicates retries, and rejects changed payloads reusing an id', async t => {
  const { app, file } = await setup(t); const body = payload();
  const first = await post(app, body); assert.equal(first.status, 201);
  assert.equal((await first.json()).id, body.id);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).items.length, 1);
  const retry = await post(app, body); assert.equal(retry.status, 200);
  assert.equal((await retry.json()).duplicate, true);
  assert.equal((await post(app, { ...body, content: '不同内容' })).status, 409);
  const result = await (await list(app)).json();
  assert.equal(result.items.length, 1); assert.equal(result.items[0].status, 'pending');
});

test('only authenticated administrators can read or change feedback, and data is never cached', async t => {
  const { app } = await setup(t); const body = payload(); await post(app, body);
  for (const headers of [{}, { Authorization: 'Bearer wrong' }]) {
    const res = await list(app, '', headers); assert.equal(res.status, 401); assert.equal(res.headers.get('cache-control'), 'no-store');
  }
  const endpoint = `${app.url}/api/feedback/${body.id}`;
  const patch = headers => fetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ status: 'resolved' }) });
  assert.equal((await patch({})).status, 401);
  assert.equal((await patch(auth)).status, 200);
  const res = await list(app, '?status=resolved'); assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal((await res.json()).items[0].status, 'resolved');
  assert.equal((await (await list(app, '?status=pending')).json()).items.length, 0);
  assert.equal((await fetch(app.url + '/data/feedback.json')).status, 404);
  const shell = await fetch(app.url + '/feedback-admin/'); assert.equal(shell.status, 200);
  const html = await shell.text(); assert.match(html, /登录/); assert.ok(!html.includes(token));
});

test('stored feedback and processing status survive a server restart', async t => {
  const { app, file } = await setup(t); const body = payload(); await post(app, body);
  await fetch(`${app.url}/api/feedback/${body.id}`, { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'processing' }) });
  const second = createServer({ feedbackPath: file, feedbackAdminToken: token }); await second.listen(); t.after(() => second.close());
  const item = (await (await list(second)).json()).items[0]; assert.equal(item.id, body.id); assert.equal(item.status, 'processing');
});

test('feedback validates category, limits fields, rejects extra identity fields and oversized requests', async t => {
  const { app } = await setup(t);
  for (const body of [payload({ content: '  ' }), payload({ category: 'unknown' }), payload({ content: '中'.repeat(4001) }), payload({ contact: 'x'.repeat(201) }), payload({ playerKey: 'private' }), payload({ context: { version: 'v1', room: 'ABCDE' } }), payload({ id: '../../file' })]) {
    assert.equal((await post(app, body)).status, 400);
  }
  assert.equal((await post(app, payload({ content: 'x'.repeat(20000) }))).status, 413);
  assert.equal((await fetch(app.url + '/api/feedback', { method: 'POST', body: '{}' })).status, 415);
});

test('feedback allows only configured public origins, and the admin API refuses cross-origin access', async t => {
  const { app } = await setup(t, { feedbackAllowedOrigins: ['https://game.example'] });
  assert.equal((await post(app, payload(), { Origin: 'https://evil.example' })).status, 403);
  const accepted = await post(app, payload(), { Origin: 'https://game.example' }); assert.equal(accepted.status, 201); assert.equal(accepted.headers.get('access-control-allow-origin'), 'https://game.example');
  const preflight = await fetch(app.url + '/api/feedback', { method: 'OPTIONS', headers: { Origin: 'https://game.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(preflight.status, 204);
  assert.equal((await list(app, '', { ...auth, Origin: 'https://game.example' })).status, 403);
  assert.equal((await list(app, '', { ...auth, Origin: app.url })).status, 200);
});

test('parallel retries create one durable record, with only one newly-created response', async t => {
  const { app, file } = await setup(t); const body = payload();
  const responses = await Promise.all(Array.from({ length: 6 }, () => post(app, body)));
  assert.equal(responses.filter(r => r.status === 201).length, 1);
  assert.equal(responses.filter(r => r.status === 200).length, 5);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).items.length, 1);
});

test('storage failure never returns submission success or leaves an in-memory phantom record', async t => {
  const { app, file } = await setup(t); await mkdir(file);
  assert.equal((await post(app, payload())).status, 503);
  assert.equal((await (await list(app)).json()).items.length, 0);
});

test('public feedback submissions are rate limited without trusting forwarded IP headers', async t => {
  const { app } = await setup(t); let last;
  for (let i = 0; i < 21; i++) last = await post(app, payload(), { 'X-Forwarded-For': `10.0.0.${i}` });
  assert.equal(last.status, 429); assert.ok(Number(last.headers.get('retry-after')) > 0);
});

test('reverse proxy admin origin requires explicit configuration and never trusts forwarded scheme', async t => {
  const { app } = await setup(t, { feedbackAdminOrigin: 'https://feedback.example' });
  const accepted = await list(app, '', { ...auth, Origin: 'https://feedback.example' }); assert.equal(accepted.status, 200);
  assert.equal((await list(app, '', { ...auth, Origin: 'https://evil.example', 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'evil.example' })).status, 403);
});

test('oversized chunked bodies get a JSON rejection and never break subsequent requests', async t => {
  const { app } = await setup(t);
  const response = await fetch(app.url + '/api/feedback', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, duplex: 'half',
    body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(17000))); controller.close(); } })
  });
  assert.equal(response.status, 413); assert.equal((await response.json()).ok, false);
  assert.equal((await post(app, payload())).status, 201);
});

test('aborted anonymous uploads leave the server healthy without writing a record', async t => {
  const { app } = await setup(t);
  await new Promise(resolve => {
    const req = http.request(app.url + '/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    req.on('error', () => resolve()); req.on('close', resolve); req.write('{'); setTimeout(() => req.destroy(), 15);
  });
  assert.equal((await fetch(app.url + '/health')).status, 200);
  assert.equal((await (await list(app)).json()).items.length, 0);
});

test('CORS errors remain readable to an allowed game and responses never disclose administrator secrets', async t => {
  const { app } = await setup(t, { feedbackAllowedOrigins: ['https://game.example'] });
  const response = await post(app, payload({ content: '' }), { Origin: 'https://game.example' });
  assert.equal(response.status, 400); assert.equal(response.headers.get('access-control-allow-origin'), 'https://game.example');
  const runtime = await (await fetch(app.url + '/runtime-config.js')).text(); assert.ok(!runtime.includes(token));
  assert.equal((await fetch(app.url + '/src/feedback-admin.js')).status, 404);
  assert.ok(!(await response.text()).includes(token));
});
