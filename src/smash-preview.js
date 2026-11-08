import { CourtView } from './view.js';
import { createMatch, stepMatch } from '../shared/game.js';
import { makeAthlete as makeBaseline, updateAthlete as updateBaseline } from './preview/smash-baseline.js';
import { upgradeAthlete } from './athlete-import.js';

document.title='开拍 · 杀球新旧对比';
document.body.removeAttribute('data-screen');
document.body.innerHTML=`<canvas id="court" aria-label="杀球动作球场预览"></canvas>
<div class="comparison-labels"><strong>之前</strong><strong>新版候选</strong></div>
<nav class="smash-review"><strong>杀球新旧对比 · 同一来球与时刻</strong><div>
<button id="jump">起跳杀球</button><button id="standing">普通杀球</button>
<button id="pause">暂停</button><button id="speed">慢放</button><button id="angle">侧面检查</button>
<a href="./">进入游戏试玩</a></div><label>动作进度 <input id="scrub" type="range" min="0" max="179" value="0"></label>
<small id="status">正在加载比赛人物…</small></nav>`;
const style=document.createElement('style');style.textContent=`
html,body{margin:0;width:100%;height:100%;overflow:hidden}#court{position:fixed;inset:0;width:100%;height:100%}
.comparison-labels{position:fixed;top:16px;left:0;right:0;display:grid;grid-template-columns:1fr 1fr;text-align:center;color:#fff;font:600 16px system-ui;pointer-events:none;z-index:10}
.smash-review{position:fixed;bottom:16px;left:16px;right:16px;max-width:680px;margin:auto;padding:14px 18px;border-radius:16px;background:rgba(246,248,243,.94);color:#173c37;font:14px/1.6 system-ui;z-index:10}
.smash-review div{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.smash-review button,.smash-review a{font:inherit;color:inherit;padding:5px 10px;background:transparent;border:1px solid #849b90;border-radius:8px;text-decoration:none;cursor:pointer}.smash-review label{display:flex;align-items:center;gap:12px}.smash-review input{flex:1;min-width:0}.smash-review small{display:block}@media(max-width:600px){.smash-review{bottom:8px;left:8px;right:8px;padding:8px 12px;font-size:12px}}
`;document.head.append(style);
const view=new CourtView(document.getElementById('court'));view.setMode('match');
const baseline=makeBaseline(view.scene,0);void upgradeAthlete(baseline);
let frames=[],index=-1,clock=0,last=0,playing=true,rate=1,angle=0,kind='jump';
function build(){
  const state=createMatch();state.phase='rally';state.service.active=false;state.time=1;
  Object.assign(state.players[0],{x:0,z:3.8,vx:0,vz:0});
  Object.assign(state.shuttle,{x:.35,y:kind==='jump'?3.7:2.65,z:3.6,vx:0,vy:-.2,vz:0,active:true,lastHit:1});
  frames=[];
  for(let i=0;i<180;i++){
    stepMatch(state,[i===30?{shot:'smash',charge:.35}:i>0&&i<30?{prepare:'smash'}:{},{}],1/120);
    frames.push(structuredClone(state));
  }
  clock=0;index=-1;playing=true;document.getElementById('pause').textContent='暂停';
}
function drawFrame(next){
  if(next<index)index=-1;
  baseline.root.visible=false;baseline.ground.visible=false;
  view.players[0].root.visible=true;view.players[0].ground.visible=true;
  view.renderer.setScissorTest(false);
  view.renderer.setViewport(0,0,view.width,view.height);
  for(let i=index+1;i<=next;i++){
    const frame=frames[i];view.render(frame,0,1/120);
    updateBaseline(baseline,frame.players[0],0,frame.shuttle,frame.time,1/120,true,
      ['paused','countdown','over'].includes(frame.phase),i===0);
  }
  index=next;
  const width=view.width,height=view.height;
  const panel=document.querySelector('.smash-review').getBoundingClientRect();
  const bottom=Math.min(height*.55,Math.ceil(panel.height+32));
  const h=Math.max(1,height-bottom-44),w=Math.max(1,Math.floor(width/2));
  // Both panels share precisely the same camera, state and clock.
  if(angle<2){
    const distance=Math.max(4.2,2.4/(w/h));
    view.camera.clearViewOffset();view.camera.fov=45;view.camera.aspect=w/h;
    view.camera.position.set(angle===1?distance:distance*.72,1.65+distance*.12,angle===1?3.8:3.8-distance*.7);
    view.camera.lookAt(0,1.55,3.8);view.camera.updateProjectionMatrix();
  }else{
    view.width=w;view.height=h;view.updateCamera(0);view.width=width;view.height=height;
  }
  view.renderer.clear();
  view.renderer.setScissorTest(true);
  for(const [x,old] of [[0,true],[w,false]]){
    baseline.root.visible=old;baseline.ground.visible=old;
    view.players[0].root.visible=!old;view.players[0].ground.visible=!old;
    view.renderer.setViewport(x,bottom,w,h);view.renderer.setScissor(x,bottom,w,h);
    view.renderer.render(view.scene,view.camera);
  }
  view.renderer.setScissorTest(false);
  view.renderer.setViewport(0,0,width,height);
  document.getElementById('scrub').value=String(next);
  const action=frames[next].players[0].action;
  const phases={prepare:'侧身蓄力',windup:'蹬地引拍',contact:'触球',followthrough:'随挥',recovery:'落地恢复'};
  document.getElementById('status').textContent=`${kind==='jump'?'起跳':'普通'}杀球 · ${phases[action?.stage]||'准备下一拍'} · ${rate===1?'原速':'¼ 速度'} · ${[baseline,view.players[0]].every(p=>p.root.userData.modelStatus==='ready')?'两侧比赛人物已加载':'人物加载中'}`;
}
document.getElementById('jump').onclick=()=>{kind='jump';build();};
document.getElementById('standing').onclick=()=>{kind='standing';build();};
document.getElementById('pause').onclick=event=>{playing=!playing;event.target.textContent=playing?'暂停':'继续';};
document.getElementById('speed').onclick=event=>{rate=rate===1?.25:1;event.target.textContent=rate===1?'慢放':'恢复原速';};
document.getElementById('angle').onclick=event=>{angle=(angle+1)%3;event.target.textContent=['侧面检查','比赛视角','近看斜前方'][angle];};
document.getElementById('scrub').oninput=event=>{playing=false;clock=Number(event.target.value)/120;document.getElementById('pause').textContent='继续';drawFrame(Number(event.target.value));};
window.addEventListener('resize',()=>view.resize());
build();
function animate(now){const dt=Math.min(.05,(now-last)/1000||0);last=now;if(playing)clock+=dt*rate;drawFrame(Math.floor(clock*120)%frames.length);requestAnimationFrame(animate);}
requestAnimationFrame(animate);
window.__smashPreview={view,baseline,get frames(){return frames;},get index(){return index;},get kind(){return kind;}};
