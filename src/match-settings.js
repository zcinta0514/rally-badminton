import { ROLES, getScoringRules, getDifficultyProfile, staminaEffects, movementStaminaRate, shotStaminaCost } from '../shared/game.js';
import { normalizeArenaPreferences, saveArenaPreferences, readArenaPreferences } from './arena-preferences.js';
import { LOBBY_TRACKS } from './lobby-tracks.js';
import { STAMINA_TUNING } from '../shared/stamina.js';

export function describeRole(role) {
  const r = ROLES[role] || ROLES.balanced;
  const style = { balanced: '控球耗费均衡，疲劳反应适中', swift: '跑动省力、体力回满快，连续杀球更费体力', power: '杀球省力、体力池大，跑动较费力、回满较慢' }[role] || '控球耗费均衡，疲劳反应适中';
  return style + ' · 速度 ' + r.speed + 'm/s（耗尽 ' + (r.speed * r.fatigue.speedFloor).toFixed(2) + 'm/s） · 力量 ' + Math.round(r.power * 100) + '% · 体力 ' + r.maxStamina +
    ' · 慢移恢复最高 ' + r.recovery + '/s · 全速耗费 ' + movementStaminaRate(r, r.speed).toFixed(1) + '/s' +
    ' · 高远/吊球/杀球耗费 ' + ['clear','drop','smash'].map(shot => shotStaminaCost(r,shot).toFixed(1)).join('/') + ' · 满力耗费增加35%';
}
export function describeMatch(state, side = 0, mode = 'ai') {
  if (state.challenge?.kind === 'hell') return [
    '地狱挑战 · 双方从0分开始；你先得2分获胜，对手先得5分获胜，无需净胜。',
    '你：' + ROLES[state.players[side].role].label + '型，每分回满体力；对手无限体力、高手决策、移动加快。',
    '幻影球：一真三假，真球有实线尾迹，虚影过网前消散。',
    '重炮：提前蓄力并锁定线路；挡回后，利用对手回位减速反攻。',
    '鱼跃救球：远处低球触发；落地、撑地起身共约0.7秒，起身后可再次扑救，次数不限。',
    '每次回球尽可能使用技能，高球可连续重炮，扑救不叠加主动技能。移动与击球按键沿用你的布局。',
  ].join('\n');
  const self = ROLES[state.players[side].role], other = ROLES[state.players[1 - side].role], rule = getScoringRules(state);
  const assistance = state.assist?.side === side && state.assist.level === 'beginner' ? '入门接球辅助开启' : '接球辅助关闭';
  const ai = getDifficultyProfile(state.difficulty);
  return [
    '我方：' + self.label + '型 · 体力上限 ' + self.maxStamina + '；对手：' + other.label + '型 · ' + other.maxStamina,
    (state.ruleset === 'standard21' ? '三局两胜 · 每局21分' : '单局快赛 · ' + rule.target + '分') + ' · 净胜' + rule.winBy + '分 · ' + rule.cap + '分封顶',
    mode === 'online' ? '好友对战 · ' + assistance : 'AI 反应 ' + Math.round(ai.reaction * 1000) + 'ms · 节奏 ' + Math.round(ai.pace * 100) + '% · ' + assistance,
    '你的当前最高移动速度 ' + (self.speed * staminaEffects(state.players[side], self).speedScale).toFixed(2) + 'm/s；疲劳时跑动、强攻与压线更容易失误。',
    '成功回球后慢移或站稳调整：高远球恢复加快' + Math.round(STAMINA_TUNING.shotRecovery.clear.boost * 100) + '%（额外最多' + STAMINA_TUNING.shotRecovery.clear.budget + '点），吊球加快' + Math.round(STAMINA_TUNING.shotRecovery.drop.boost * 100) + '%（额外最多' + STAMINA_TUNING.shotRecovery.drop.budget + '点）；杀球和发球无加成，跑动／准备击球时不恢复。',
    '回合中慢移调整可恢复体力；每分结束进入下一次发球时，你恢复最多 ' +
      (self.recovery * STAMINA_TUNING.pointRecoverySeconds).toFixed(1) + ' 点，对手恢复最多 ' +
      (other.recovery * STAMINA_TUNING.pointRecoverySeconds).toFixed(1) + ' 点；等待发球、分间及暂停不会额外恢复。',
  ].join(String.fromCharCode(10));
}

export function bindMatchSettings(audio, { document = globalThis.document, preferences = readArenaPreferences(), menuAudio, onChange = () => {} } = {}) {
  const button = document.querySelector('#match-settings-toggle'), panel = document.querySelector('#match-settings-panel');
  let settings = normalizeArenaPreferences(preferences);
  const close = () => { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  const inputs = [...panel.querySelectorAll('[data-volume]')];
  const brightness = panel.querySelector('#arena-brightness');
  const flightGuides = panel.querySelector('#arena-flight-guides');
  const track = panel.querySelector('#arena-music-track');
  const localOption = track?.querySelector('option[value="local"]');
  if (localOption) for (const [id, { title }] of Object.entries(LOBBY_TRACKS)) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = title;
    track.insertBefore(option, localOption);
  }
  const file = panel.querySelector('#arena-music-file');
  const apply = (useLocal = menuAudio?.usingLocal) => {
    audio.setPreferences(settings);
    if(flightGuides)flightGuides.checked=settings.flightGuides;
    menuAudio?.setPreferences(settings, useLocal);
    if (track && menuAudio) {
      localOption.disabled = localOption.hidden = !menuAudio.localUrl;
      track.value = menuAudio.usingLocal ? 'local' : settings.musicTrack;
    }
    if(brightness){brightness.value=Math.round(settings.brightness*100);brightness.nextElementSibling.value=brightness.value+'%';}
    for (const input of inputs) { input.value = Math.round(settings[input.dataset.volume] * 100); input.nextElementSibling.value = input.value + '%'; }
    onChange({ ...settings });
  };
  button.addEventListener('click', () => { panel.hidden = !panel.hidden; button.setAttribute('aria-expanded', String(!panel.hidden)); });
  for (const input of inputs) input.addEventListener('input', () => {
    settings = normalizeArenaPreferences({ ...settings, [input.dataset.volume]: Number(input.value) / 100 }); apply(); saveArenaPreferences(settings);
  });
  brightness?.addEventListener('input',()=>{
    settings=normalizeArenaPreferences({...settings,brightness:Number(brightness.value)/100});apply();saveArenaPreferences(settings);
  });
  flightGuides?.addEventListener('change',()=>{
    settings=normalizeArenaPreferences({...settings,flightGuides:flightGuides.checked});apply();saveArenaPreferences(settings);
  });
  track?.addEventListener('change', () => {
    if (track.value === 'local') { apply(true); return; }
    settings = normalizeArenaPreferences({ ...settings, musicTrack: track.value });
    apply(false);
    saveArenaPreferences(settings);
  });
  panel.querySelector('#arena-choose-music')?.addEventListener('click', () => file?.click());
  file?.addEventListener('change', () => {
    if (file.files?.[0] && menuAudio?.importLocal(file.files[0])) apply(true);
    file.value = '';
  });
  panel.querySelector('#arena-reset').addEventListener('click', () => { settings = normalizeArenaPreferences(null); apply(false); saveArenaPreferences(settings); });
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); button.focus(); } });
  panel.addEventListener('pointerdown', event => event.stopPropagation());
  document.addEventListener('pointerdown', event => { if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) close(); });
  apply();
  return { close, selectPalette(name) {
    settings = normalizeArenaPreferences({ ...settings, courtPalette: name });
    apply(); saveArenaPreferences(settings);
    return settings.courtPalette;
  }, update(state, side, mode) {
    if (document.body.dataset.screen !== 'match' || state.phase === 'over') close();
    const summary = panel.querySelector('#match-settings-summary'), text = describeMatch(state, side, mode);
    if (summary.textContent !== text) summary.textContent = text;
  }, get preferences() { return { ...settings }; } };
}
