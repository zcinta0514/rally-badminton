import { ROLES, getScoringRules, getDifficultyProfile, staminaEffects, movementStaminaRate, shotStaminaCost } from '../shared/game.js';
import { normalizeArenaPreferences, saveArenaPreferences, readArenaPreferences } from './arena-preferences.js';

export function describeRole(role) {
  const r = ROLES[role] || ROLES.balanced;
  const style = { balanced: '控球耗费均衡，疲劳反应适中', swift: '跑动省力、恢复快，连续杀球更费体力', power: '杀球省力，跑动更费体力、恢复较慢' }[role] || '控球耗费均衡，疲劳反应适中';
  return style + ' · 速度 ' + r.speed + 'm/s（耗尽 ' + (r.speed * r.fatigue.speedFloor).toFixed(2) + 'm/s） · 力量 ' + Math.round(r.power * 100) + '% · 体力 ' + r.maxStamina +
    ' · 慢移恢复最高 ' + r.recovery + '/s · 全速耗费 ' + movementStaminaRate(r, r.speed).toFixed(1) + '/s' +
    ' · 高远/吊球/杀球耗费 ' + ['clear','drop','smash'].map(shot => shotStaminaCost(r,shot).toFixed(1)).join('/') + ' · 满力耗费增加35%';
}
export function describeMatch(state, side = 0, mode = 'ai') {
  const self = ROLES[state.players[side].role], other = ROLES[state.players[1 - side].role], rule = getScoringRules(state);
  const assistance = state.assist?.side === side && state.assist.level === 'beginner' ? '入门接球辅助开启' : '接球辅助关闭';
  const ai = getDifficultyProfile(state.difficulty);
  return [
    '你：' + self.label + '型 · 体力上限 ' + self.maxStamina + '；对手：' + other.label + '型 · ' + other.maxStamina,
    (state.ruleset === 'standard21' ? '三局两胜 · 每局21分' : '单局快赛 · ' + rule.target + '分') + ' · 净胜' + rule.winBy + '分 · ' + rule.cap + '分封顶',
    mode === 'online' ? '好友对打 · ' + assistance : 'AI 反应 ' + Math.round(ai.reaction * 1000) + 'ms · 节奏 ' + Math.round(ai.pace * 100) + '% · ' + assistance,
    '你的当前最高移动速度 ' + (self.speed * staminaEffects(state.players[side], self).speedScale).toFixed(2) + 'm/s；疲劳时跑动、强攻与压线更容易失误。',
    '体力只在回合中慢移调整时恢复；发球、分间及暂停均不恢复。',
  ].join(String.fromCharCode(10));
}

export function bindMatchSettings(audio, { document = globalThis.document, preferences = readArenaPreferences(), onChange = () => {} } = {}) {
  const button = document.querySelector('#match-settings-toggle'), panel = document.querySelector('#match-settings-panel');
  let settings = normalizeArenaPreferences(preferences);
  const close = () => { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  const inputs = [...panel.querySelectorAll('[data-volume]')];
  const apply = () => {
    audio.setPreferences(settings);
    for (const input of inputs) { input.value = Math.round(settings[input.dataset.volume] * 100); input.nextElementSibling.value = input.value + '%'; }
    onChange({ ...settings });
  };
  button.addEventListener('click', () => { panel.hidden = !panel.hidden; button.setAttribute('aria-expanded', String(!panel.hidden)); });
  for (const input of inputs) input.addEventListener('input', () => {
    settings = normalizeArenaPreferences({ ...settings, [input.dataset.volume]: Number(input.value) / 100 }); apply(); saveArenaPreferences(settings);
  });
  panel.querySelector('#arena-reset').addEventListener('click', () => { settings = normalizeArenaPreferences(null); apply(); saveArenaPreferences(settings); });
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); button.focus(); } });
  panel.addEventListener('pointerdown', event => event.stopPropagation());
  document.addEventListener('pointerdown', event => { if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) close(); });
  apply();
  return { close, update(state, side, mode) {
    if (document.body.dataset.screen !== 'match' || state.phase === 'over') close();
    const summary = panel.querySelector('#match-settings-summary'), text = describeMatch(state, side, mode);
    if (summary.textContent !== text) summary.textContent = text;
  }, get preferences() { return { ...settings }; } };
}
