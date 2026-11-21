const recommendedKeys = {
  cross: ['drop'], lift: ['clear'], netFree: ['drop', 'clear'],
  defense: ['drop'], smash: ['smash'], serve: ['clear'],
};

function strokeCue(training) {
  const { drill, lane, target } = training;
  if (!target) return '';
  const incoming = lane < 0 ? '左' : '右';
  const side = target.x < 0 ? '左' : '右';
  switch (drill) {
    case 'cross': return incoming + '路网前球。吊球键向' + side + '横拖并稍向下，勾对角。';
    case 'lift': return incoming + '路网前球。高远键向' + side + '横拖并稍向上，挑后场。';
    case 'netFree': {
      const crossSide = lane < 0 ? '右' : '左';
      return incoming + '路网前球。吊球键向' + crossSide + '下勾对角，高远键向' + incoming + '上挑后场。';
    }
    case 'defense': return incoming + '路杀球。先按住吊球键，向' + side + '拖瞄准目标，球到身前时松手。';
    case 'smash': return incoming + '路高球。提前到位，杀球键向' + side + '拖，高点松手下压。';
    case 'serve': return '比赛沿对角发球，吊球发短，高远发长。本球用高远键向' + side + '拖，蓄力发到对角后场。';
    default: return '';
  }
}

const keyLabels = {clear:'高远', drop:'吊球', smash:'杀球'};
function aimLabel(heldShot) {
  if (!heldShot?.prepare) return '按住蓄力 · 松手击球';
  const { prepare, aim, aimDepth, charge } = heldShot;
  const lane = aim < -.125 ? '左路' : aim > .125 ? '右路' : '中路';
  const depth = aimDepth > .125 ? '偏深' : aimDepth < -.125 ? '偏短' : '原深度';
  return keyLabels[prepare] + ' · ' + lane + ' ' + depth + ' · ' + Math.round(charge * 100) + '%';
}

export function bindTrainingUI({ onEnter, onStart, onConfigure, onExit }) {
  const byId = id => document.getElementById(id);
  const panel = byId('training-ui');
  const setup = byId('training-setup');
  const adjust = byId('training-adjust');
  const drillSelect = byId('training-drill');
  const kind = byId('training-kind');
  const fields = {
    power: byId('training-power'), interval: byId('training-interval'),
    line: byId('training-line'), targetSide: byId('training-target'),
  };
  const feedback = byId('training-feedback');
  const coaching = byId('training-coaching');
  const cue = byId('training-cue');
  const setupCue = byId('training-hint');
  const counter = byId('training-count');
  const aimValue = byId('aim-value');
  const buttons = document.querySelectorAll('#game-controls [data-shot]');
  const saved = new Map();
  let options = { drill: 'cross', power: 1, interval: 1.5, line: 'right', targetSide: 'auto' };

  function showSetup(visible) {
    adjust.hidden = false;
    setup.hidden = !visible;
    adjust.setAttribute('aria-expanded', String(visible));
    adjust.textContent = visible ? '收起设置' : '训练设置';
  }

  function syncOptions() {
    const { drill } = options;
    const free = kind.value === 'free';
    for (const el of setup.querySelectorAll('[data-free-only]')) el.hidden = !free;
    for (const el of setup.querySelectorAll('[data-drill-only]')) el.hidden = free;
    byId('training-gestures').hidden = free;
    byId('training-start').textContent = free ? '开始对练 ↗' : '开始连练 ↗';
    if (free) setupCue.textContent = '每球恢复双方体力，持续计分，退出结束训练。';
    drillSelect.value = drill;
    for (const [key, field] of Object.entries(fields)) field.value = String(options[key]);
    for (const element of setup.querySelectorAll('[data-feed-only]')) element.hidden = free || drill === 'serve';
    fields.targetSide.disabled = ['cross','netFree'].includes(drill);
    fields.targetSide.options[0].textContent = ({cross:'随线对角', netFree:'前后双区'})[drill] || '随专项';
  }

  function configuration() {
    return { ...options, free: kind.value === 'free', roles: [byId('free-role').value, byId('free-opponent').value], server: Number(byId('free-server').value) };
  }

  function preview() {
    document.body.dataset.training = 'preview';
    delete document.body.dataset.trainingContact;
    panel.hidden = false;
    coaching.hidden = counter.hidden = true;
    byId('training-session').textContent = '场馆预览';
    syncOptions();
    showSetup(true);
  }

  function configure() {
    if (document.body.dataset.training !== 'playing' || kind.value === 'free') return;
    preview();
    onConfigure(configuration());
    kind.focus({ preventScroll: true });
  }

  byId('open-training').addEventListener('click', () => {
    if (onEnter(configuration()) === false) return;
    preview();
    kind.focus({ preventScroll: true });
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
    onConfigure(configuration());
  });
  byId('training-start').addEventListener('click', () => {
    for (const button of buttons) {
      button.toggleAttribute('data-training-recommended', kind.value !== 'free' && recommendedKeys[options.drill].includes(button.dataset.shot));
    }
    document.body.dataset.training = 'playing';
    byId('training-session').textContent = kind.value === 'free' ? '自由训练' : drillSelect.selectedOptions[0].textContent;
    adjust.hidden = kind.value === 'free';
    adjust.textContent = '训练设置';
    adjust.setAttribute('aria-expanded', 'false');
    setup.hidden = true;
    counter.hidden = false;
    counter.textContent = kind.value === 'free' ? '你 0 ∶ 0 对方' : '命中 0 / 0';
    coaching.hidden = kind.value === 'free';
    cue.textContent = setupCue.textContent;
    feedback.textContent = '';
    onStart(configuration());
  });

  return {
    configure,
    updateFree(state, held) {
      const aim = aimLabel(held);
      if (aimValue.textContent !== aim) aimValue.textContent = aim;
      const score = '你 ' + state.score[0] + ' ∶ ' + state.score[1] + ' 对方';
      if (counter.textContent !== score) counter.textContent = score;
    },
    close() {
      delete document.body.dataset.training;
      delete document.body.dataset.trainingContact;
      panel.hidden = true;
      for (const button of buttons) button.removeAttribute('data-training-recommended');
    },
    update(training, heldShot) {
      if (!training || !document.body.dataset.training) return;
      const playing = document.body.dataset.training === 'playing';
      const hint = playing ? cue : setupCue;
      const instruction = strokeCue(training);
      if (hint.textContent !== instruction) hint.textContent = instruction;
      if (!playing) return;
      const count = '命中 ' + training.hits + ' / ' + training.attempts;
      if (counter.textContent !== count) counter.textContent = count;
      const ready = training.stage === 'feed' && training.canHit;
      if (Boolean(document.body.dataset.trainingContact) !== Boolean(ready)) {
        if (ready) document.body.dataset.trainingContact = 'ready';
        else delete document.body.dataset.trainingContact;
      }
      const prompt = ready ? '可以击球 · 松开击球键' : training.feedback;
      if (prompt && feedback.textContent !== prompt) feedback.textContent = prompt;
      const aim = aimLabel(heldShot);
      if (aimValue.textContent !== aim) aimValue.textContent = aim;
    },
  };
}
