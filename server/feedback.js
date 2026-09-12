import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

const categories = new Set(['controls', 'network', 'performance', 'suggestion', 'other']);
const statuses = new Set(['pending', 'processing', 'resolved']);
const idPattern = /^[a-zA-Z0-9_-]{16,80}$/;
const maxBytes = 16 * 1024;
const problem = (status, message) => Object.assign(new Error(message), { status });
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keysAllowed = (value, keys) => plain(value) && Object.keys(value).every(key => keys.includes(key));
const hash = value => createHash('sha256').update(value).digest();

function validateSubmission(value) {
  if (!keysAllowed(value, ['id', 'category', 'content', 'contact', 'context'])) throw problem(400, '反馈字段不正确。');
  if (typeof value.id !== 'string' || !idPattern.test(value.id)) throw problem(400, '提交编号不正确。');
  if (!categories.has(value.category)) throw problem(400, '请选择问题类型。');
  const field = (value, limit, required = false) => {
    if (value === undefined && !required) return '';
    if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) throw problem(400, '内容为空或超过长度限制。');
    return value.trim();
  };
  const context = value.context ?? {};
  if (!keysAllowed(context, ['version', 'platform', 'mode'])) throw problem(400, '附带信息不正确。');
  return { id: value.id, category: value.category, content: field(value.content, 4000, true), contact: field(value.contact, 200),
    context: { version: field(context.version, 80), platform: field(context.platform, 80), mode: field(context.mode, 40) } };
}

async function readJSON(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw problem(415, '请使用 JSON 提交。');
  if (Number(req.headers['content-length']) > maxBytes) throw problem(413, '提交内容过大。');
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw problem(413, '提交内容过大。');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw problem(400, '提交内容不是有效 JSON。'); }
}

class FeedbackStore {
  constructor(filePath) { this.filePath = path.resolve(filePath); this.items = []; this.queue = Promise.resolve(); }
  async load() {
    let parsed;
    try { parsed = JSON.parse(await readFile(this.filePath, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (parsed.schema !== 1 || !Array.isArray(parsed.items) || parsed.items.length > 10000) throw new Error('Invalid feedback storage; restore a valid backup before starting');
    const ids = new Set();
    for (const item of parsed.items) {
      validateSubmission({ id: item.id, category: item.category, content: item.content, contact: item.contact, context: item.context });
      if (ids.has(item.id) || !statuses.has(item.status) || !Number.isFinite(Date.parse(item.createdAt)) || !Number.isFinite(Date.parse(item.updatedAt))) throw new Error('Invalid stored feedback');
      ids.add(item.id);
    }
    this.items = parsed.items;
  }
  async persist(items) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify({ schema: 1, items }) + '\n', 'utf8'); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, this.filePath);
      this.items = items;
    } finally { await rm(temporary, { force: true }); }
  }
  transact(fn) {
    const job = this.queue.then(fn); this.queue = job.catch(() => {}); return job;
  }
  submit(submission) {
    return this.transact(async () => {
      const existing = this.items.find(item => item.id === submission.id);
      if (existing) {
        const previous = validateSubmission({ id: existing.id, category: existing.category, content: existing.content, contact: existing.contact, context: existing.context });
        if (JSON.stringify(previous) !== JSON.stringify(submission)) throw problem(409, '提交编号已使用，请保留原稿并重新提交。');
        return { id: existing.id, duplicate: true };
      }
      if (this.items.length >= 10000) throw problem(503, '反馈列表暂时已满，请稍后再试。');
      const now = new Date().toISOString();
      await this.persist([...this.items, { ...submission, status: 'pending', createdAt: now, updatedAt: now }]);
      return { id: submission.id, duplicate: false };
    });
  }
  update(id, status) {
    return this.transact(async () => {
      const index = this.items.findIndex(item => item.id === id);
      if (index < 0) throw problem(404, '这条反馈不存在。');
      const items = [...this.items]; items[index] = { ...items[index], status, updatedAt: new Date().toISOString() };
      await this.persist(items); return items[index];
    });
  }
}

export function createFeedbackService({ filePath = null, adminToken = '', allowedOrigins = [], adminOrigin = '', tls = false } = {}) {
  if (Boolean(filePath) !== Boolean(adminToken)) throw new Error('Feedback requires both feedbackPath and feedbackAdminToken');
  if (adminToken && (typeof adminToken !== 'string' || adminToken.length < 32)) throw new Error('Feedback administrator token must contain at least 32 characters');
  const validOrigin = value => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || value !== url.origin) throw new Error('Feedback origin must contain only scheme and host');
    return value;
  };
  const origins = new Set(allowedOrigins.map(validOrigin));
  if (adminOrigin) validOrigin(adminOrigin);
  const store = filePath ? new FeedbackStore(filePath) : null;
  const secretHash = adminToken ? hash(adminToken) : null;
  const buckets = new Map();
  function rate(req, type, limit, windowMs) {
    const now = Date.now();
    for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key);
    const key = `${type}:${req.socket.remoteAddress}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= 10000) throw problem(429, '请求较多，请稍后重试。');
      bucket = { count: 0, until: now + windowMs }; buckets.set(key, bucket);
    }
    if (++bucket.count > limit) throw Object.assign(problem(429, '提交过于频繁，请稍后重试。'), { retryAfter: Math.ceil((bucket.until - now) / 1000) });
  }
  const send = (res, status, value) => {
    const body = value === undefined ? '' : JSON.stringify(value);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) }); res.end(body);
  };
  async function handle(req, res, pathname) {
    const api = pathname === '/api/feedback' || pathname.startsWith('/api/feedback/');
    const adminPage = pathname === '/feedback-admin/' || pathname === '/feedback-admin' || pathname.startsWith('/feedback-admin/');
    if (!api && !adminPage) return false;
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Origin');
    try {
      if (!store) throw problem(503, '意见反馈尚未接通，内容可先保存在本机。');
      if (adminPage) {
        if (!['GET', 'HEAD'].includes(req.method)) throw problem(405, '不支持此请求方法。');
        const name = ({ '/feedback-admin/': 'feedback-admin.html', '/feedback-admin': 'feedback-admin.html', '/feedback-admin/admin.js': 'feedback-admin.js', '/feedback-admin/admin.css': 'feedback-admin.css' })[pathname];
        if (!name) throw problem(404, '页面不存在。');
        const body = await readFile(new URL(`../src/${name}`, import.meta.url));
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
        res.setHeader('X-Frame-Options', 'DENY');
        res.writeHead(200, { 'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', 'Content-Length': body.length }); res.end(req.method === 'HEAD' ? undefined : body); return true;
      }
      const publicWrite = pathname === '/api/feedback' && ['POST', 'OPTIONS'].includes(req.method);
      const origin = req.headers.origin;
      const sameOrigin = `${tls ? 'https' : 'http'}://${req.headers.host}`;
      if (origin && origin !== sameOrigin && origin !== adminOrigin && !(publicWrite && origins.has(origin))) throw problem(403, '此来源不允许访问反馈服务。');
      if (origin && publicWrite) res.setHeader('Access-Control-Allow-Origin', origin);
      if (publicWrite && req.method === 'OPTIONS') {
        if (req.headers['access-control-request-method'] !== 'POST' || (req.headers['access-control-request-headers'] || '').split(',').some(value => value.trim() && value.trim().toLowerCase() !== 'content-type')) throw problem(403, '不允许此跨站请求。');
        res.setHeader('Access-Control-Allow-Methods', 'POST'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); send(res, 204); return true;
      }
      if (publicWrite) {
        rate(req, 'submit', 20, 10 * 60 * 1000);
        const submission = validateSubmission(await readJSON(req));
        const result = await store.submit(submission); send(res, result.duplicate ? 200 : 201, { ok: true, ...result }); return true;
      }
      const supplied = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
      if (!supplied || !timingSafeEqual(hash(supplied), secretHash)) {
        rate(req, 'login', 10, 60 * 1000); res.setHeader('WWW-Authenticate', 'Bearer'); throw problem(401, '请使用正确的私人管理令牌登录。');
      }
      if (pathname === '/api/feedback' && req.method === 'GET') {
        const query = new URL(req.url, 'http://localhost').searchParams;
        const status = query.get('status') || '', category = query.get('category') || '';
        if ((status && !statuses.has(status)) || (category && !categories.has(category))) throw problem(400, '筛选条件不正确。');
        const items = store.items.filter(item => (!status || item.status === status) && (!category || item.category === category)).slice().reverse();
        send(res, 200, { items }); return true;
      }
      const id = pathname.slice('/api/feedback/'.length);
      if (pathname.startsWith('/api/feedback/') && idPattern.test(id) && req.method === 'PATCH') {
        const body = await readJSON(req);
        if (!keysAllowed(body, ['status']) || !statuses.has(body.status)) throw problem(400, '处理状态不正确。');
        send(res, 200, { item: await store.update(id, body.status) }); return true;
      }
      throw problem(405, '不支持此请求方法。');
    } catch (error) {
      if (error.retryAfter) res.setHeader('Retry-After', error.retryAfter);
      // Never echo submitted content, tokens, paths or raw storage errors.
      if (!res.headersSent) send(res, error.status || 503, { ok: false, message: error.status ? error.message : '反馈暂时无法保存，请保留草稿后重试。' });
      return true;
    }
  }
  return { enabled: Boolean(store), load: () => store?.load(), flush: () => store?.queue, handle };
}
