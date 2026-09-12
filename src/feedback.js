const DRAFT_KEY = 'rally-feedback-draft-v1';
const categoryLabels = { controls: '操作手感', network: '联机', performance: '画面性能', suggestion: '功能建议', other: '其他' };
const emptyFields = () => ({ category: 'controls', content: '', contact: '' });
const text = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';
const publicContext = value => ({ version: text(value?.version, 80), platform: text(value?.platform, 80), mode: text(value?.mode, 40) });
const fieldsOnly = value => ({ category: Object.hasOwn(categoryLabels, value?.category) ? value.category : 'controls', content: text(value?.content, 4000), contact: text(value?.contact, 200) });
function readStorage() { try { return globalThis.localStorage; } catch { return undefined; } }
function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes); return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}
export function validateFeedbackEndpoint(value) {
  if (!value) return '';
  if (value === '/api/feedback') return value;
  let url; try { url = new URL(value); } catch { throw new Error('反馈接收地址配置无效。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new Error('反馈接收地址必须使用 HTTPS，且不能包含凭据或查询参数。');
  return url.href;
}

export function createFeedbackClient({ storage = readStorage(), fetcher = (...args) => fetch(...args), getEndpoint = () => globalThis.RALLY_CONFIG?.feedbackURL || '', getContext = () => ({}), idFactory = makeId } = {}) {
  let draft = null, busy = false, storageAvailable = Boolean(storage);
  try {
    const saved = JSON.parse(storage?.getItem(DRAFT_KEY) || 'null');
    if (saved && /^[a-zA-Z0-9_-]{16,80}$/.test(saved.id)) draft = { ...fieldsOnly(saved), id: saved.id, context: publicContext(saved.context) };
  } catch { storageAvailable = false; }
  const snapshot = () => draft ? { ...draft, context: { ...draft.context } } : emptyFields();
  function persist() {
    try {
      if (!storage) throw new Error('Storage unavailable');
      if (draft) storage.setItem(DRAFT_KEY, JSON.stringify(draft)); else storage.removeItem(DRAFT_KEY);
      storageAvailable = true;
    } catch { storageAvailable = false; }
  }
  function saveDraft(value) {
    if (busy) return snapshot();
    const fields = fieldsOnly(value);
    if (!draft || JSON.stringify(fieldsOnly(draft)) !== JSON.stringify(fields)) draft = { ...fields, id: idFactory(), context: publicContext(getContext()) };
    persist(); return snapshot();
  }
  async function submit() {
    if (busy) throw new Error('正在提交，请稍候。');
    if (!draft?.content.trim()) throw new Error('请写下具体问题或建议。');
    const endpoint = validateFeedbackEndpoint(getEndpoint());
    if (!endpoint) throw new Error('反馈服务尚未接通。草稿已保留，接通后可再提交。');
    busy = true; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetcher(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft), credentials: 'omit', cache: 'no-store', signal: controller.signal });
      let result; try { result = await response.json(); } catch { throw new Error('未收到保存确认，草稿已保留，请稍后重试。'); }
      if (![200, 201].includes(response.status)) throw new Error(text(result?.message, 200) || '提交失败，草稿已保留，请稍后重试。');
      if (result?.ok !== true || result.id !== draft.id) throw new Error('未收到正确的保存确认，草稿已保留，请稍后重试。');
      const id = draft.id; draft = null; persist(); return { id };
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('网络连接失败，草稿已保留，请联网后重试。');
      throw error;
    } finally { clearTimeout(timer); busy = false; }
  }
  return { readDraft: snapshot, saveDraft, submit, isBusy: () => busy, hasPersistentDraft: () => storageAvailable };
}

export function initFeedback({ getContext = () => ({}), canOpen = () => true, showToast = () => {}, getEndpoint = () => globalThis.RALLY_CONFIG?.feedbackURL || '' } = {}) {
  const client = createFeedbackClient({ getContext, getEndpoint });
  const dialog = document.createElement('dialog'); dialog.id = 'feedback-dialog'; dialog.className = 'feedback-modal'; dialog.setAttribute('aria-labelledby', 'feedback-title');
  dialog.innerHTML = `<form id="feedback-form"><header class="feedback-heading"><div><div class="feedback-eyebrow">MAKE THE NEXT GAME BETTER</div><h2 id="feedback-title">意见反馈</h2></div><button class="feedback-close" type="button" aria-label="关闭意见反馈">×</button></header><div class="feedback-scroll"><p class="feedback-intro">哪里不顺手，或想增加什么玩法？告诉我们。</p><div class="feedback-fields"><label>问题类型<select name="category">${Object.entries(categoryLabels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><label class="feedback-content-label">具体内容<textarea name="content" rows="4" maxlength="4000" required placeholder="例如：哪种玩法、做了什么操作、出现了什么问题…"></textarea><span class="feedback-count">0 / 4000</span></label><label>联系方式 <span class="feedback-optional">选填</span><input name="contact" maxlength="200" autocomplete="off" placeholder="如邮箱或微信，便于进一步了解"></label></div><p class="feedback-privacy">无需登录。会附带游戏版本、运行平台和当前玩法；意见仅供作者查看。</p><p class="feedback-context"></p></div><p class="feedback-status" role="status" aria-live="polite"></p><footer><span class="feedback-draft-note">关闭后保留本机草稿</span><div class="feedback-actions"><button class="feedback-cancel" type="button">暂存并关闭</button><button class="feedback-submit" type="submit">提交反馈 ↗</button></div></footer></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form'), category = form.elements.category, content = form.elements.content, contact = form.elements.contact;
  const status = dialog.querySelector('.feedback-status'), submitButton = dialog.querySelector('.feedback-submit');
  let opener = null;
  const values = () => ({ category: category.value, content: content.value, contact: contact.value });
  function draftNote() { dialog.querySelector('.feedback-draft-note').textContent = client.hasPersistentDraft() ? '关闭后保留本机草稿' : '本机无法保存草稿，请保持此窗口打开'; }
  function fill() { const draft = client.readDraft(); category.value = draft.category; content.value = draft.content; contact.value = draft.contact; dialog.querySelector('.feedback-count').textContent = `${content.value.length} / 4000`; draftNote(); }
  function setStatus(message, error = false) { status.textContent = message; status.classList.toggle('feedback-error', error); }
  function save() { client.saveDraft(values()); dialog.querySelector('.feedback-count').textContent = `${content.value.length} / 4000`; draftNote(); }
  function close() { if (client.isBusy()) return; save(); dialog.close(); opener?.focus?.(); }
  function open() {
    if (!canOpen() || dialog.open) return false;
    opener = document.activeElement; fill();
    const context = publicContext(getContext());
    dialog.querySelector('.feedback-context').textContent = [context.version && `版本 ${context.version.slice(0, 8)}`, context.platform, context.mode].filter(Boolean).join(' · ');
    let configured = false; try { configured = Boolean(validateFeedbackEndpoint(getEndpoint())); } catch { /* submission reports invalid endpoint */ }
    setStatus(configured ? '提交成功后，作者会在私人反馈列表中看到。' : '反馈服务尚未接通。可以先写下建议并保存草稿。');
    submitButton.textContent = configured ? '提交反馈 ↗' : '保存草稿';
    dialog.showModal(); return true;
  }
  form.addEventListener('input', save);
  dialog.querySelector('.feedback-close').addEventListener('click', close);
  dialog.querySelector('.feedback-cancel').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  // Native modal isolates this form from the game's existing dialog state machine.
  for (const eventName of ['keydown', 'keyup', 'pointerdown', 'pointerup']) dialog.addEventListener(eventName, event => event.stopPropagation());
  form.addEventListener('submit', async event => {
    event.preventDefault(); save();
    if (!content.value.trim()) { setStatus('请写下具体问题或建议。', true); content.focus(); return; }
    let endpoint;
    try { endpoint = validateFeedbackEndpoint(getEndpoint()); } catch (error) { setStatus(error.message, true); return; }
    if (!endpoint) { setStatus(client.hasPersistentDraft() ? '草稿已保存在本机。反馈服务接通后，回到这里提交。' : '本机无法保存草稿，请复制内容自行保留。', !client.hasPersistentDraft()); return; }
    for (const control of form.elements) control.disabled = true;
    setStatus('正在提交，请稍候…');
    try { await client.submit(); fill(); setStatus('提交成功，作者已能在私人反馈列表中看到。'); showToast('反馈已提交'); }
    catch (error) { setStatus(error.message, true); draftNote(); }
    finally { for (const control of form.elements) control.disabled = false; }
  });
  for (const [selector, id, className] of [['.menu-foot', 'open-feedback', 'leaderboard-entry feedback-entry'], ['#result-dialog', 'result-feedback', 'text-btn feedback-entry']]) {
    const target = document.querySelector(selector);
    if (target && !document.getElementById(id)) { const button = document.createElement('button'); button.id = id; button.type = 'button'; button.className = className; button.textContent = '意见反馈'; button.addEventListener('click', open); target.append(button); }
  }
  return { open, isOpen: () => dialog.open, isBusy: client.isBusy };
}
