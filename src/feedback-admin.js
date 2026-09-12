const $ = selector => document.querySelector(selector);
const categories = { controls: '操作手感', network: '联机', performance: '画面性能', suggestion: '功能建议', other: '其他' };
const statuses = { pending: '待处理', processing: '处理中', resolved: '已处理' };
let token = '', items = [], selectedId = '', generation = 0;
const notice = (message, error = false) => { $('#notice').textContent = message; $('#notice').classList.toggle('error', error); };
function element(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
function logout(message = '已退出登录。') {
  token = ''; items = []; selectedId = ''; generation++;
  $('#token').value = ''; $('#login-form').hidden = false; $('#inbox').hidden = true; $('#logout').hidden = true;
  $('#items').replaceChildren(); $('#detail').replaceChildren(element('p', '选择一条反馈查看内容。', 'muted')); notice(message);
}
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }, cache: 'no-store', credentials: 'omit' });
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401) { logout('管理密码不正确或已更换，请重新登录。'); throw new Error('管理密码不正确或已更换，请重新登录。'); }
    throw new Error(body.message || '请求失败，请稍后重试。');
  }
  return body;
}
const date = value => new Date(value).toLocaleString('zh-CN', { hour12: false });
function showDetail(item) {
  selectedId = item.id;
  for (const button of $('#items').children) button.setAttribute('aria-pressed', String(button.dataset.id === item.id));
  const detail = $('#detail'); detail.replaceChildren(element('h2', categories[item.category] || '反馈'), element('p', item.content, 'content'));
  const metadata = element('dl', undefined, 'metadata');
  for (const [key, value] of [['提交时间', date(item.createdAt)], ['更新时间', date(item.updatedAt)], ['联系方式', item.contact || '未提供'], ['游戏版本', item.context.version || '未提供'], ['运行平台', item.context.platform || '未提供'], ['当前玩法', item.context.mode || '未提供'], ['反馈编号', item.id]]) {
    metadata.append(element('dt', key), element('dd', value));
  }
  detail.append(metadata);
  const actions = element('div', undefined, 'actions'), label = element('label', '处理状态'), select = element('select');
  for (const [value, text] of Object.entries(statuses)) { const option = element('option', text); option.value = value; select.append(option); }
  select.value = item.status; label.append(select);
  const save = element('button', '保存状态', 'primary');
  save.addEventListener('click', async () => {
    save.disabled = true; const current = generation;
    try {
      await request(`/api/feedback/${encodeURIComponent(item.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: select.value }) });
      if (current !== generation) return;
      await refresh(); notice('处理状态已保存。');
    } catch (error) { if (current === generation) notice(error.message, true); } finally { save.disabled = false; }
  });
  actions.append(label, save); detail.append(actions);
}
function render() {
  const container = $('#items'); container.replaceChildren(); $('#count').textContent = `${items.length} 条反馈`;
  if (!items.length) { container.append(element('p', '当前筛选下没有反馈。', 'empty')); $('#detail').replaceChildren(element('p', '选择一条反馈查看内容。', 'muted')); return; }
  for (const item of items) {
    const button = element('button', undefined, 'item'); button.dataset.id = item.id;
    button.append(element('span', `${statuses[item.status]} · ${categories[item.category]}`, 'badge'), element('strong', item.content.length > 70 ? item.content.slice(0, 70) + '…' : item.content), element('small', date(item.createdAt)));
    button.addEventListener('click', () => showDetail(item)); container.append(button);
  }
  showDetail(items.find(item => item.id === selectedId) || items[0]);
}
async function refresh() {
  const current = ++generation; $('#refresh').disabled = true; notice('正在读取反馈…');
  try {
    const query = new URLSearchParams({ status: $('#status-filter').value, category: $('#category-filter').value });
    const result = await request('/api/feedback?' + query);
    if (current !== generation) return;
    items = result.items; $('#login-form').hidden = true; $('#inbox').hidden = false; $('#logout').hidden = false; render(); notice('列表已更新。');
  } finally { $('#refresh').disabled = false; }
}
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); token = $('#token').value.trim(); $('#token').value = ''; const button = event.submitter; button.disabled = true;
  try { await refresh(); } catch (error) { notice(error.message, true); } finally { button.disabled = false; }
});
for (const selector of ['#refresh', '#status-filter', '#category-filter']) $(selector).addEventListener(selector === '#refresh' ? 'click' : 'change', () => refresh().catch(error => notice(error.message, true)));
$('#logout').addEventListener('click', () => logout());
window.addEventListener('pagehide', () => logout(''));
