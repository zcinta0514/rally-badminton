import { captureMotion, presentLocal } from './local-presentation.js';
import { practiceInputs, localTeam, lineupNames } from './match-lineup.js';
import { hellStatus } from '../shared/hell-mode.js';
import { CourtView } from './view.js';
import { Controls } from './controls.js';
import { ArenaAudio } from './arena-audio.js';
import { MenuAudio, interfaceSound } from './menu-audio.js';
import { createHaptics } from './haptics.js';
import { MatchFinale } from './match-finale.js';
import { createUsageAnalytics } from './analytics.js';
import { NetworkPlayback } from './network-playback.js';
import { PerformanceMonitor, formatPerformance } from './performance.js';
import { bindCameraSettings } from './camera-settings.js';
import { bindShotLayout } from './shot-layout.js';
import { paintShotAim, clearShotAim } from './shot-buttons.js';
import { bindMatchSettings, describeRole } from './match-settings.js';
import { bindPalettePicker } from './palette-picker.js';
import { readArenaPreferences } from './arena-preferences.js';
import { matchPressure } from './arena-feedback.js';
import { initPWA, getWebSocketURL } from './pwa.js';
import { isUpdateSafe } from './update-client.js';
import { getUpdatePreferencesStorage, saveUpdatePreferences, restoreUpdatePreferences } from './update-preferences.js';
import { initOnboarding } from './onboarding.js';
import { createPlayerProfile, normalizePlayerName } from './player-profile.js';
import { createLeaderboard, getLeaderboardURL, resultRecordText } from './leaderboard.js';
import { openPeerRoom } from './peer-network.js';
import { createPeerRecords } from './peer-records.js';
import { resolveShotAim, toWorldInput } from './play-input.js';
import { createMatch, getScoringRules, getDifficultyProfile, stepMatch, aiInput, pauseMatch, resumeMatch, finishMatch, RULES_VERSION, ROLES, staminaEffects, predictLanding, getShotAvailability, getInterceptAdvice, getShotTarget } from '../shared/game.js';

const $=id=>document.getElementById(id);
const demoMode=globalThis.RALLY_CONFIG?.demoMode===true;
const peerMode=globalThis.RALLY_CONFIG?.peerMode===true;
const practiceOnly=demoMode&&!peerMode;
const usage=createUsageAnalytics({config:globalThis.RALLY_CONFIG?.analytics});
usage.pageView();
const usageToggle=$('usage-enabled');
if(usageToggle){
  usageToggle.checked=usage.enabled;usageToggle.disabled=!usage.configured;
  $('usage-status').textContent=usage.configured?'仅记录访问、开局、完赛、中断及体验降级事件；关闭不影响游戏。':'当前站点未启用使用统计。';
  usageToggle.addEventListener('change',()=>{usage.setEnabled(usageToggle.checked);usageToggle.checked=usage.enabled;});
}
const netDragPlaytest=new URLSearchParams(location.search).get('netDrag')==='1';
const names={easy:'入门',medium:'进阶',hard:'高手'};
const difficultyNotes=Object.fromEntries(['easy','medium','hard'].map(key=>{const p=getDifficultyProfile(key);return [key, 'AI 反应 '+Math.round(p.reaction*1000)+'ms · 回球节奏 '+Math.round(p.pace*100)+'%'+(key==='easy'?' · 入门接球辅助开启':' · 接球辅助关闭')];}));
const roleNotes=Object.fromEntries(Object.keys(ROLES).map(key=>[key,describeRole(key)]));
const roleGuidance={
  balanced:{energy:'回位调整，保持攻守平衡',ready:'站稳击球 · 保持攻守平衡',smash:'现在可杀球 · 均衡出手'},
  swift:{energy:'抢点接球，减少无谓跑动',ready:'已进入抢点范围 · 松开击球',smash:'现在可杀球 · 灵巧型适合抢节奏'},
  power:{energy:'重击要选高点，出手后及时回位',ready:'进入击球范围 · 为重击找高点',smash:'高点击球 · 现在适合重击'},
};
const updatePreferencesStorage=getUpdatePreferencesStorage(window);
const restoredUpdatePreferences=restoreUpdatePreferences(globalThis.RALLY_CONFIG?.buildId,updatePreferencesStorage);
let arenaPreferences=restoredUpdatePreferences?.arena??readArenaPreferences(),matchSettings;
const settings={format:'singles',friendFormat:'singles',teammateDifficulty:'medium',teammateRole:'balanced',role:'balanced',coachRole:'balanced',friendRole:'balanced',friendTarget:5,friendRuleset:'quick',difficulty:'easy',target:5,ruleset:'quick',...restoredUpdatePreferences?.settings,finale:'none'};
let entryStage='home',friendAction='choose';
let mode='menu',state=null,side=0,room=null,socket=null,netGeneration=0;
let hellRole=settings.role;
let peerSession=null,peerAttempt=null,peerDisconnected=false;
let pendingShot=null,aim=0,dragAim=null,view,controls,palettePicker,lastFrame=performance.now(),accumulator=0,lastSend=0,smashReady=false,shotLayoutHold=false;
let toastTimer,helpOpen=false,rematchRequested=false,lastPhase='',lastHit=0,lastPoint=0,connecting=false,reconnecting=false,resultPending=false;
let reconnectError='',recoveryRemainingMs=null;
let playerProfile=null,currentPlayerId=null,leaderboardRecord=null,leaderboardReturn=null,leaderboardFormat='singles';
const arenaAudio=new ArenaAudio({preferences:arenaPreferences});
const haptics=createHaptics();
const shotFlashTimers=new WeakMap();
function flashShotButton(button,shot){
  if(!button)return;
  button.classList.remove('fired');
  void button.offsetWidth;
  button.classList.add('fired');
  clearTimeout(shotFlashTimers.get(button));
  shotFlashTimers.set(button,setTimeout(()=>button.classList.remove('fired'),shot==='smash'?300:220));
}
function syncHapticsToggle(){
  const toggle=$('haptics-enabled');if(!toggle)return;
  toggle.checked=haptics.enabled&&haptics.supported;
  toggle.disabled=!haptics.supported;
  const note=$('haptics-note');
  if(note)note.textContent=haptics.supported?'击球与杀球时轻振；可在本机关闭。':'当前浏览器不支持振动反馈，按键与画面反馈不受影响。';
}
syncHapticsToggle();
$('haptics-enabled')?.addEventListener('change',event=>{haptics.setEnabled(event.target.checked);syncHapticsToggle();});
const finale=new MatchFinale();
let sound=restoredUpdatePreferences?.sound??true;
let selectedShot='clear',dragDepth=0,lastShotRequest=null,gestureOrigin=null;
const showToast=text=>{clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3800);};
const menuAudio=new MenuAudio({media:$('lobby-music-player'),getContext:()=>arenaAudio.context,
  preferences:arenaPreferences,onError:showToast,onTrack:title=>{
    const label=$('arena-music-current');
    if(label){label.textContent=title;label.hidden=false;}
  }});
const shotLayout=bindShotLayout({showToast,onClose:()=>{shotLayoutHold=false;accumulator=0;lastFrame=performance.now();controls?.reset();}});
for(const trigger of document.querySelectorAll('[data-open-shot-layout]'))trigger.addEventListener('click',()=>{closeHelpOrSetup();shotLayout?.open();});
const openShotLayoutInMatch=()=>{
  if(mode==='online'){showToast('联机对局请回首页调整按键');return;}
  if(!state||state.phase==='over')return;
  matchSettings?.close();shotLayoutHold=true;accumulator=0;
  controls?.reset();pendingShot=null;dragAim=null;gestureOrigin=null;
  try{if(!shotLayout?.open())shotLayoutHold=false;}
  catch(error){shotLayoutHold=false;console.error(error);showToast('调整面板打开失败，请回首页重试');}
};
$('edit-shot-layout')?.addEventListener('click',openShotLayoutInMatch);
const playback=new NetworkPlayback();
const performanceMonitor=new PerformanceMonitor({devicePixelRatio:window.devicePixelRatio});
const pwa=initPWA({fullscreenButton:$('fullscreen'),landscapeButton:$('landscape'),showToast,onUpdateLock:({version}={})=>{
    saveUpdatePreferences({version,settings,sound,arena:arenaPreferences},updatePreferencesStorage);controls?.reset();
  },
  isSafeToUpdate:({allowHidden=false}={})=>entryStage==='home'&&isUpdateSafe({ready:Boolean(controls&&view)&&$('loading').hidden,visible:allowHidden||!document.hidden,mode,state,room,
    connection:socket||peerSession||peerAttempt,connecting,reconnecting,pendingResult:resultPending,finale:finale.blocking,
    overlay:Boolean(document.querySelector('dialog[open], .dialog:not([hidden]), #camera-panel:not([hidden]), #match-settings-panel:not([hidden]), #palette-panel:not([hidden]), #shot-layout-editor:not([hidden])')),
    editing:Boolean(document.activeElement?.matches('input, textarea, select, [contenteditable="true"]'))})});
const onboarding=initOnboarding({showToast,canOpen:()=>Boolean(controls)&&$('loading').hidden&&mode==='menu'&&!room&&!connecting&&!peerSession&&!peerAttempt,
  onStartPractice:()=>openEntry('ai')});
let lastRtt=null,lastDiagnostics=0,appliedQuality='',peerStats=null,lastPeerStats=0,peerStatsPending=false;
const setText=(id,text)=>{if($(id).textContent!==String(text))$(id).textContent=text;};
const peerRecords=peerMode?createPeerRecords():null;
const doublesRecords=peerMode?createPeerRecords({format:'doubles'}):null;
const leaderboard=createLeaderboard(peerMode?{document,getURL:()=>'',fetchImpl:async()=>({ok:true,json:async()=>(leaderboardFormat==='doubles'?doublesRecords:peerRecords).list()})}:{document,getURL:()=>getLeaderboardURL(getWebSocketURL())});
function preparePlayerProfile(){
  playerProfile??=createPlayerProfile();
  setText('player-profile-note',playerProfile.persistent?(peerMode?'战绩仅保存在当前浏览器。':'战绩绑定本浏览器，不跨设备同步。'):'浏览器未允许保存身份。本页可正常记分，关闭后将无法接续此身份的战绩。');
  return playerProfile;
}
if(practiceOnly){
  for(const id of ['open-leaderboard','result-leaderboard'])$(id).hidden=true;
  setText('menu-intro','人机对战 · 局域网联机 · 5 / 11 / 21 分');
  setText('open-friends','局域网联机说明 ↗');
}else try{$('player-name').value=preparePlayerProfile().name;}catch(error){setText('player-profile-note',error.message);}
if(peerMode){
  setText('menu-intro','人机对战 · 好友对战 · 5 / 11 / 21 分');
  setText('leaderboard-title','本机好友榜');
}else setText('friends-network-note','同一局域网网址 · 主机电脑需保持运行');
if(netDragPlaytest){
  document.title='开拍 RALLY · 网前试打';
  setText('menu-intro','网前试打 · 吊球轻点打短，向上拖可挑后场');
}
function dialog(id){
  if(id==='friends-dialog'){openEntry('friends');return;}
  for(const el of document.querySelectorAll('.dialog'))el.hidden=el.id!==id;
  $('dialog-backdrop').hidden=!id;
}
function openLeaderboard(from){
  if(practiceOnly)return;
  if(from==='result'&&state?.phase!=='over')return;
  if(from==='menu'&&mode!=='menu')return;
  if(from==='result')leaderboardFormat=state?.format||'singles';
  $('leaderboard-format').hidden=!peerMode;$('leaderboard-format').value=leaderboardFormat;
  if(peerMode)setText('leaderboard-title',leaderboardFormat==='doubles'?'本机双打榜':'本机单打榜');
  leaderboardReturn=from;dialog('leaderboard-dialog');leaderboard.load({selfId:currentPlayerId});
}
$('leaderboard-format').addEventListener('change',()=>{leaderboardFormat=$('leaderboard-format').value==='doubles'?'doubles':'singles';setText('leaderboard-title',leaderboardFormat==='doubles'?'本机双打榜':'本机单打榜');leaderboard.load({selfId:currentPlayerId});});
function closeLeaderboard(){
  const from=leaderboardReturn;leaderboardReturn=null;leaderboard.cancel();
  if(reconnecting){showConnectionRecovery();return;}
  dialog(from==='result'&&state?.phase==='over'?'result-dialog':null);
}
function showConnectionRecovery(){
  helpOpen=false;$('pause-rule-note').hidden=state?.format==='doubles';
  setText('pause-title','连接中断');setText('pause-time',recoveryRemainingMs===null?'—':Math.ceil(recoveryRemainingMs/1000));
  setText('pause-description',reconnectError?`连接恢复失败：${reconnectError}。可返回首页继续人机，或重新约战。`:state?.format==='doubles'?'正在恢复原位置，最多等待30秒。超时结束本场，不计胜负。':'正在尝试恢复连接。可直接返回首页；离线人机不需要比赛服务器。');
  setText('resume','等待连接恢复…');$('resume').disabled=true;
  dialog('pause-dialog');
}
function unlockAudio(){
  if(sound&&(!arenaAudio.context||arenaAudio.context.state!=='running'))void arenaAudio.unlock();
}
function clearFinale(){
  finale.cancel(state?.phase==='over'||finale.blocking);view?.clearFinale();arenaAudio.stopVoices('finale');
  $('match-finale').hidden=true;$('finale-bubble').hidden=true;
  delete document.body.dataset.finale;delete document.body.dataset.finalePending;
}
function showFinale(frame){
  if(finale.blocking)document.body.dataset.finalePending='true';else delete document.body.dataset.finalePending;
  $('match-finale').hidden=!frame;
  if(!frame){delete document.body.dataset.finale;return;}
  document.body.dataset.finale='true';
  setText('finale-winner',`${frame.names[frame.winner]} 赢了`);
  for(let index=0;index<2;index++){
    const label=$(`finale-player-${index}`),anchor=view.finaleAnchors[index];
    label.dataset.result=index===frame.winner?'winner':'loser';
    setText(`finale-role-${index}`,index===frame.winner?'胜者':'败者');
    setText(`finale-name-${index}`,frame.names[index]);
    label.style.left=`${anchor.x}px`;label.style.top=`${Math.max(68,anchor.y)}px`;
  }
  const bubble=$('finale-bubble'),anchor=view.finaleAnchors[frame.loser];
  bubble.hidden=!frame.bubble;bubble.style.left=`${anchor.x}px`;bubble.style.top=`${Math.max(122,anchor.y+60)}px`;
  if(frame.voice)arenaAudio.playFinale(frame.key);
}
// Safari can interrupt an already-unlocked device after a background/lock cycle.
// Retry inside the next real gesture; a running or muted device needs no work.
document.addEventListener('pointerdown',unlockAudio);
document.addEventListener('keydown',unlockAudio);
// Use the native click for touch, mouse and keyboard so one activation gets one sound.
function menuGesture(event, kind){
  if(!sound||!event.isTrusted)return;
  unlockAudio();menuAudio.activate();
  if(kind)menuAudio.playClick(kind);
}
document.addEventListener('click',event=>{
  if(event.target?.closest?.('#sound'))return;
  menuGesture(event,interfaceSound(event.target));
},true);
document.addEventListener('change',event=>{
  if(event.target?.matches?.('#match-settings-panel input[type="range"], #arena-music-track, input[type="checkbox"]'))menuGesture(event,'tap');
});
window.addEventListener('pagehide',()=>menuAudio.setVisible(false));
window.addEventListener('pageshow',()=>menuAudio.setVisible(!document.hidden));

function groupChoice(container,attribute,value){
  for(const button of $(container).querySelectorAll('button')){
    const selected=button.dataset[attribute]===String(value);button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
  }
}
function syncRulesControls(){
  const standard=settings.ruleset==='standard21';
  const rules=getScoringRules(settings);
  $('targets').setAttribute('aria-disabled',String(standard));
  for(const choice of $('targets').querySelectorAll('button'))choice.disabled=standard;
  groupChoice('targets','target',standard?21:settings.target);
  setText('rules-note',standard?'21 分 · 赢两分，30 封顶 · 三局两胜 · 局间休息 4 秒':`达到 ${rules.target} 分且净胜 ${rules.winBy} 分获胜 · ${rules.cap} 分封顶 · 对角发球`);
}
function syncSoundControls(){
  arenaAudio.setEnabled(sound);menuAudio.setEnabled(sound);$('sound').dataset.muted=String(!sound);
  $('sound').setAttribute('aria-label',sound?'关闭声音':'开启声音');
}
if(restoredUpdatePreferences){
  for(const [id,attribute] of [['roles','role'],['friend-roles','friendRole'],['coach-roles','coachRole'],['difficulties','difficulty'],['rulesets','ruleset']])groupChoice(id,attribute,settings[attribute]);
  syncRulesControls();syncSoundControls();
}
setText('role-note',roleNotes[settings.role]);setText('difficulty-note',difficultyNotes[settings.difficulty]);
function syncCoachNote(){setText('coach-note',ROLES[settings.coachRole].label+'陪练 · '+({balanced:'攻守均衡',swift:'移动快、体力回满快，连续杀球耗费较高',power:'重击省力、体力池大，跑动较费力、回满较慢'}[settings.coachRole])+'。仅用于普通人机对战。');}
syncCoachNote();
for(const [id,key,attr] of [['roles','role','role'],['friend-roles','friendRole','friendRole'],['coach-roles','coachRole','coachRole'],['difficulties','difficulty','difficulty'],['targets','target','target'],['rulesets','ruleset','ruleset'],['friend-modes','finale','finale']]){
  $(id).addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    settings[key]=key==='target'?Number(button.dataset[attr]):button.dataset[attr];groupChoice(id,attr,settings[key]);
    if(key==='role')setText('role-note',roleNotes[settings.role]);
    if(key==='coachRole')syncCoachNote();
    if(key==='difficulty')setText('difficulty-note',difficultyNotes[settings.difficulty]);
    if(key==='ruleset'||key==='target')syncRulesControls();
    syncEntrySettings();
  });
}
function syncEntrySettings(){
  groupChoice('teammate-roles','partnerRole',settings.teammateRole);groupChoice('teammate-difficulties','partnerDifficulty',settings.teammateDifficulty);
  groupChoice('ai-lineup','lineup',settings.format);groupChoice('friend-lineup','lineup',settings.friendFormat);
  $('doubles-practice-options').hidden=settings.format!=='doubles';
  if(settings.friendFormat==='doubles')settings.finale='none';
  $('friend-mode-picker').hidden=settings.friendFormat==='doubles';
  syncRulesControls();
  $('friend-mode-note').hidden=settings.finale!=='father-son';
  groupChoice('hell-roles','hellRole',hellRole);
  groupChoice('ai-formats','format',settings.ruleset+':'+(settings.ruleset==='standard21'?21:settings.target));
  groupChoice('friend-formats','format',settings.friendRuleset+':'+(settings.friendRuleset==='standard21'?21:settings.friendTarget));
  const rule=getScoringRules({ruleset:settings.friendRuleset,target:settings.friendTarget});
  setText('friend-rules-note',settings.friendRuleset==='standard21'?'三局两胜 · 每局21分 · 净胜2分 · 30封顶':rule.target+'分单局 · 净胜2分 · '+rule.cap+'封顶');
}
function syncEntryHeading(){
  const friendForm=entryStage==='friends'&&friendAction!=='choose';
  const labels={solo:'单人对战',ai:'人机对战',hell:'地狱挑战',friends:'好友对战',home:''};
  setText('entry-title',friendForm?(friendAction==='create'?'创建房间':'加入房间'):labels[entryStage]);
  setText('entry-back',friendForm?'← 返回好友对战':['ai','hell'].includes(entryStage)?'← 返回单人对战':'← 返回首页');
  $('menu').scrollTop=0;
  $(entryStage==='home'?'open-solo':'entry-back').focus({preventScroll:true});
}
function setFriendAction(action){
  friendAction=action;
  const choosing=action==='choose';
  const creating=action==='create';
  $('friend-tabs').hidden=!choosing;
  $('friend-form').hidden=choosing;
  $('friend-create-options').hidden=$('friend-create-details').hidden=$('create-room').hidden=!creating;
  $('friend-join-options').hidden=$('join-room').hidden=action!=='join';
  $('friend-more').open=false;
  if(entryStage==='friends')syncEntryHeading();
}
function openEntry(stage){
  if(state||room||peerAttempt||connecting)return;
  entryStage=stage;dialog(null);$('menu').dataset.entry=stage;
  $('entry-home-heading').hidden=stage!=='home';$('entry-heading').hidden=stage==='home';
  $('mode-setup').hidden=!['home','solo','ai'].includes(stage);$('ai-setup').hidden=stage!=='ai';
  $('home-actions').hidden=stage!=='home';$('ai-start-controls').hidden=stage!=='ai';
  $('solo-actions').hidden=stage!=='solo';
  $('hell-setup').hidden=stage!=='hell';$('friends-dialog').hidden=stage!=='friends';
  $('ai-more').open=false;
  $('hell-more').open=false;
  $('friend-more').open=false;
  syncEntrySettings();
  syncEntryHeading();
}
for(const [id,friend]of [['ai-formats',false],['friend-formats',true]])$(id).addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;const [ruleset,target]=button.dataset.format.split(':');
  if(friend){settings.friendRuleset=ruleset;settings.friendTarget=Number(target);}else{settings.ruleset=ruleset;settings.target=Number(target);syncRulesControls();}
  syncEntrySettings();
});
for(const [id,key,attribute] of [['ai-lineup','format','lineup'],['friend-lineup','friendFormat','lineup'],['teammate-roles','teammateRole','partnerRole'],['teammate-difficulties','teammateDifficulty','partnerDifficulty']])$(id).addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled)return;settings[key]=button.dataset[attribute];groupChoice(id,attribute,settings[key]);syncEntrySettings();});
$('room-seat').addEventListener('change',()=>send({type:'lobby',seat:Number($('room-seat').value)}));
$('room-role').addEventListener('change',()=>send({type:'lobby',role:$('room-role').value}));
$('friend-tabs').addEventListener('click',event=>{const button=event.target.closest('button');if(button&&!button.disabled)setFriendAction(button.dataset.action);});
$('entry-back').addEventListener('click',()=>{
  if(connecting||peerAttempt){exitToMenu({entry:'friends'});return;}
  closeHelpOrSetup();
  if(entryStage==='friends'&&friendAction!=='choose'){setFriendAction('choose');return;}
  openEntry(['ai','hell'].includes(entryStage)?'solo':'home');
});
syncEntrySettings();
function selectAim(value){aim=value;lastShotRequest=null;}

function setScreen(screen){
  if(screen!=='match')matchSettings?.close();
  document.body.dataset.screen=screen;
  menuAudio.setScene(screen==='match'?'match':'lobby');
  if(screen!=='match')document.body.dataset.entering='false';
  pwa.setMatchActive(screen==='match');
  $('menu').hidden=screen!=='menu';$('court-caption').hidden=screen!=='menu';
  $('hud').hidden=screen!=='match';$('game-controls').hidden=screen!=='match';$('pause').hidden=screen!=='match';
  if(screen==='match')shotLayout?.refresh();
  view?.setMode(screen);
}
function enterMatch(){
  usage.startMatch(mode);
  clearFinale();
  resultPending=false;
  leaderboardReturn=null;leaderboard.cancel();
  lastPhase='';lastHit=state?.hitId||0;lastPoint=state?.pointId||0;arenaAudio.reset();view?.resetCrowd();
  rematchRequested=false;helpOpen=false;pendingShot=null;dragAim=null;dragDepth=0;gestureOrigin=null;selectedShot='clear';selectAim(0);accumulator=0;lastFrame=performance.now();
  const fromLobby=document.body.dataset.screen!=='match';
  controls.reset();controls.setEnabled(false);setScreen('match');dialog(null);unlockAudio();
  view?.beginMatchEntrance?.({side:localTeam(state,side),online:mode==='online',phase:state?.phase,remaining:state?.timer,fromLobby});
  document.body.dataset.entering=String(view?.entranceActive===true);
  const dots=document.querySelectorAll('.player-dot');
  dots[0].style.background=localTeam(state,side)===0?'#fb7959':'#b5ebc7';
  dots[1].style.background=localTeam(state,side)===1?'#fb7959':'#b5ebc7';
}
function exitToMenu({entry='home'}={}){
  usage.endMatch('quit');
  clearFinale();finale.reset();
  resultPending=false;
  leaderboardReturn=null;leaderboard.cancel();leaderboardRecord=null;
  if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'leave'}));
  netGeneration++;peerAttempt?.abort();peerAttempt=null;peerSession?.close();peerSession=null;peerDisconnected=false;
  socket?.close();socket=null;room=null;setRoomBusy(false);reconnecting=false;reconnectError='';
  mode='menu';side=0;state=null;pendingShot=null;helpOpen=false;rematchRequested=false;controls.reset();controls.setEnabled(false);
  arenaAudio.reset();
  playback.reset();lastRtt=null;peerStats=null;lastPeerStats=0;peerStatsPending=false;
  $('countdown').hidden=true;$('hell-status').hidden=true;setScreen('menu');dialog(null);history.replaceState(null,'',location.pathname+(netDragPlaytest?'?netDrag=1':''));
  if(entry==='friends')setFriendAction('choose');
  openEntry(entry);
  if(entry==='home')queueMicrotask(()=>onboarding.maybeShow());
}
function startAI(){
  if(peerAttempt||peerSession)exitToMenu();
  playback.reset();lastRtt=null;
  mode='ai';side=0;state=createMatch({target:settings.target,ruleset:settings.ruleset,format:settings.format,roles:settings.format==='doubles'?[settings.role,settings.coachRole,settings.teammateRole,settings.coachRole]:[settings.role,settings.coachRole],teammateDifficulty:settings.teammateDifficulty,difficulty:settings.difficulty,
    playerAssist:settings.difficulty==='easy'?'beginner':'none',assistSide:0,netDragSide:netDragPlaytest?0:null,seed:Math.floor(Math.random()*0x7fffffff)});
  enterMatch();
  if(netDragPlaytest)showToast('网前试打：吊球轻点打短，向上拖可挑后场');
}
function startHell(){
  if(peerAttempt||peerSession)exitToMenu();
  playback.reset();lastRtt=null;
  mode='ai';side=0;state=createMatch({challenge:'hell',roles:[hellRole,'balanced'],difficulty:'hard',
    seed:Math.floor(Math.random()*0x7fffffff)});
  enterMatch();
}
$('hell-roles').addEventListener('click',event=>{
  const button=event.target.closest('[data-hell-role]');if(!button)return;
  hellRole=button.dataset.hellRole;groupChoice('hell-roles','hellRole',hellRole);
});
const worldInput=input=>toWorldInput({...input,aimDepth:input.aimDepth??dragDepth},localTeam(state,side),dragAim??aim);
function send(message){if(peerMode)peerSession?.send(message);else if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(['create','join','resumeSession'].includes(message.type)?{...message,rulesVersion:RULES_VERSION}:message));}
function fireShot(request){
  if(view?.entranceActive||!state||!['serve','rally'].includes(state.phase))return;
  const selectedAim=resolveShotAim(request,aim);
  const input=worldInput({...controls.sample(),...request,aim:selectedAim});dragAim=null;dragDepth=0;
  selectedShot=request.shot;lastShotRequest={shot:request.shot,aim:selectedAim,aimDepth:request.aimDepth??0,charge:request.charge};
  if(mode==='online')send({type:'input',...input});else pendingShot=input;
}
function requestPause(){
  if(view?.entranceActive)return;
  if(reconnecting){showConnectionRecovery();return;}
  if(!state||!['serve','rally','point','intermission'].includes(state.phase))return;
  pendingShot=null;controls.reset();
  if(mode==='online')send({type:'pause'});
  else if(!pauseMatch(state,0)){helpOpen=false;showToast('暂停已用过，每人每场可暂停一次。');}
}

function handleNetwork(message){
  if(message.type==='room'){
    room=message;side=message.slot;
    const doubles=message.format==='doubles',capacity=doubles?4:2,connected=message.players.filter(p=>p?.connected).length;
    if(finale.blocking&&message.players.some(player=>!player?.connected))clearFinale();
    currentPlayerId=message.players[side]?.playerId||null;
    setText('waiting-code',message.code);
    setText('waiting-mode',doubles?'双打 2V2 · 自由配合':message.rules?.finale==='father-son'?'父子局 · 赛后互动不可跳过':'普通对局 · 无赛后互动');
    setText('waiting-status',connected===capacity?'● 全员到齐，可以准备':'● 等待球友加入 · '+connected+'/'+capacity);
    history.replaceState(null,'','?room='+encodeURIComponent(message.code)+(doubles?'&format=doubles':''));
    $('doubles-room-options').hidden=!doubles;
    if(doubles){
      $('room-seat').value=String(side);$('room-role').value=message.players[side]?.role||'balanced';
      for(const option of $('room-seat').options)option.disabled=Number(option.value)!==side&&Boolean(message.players[Number(option.value)]);
    }
    if(message.abandoned&&!state){peerClosed(new Error('等待重连超时，房间已结束，请重新建房'));return;}
    if(!state){mode='waiting';
      const ready=message.ready||[],parent=message.rules?.finale==='father-son';
      const lineup=message.players.map((p,index)=>(doubles?(index%2===0?'A':'B')+'队 '+(index<2?'1':'2')+' · ':'')+(p?((index===side?'你 · ':'')+p.name+' · '+ROLES[p.role].label+' · '+(!p.connected?'已断开':ready.includes(index)?'已准备':'未准备')):'等待加入')).join('\n');
      setText('waiting-players',lineup);
      setText('waiting-rules',(message.ruleset==='standard21'?'标准三局 · 每局21分':message.target+'分单局')+' · '+(doubles?'双打':parent?'父子局':'普通单打'));
      setText('waiting-consent',parent?'父子局：败者跪拜叫爸爸，约3秒不可跳过。双方确认并准备后开始比赛。':doubles?'确认队伍与规则，四人准备后倒数 3 秒开赛。换位或换角色需要重新准备。':'确认本房间规则，双方准备后倒数 3 秒开始比赛。');
      $('ready-room').disabled=connected!==capacity||ready.includes(side)||!message.readyRequired;
      setText('ready-room',connected!==capacity?'等待全员加入':ready.includes(side)?'已准备，等待球友':parent?'同意父子局并准备':'确认规则并准备');
      dialog('waiting-dialog');}
  }else if(message.type==='reconnecting'){
    reconnecting=true;recoveryRemainingMs=message.remainingMs;controls.reset();pendingShot=null;playback.freeze(performance.now());controls.setEnabled(false);if(state)showConnectionRecovery();else setText('waiting-status','连接中断 · 正在重连 '+Math.ceil(message.remainingMs/1000)+' 秒');
  }else if(message.type==='state'){
    message.state.reconnect=message.reconnect?.slots?.length?message.reconnect:null;recoveryRemainingMs=null;
    if(message.state?.rulesVersion!==RULES_VERSION){showToast('比赛规则已更新，请双方联网刷新后重新建房');controls.setEnabled(false);return;}
    if(!playback.receive(message.state,performance.now(),message))return;
    leaderboardRecord=peerMode&&message.state.phase==='over'?(message.state.format==='doubles'?doublesRecords:peerRecords).record({sessionId:message.sessionId||room?.sessionId,matchId:message.matchId,players:room?.players,state:message.state,selfId:currentPlayerId,abandoned:message.abandoned}):message.leaderboard||null;
    const entering=mode!=='online'||(state?.phase==='over'&&message.state.phase!=='over');
    if(reconnecting)lastPhase='';
    state=message.state;mode='online';reconnecting=false;reconnectError='';
    if(entering)enterMatch();
    usage.observeResult(state);
    const wasFinaleBlocking=finale.blocking;
    finale.receive(message,{mode,players:room?.players,finaleMode:room?.rules?.finale});
    if(wasFinaleBlocking&&!finale.blocking)clearFinale();
  }else if(message.type==='error'){
    showToast(message.message);connecting=false;helpOpen=false;
    if(reconnecting){reconnectError=message.message;controls.setEnabled(false);showConnectionRecovery();}
  }else if(message.type==='pong'){
    // Host commands are local to its authority; their turnaround is not peer RTT.
    lastRtt=peerMode&&peerSession?.isHost?null:Math.max(0,Date.now()-message.at);
    setText('connection',lastRtt===null?'手机直连':`${lastRtt} ms · ${peerMode?'手机直连':'联机'}`);
  }else if(message.type==='rematch'){
    rematchRequested=message.ready.includes(side);
    if(state?.phase==='over')setText('rematch',rematchRequested?'等待对手确认…':message.ready.length?'对手邀请再战 · 开始 ↗':'再来一局 ↗');
  }else if(message.type==='resumeReady'){
    if(state?.phase==='paused')setText('resume',message.ready.includes(side)?'已准备，等待对手…':'对手已准备 · 继续 ↗');
  }
}
async function connect(){
  if(socket?.readyState===WebSocket.OPEN)return;
  const generation=++netGeneration;
  const ws=new WebSocket(getWebSocketURL());socket=ws;
  ws.addEventListener('message',event=>{if(generation!==netGeneration)return;try{handleNetwork(JSON.parse(event.data));}catch(error){console.error(error);showToast('收到无效比赛状态，请重新进入房间');}});
  ws.addEventListener('close',()=>{
    if(generation!==netGeneration)return;
    clearFinale();
    controls.reset();pendingShot=null;
    if(room&&mode==='online'){
      playback.freeze(performance.now());controls.setEnabled(false);lastRtt=null;
      reconnecting=true;reconnectError='';showConnectionRecovery();setText('connection','正在重连…');showToast('连接中断，正在尝试恢复；比赛状态以服务器为准。');
      setTimeout(async()=>{if(generation!==netGeneration||!room)return;const token=room.token;try{await connect();send({type:'resumeSession',token});}catch{showToast('暂时无法连接，请检查网络后重新进入房间');}},1200);
    }else if(mode==='waiting'){showToast('房间连接已断开，请重新创建');exitToMenu();}
  });
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{ws.close();reject(new Error('连接超时，请确认游戏服务器正在运行'));},6500);
    ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
    ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('无法连接游戏服务器，请检查网络'));},{once:true});
  });
}
async function roomAction(type){
  if(practiceOnly){dialog('lan-dialog');return;}
  if(!peerMode&&settings.friendFormat==='doubles'){showToast('四人双打请使用手机直连入口');return;}
  if(connecting)return;
  const name=normalizePlayerName($('player-name').value);
  if(!name){showToast('先输入你的昵称或常用玩家 ID');$('player-name').focus();return;}
  const code=$('room-code').value.trim().toUpperCase();
  if(type==='join'&&!/^[A-Z2-9]{5}$/.test(code)){showToast('请输入 5 位房间码');return;}
  setRoomBusy(true,type);
  let generation=peerMode?++netGeneration:netGeneration;
  const attempt=peerMode?new AbortController():null;
  if(attempt){peerAttempt=attempt;peerDisconnected=false;}
  try{
    const profile=preparePlayerProfile();$('player-name').value=profile.saveName(name);preparePlayerProfile();
    const options={type,name,format:settings.friendFormat,role:settings.friendRole,target:settings.friendTarget,ruleset:settings.friendRuleset,readyRequired:true,finaleCapability:'father-son',...(type==='join'?{code}:{finale:settings.finale})};
    if(peerMode){
      const playerId=await peerRecords.publicId(profile.playerKey);
      if(generation!==netGeneration)return;
      const session=await openPeerRoom({...options,playerId,signal:attempt.signal,
        onMessage:message=>{if(generation===netGeneration)handleNetwork(message);},
        onStatus:text=>{if(generation===netGeneration)setText('waiting-status',text);},
        onClose:error=>{if(generation===netGeneration)peerClosed(error);}});
      if(generation!==netGeneration){session.close();return;}
      peerSession=session;peerAttempt=null;
    }else{const connection=connect();generation=netGeneration;await connection;if(generation!==netGeneration)return;send({...options,playerKey:profile.playerKey});}
  }catch(error){if(generation===netGeneration&&!attempt?.signal.aborted){showToast(error.message);if(peerMode&&!state){room=null;mode='menu';dialog('friends-dialog');}}}
  finally{if(generation===netGeneration){peerAttempt=null;setRoomBusy(false);}}
}
function setRoomBusy(busy,type){
  connecting=busy;
  $('create-room').disabled=busy;$('join-room').disabled=busy;
  for(const id of ['friend-modes','friend-roles','friend-formats','friend-tabs','friend-lineup'])for(const choice of $(id).querySelectorAll('button'))choice.disabled=busy;
  setText('create-room',busy&&type==='create'?'正在创建…':'创建房间');
  setText('join-room',busy&&type==='join'?'正在连接…':'加入房间');
}
function peerClosed(error){
  clearFinale();
  peerDisconnected=true;peerSession?.close();peerSession=null;controls.reset();
  if(!state){exitToMenu();showToast(error?.message||'房间已断开，请重新创建');return;}
  if(state.phase!=='over'){
    finishMatch(state,null,error?.message||'手机连接已断开，请重新建房');
    playback.reset();playback.receive(state,performance.now());
    leaderboardRecord={status:'excluded',reason:'abandoned'};lastPhase='';
    usage.observeResult(state);
  }
  setText('connection','连接已断开');
}
function closeHelpOrSetup(){
  if(peerAttempt){netGeneration++;peerAttempt.abort();peerAttempt=null;setRoomBusy(false);}
  helpOpen=false;if(state?.phase==='paused')dialog('pause-dialog');else dialog(null);
}
$('open-solo').addEventListener('click',()=>openEntry('solo'));
$('start-ai').addEventListener('click',()=>openEntry('ai'));
$('start-ai-confirm').addEventListener('click',startAI);
$('start-hell').addEventListener('click',()=>openEntry('hell'));
$('start-hell-confirm').addEventListener('click',startHell);
$('open-friends').addEventListener('click',()=>{settings.finale='none';groupChoice('friend-modes','finale','none');setFriendAction('choose');dialog(practiceOnly?'lan-dialog':'friends-dialog');});
$('open-leaderboard').addEventListener('click',()=>openLeaderboard('menu'));
$('result-leaderboard').addEventListener('click',()=>openLeaderboard('result'));
$('close-leaderboard').addEventListener('click',closeLeaderboard);
$('leaderboard-retry').addEventListener('click',()=>leaderboard.load({selfId:currentPlayerId}));
$('create-room').addEventListener('click',()=>roomAction('create'));
$('ready-room').addEventListener('click',()=>{if(room?.readyRequired&&!$('ready-room').disabled)send({type:'ready',format:room.format||'singles',target:room.target,ruleset:room.ruleset,finale:room.rules.finale});});
$('join-room').addEventListener('click',()=>roomAction('join'));
$('room-code').addEventListener('keydown',event=>{if(event.key==='Enter')roomAction('join');});
$('pause').addEventListener('click',requestPause);
$('resume').addEventListener('click',()=>{if(mode==='online')send({type:'resume'});else if(state)resumeMatch(state);});
for(const id of ['leave-game','back-menu'])$(id).addEventListener('click',exitToMenu);
$('leave-waiting').addEventListener('click',()=>exitToMenu({entry:'friends'}));
$('rematch').addEventListener('click',()=>{
  if(finale.blocking)return;
  if(peerMode&&peerDisconnected){exitToMenu();dialog('friends-dialog');return;}
  if(mode==='online'){send({type:'rematch'});rematchRequested=true;setText('rematch','等待球友同意…');}
  else if(state?.challenge)startHell();
  else startAI();
});
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',closeHelpOrSetup);
$('help').addEventListener('click',()=>{
  if(finale.blocking)return;
  if(view?.entranceActive||state?.phase==='countdown')return;
  if(state&&['serve','rally','point','intermission'].includes(state.phase)){helpOpen=true;requestPause();return;}
  helpOpen=true;dialog('help-dialog');
});
$('copy-invite').addEventListener('click',async()=>{
  if(!room)return;
  const address=new URL(location.pathname,location.origin);address.searchParams.set('room',room.code);if(room.format==='doubles')address.searchParams.set('format','doubles');const invite=address.href;
  try{await navigator.clipboard.writeText(invite);showToast('邀请链接已复制');}
  catch{window.prompt('复制链接发给球友：',invite);}
});
$('open-beta-group').addEventListener('click',()=>{
  $('beta-copy-status').textContent='';
  dialog('beta-group');
  $('copy-beta-wechat').focus();
});
$('copy-beta-wechat').addEventListener('click',async()=>{
  const wechat=$('beta-wechat');
  const status=$('beta-copy-status');
  try{
    await navigator.clipboard.writeText(wechat.value);
    status.textContent='微信号已复制';
  }catch{
    wechat.focus();
    wechat.select();
    status.textContent='请手动复制已选中的微信号';
  }
});
$('sound').addEventListener('click',event=>{sound=!sound;syncSoundControls();menuGesture(event,'confirm');showToast(sound?'声音已开启':'声音已关闭');});
document.addEventListener('visibilitychange',()=>{
  if(finale.blocking)lastFrame=performance.now();
  arenaAudio.setVisible(!document.hidden);
  menuAudio.setVisible(!document.hidden);
  if(!document.hidden||!state||state.phase==='over')return;
  if(shotLayoutHold){controls?.reset();pendingShot=null;return;}
  controls?.reset();pendingShot=null;
  if(mode==='online'){playback.freeze(performance.now());send({type:'suspend'});}
  else if(mode==='ai'&&state.phase!=='paused'){
    if(state.phase==='countdown'){state.phase='paused';state.timer=state.pause.remaining;state.message='比赛暂停 · 等待继续';}
    else if(!pauseMatch(state,0)){const winner=state.score[0]===state.score[1]?null:state.score[0]>state.score[1]?0:1;finishMatch(state,winner,'暂停次数已用完，本局按当前比分结束');}
  }
});

function relativeMessage(text){
  const team=localTeam(state,side), own=state?.format==='doubles'?'我方':'你';
  return String(text||'').replace(/近场/g,team===0?own:'对方').replace(/远场/g,team===1?own:'对方');
}
function shotGuidance(state){
  const input=controls.sample(),shot=input.prepare||selectedShot;
  const localRequest=input.prepare?{shot,aim:dragAim??aim,aimDepth:dragDepth,charge:input.charge}:
    lastShotRequest||{shot,aim,aimDepth:0,charge:0};
  const request={...localRequest,aim:localRequest.aim*(localTeam(state,side)===0?1:-1)};
  return {landing:predictLanding(state),intercept:getInterceptAdvice(state,side,request),
    availability:getShotAvailability(state,side,request),
    target:getShotTarget(state,side,request),
    shot,prepare:input.prepare,charge:input.charge,aim:localRequest.aim,aimDepth:localRequest.aimDepth};
}
function updateUI(info,state){
  if(!state)return;
  const team=localTeam(state,side),doubles=state.format==='doubles';
  matchSettings?.update(state,side,mode);
  const hell=hellStatus(state);
  $('hell-status').hidden=!hell;
  if(hell){
    $('hell-status').dataset.skill=hell.key;
    setText('hell-skill-title',hell.title);setText('hell-skill-hint',hell.hint);
  }
  $('result-leaderboard').hidden=mode!=='online';
  $('result-record').hidden=mode!=='online';
  if(mode==='online'&&state.phase==='over')setText('result-record',resultRecordText(leaderboardRecord));
  const self=state.players[side],opponent=state.players[1-team];
  const namesPair=lineupNames(state,side,mode==='online'?room?.players:null);
  const nameSelf=doubles?namesPair.self:mode==='online'?room?.players[side]?.name||'你':'你';
  const nameOther=doubles?namesPair.other:mode==='online'?room?.players[1-team]?.name||'球友':state.challenge?'地狱球王':`${names[settings.difficulty]}陪练`;
  setText('name-self',nameSelf);setText('name-other',nameOther);
  setText('role-self',ROLES[self.role].label+'型');setText('role-other',state.challenge?'体力 ∞':ROLES[opponent.role].label+'型');
  setText('score-self',state.challenge?state.score[team]+'/2':state.score[team]);setText('score-other',state.challenge?state.score[1-team]+'/5':state.score[1-team]);
  const matchType=doubles?(mode==='ai'?'人机双打':'好友双打'):mode==='ai'?(state.netDragSide===side?'人机 · 网前试打':'人机对战'):room?.rules?.finale==='father-son'?'父子局':'普通对局';
  const matchLabel=state.challenge?'地狱挑战 · 你 2 分 / 对手 5 分':state.ruleset==='standard21'?`第${state.gameNumber}局 · ${state.games[team]}:${state.games[1-team]} · ${matchType}`:`${state.target} 分制 · ${matchType}`;
  const scoring=getScoringRules(state);
  const scoringPhase=['paused','countdown'].includes(state.phase)?state.pause.previousPhase:state.phase;
  const extraPoints=!state.challenge&&['serve','rally','point'].includes(scoringPhase)&&Math.min(...state.score)>=scoring.target-1;
  const pressure=['serve','rally','point'].includes(scoringPhase)?matchPressure(state):[null,null];
  const pressureHint=[team,1-team].filter(player=>pressure[player]).map(player=>(player===team?'你':'对手')+'的'+(pressure[player]==='match'?'赛点':'局点')).join(' · ');
  const scoringHint=[pressureHint,extraPoints?(state.score.every(score=>score===scoring.cap-1)?'下一分获胜':'加球中'):''].filter(Boolean).join(' · ');
  setText('match-label',matchLabel+(scoringHint?` · ${scoringHint}`:''));
  setText('match-message',state.phase==='serve'?(state.server===team?`${doubles&&state.serverPlayer!==side?'队友':'你'}发球 · ${state.service?.court==='left'?'左':'右'}发球区 → 对角`:'等待对手对角发球'):relativeMessage(state.message));
  setText('rally',state.phase==='rally'?`${state.rally} 拍回合`:`第 ${state.pointId+1} 分`);
  if(mode==='ai')setText('connection',state.challenge?'2 / 5 非对称挑战':'本地练习');
  const roleHint=roleGuidance[self.role]||roleGuidance.balanced;
  const smashButton=document.querySelector('[data-shot="smash"]');
  const canSmash=Boolean(info.availability.canSmash);
  smashButton.classList.toggle('unavailable',!canSmash);
  smashButton.classList.toggle('ready',canSmash);
  if(canSmash&&!smashReady&&state.phase==='rally')haptics.ready();
  smashReady=canSmash;
  const lane=info.aim,depth=info.aimDepth;
  const quality=info.target?.quality;
  const risk=quality?.risk||0;
  const qualityReason=quality?.reason?.split(' · ')[0]||'站稳回球';
  const riskText=info.prepare&&quality?`${risk>.55?'高风险':risk>.25?'有风险':'稳健'} · ${qualityReason.split('，')[0]}`:'左右选线 · 松手击球';
  setText('shot-risk',riskText);
  $('shot-risk').dataset.risk=info.prepare?(risk>.55?'high':risk>.25?'medium':'low'):'idle';
  setText('aim-value',info.prepare?`${lane<-.15?'左':lane>.15?'右':'中路'}${depth>.15?' · 偏深':depth<-.15?' · 偏短':''} · ${Math.round(info.charge*100)}%`:'按住击球键拖动');
  const gesture=$('gesture-pad');
  gesture.hidden=!info.prepare||!gestureOrigin;
  if(!gesture.hidden){
    gesture.style.left=`${Math.max(62,Math.min(innerWidth-62,gestureOrigin.x))}px`;
    gesture.style.top=`${Math.max(70,Math.min(innerHeight-70,gestureOrigin.y))}px`;
    $('gesture-dot').style.transform=`translate(calc(-50% + ${lane*42}px),calc(-50% - ${depth*42}px))`;
  }
  let guidance='按住击球键，拖动选落点';
  if(state.phase==='serve')guidance=state.serverPlayer===side?'发球落点限在对角区 · 按住再松开':doubles?(state.receiverPlayer===side?'你接发球 · 留意对角来球':'队友准备中 · 发球后自由跑位'):'准备接发 · 留意来球落点';
  else if(info.availability.canSmash)guidance=self.role==='power'&&state.shuttle.y<2.4
    ?'现在可杀球 · 高点威力更大':roleHint.smash;
  else if(info.availability.canHit)guidance=info.availability.assist==='beginner'?'已进入辅助接球范围 · 松开击球':roleHint.ready;
  else if(info.intercept.status==='approach')guidance=info.intercept.futureCanSmash
    ? (info.availability.assist==='beginner'?'向黄色圈移动 · 辅助范围会提前提示':'向黄色圈移动 · 准备高点击杀')
    : (info.availability.assist==='beginner'?'向黄色圈移动 · 提前准备挥拍':'向黄色圈移动 · 提前准备挥拍');
  else if(info.intercept.status==='out')guidance=info.intercept.reason;
  else if(info.intercept.status==='unreachable')guidance='来球较远 · 尽快移动接球';
  if(state.phase==='rally'&&state.shuttle.lastHit===1-team&&state.lastShot==='smash'&&
    ['approach','ready'].includes(info.intercept.status))guidance='来球快 · 提前松开高远／吊球键接回';
  if(state.phase==='rally'&&state.shuttle.lastHit===1-team&&self.pendingShot)guidance='击球已准备 · 继续跑位，进入范围后出手';
  if(state.phase==='rally'&&!info.prepare&&info.availability.canHit&&staminaEffects(self,ROLES[self.role]).severity>.5)guidance='体力偏低 · 先减速，收力打场内';
  if(state.netDragSide===team&&state.phase==='rally'&&info.prepare==='drop'&&
    state.shuttle.z*(team===0?1:-1)>0&&Math.abs(state.shuttle.z)<=2.2&&state.shuttle.y<=1.9)
    guidance=`网前试打 · ${Math.abs(info.target.aimZ)>3?'挑后场':'轻放 / 打短'} · 目标距网 ${Math.abs(info.target.aimZ).toFixed(1)} 米`;
  if(info.prepare&&info.availability.canHit&&risk>.25)guidance=qualityReason;
  else if(info.prepare==='smash'&&info.availability.canHit&&!info.availability.canSmash)guidance=info.target.fallbackReason||qualityReason||info.availability.reason;
  const lastShot=state.lastShotInfo;
  if(!info.prepare&&(lastShot?.playerSlot??lastShot?.side)===side&&state.time-lastShot.at<1.2&&lastShot.quality.risk>.25)guidance='刚才一拍 · '+lastShot.quality.reason.split(' · ')[0];
  if(doubles&&state.phase==='rally'&&!info.prepare&&!info.availability.canHit&&state._doublesAI?.[team])guidance=state._doublesAI[team].primary===side?'你来接 · 队友补位':'队友接球 · 留意空当';
  setText('assist-status',guidance);
  $('assist-status').dataset.kind=guidance==='按住击球键，拖动选落点'?'instruction':'live';
  if(state.phase==='countdown'&&helpOpen){helpOpen=false;dialog(null);}
  $('help').disabled=view?.entranceActive||reconnecting||state.phase==='countdown'||finale.blocking;
  controls.setEnabled(!view?.entranceActive&&['serve','rally'].includes(state.phase)&&!helpOpen&&!reconnecting&&!shotLayoutHold);
  $('pause').disabled=view?.entranceActive||!['serve','rally','point','intermission'].includes(state.phase);
  $('countdown').hidden=!['countdown','intermission'].includes(state.phase)||(state.phase==='intermission'&&view.rallyEnding);
  if(state.phase==='countdown')setText('countdown',Math.max(1,Math.ceil(state.timer)));
  if(state.phase==='intermission')setText('countdown',`换边准备 · ${Math.max(1,Math.ceil(state.timer))}`);
  $('countdown').classList.toggle('intermission',state.phase==='intermission');
  arenaAudio.setListener(view?.camera?.position);
  arenaAudio.update(state,!document.hidden);
  if(state.phase!==lastPhase){
    lastPhase=state.phase;
    if(state.phase==='paused'){
      $('pause-rule-note').hidden=Boolean(state.reconnect);
      setText('pause-title','比赛暂停');
      setText('resume','继续比赛 ↗');
      setText('pause-description',state.reconnect?'连接中断，等待球友恢复。超时则中断，不计胜负。':doubles&&mode==='online'?'全员连接后，四人确认继续比赛。':mode==='ai'?'每人每场可暂停一次，最多 30 秒。':peerMode?'每人每场一次，最多 30 秒；双方准备后继续，请保持游戏在前台。':'每人每场一次；双方准备后继续，断线对手可在倒计时内重连。');
      dialog(helpOpen?'help-dialog':'pause-dialog');
    }else if(state.phase==='over'){
      const resultScope=state.ruleset==='standard21'?'本场':'本局';
      setText('result-title',state.challenge&&state.endReason==='scored'?(state.winner===team?'地狱挑战通关':'挑战失败'):state.winner===null?`${resultScope}结束`:state.winner===team?`${resultScope}获胜`:`${resultScope}失利`);
      const resultScores=state.ruleset==='standard21'?state.games:state.score;
      $('result-dialog').dataset.outcome=state.winner===null?'neutral':state.winner===team?'win':'loss';
      setText('result-mode',state.challenge?'地狱挑战':`${matchType} · ${state.ruleset==='standard21'?'三局两胜':`${state.target} 分制`}`);
      setText('result-name-self',nameSelf);setText('result-name-other',nameOther);
      setText('result-score-self',resultScores[team]);setText('result-score-other',resultScores[1-team]);
      setText('result-score-label',state.ruleset==='standard21'?'最终局数':state.endReason==='scored'?'最终比分':'结束时比分');
      $('result-score').setAttribute('aria-label',`${nameSelf} ${resultScores[team]} 比 ${resultScores[1-team]} ${nameOther}${state.ruleset==='standard21'?'，局数':''}`);
      const resultReason=relativeMessage(state.message).replace(/\s*·\s*(?:局数\s*)?\d+\s*:\s*\d+$/,'');
      setText('result-reason',resultReason+(state.ruleset==='standard21'?` · 最后一局 ${state.score[team]}:${state.score[1-team]}`:''));setText('rematch',state.challenge?'再次挑战 ↗':'再来一局 ↗');
      rematchRequested=false;helpOpen=false;resultPending=true;dialog(null);
    }else if(!helpOpen)dialog(null);
  }
  if(state.phase==='over'&&resultPending&&!view.rallyEnding&&!finale.blocking){
    resultPending=false;dialog('result-dialog');
  }
  if(state.phase==='over'&&!resultPending&&!finale.blocking&&!arenaAudio.voices?.size)menuAudio.setScene('result');
  if(state.phase==='paused'){
    setText('pause-time',Math.ceil(state.reconnect?state.reconnect.remainingMs/1000:state.pause.remaining));
    $('resume').disabled=mode==='online'&&(reconnecting||room?.players.some(p=>!p?.connected));
  }
  if(peerMode&&peerDisconnected&&state.phase==='over')setText('rematch','重新建房 ↗');
  if(reconnecting)showConnectionRecovery();
}

try{
  view=new CourtView($('court'),{courtPalette:arenaPreferences.courtPalette});
  bindCameraSettings(view);
  matchSettings=bindMatchSettings(arenaAudio,{preferences:arenaPreferences,menuAudio,onChange:value=>{
    const paletteChanged=value.courtPalette!==arenaPreferences.courtPalette;
    arenaPreferences=value;
    view.setLightingBrightness(value.brightness);
    if(paletteChanged)view.setCourtPalette(value.courtPalette);
    palettePicker?.setValue(value.courtPalette);
  }});
  palettePicker=bindPalettePicker({palette:arenaPreferences.courtPalette,onSelect:name=>matchSettings.selectPalette(name)});
  view.setMode('menu');
  const resizeCourt=()=>view.resize();
  window.addEventListener('resize',resizeCourt);
  window.visualViewport?.addEventListener('resize',resizeCourt);
  new ResizeObserver(resizeCourt).observe($('court'));
  window.addEventListener('orientationchange',()=>{controls?.reset();pendingShot=null;requestAnimationFrame(resizeCourt);setTimeout(resizeCourt,250);});
  controls=new Controls({joystick:$('joystick'),knob:$('knob'),movementSurface:$('court'),shotButtons:document.querySelectorAll('[data-shot]'),onShot:fireShot,onAim:(value,explicit,depth=0)=>{
    dragAim=explicit?value:null;dragDepth=explicit?depth:0;
    const active=controls?.activeShot;
    if(active?.button)paintShotAim(active.button,value,depth);
    else clearShotAim(document.querySelectorAll('[data-shot]'));
    if(active)lastShotRequest=null;
  },onAimSelect:selectAim,onPause:requestPause,onFeedback:(type,detail)=>{if(type==='press')haptics.press(detail.shot);else if(type==='charged')haptics.charged();else if(type==='shoot'){haptics.shoot(detail.shot);flashShotButton(detail.button,detail.shot);}}});
  document.querySelectorAll('[data-shot]').forEach(button=>button.addEventListener('pointerdown',event=>{
    if(controls.activeShot?.pointerId===event.pointerId)gestureOrigin={x:event.clientX,y:event.clientY};
  }));
  window.addEventListener('keydown',()=>{if(controls.activeShot?.key)gestureOrigin=null;});
  controls.setEnabled(false);
  $('loading').hidden=true;
  let pingTime=0,previousMotion=null;
  function frame(now){
    const elapsed=Math.max(0,(now-lastFrame)/1000);lastFrame=now;
    let renderMs=0,guidanceMs=0,uiMs=0;
    if(mode==='menu'||mode==='waiting'){
      const renderStart=performance.now();
      view.renderLobby(Math.min(elapsed,.1));renderMs=performance.now()-renderStart;
    }else if(state){
      view.advanceEntrance?.(elapsed,{hidden:document.hidden,phase:state.phase,remaining:state.timer});
      document.body.dataset.entering=String(view.entranceActive===true);
      if(mode==='ai'){
        if(shotLayoutHold||view.entranceActive){accumulator=0;}
        else if(state.phase==='paused'){stepMatch(state,[{},{}],elapsed);accumulator=0;}
        else{
          accumulator+=Math.min(elapsed,.15);
          while(accumulator>=1/60){
            const input=worldInput(controls.sample());if(pendingShot){Object.assign(input,pendingShot);pendingShot=null;}
            previousMotion=captureMotion(state);
            stepMatch(state,practiceInputs(state,input,settings),1/60);accumulator-=1/60;
          }
        }
        usage.observeResult(state);
      }else if(mode==='online'){
        if(now-lastSend>1000/30){lastSend=now;if(['serve','rally'].includes(state.phase)&&!reconnecting)send({type:'input',...worldInput(controls.sample())});}
        if(now-pingTime>2000){pingTime=now;send({type:'ping',at:Date.now()});}
      }
      const displayed=mode==='online'?(playback.sample(now)||state):presentLocal(state,previousMotion,accumulator*60);
      const guidanceStart=performance.now();const info=shotGuidance(displayed);guidanceMs=performance.now()-guidanceStart;
      const finaleFrame=mode==='online'?finale.update({dt:elapsed,serverNow:now-(playback.clockOffset??0)-playback.bufferMs,
        phase:displayed.phase,rallyEnding:view.rallyEnding,visible:!document.hidden}):null;
      if(finaleFrame)info.finale=finaleFrame;
      info.playerNames=mode==='online'?room?.players.map(p=>p?.name||'球友'):null;
      const renderStart=performance.now();view.render(displayed,side,reconnecting?0:Math.min(elapsed,.1),info);renderMs=performance.now()-renderStart;
      const uiStart=performance.now();updateUI(info,displayed);uiMs=performance.now()-uiStart;
      showFinale(finaleFrame);
      // Input eligibility follows authority as well as the delayed presentation.
      if(reconnecting||!['serve','rally'].includes(state.phase))controls.setEnabled(false);
    }
    performanceMonitor.record({frameMs:elapsed*1000,renderMs,guidanceMs,uiMs,visible:!document.hidden});
    if(now-lastDiagnostics>500){
      lastDiagnostics=now;const stats=performanceMonitor.summary();
      const qualityKey=JSON.stringify(stats.quality);
      if(qualityKey!==appliedQuality){view.setQuality(stats.quality);appliedQuality=qualityKey;}
      const network=mode==='online'?playback.metrics(now):null;
      const renderer=view.getRendererMetrics();
      if(mode==='online'&&peerSession&&typeof peerSession.getStats==='function'&&now-lastPeerStats>2000&&!peerStatsPending){
        peerStatsPending=true;lastPeerStats=now;
        Promise.resolve(peerSession.getStats()).then(value=>{peerStats=value;},()=>{peerStats=null;}).finally(()=>{peerStatsPending=false;});
      }
      if(network&&((network.underruns>0)||network.jitterMs>80||network.ageMs>500))usage.markDegraded?.('network');
      if(stats.quality.shadows===false||stats.quality.pixelRatio<performanceMonitor.maxPixelRatio)usage.markDegraded?.('performance');
      if($('performance-readout'))setText('performance-readout',formatPerformance(stats,network,lastRtt,renderer,peerStats));
      // Read-only diagnostics for reproducible browser QA and user bug reports.
      window.rallyDiagnostics={render:stats,network,rtt:lastRtt,renderer,peer:peerStats,
        stateTime:state?.time??null,statePhase:state?.phase??null,
        format:state?.format,playerSlot:side,team:state?localTeam(state,side):null,score:state?[...state.score]:null,hitId:state?.hitId,playerCount:state?.players.length,serverPlayer:state?.serverPlayer,receiverPlayer:state?.receiverPlayer,
        entrance:{active:view.entranceActive,progress:view.entrance?.progress??1,camera:view.camera?.position?.toArray()},
        challenge:state?.challenge?{...state.challenge,score:[...state.score],hitId:state.hitId,lastShot:state.lastShotInfo}:null,
        netDragPlaytest:state?.netDragSide===side&&mode==='ai',
        lastShot:state?.netDragSide===side?state.lastShotInfo:null};
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  const invited=new URLSearchParams(location.search).get('room');
  if(invited&&!practiceOnly){settings.friendFormat=new URLSearchParams(location.search).get('format')==='doubles'?'doubles':'singles';syncEntrySettings();$('room-code').value=invited.toUpperCase().slice(0,5);setFriendAction('join');dialog('friends-dialog');}
  onboarding.maybeShow();
}catch(error){
  console.error(error);$('loading').textContent='球场加载失败：'+error.message+'。请使用支持 WebGL 2 的浏览器后刷新。';
}
