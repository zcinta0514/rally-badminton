const TUTORIAL_VERSION = '1';
const SEEN_KEY = 'rally.onboarding.seen';
const HINTS_KEY = 'rally.operationHints';

function availableStorage(document) {
  try { return document.defaultView?.localStorage; } catch { return undefined; }
}
function read(storage, key) {
  try { return storage?.getItem(key); } catch { return null; }
}
function write(storage, key, value) {
  try { storage?.setItem(key, value); } catch { /* Keep the preference for this page when storage is denied. */ }
}

/** A lobby-only introduction. Calling maybeShow never starts a match or changes a URL. */
export function initOnboarding({
  document = globalThis.document,
  storage = availableStorage(document),
  canOpen = () => true,
  onStartPractice,
  showToast = () => {},
} = {}) {
  let seen = read(storage, SEEN_KEY) === TUTORIAL_VERSION;
  let hintsEnabled = read(storage, HINTS_KEY) !== 'off';
  let page = 0;
  let opener = null;
  let opened = false;
  const create = (tag, className, text, id) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    if (id) node.id = id;
    return node;
  };
  const button = (text, id, className = 'onboarding-link') => {
    const node = create('button', className, text, id); node.type = 'button'; return node;
  };

  const entry = button('新手入门', 'onboarding-entry');
  const footer = document.querySelector('#menu .menu-foot');
  footer?.insertBefore(entry, footer.querySelector('span:last-child'));
  const help = document.getElementById('help-dialog');
  const settings = create('div', 'onboarding-settings');
  const replay = button('再看三步教学 ↗', 'onboarding-replay');
  const label = create('label', 'onboarding-hints-label');
  const hints = create('input', '', '', 'operation-hints'); hints.type = 'checkbox';
  const hintDescription = create('p', 'onboarding-hints-note', '收起操作说明、键位与图例。体力、击球状态和实时风险会保留。', 'operation-hints-description');
  hints.setAttribute('aria-describedby', hintDescription.id);
  label.append(hints, create('span', '', '显示操作文字提示'));
  settings.append(replay, label, hintDescription);
  help?.insertBefore(settings, help.querySelector('.usage-settings'));

  const modal = create('dialog', 'onboarding-dialog', '', 'onboarding-dialog');
  modal.setAttribute('aria-labelledby', 'onboarding-title');
  const header = create('div', 'onboarding-header');
  const progress = create('span', 'onboarding-progress', '', 'onboarding-progress');
  const skip = button('先跳过', 'onboarding-skip');
  header.append(progress, skip);
  const content = create('div', 'onboarding-content');
  const title = create('h2', '', '', 'onboarding-title'); title.setAttribute('tabindex', '-1');
  const intro = create('p', 'onboarding-intro');
  const visual = create('div', 'onboarding-visual'); visual.setAttribute('aria-hidden', 'true');
  const instructions = create('div', 'onboarding-instructions');
  const keyboard = create('p', 'onboarding-keyboard');
  content.append(title, intro, visual, instructions, keyboard);
  const actions = create('div', 'onboarding-actions');
  const back = button('上一步', 'onboarding-back', 'secondary-btn');
  const practice = button('去人机练习', 'onboarding-practice', 'secondary-btn');
  const next = button('下一步 ↗', 'onboarding-next', 'primary-btn');
  actions.append(back, practice, next);
  const note = create('p', 'onboarding-return-note', '内容可上下滑动 · 随时从首页「新手入门」重看。');
  modal.append(header, content, actions, note);
  document.body.append(modal);

  const pages = [
    {
      title: '先选一场，轻松开打。',
      intro: '第一次玩，推荐均衡型 · 入门难度 · 5 分快赛。',
      visual: ['人机练习', '好友对打'],
      lines: [
        ['自己练', '在首页选好打法、难度与分制，点「人机开打」。'],
        ['和朋友打', '点「好友对打」，一人建房，另一人输入 5 位房间码加入。加入后自动开赛，双方先准备好。'],
      ],
      keyboard: '手机横屏，双手操控。比赛规则和高级技巧可在「操作说明」查看。',
    },
    {
      title: '左手移动，先到接球位置。',
      intro: '左半屏空白处按下并拖动，松手就停。右手可以同时击球。',
      visual: ['↕ ↔', '移动 → 到位'],
      lines: [
        ['看地面', '青圈是来球预计落点，黄色圈是建议接球位置。'],
        ['提前跑位', '球落地前到位；出现「进入击球范围」或「现在可杀球」时准备出手。'],
      ],
      keyboard: '电脑：W A S D 或方向键移动。',
    },
    {
      title: '右手选球路，松开击球。',
      intro: '按住高远、吊球或杀球按钮，拖动瞄准，再松开出手。',
      visual: ['按住', '拖动', '松开'],
      lines: [
        ['选落点', '左拖打左、右拖打右；上拖更深、下拖更靠网。粉圈显示瞄准目标。'],
        ['选时机', '按住越久蓄力越多。先用高远球稳定回球，等「现在可杀球」再尝试杀球。'],
      ],
      keyboard: '电脑：J 高远 / K 吊球 / L 杀球；Z / X / C 选择左 / 中 / 右。',
    },
  ];

  function applyHints() {
    hints.checked = hintsEnabled;
    document.body.dataset.operationHints = hintsEnabled ? 'on' : 'off';
  }
  function render() {
    const current = pages[page];
    progress.textContent = `新手入门 · ${page + 1} / ${pages.length}`;
    title.textContent = current.title;
    intro.textContent = current.intro;
    visual.dataset.page = String(page);
    visual.replaceChildren(...current.visual.map(text => create('span', '', text)));
    instructions.replaceChildren(...current.lines.map(([heading, text]) => {
      const line = create('p'); line.append(create('strong', '', heading), create('span', '', text)); return line;
    }));
    keyboard.textContent = current.keyboard;
    back.hidden = page === 0;
    practice.hidden = page !== pages.length - 1 || typeof onStartPractice !== 'function';
    next.textContent = page === pages.length - 1 ? '准备好了 ↗' : '下一步 ↗';
    content.scrollTop = 0;
  }
  function eligible() {
    const loading = document.getElementById('loading');
    return document.body.dataset.screen !== 'match' && (!loading || loading.hidden) && canOpen();
  }
  function hasOtherDialog(allowHelp) {
    return [...document.querySelectorAll('dialog[open], #dialog-backdrop .dialog:not([hidden])')]
      .some(node => node !== modal && !(allowHelp && node === help));
  }
  function open({ fromHelp = false } = {}) {
    if (opened) return true;
    if (!eligible() || hasOtherDialog(fromHelp)) return false;
    opener = document.activeElement;
    page = 0;
    render();
    try { modal.showModal(); } catch {
      showToast('暂时无法打开教学，请在首页的操作说明中查看。'); return false;
    }
    opened = true;
    title.focus({ preventScroll: true });
    return true;
  }
  function rememberAndRestore() {
    if (!opened) return;
    opened = false;
    seen = true;
    write(storage, SEEN_KEY, TUTORIAL_VERSION);
    const focusTarget = opener && !opener.closest?.('[hidden]') ? opener : entry;
    focusTarget?.focus?.({ preventScroll: true });
  }
  function close() {
    if (!opened) return;
    modal.close();
    rememberAndRestore();
  }
  function maybeShow() {
    return !seen && !opened && open();
  }
  entry.addEventListener('click', () => open());
  replay.addEventListener('click', () => {
    if (!open({ fromHelp: true })) showToast('完整教学请回到首页查看；当前操作说明可继续阅读。');
  });
  hints.addEventListener('change', () => {
    hintsEnabled = hints.checked; applyHints(); write(storage, HINTS_KEY, hintsEnabled ? 'on' : 'off');
  });
  skip.addEventListener('click', close);
  modal.addEventListener('cancel', event => { event.preventDefault(); close(); });
  // Native close events are queued; an older one may arrive after a reopen.
  modal.addEventListener('close', () => { if (!modal.open) rememberAndRestore(); });
  back.addEventListener('click', () => { if (page > 0) { page--; render(); title.focus({ preventScroll: true }); } });
  next.addEventListener('click', () => {
    if (page === pages.length - 1) close();
    else { page++; render(); title.focus({ preventScroll: true }); }
  });
  practice.addEventListener('click', () => {
    if (page !== pages.length - 1 || !eligible()) return;
    close(); onStartPractice?.();
  });
  applyHints();
  return { open, maybeShow, close, get isOpen() { return opened; } };
}
