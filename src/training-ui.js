const lessons = {
  cross: {
    hint: '迎到网前，球到拍前时松开勾对角键，贴网回到斜对面。',
    buttons: { drop: '勾对角', clear: '挑后场' },
  },
  lift: {
    hint: '接同一组网前球，在球下方起拍，把球挑到后场目标区。',
    buttons: { drop: '勾对角', clear: '挑后场' },
  },
  netFree: {
    hint: '每球自选动作。勾对角打斜对面的网前区，挑后场打同侧的后场区。',
    buttons: { drop: '勾对角', clear: '挑后场' },
  },
  defense: {
    hint: '迎住向下的杀球，在身前松开接杀键，把球挡回目标区。',
    buttons: { drop: '接杀' },
  },
  smash: {
    hint: '提前移动到高球下方，在高点松开杀球键，向下打进目标区。',
    buttons: { smash: '杀球' },
  },
  serve: {
    hint: '按住发球键蓄力，拖动选线，松手把球发进对角目标区。',
    buttons: { clear: '发球' },
  },
};

export function bindTrainingUI({ onEnter, onStart, onConfigure, onExit }) {
  const byId = id => document.getElementById(id);
  const panel = byId('training-ui');
  const setup = byId('training-setup');
  const adjust = byId('training-adjust');
  const drillSelect = byId('training-drill');
  const fields = {
    power: byId('training-power'), interval: byId('training-interval'),
    line: byId('training-line'), targetSide: byId('training-target'),
  };
  const feedback = byId('training-feedback');
  const counter = byId('training-count');
  const aimValue = byId('aim-value');
  const saved = new Map();
  let options = { drill: 'cross', power: 1, interval: 1.5, line: 'right', targetSide: 'auto' };
  let originalButtons;

  function showSetup(visible) {
    setup.hidden = !visible;
    adjust.setAttribute('aria-expanded', String(visible));
    adjust.textContent = visible ? '收起设置' : '专项设置';
  }

  function syncOptions() {
    const { drill } = options;
    drillSelect.value = drill;
    for (const [key, field] of Object.entries(fields)) field.value = String(options[key]);
    for (const field of setup.querySelectorAll('[data-feed-field]')) field.hidden = drill === 'serve';
    fields.targetSide.disabled = ['cross','netFree'].includes(drill);
    fields.targetSide.options[0].textContent = ({cross:'随线对角', netFree:'前后双区'})[drill] || '随专项';
    byId('training-hint').textContent = lessons[drill].hint;
  }

  function preview() {
    document.body.dataset.training = 'preview';
    delete document.body.dataset.trainingContact;
    panel.hidden = false;
    feedback.hidden = counter.hidden = true;
    byId('training-session').textContent = '场馆预览';
    syncOptions();
    showSetup(true);
  }

  function configure() {
    if (document.body.dataset.training !== 'playing') return;
    preview();
    onConfigure({ ...options });
    drillSelect.focus({ preventScroll: true });
  }

  byId('open-training').addEventListener('click', () => {
    if (onEnter({ ...options }) === false) return;
    preview();
    drillSelect.focus({ preventScroll: true });
  });
  adjust.addEventListener('click', () => {
    if (document.body.dataset.training === 'playing') configure();
    else showSetup(setup.hidden);
  });
  byId('training-exit').addEventListener('click', () => onExit());
  setup.addEventListener('change', event => {
    if (event.target === drillSelect) {
      saved.set(options.drill, options);
      const drill = drillSelect.value;
      options = saved.get(drill) || { ...options, drill, targetSide: 'auto' };
    } else {
      options = {
        drill: drillSelect.value, power: Number(fields.power.value),
        interval: Number(fields.interval.value), line: fields.line.value,
        targetSide: fields.targetSide.value,
      };
    }
    syncOptions();
    onConfigure({ ...options });
  });
  byId('training-start').addEventListener('click', () => {
    const buttons = lessons[options.drill].buttons;
    originalButtons ??= [...document.querySelectorAll('#game-controls [data-shot]')].map(button => {
      const label = button.querySelector('.key-face strong');
      return { button, label, text: label.textContent };
    });
    for (const { button, label } of originalButtons) {
      const name = buttons[button.dataset.shot];
      button.hidden = !name;
      if (name) label.textContent = name;
    }
    document.body.dataset.training = 'playing';
    byId('training-session').textContent = drillSelect.selectedOptions[0].textContent;
    adjust.textContent = '调整专项';
    adjust.setAttribute('aria-expanded', 'false');
    setup.hidden = true;
    counter.hidden = false;
    counter.textContent = '命中 0 / 0';
    feedback.hidden = false;
    feedback.textContent = lessons[options.drill].hint;
    onStart({ ...options });
  });

  return {
    configure,
    close() {
      delete document.body.dataset.training;
      delete document.body.dataset.trainingContact;
      panel.hidden = true;
      for (const { button, label, text } of originalButtons || []) {
        button.hidden = false;
        label.textContent = text;
      }
      originalButtons = null;
    },
    update(training, heldShot) {
      if (!training || document.body.dataset.training !== 'playing') return;
      const count = '命中 ' + training.hits + ' / ' + training.attempts;
      if (counter.textContent !== count) counter.textContent = count;
      const ready = training.stage === 'feed' && training.canHit;
      if (Boolean(document.body.dataset.trainingContact) !== Boolean(ready)) {
        if (ready) document.body.dataset.trainingContact = 'ready';
        else delete document.body.dataset.trainingContact;
      }
      const prompt = ready ? '可以击球 · 松开击球键' : training.feedback;
      if (prompt && feedback.textContent !== prompt) feedback.textContent = prompt;
      const serving = options.drill === 'serve';
      const aimLabel = heldShot?.prepare
        ? '蓄力 ' + Math.round(heldShot.charge * 100) + '%'
        : serving ? '按住发球键蓄力' : '松开击球键出手';
      if (aimValue.textContent !== aimLabel) aimValue.textContent = aimLabel;
    },
  };
}
