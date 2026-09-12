import test from 'node:test';
import assert from 'node:assert/strict';
const module = await import('../src/feedback.js').catch(() => ({}));
const storage = () => { const entries = new Map(); return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) }; };
const fields = { category: 'controls', content: '杀球手感需要调整', contact: '' };
function client(options = {}) { assert.equal(typeof module.createFeedbackClient, 'function', 'feedback client exists'); return module.createFeedbackClient({ storage: storage(), getEndpoint: () => '/api/feedback', getContext: () => ({ version: 'build-a', platform: 'Android', mode: 'practice', playerKey: 'must-not-send', roomCode: 'ABCDE' }), ...options }); }

test('unconfigured static feedback keeps a draft and never pretends to send it', async () => {
  let calls = 0; const c = client({ getEndpoint: () => '', fetcher: () => { calls++; } }); c.saveDraft(fields);
  await assert.rejects(c.submit(), /尚未接通/); assert.equal(calls, 0); assert.equal(c.readDraft().content, fields.content);
});

test('failed feedback survives client reload and retries the exact id and public context', async () => {
  const disk = storage(); let first;
  const one = client({ storage: disk, fetcher: async (url, options) => { first = JSON.parse(options.body); throw new Error('offline'); } });
  one.saveDraft(fields); await assert.rejects(one.submit());
  let retried;
  const two = client({ storage: disk, getContext: () => ({ version: 'new-version' }), fetcher: async (url, options) => { retried = JSON.parse(options.body); return new Response(JSON.stringify({ ok: true, id: retried.id }), { status: 200 }); } });
  assert.equal(two.readDraft().content, fields.content); await two.submit(); assert.deepEqual(retried, first);
  assert.deepEqual(Object.keys(retried.context).sort(), ['mode', 'platform', 'version']); assert.equal(two.readDraft().content, '');
});

test('HTTP success without matching durable acknowledgement leaves the draft intact', async () => {
  const c = client({ fetcher: async () => new Response(JSON.stringify({ ok: true, id: 'wrong-id' }), { status: 200 }) }); c.saveDraft(fields);
  await assert.rejects(c.submit(), /确认/); assert.equal(c.readDraft().content, fields.content);
});

test('editing a failed submission creates a new id while an unchanged retry preserves it', async () => {
  const c = client({ fetcher: async () => { throw new Error('offline'); } }); const first = c.saveDraft(fields); await assert.rejects(c.submit());
  const unchanged = c.saveDraft(fields); assert.equal(unchanged.id, first.id);
  const edited = c.saveDraft({ ...fields, content: '新的内容' }); assert.notEqual(edited.id, first.id);
});

test('client accepts only HTTPS public endpoints or the exact local feedback path', async () => {
  for (const endpoint of ['http://remote.example/api/feedback', 'https://user:secret@remote.example/api/feedback', '//evil.example/api/feedback', '/api/feedback?token=secret', 'javascript:alert(1)']) {
    const c = client({ getEndpoint: () => endpoint, fetcher: () => assert.fail('invalid destination must not be contacted') }); c.saveDraft(fields); await assert.rejects(c.submit(), /地址/);
  }
});
