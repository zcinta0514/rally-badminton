import { CourtView } from './view.js';
import { Controls } from './controls.js';
import { ArenaAudio } from './arena-audio.js';
import { NetworkPlayback } from './network-playback.js';
import { PerformanceMonitor, formatPerformance } from './performance.js';
import { bindCameraSettings } from './camera-settings.js';
import { initPWA, getWebSocketURL } from './pwa.js';
import { createPlayerProfile, normalizePlayerName } from './player-profile.js';
import { createLeaderboard, getLeaderboardURL, resultRecordText } from './leaderboard.js';
import { normalizeLanAddress } from './lan-entry.js';
import { resolveShotAim, toWorldInput } from './play-input.js';
import { createMatch, stepMatch, aiInput, pauseMatch, resumeMatch, finishMatch, ROLES, predictLanding, getShotAvailability, getInterceptAdvice, getShotTarget } from '../shared/game.js';

const $=id=>document.getElementById(id);
const demoMode=globalThis.RALLY_CONFIG?.demoMode===true;
const names={easy:'入门',medium:'进阶',hard:'高手'};
const roleNotes={balanced:'均衡的移动、力量与恢复，适合初次上场。',swift:'移动更快、恢复更快；杀球力量稍弱，靠跑位创造机会。',power:'杀球更重、体力上限更高；步速和恢复较慢，要选好时机。'};
const settings={role:'balanced',difficulty:'easy',target:5,ruleset:'quick'};
let mode='menu',state=null,side=0,room=null,socket=null,netGeneration=0;
let pendingShot=null,aim=0,dragAim=null,view,controls,lastFrame=performance.now(),accumulator=0,lastSend=0;
let toastTimer,helpOpen=false,rematchRequested=false,lastPhase='',lastHit=0,lastPoint=0,connecting=false,reconnecting=false,resultPending=false;
let reconnectError='';
let playerProfile=null,currentPlayerId=null,leaderboardRecord=null,leaderboardReturn=null;
const arenaAudio=new ArenaAudio();
let sound=true;
let selectedShot='clear',dragDepth=0,lastShotRequest=null,gestureOrigin=null;
const showToast=text=>{clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3800);};
const playback=new NetworkPlayback();
const performanceMonitor=new PerformanceMonitor({devicePixelRatio:window.devicePixelRatio});
const pwa=initPWA({fullscreenButton:$('fullscreen'),showToast});
let lastRtt=null,lastDiagnostics=0,appliedQuality='';
const setText=(id,text)=>{if($(id).textContent!==String(text))$(id).textContent=text;};
const leaderboard=createLeaderboard({document,getURL:()=>getLeaderboardURL(getWebSocketURL())});
function preparePlayerProfile(){
  playerProfile??=createPlayerProfile();
  setText('player-profile-note',playerProfile.persistent?'此名称会显示在比分和榜单中。战绩绑定当前浏览器；换设备或清除网站数据后不自动同步。':'浏览器未允许保存身份。本页可正常记分，关闭后将无法接续此身份的战绩。');
  return playerProfile;
}
if(demoMode){
  for(const id of ['open-leaderboard','result-leaderboard'])$(id).hidden=true;
  setText('menu-intro','与人机练习，或通过局域网和好友 1V1。');
}else try{$('player-name').value=preparePlayerProfile().name;}catch(error){setText('player-profile-note',error.message);}
function dialog(id){
  for(const el of document.querySelectorAll('.dialog'))el.hidden=el.id!==id;
  $('dialog-backdrop').hidden=!id;
}
function openLeaderboard(from){
  if(demoMode)return;
  if(from==='result'&&state?.phase!=='over')return;
  if(from==='menu'&&mode!=='menu')return;
  leaderboardReturn=from;dialog('leaderboard-dialog');leaderboard.load({selfId:currentPlayerId});
}
function closeLeaderboard(){
  const from=leaderboardReturn;leaderboardReturn=null;leaderboard.cancel();
  if(reconnecting){showConnectionRecovery();return;}
  dialog(from==='result'&&state?.phase==='over'?'result-dialog':null);
}
function showConnectionRecovery(){
  helpOpen=false;
  setText('pause-title','连接中断。');setText('pause-time','—');
  setText('pause-description',reconnectError?`连接恢复失败：${reconnectError}。可返回首页继续人机，或重新约战。`:'正在尝试恢复连接。可直接返回首页；离线人机不需要比赛服务器。');
  setText('resume','等待连接恢复…');$('resume').disabled=true;
  dialog('pause-dialog');
}
function unlockAudio(){
  if(sound)arenaAudio.unlock();
}
document.addEventListener('pointerdown',unlockAudio,{once:true});

function groupChoice(container,attribute,value){
  for(const button of $(container).querySelectorAll('button')){
    const selected=button.dataset[attribute]===String(value);button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
  }
}
for(const [id,key,attr] of [['roles','role','role'],['difficulties','difficulty','difficulty'],['targets','target','target'],['rulesets','ruleset','ruleset']]){
  $(id).addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    settings[key]=key==='target'?Number(button.dataset[attr]):button.dataset[attr];groupChoice(id,attr,settings[key]);
    if(key==='role')setText('role-note',roleNotes[settings.role]);
    if(key==='ruleset'){
      const standard=settings.ruleset==='standard21';
      $('targets').setAttribute('aria-disabled',String(standard));
      for(const choice of $('targets').querySelectorAll('button'))choice.disabled=standard;
      groupChoice('targets','target',standard?21:settings.target);
      setText('rules-note',standard?'21 分 · 赢两分，30 封顶 · 三局两胜 · 局间休息 4 秒':'先到目标分获胜 · 对角发球');
    }
  });
}
function selectAim(value){aim=value;lastShotRequest=null;}

function setScreen(screen){
  document.body.dataset.screen=screen;
  pwa.setMatchActive(screen==='match');
  $('menu').hidden=screen!=='menu';$('court-caption').hidden=screen!=='menu';
  $('hud').hidden=screen!=='match';$('game-controls').hidden=screen!=='match';$('pause').hidden=screen!=='match';
  view?.setMode(screen);
}
function enterMatch(){
  resultPending=false;
  leaderboardReturn=null;leaderboard.cancel();
  lastPhase='';lastHit=state?.hitId||0;lastPoint=state?.pointId||0;arenaAudio.reset();
  rematchRequested=false;helpOpen=false;pendingShot=null;dragAim=null;dragDepth=0;gestureOrigin=null;selectedShot='clear';selectAim(0);accumulator=0;lastFrame=performance.now();
  controls.reset();setScreen('match');dialog(null);unlockAudio();
  const dots=document.querySelectorAll('.player-dot');
  dots[0].style.background=side===0?'#fb7959':'#b5ebc7';
  dots[1].style.background=side===1?'#fb7959':'#b5ebc7';
}
function exitToMenu(){
  resultPending=false;
  leaderboardReturn=null;leaderboard.cancel();leaderboardRecord=null;
  if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'leave'}));
  netGeneration++;socket?.close();socket=null;room=null;connecting=false;reconnecting=false;reconnectError='';
  mode='menu';side=0;state=null;pendingShot=null;helpOpen=false;rematchRequested=false;controls.reset();controls.setEnabled(false);
  arenaAudio.reset();
  playback.reset();lastRtt=null;
  $('countdown').hidden=true;setScreen('menu');dialog(null);history.replaceState(null,'',location.pathname);
}
function startAI(){
  playback.reset();lastRtt=null;
  mode='ai';side=0;state=createMatch({target:settings.target,ruleset:settings.ruleset,roles:[settings.role,'balanced'],difficulty:settings.difficulty,seed:Math.floor(Math.random()*0x7fffffff)});
  enterMatch();
}
const worldInput=input=>toWorldInput({...input,aimDepth:input.aimDepth??dragDepth},side,dragAim??aim);
function send(message){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));}
function fireShot(request){
  if(!state||!['serve','rally'].includes(state.phase))return;
  const selectedAim=resolveShotAim(request,aim);
  const input=worldInput({...controls.sample(),...request,aim:selectedAim});dragAim=null;dragDepth=0;
  selectedShot=request.shot;lastShotRequest={shot:request.shot,aim:selectedAim,aimDepth:request.aimDepth??0,charge:request.charge};
  if(mode==='online')send({type:'input',...input});else pendingShot=input;
}
function requestPause(){
  if(reconnecting){showConnectionRecovery();return;}
  if(!state||!['serve','rally','point','intermission'].includes(state.phase))return;
  pendingShot=null;controls.reset();
  if(mode==='online')send({type:'pause'});
  else if(!pauseMatch(state,0)){helpOpen=false;showToast('暂停已用过，每人每场可暂停一次。');}
}

function handleNetwork(message){
  if(message.type==='room'){
    room=message;side=message.slot;
    currentPlayerId=message.players[side]?.playerId||null;
    setText('waiting-code',message.code);
    setText('waiting-status',message.players.filter(Boolean).length===2?'● 球友已到，准备开场':'● 房间已创建，等待加入');
    history.replaceState(null,'',`?room=${encodeURIComponent(message.code)}`);
    if(!state){mode='waiting';dialog('waiting-dialog');}
  }else if(message.type==='state'){
    if(!playback.receive(message.state,performance.now(),message))return;
    leaderboardRecord=message.leaderboard||null;
    const entering=mode!=='online'||(state?.phase==='over'&&message.state.phase!=='over');
    if(reconnecting)lastPhase='';
    state=message.state;mode='online';reconnecting=false;reconnectError='';
    if(entering)enterMatch();
  }else if(message.type==='error'){
    showToast(message.message);connecting=false;helpOpen=false;
    if(reconnecting){reconnectError=message.message;controls.setEnabled(false);showConnectionRecovery();}
  }else if(message.type==='pong'){
    lastRtt=Math.max(0,Date.now()-message.at);
    setText('connection',`${lastRtt} ms · 联机`);
  }else if(message.type==='rematch'){
    rematchRequested=message.ready.includes(side);
    if(state?.phase==='over')setText('rematch',rematchRequested?'等待球友同意…':message.ready.length?'球友邀你再战 · 开始 ↗':'再来一局 ↗');
  }else if(message.type==='resumeReady'){
    if(state?.phase==='paused')setText('resume',message.ready.includes(side)?'已准备，等待球友…':'球友已准备 · 继续 ↗');
  }
}
async function connect(){
  if(socket?.readyState===WebSocket.OPEN)return;
  const generation=++netGeneration;
  const ws=new WebSocket(getWebSocketURL());socket=ws;
  ws.addEventListener('message',event=>{if(generation!==netGeneration)return;try{handleNetwork(JSON.parse(event.data));}catch(error){console.error(error);showToast('收到无效比赛状态，请重新进入房间');}});
  ws.addEventListener('close',()=>{
    if(generation!==netGeneration)return;
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
  if(demoMode){dialog('lan-dialog');return;}
  if(connecting)return;
  const name=normalizePlayerName($('player-name').value);
  if(!name){showToast('先输入你的昵称或常用玩家 ID');$('player-name').focus();return;}
  const code=$('room-code').value.trim().toUpperCase();
  if(type==='join'&&!/^[A-Z2-9]{5}$/.test(code)){showToast('请输入 5 位房间码');return;}
  connecting=true;setText(type==='create'?'create-room':'join-room','连接中…');
  try{const profile=preparePlayerProfile();$('player-name').value=profile.saveName(name);preparePlayerProfile();await connect();send({type,name,playerKey:profile.playerKey,role:settings.role,target:settings.target,ruleset:settings.ruleset,code});}
  catch(error){showToast(error.message);}
  finally{connecting=false;setText('create-room','创建房间 ＋');setText('join-room','加入 ↗');}
}
function closeHelpOrSetup(){
  helpOpen=false;if(state?.phase==='paused')dialog('pause-dialog');else dialog(null);
}
$('start-ai').addEventListener('click',startAI);
$('open-friends').addEventListener('click',()=>{dialog(demoMode?'lan-dialog':'friends-dialog');});
function openLanGame(){
  try{location.assign(normalizeLanAddress($('lan-address').value));}
  catch(error){showToast(error.message);$('lan-address').focus();}
}
$('open-lan-game').addEventListener('click',openLanGame);
$('lan-address').addEventListener('keydown',event=>{if(event.key==='Enter')openLanGame();});
$('open-leaderboard').addEventListener('click',()=>openLeaderboard('menu'));
$('result-leaderboard').addEventListener('click',()=>openLeaderboard('result'));
$('close-leaderboard').addEventListener('click',closeLeaderboard);
$('leaderboard-retry').addEventListener('click',()=>leaderboard.load({selfId:currentPlayerId}));
$('create-room').addEventListener('click',()=>roomAction('create'));
$('join-room').addEventListener('click',()=>roomAction('join'));
$('room-code').addEventListener('keydown',event=>{if(event.key==='Enter')roomAction('join');});
$('pause').addEventListener('click',requestPause);
$('resume').addEventListener('click',()=>{if(mode==='online')send({type:'resume'});else if(state)resumeMatch(state);});
for(const id of ['leave-game','back-menu','leave-waiting'])$(id).addEventListener('click',exitToMenu);
$('rematch').addEventListener('click',()=>{
  if(mode==='online'){send({type:'rematch'});rematchRequested=true;setText('rematch','等待球友同意…');}
  else startAI();
});
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',closeHelpOrSetup);
$('help').addEventListener('click',()=>{
  if(state?.phase==='countdown')return;
  if(state&&['serve','rally','point','intermission'].includes(state.phase)){helpOpen=true;requestPause();return;}
  helpOpen=true;dialog('help-dialog');
});
$('copy-invite').addEventListener('click',async()=>{
  const invite=`${location.origin}/?room=${room.code}`;
  try{await navigator.clipboard.writeText(invite);showToast('邀请链接已复制');}
  catch{window.prompt('复制链接发给球友：',invite);}
});
$('sound').addEventListener('click',()=>{sound=!sound;arenaAudio.setEnabled(sound);$('sound').dataset.muted=String(!sound);$('sound').setAttribute('aria-label',sound?'关闭声音':'开启声音');showToast(sound?'声音已开启':'声音已关闭');});
document.addEventListener('visibilitychange',()=>{
  arenaAudio.setVisible(!document.hidden);
  if(!document.hidden||!state||state.phase==='over')return;
  controls?.reset();pendingShot=null;
  if(mode==='online'){playback.freeze(performance.now());send({type:'suspend'});}
  else if(mode==='ai'&&state.phase!=='paused'){
    if(state.phase==='countdown'){state.phase='paused';state.timer=state.pause.remaining;state.message='比赛暂停 · 等待继续';}
    else if(!pauseMatch(state,0)){const winner=state.score[0]===state.score[1]?null:state.score[0]>state.score[1]?0:1;finishMatch(state,winner,'暂停次数已用完，本局按当前比分结束');}
  }
});

function relativeMessage(text){
  return String(text||'').replace(/近场/g,side===0?'你':'对手').replace(/远场/g,side===1?'你':'对手');
}
function shotGuidance(state){
  const input=controls.sample(),shot=input.prepare||selectedShot;
  const localRequest=input.prepare?{shot,aim:dragAim??aim,aimDepth:dragDepth,charge:input.charge}:
    lastShotRequest||{shot,aim,aimDepth:0,charge:0};
  const request={...localRequest,aim:localRequest.aim*(side===0?1:-1)};
  return {landing:predictLanding(state),intercept:getInterceptAdvice(state,side,request),
    availability:getShotAvailability(state,side,request),
    target:getShotTarget(state,side,request),
    shot,prepare:input.prepare,charge:input.charge,aim:localRequest.aim,aimDepth:localRequest.aimDepth};
}
function updateUI(info,state){
  if(!state)return;
  $('result-leaderboard').hidden=mode!=='online';
  $('result-record').hidden=mode!=='online';
  if(mode==='online'&&state.phase==='over')setText('result-record',resultRecordText(leaderboardRecord));
  const self=state.players[side],opponent=state.players[1-side];
  const nameSelf=mode==='online'?room?.players[side]?.name||'你':'你';
  const nameOther=mode==='online'?room?.players[1-side]?.name||'球友':`${names[settings.difficulty]}陪练`;
  setText('name-self',nameSelf);setText('name-other',nameOther);
  setText('role-self',ROLES[self.role].label+'型');setText('role-other',ROLES[opponent.role].label+'型');
  setText('score-self',state.score[side]);setText('score-other',state.score[1-side]);
  setText('match-label',state.ruleset==='standard21'?`第${state.gameNumber}局 · 局数${state.games[side]}:${state.games[1-side]} · 21分`:`抢 ${state.target} 分 · ${mode==='ai'?'人机练习':'好友对战'}`);
  setText('match-message',state.phase==='serve'?(state.server===side?`你发球 · ${state.service?.court==='left'?'左':'右'}发球区 → 对角`:'等待对手对角发球'):relativeMessage(state.message));
  setText('rally',state.phase==='rally'?`${state.rally} 拍回合`:`第 ${state.pointId+1} 分`);
  if(mode==='ai')setText('connection','本地练习');
  const energy=Math.round(100*self.stamina/ROLES[self.role].maxStamina);
  setText('energy-value',`${energy}%`);$('energy-fill').style.width=`${energy}%`;$('energy-fill').style.background=energy<25?'#f48d6d':'#d4f084';
  setText('energy-hint',energy<25?'体力偏低 · 减少强攻':'回位调整，恢复体力');
  const smashButton=document.querySelector('[data-shot="smash"]');
  smashButton.classList.toggle('unavailable',!info.availability.canSmash);
  smashButton.classList.toggle('ready',info.availability.canSmash);
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
  if(state.phase==='serve')guidance=state.server===side?'发球落点限在对角区 · 按住再松开':'准备接发 · 留意来球落点';
  else if(info.availability.canSmash)guidance='现在可杀球 · 松开「杀球」';
  else if(info.availability.canHit)guidance='进入击球范围 · 松开击球';
  else if(info.intercept.status==='approach')guidance=info.intercept.futureCanSmash?'向黄色圈移动 · 准备高点击杀':'向黄色圈移动 · 提前准备挥拍';
  else if(info.intercept.status==='out')guidance=info.intercept.reason;
  else if(info.intercept.status==='unreachable')guidance='来球较远 · 尽快移动接球';
  if(info.prepare&&info.availability.canHit&&risk>.25)guidance=qualityReason;
  else if(info.prepare==='smash'&&info.availability.canHit&&!info.availability.canSmash)guidance=info.target.fallbackReason||qualityReason||info.availability.reason;
  const lastShot=state.lastShotInfo;
  if(!info.prepare&&lastShot?.side===side&&state.time-lastShot.at<1.2&&lastShot.quality.risk>.25)guidance='刚才一拍 · '+lastShot.quality.reason.split(' · ')[0];
  setText('assist-status',guidance);
  if(state.phase==='countdown'&&helpOpen){helpOpen=false;dialog(null);}
  $('help').disabled=reconnecting||state.phase==='countdown';
  controls.setEnabled(['serve','rally'].includes(state.phase)&&!helpOpen&&!reconnecting);
  $('pause').disabled=!['serve','rally','point','intermission'].includes(state.phase);
  $('countdown').hidden=!['countdown','intermission'].includes(state.phase)||(state.phase==='intermission'&&view.rallyEnding);
  if(state.phase==='countdown')setText('countdown',Math.max(1,Math.ceil(state.timer)));
  if(state.phase==='intermission')setText('countdown',`换边准备 · ${Math.max(1,Math.ceil(state.timer))}`);
  $('countdown').classList.toggle('intermission',state.phase==='intermission');
  arenaAudio.update(state,!document.hidden);
  if(state.phase!==lastPhase){
    lastPhase=state.phase;
    if(state.phase==='paused'){
      setText('pause-title','休息一下。');
      setText('resume','准备继续 ↗');
      setText('pause-description',mode==='ai'?'每人每场可暂停一次，最多 30 秒。':'每人每场一次；双方准备后继续，断线球友可在倒计时内重连。');
      dialog(helpOpen?'help-dialog':'pause-dialog');
    }else if(state.phase==='over'){
      setText('result-title',state.winner===null?'本局结束。':state.winner===side?'这一局，你拿下。':'下一局，再争取。');
      setText('result-score',state.ruleset==='standard21'?`局数 ${state.games[side]} : ${state.games[1-side]}`:`${state.score[side]} : ${state.score[1-side]}`);
      const resultReason=relativeMessage(state.message).replace(/\s*·\s*(?:局数\s*)?\d+\s*:\s*\d+$/,'');
      setText('result-reason',resultReason+(state.ruleset==='standard21'?` · 本局比分 ${state.score[side]}:${state.score[1-side]}`:''));setText('rematch','再来一局 ↗');
      rematchRequested=false;helpOpen=false;resultPending=true;dialog(null);
    }else if(!helpOpen)dialog(null);
  }
  if(state.phase==='over'&&resultPending&&!view.rallyEnding){
    resultPending=false;dialog('result-dialog');
  }
  if(state.phase==='paused'){
    setText('pause-time',Math.ceil(state.pause.remaining));
    $('resume').disabled=mode==='online'&&(reconnecting||room?.players.some(p=>!p?.connected));
  }
  if(reconnecting)showConnectionRecovery();
}

try{
  view=new CourtView($('court'));
  bindCameraSettings(view);
  view.setMode('menu');
  const resizeCourt=()=>view.resize();
  window.addEventListener('resize',resizeCourt);
  window.visualViewport?.addEventListener('resize',resizeCourt);
  new ResizeObserver(resizeCourt).observe($('court'));
  window.addEventListener('orientationchange',()=>{controls?.reset();pendingShot=null;requestAnimationFrame(resizeCourt);setTimeout(resizeCourt,250);});
  controls=new Controls({joystick:$('joystick'),knob:$('knob'),movementSurface:$('court'),shotButtons:document.querySelectorAll('[data-shot]'),onShot:fireShot,onAim:(value,explicit,depth=0)=>{dragAim=explicit?value:null;dragDepth=explicit?depth:0;if(controls?.activeShot)lastShotRequest=null;},onAimSelect:selectAim,onPause:requestPause});
  document.querySelectorAll('[data-shot]').forEach(button=>button.addEventListener('pointerdown',event=>{
    if(controls.activeShot?.pointerId===event.pointerId)gestureOrigin={x:event.clientX,y:event.clientY};
  }));
  window.addEventListener('keydown',()=>{if(controls.activeShot?.key)gestureOrigin=null;});
  controls.setEnabled(false);
  $('loading').hidden=true;
  let demo=createMatch({target:5,difficulty:'medium',seed:31});
  let pingTime=0;
  function frame(now){
    const elapsed=Math.max(0,(now-lastFrame)/1000);lastFrame=now;
    let renderMs=0,guidanceMs=0,uiMs=0;
    if(mode==='menu'||mode==='waiting'){
      accumulator+=Math.min(elapsed,.1);
      while(accumulator>=1/60){stepMatch(demo,[aiInput(demo,0,'medium'),aiInput(demo,1,'medium')],1/60);accumulator-=1/60;}
      if(demo.phase==='over'&&view.lastPhase==='over'&&!view.rallyEnding)demo=createMatch({target:5,seed:Math.floor(now)});
      const renderStart=performance.now();
      view.render(demo,0,Math.min(elapsed,.1));renderMs=performance.now()-renderStart;
    }else if(state){
      if(mode==='ai'){
        if(state.phase==='paused'){stepMatch(state,[{},{}],elapsed);accumulator=0;}
        else{
          accumulator+=Math.min(elapsed,.15);
          while(accumulator>=1/60){
            const input=worldInput(controls.sample());if(pendingShot){Object.assign(input,pendingShot);pendingShot=null;}
            stepMatch(state,[input,aiInput(state,1,settings.difficulty)],1/60);accumulator-=1/60;
          }
        }
      }else if(mode==='online'){
        if(now-lastSend>1000/30){lastSend=now;if(['serve','rally'].includes(state.phase)&&!reconnecting)send({type:'input',...worldInput(controls.sample())});}
        if(now-pingTime>2000){pingTime=now;send({type:'ping',at:Date.now()});}
      }
      const displayed=mode==='online'?(playback.sample(now)||state):state;
      const guidanceStart=performance.now();const info=shotGuidance(displayed);guidanceMs=performance.now()-guidanceStart;
      const renderStart=performance.now();view.render(displayed,side,reconnecting?0:Math.min(elapsed,.1),info);renderMs=performance.now()-renderStart;
      const uiStart=performance.now();updateUI(info,displayed);uiMs=performance.now()-uiStart;
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
      if($('performance-readout'))setText('performance-readout',formatPerformance(stats,network,lastRtt,renderer));
      // Read-only diagnostics for reproducible browser QA and user bug reports.
      window.rallyDiagnostics={render:stats,network,rtt:lastRtt,renderer};
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  const invited=new URLSearchParams(location.search).get('room');
  if(invited&&!demoMode){$('room-code').value=invited.toUpperCase().slice(0,5);dialog('friends-dialog');}
}catch(error){
  console.error(error);$('loading').textContent='球场加载失败：'+error.message+'。请使用支持 WebGL 2 的浏览器后刷新。';
}
