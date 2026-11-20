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

  const entry = document.getElementById('onboarding-entry') ?? button('新手指南', 'onboarding-entry');
  const help = document.getElementById('help-dialog');
  const settings = create('div', 'onboarding-settings');
  const replay = button('查看新手入门', 'onboarding-replay');
  const label = create('label', 'onboarding-hints-label');
  const hints = create('input', '', '', 'operation-hints'); hints.type = 'checkbox';
  const hintDescription = create('p', 'onboarding-hints-note', '关闭后隐藏键位和图例，仍显示体力与击球风险。', 'operation-hints-description');
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
  const practice = button('开始人机对战', 'onboarding-practice', 'secondary-btn');
  const next = button('下一步 ↗', 'onboarding-next', 'primary-btn');
  actions.append(back, practice, next);
  const note = create('p', 'onboarding-return-note', '回到首页，点「新手指南」可再看。');
  modal.append(header, content, actions, note);
  document.body.append(modal);

  const pages = [
    {
      title: '选择比赛模式',
      intro: '第一次打，选「单人对战」里的「人机对战」，从入门单打开始。',
      visual: ['单打', '双打', '专项训练'],
      lines: [
        ['专项训练', '想单练接杀或发球，回首页选「专项训练」。'],
        ['好友对战', '建房后把房间码发给好友，或直接分享邀请链接。'],
      ],
      keyboard: '想练配合，在人机对战中选「双打」，与 AI 队友搭档。',
    },
    {
      title: '移动与跑位',
      intro: '左手按住左半屏空白处，向想去的方向拖，松手即停。',
      visual: ['↕ ↔', '移动 → 到位'],
      lines: [
        ['看地面', '青圈标出球会落在哪，琥珀色提示标出你该站在哪。'],
        ['提前跑位', '先跑向建议位置，脚下提示亮起就能回球。'],
      ],
      keyboard: '电脑：W A S D 或方向键移动。',
    },
    {
      title: '击球与选线',
      intro: '轻点沿当前方向击球。想找空当，按住球键拖动，松手出球。',
      visual: ['按住', '拖动', '松开'],
      lines: [
        ['选落点', '横拖选左右，上拖打后场，下拖打网前。'],
        ['选时机', '被逼到后场，用高远球争取回位时间。杀球键亮起时，可抓高点下压。'],
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
    next.textContent = page === pages.length - 1 ? '完成' : '下一步 ↗';
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
