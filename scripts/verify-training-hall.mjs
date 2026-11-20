import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createServer } from '../server/index.js';
import { projectRoot } from './build-pwa.js';

const { chromium } = createRequire(import.meta.url)(process.env.RALLY_PLAYWRIGHT_MODULE || 'playwright');
const out = path.join(projectRoot, 'artifacts', 'training');
await mkdir(out, {recursive:true});
const app = process.env.RALLY_QA_URL ? null : createServer({port:0, host:'127.0.0.1', peerMode:true});
await app?.listen();
const browser = await chromium.launch({channel:'chrome', args:['--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:844,height:390}, isMobile:true, hasTouch:true, reducedMotion:'reduce', serviceWorkers:'block'});
const report = {environment:'Windows Chrome, CDP touchscreen input, WebGL', errors:[], rounds:{}, layouts:[], keys:{}, matchServes:{}};
page.on('pageerror', e=>report.errors.push(e.message));
await page.addInitScript(()=>{
  localStorage.setItem('rally.playtest.notice.1','1');
  localStorage.setItem('rally.onboarding.seen','1');
  localStorage.setItem('rally.usage.enabled','off');
});
const cdp = await page.context().newCDPSession(page);
const sample = ()=>page.evaluate(()=>window.rallyDiagnostics?.training);
const shotButton = key=>'#game-controls [data-shot="'+key+'"]';
const screenshot = file=>page.screenshot({path:path.join(out,file+'.png')});
async function center(selector) {
  return page.locator(selector).evaluate(el=>{
    const r=el.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2;
    if(!r.width||!el.contains(document.elementFromPoint(x,y))) throw Error('Control obscured: '+el.id);
    return {x,y};
  });
}
async function tap(selector) {
  // The AI setup scrolls on a short landscape phone. Bring its action into
  // the same visible part of the panel a player would scroll to before tapping.
  await page.locator(selector).evaluate(el=>el.scrollIntoView({block:'nearest',behavior:'instant'}));
  const {x,y}=await center(selector);
  await page.touchscreen.tap(x,y);
}
async function keys() {
  return page.locator('#game-controls [data-shot]').evaluateAll(buttons => buttons.map(b => {
    const {x,y,width,height}=b.getBoundingClientRect();
    const visible = !!width && !!height && b.contains(document.elementFromPoint(x+width/2,y+height/2));
    return {key:b.dataset.shot,label:b.querySelector('strong').textContent,hotkey:b.querySelector('small').textContent,
      visible,x,y,width,height};
  }));
}
async function stroke(shot, hold, dx=0, dy=0, capture) {
  const start=await center(shotButton(shot));
  // Use viewport CSS pixels, the same coordinates produced by a real finger.
  const end={x:start.x+dx,y:start.y+dy};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
  if(dx || dy)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[end]});
  await page.clock.runFor(hold);
  const held=await page.locator('#aim-value').textContent();
  const padVisible=await page.locator('#gesture-pad').isVisible();
  if(capture)await screenshot(capture);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  return {shot,hold,dx,dy,start,end,held,padVisible};
}
async function until(predicate, limit=5000, stride=32) {
  let s;
  for(let t=0;t<limit;t+=stride){
    s=await sample();
    if(s&&predicate(s))return s;
    await page.clock.runFor(stride);
  }
  throw Error('Timed out in drill: '+JSON.stringify(s));
}
async function round(drill,shot,hold=65,file=drill,{continuing=false,dx=0,dy=0,expected='hit'}={}){
  if(!continuing){
    await page.locator('#training-drill').selectOption(drill);
    await tap('#training-start');
  }
  const size=page.viewportSize();
  const buttons=await keys();
  assert.deepEqual(buttons.map(k=>[k.key,k.label,k.hotkey,k.visible]),
    [['clear','高远','J',true],['drop','吊球','K',true],['smash','杀球','L',true]],drill+' original match buttons');
  report.keys[size.width+'-'+drill]=buttons;
  let feed;
  if(drill==='serve'){
    await page.clock.runFor(1300);
    const s=await sample();
    assert.equal(s.shuttle.active,false,'serve waits for player release');
  }else feed=await until(s=>s.stage==='feed');
  if(drill==='defense' || drill==='smash'){
    const windup=drill==='defense'?.275:1.28;
    await until(s=>s.time-s.feedAt>=windup,2200,16);
  }else if(drill!=='serve')await until(s=>s.canHit);
  const gesture=await stroke(shot,hold,dx,dy,file==='cross'||file==='lift'?file+'-aim':null);
  assert.ok(gesture.padVisible,file+' shows the original gesture pad while pressed');
  const impact=await until(s=>s.stage==='return',1200,16);
  await page.clock.runFor(64);
  const follow=await sample();
  await screenshot(file+'-stroke');
  const flight=[];
  let s=follow;
  for(let t=0;t<4000 && s.stage==='return';t+=48){
    flight.push({time:s.time,x:s.shuttle.x,y:s.shuttle.y,z:s.shuttle.z,screen:s.screen.ball});
    await page.clock.runFor(48);
    s=await sample();
    if(file==='lift' && flight.length===9)await screenshot('lift-flight');
    if(file==='cross' && flight.length===4)await screenshot('cross-flight');
  }
  assert.ok(s.lastResult,file+' produced a landing');
  report.rounds[file]={gesture,feed:feed?.stroke?.outgoing,impact:{time:impact.time,pose:impact.pose,contact:impact.stroke?.contact,feedAt:impact.feedAt,stroke:impact.stroke},follow:follow.pose,target:s.target,result:s.lastResult,feedback:s.feedback,flight};
  console.log(file,JSON.stringify(s.lastResult));
  assert.equal(s.lastResult.outcome,expected,file+': '+JSON.stringify(s.lastResult));
  await screenshot(file+'-landing');
  return s;
}
async function matchServe(width,height,shot,hold,dx,dy) {
  await page.setViewportSize({width,height});
  await page.clock.runFor(80);
  for(const id of ['open-solo','start-ai','start-ai-confirm'])await tap('#'+id);
  await page.clock.runFor(850);
  assert.equal(await page.locator('#court').getAttribute('data-venue'),'tournament');
  assert.equal(await page.evaluate(()=>rallyDiagnostics.statePhase),'serve');
  assert.equal(await page.evaluate(()=>rallyDiagnostics.netDragPlaytest),false,'ordinary AI match');
  const matchKeys=await keys();
  for(const [name,buttons] of Object.entries(report.keys)){
    if(name.startsWith(width+'-'))assert.deepEqual(buttons,matchKeys,name+' uses match button placement');
  }
  if(shot==='clear')await screenshot('match-restored');
  const gesture=await stroke(shot,hold,dx,dy);
  let actual;
  for(let elapsed=0;elapsed<700;elapsed+=16){
    actual=await page.evaluate(()=>rallyDiagnostics.matchStroke);
    if(actual?.serving)break;
    await page.clock.runFor(16);
  }
  assert.ok(actual?.serving && actual.side===0 && actual.type===shot,'player served using '+shot);
  report.matchServes[shot]={width,height,buttons:matchKeys,gesture,stroke:actual};
  await screenshot('match-'+shot+'-serve');
  await tap('#pause');
  await page.clock.runFor(80);
  await tap('#leave-game');
}
try{
  await page.clock.install();
  await page.goto(process.env.RALLY_QA_URL||app.url);
  await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#court').dataset.venue==='tournament' && window.rallyDiagnostics);
  await page.evaluate(()=>document.fonts.ready);
  report.build=await page.evaluate(()=>({id:RALLY_CONFIG.buildId,version:RALLY_CONFIG.releaseNotice.id,url:location.href}));
  for(const [width,height] of [[667,320],[390,844],[844,390]]){
    await page.setViewportSize({width,height});
    await tap('#open-training');
    assert.equal(await page.locator('#court').getAttribute('data-venue'),'training');
    await center('#training-start');
    await center('#training-exit');
    await page.waitForTimeout(130);
    await screenshot('setup-'+width);
    await tap('#training-adjust');
    await screenshot('hall-'+width);
    const s=await sample();
    assert.ok(s.screen.target.every(p=>p.x>=0&&p.y>=0&&p.x<width&&p.y<height));
    report.layouts.push({width,height,target:s.screen.target});
    await tap('#training-exit');
    assert.equal(await page.locator('#court').getAttribute('data-venue'),'tournament');
  }
  await screenshot('lobby');
  await tap('#open-training');
  await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now()+150)));
  // The game keeps its production fixed-step simulation. The controlled browser
  // clock lets us capture each stroke at the same offset from physical contact.
  for(const [drill,shot,dx,dy] of [
    ['cross','drop',-41,17],['lift','clear',34,-20],['defense','drop',34,0],['smash','smash',34,10],
  ]){
    const s=await round(drill,shot,64,drill,{dx,dy});
    await until(next=>next.feedCount>s.feedCount);
    await tap('#training-adjust');
  }
  const {cross,lift}=report.rounds;
  assert.deepEqual(cross.feed,lift.feed);
  assert.ok(Math.abs(cross.result.contact.y-lift.result.contact.y)<.15);
  assert.ok(lift.result.apex>cross.result.apex+2);
  assert.ok(lift.follow.racketHead.y>cross.follow.racketHead.y+.1);
  assert.ok(cross.result.x<0 && lift.result.z<cross.result.z-3);
  const neutral=await round('cross','drop',64,'neutral-drop',{expected:'wrongStroke'});
  assert.ok(Math.abs(neutral.lastResult.x)<.5);
  await tap('#training-adjust');
  const longerDrop=await round('cross','drop',64,'drop-depth-control',{dx:-41,dy:-42,expected:'offTarget'});
  assert.ok(Math.abs(longerDrop.lastResult.x-cross.result.x)<.15);
  assert.ok(longerDrop.lastResult.z<cross.result.z-1.1,'upward drag deepens the same drop');
  await tap('#training-adjust');
  await page.setViewportSize({width:667,height:320});
  await page.clock.runFor(80);
  await page.locator('#training-drill').selectOption('netFree');
  await page.locator('#training-line').selectOption('left');
  await page.locator('#training-power').selectOption('0.8');
  await page.locator('#training-interval').selectOption('0.6');
  const freeA=await round('netFree','drop',64,'free-cross',{dx:41,dy:17});
  const freeB=await round('netFree','clear',64,'free-lift',{continuing:true,dx:-34,dy:-20});
  assert.equal(freeB.hits,freeA.hits+1);
  assert.ok(freeA.lastResult.x>0 && freeB.lastResult.x<0);
  assert.equal(freeB.power,.8);
  assert.equal(freeB.interval,.6);
  assert.ok(report.rounds['free-lift'].flight.every(({screen})=>screen.y>0 && screen.y<320));
  await tap('#training-adjust');
  await page.setViewportSize({width:844,height:390});
  await page.clock.runFor(80);
  await round('serve','drop',64,'serve-short',{dx:-41,dy:-17,expected:'offTarget'});
  await tap('#training-adjust');
  await round('serve','clear',680,'serve-deep',{dx:-41,dy:-17});
  assert.ok(Math.abs(report.rounds['serve-deep'].result.z)>Math.abs(report.rounds['serve-short'].result.z)+2);
  assert.equal(report.rounds['serve-short'].result.outcome,'offTarget');
  assert.equal(report.rounds['serve-deep'].result.outcome,'hit');
  await tap('#training-exit');
  await matchServe(844,390,'clear',680,-41,-17);
  await matchServe(667,320,'drop',64,-41,-17);
  for(const [key,file] of [['drop','serve-short'],['clear','serve-deep']]){
    const live=report.matchServes[key].stroke, practice=report.rounds[file].impact.stroke;
    assert.equal(practice.type,live.type);
    assert.ok(Math.abs(live.aimX-practice.aimX)<.08 && Math.abs(live.aimZ-practice.aimZ)<.08,
      'same drag selects same service target in match and training');
  }
  // A saved user layout must also move the training hit targets. Reload through
  // the lobby to let the production entry point restore the saved configuration.
  await page.evaluate(async()=>{
    const {saveShotLayout}=await import('./src/shot-layout.js');
    saveShotLayout({mode:'arc'});
    const {saveCameraSettings}=await import('./src/camera-settings.js');
    saveCameraSettings({mode:'follow',distance:11});
  });
  await page.clock.resume();
  await page.reload();
  await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#court').dataset.venue==='tournament' && window.rallyDiagnostics);
  await tap('#open-training'); await tap('#training-start');
  await page.waitForFunction(()=>rallyDiagnostics.venue==='training' && rallyDiagnostics.entrance.camera[0]>.05);
  const beforeMove=await page.evaluate(()=>({camera:rallyDiagnostics.entrance.camera,player:rallyDiagnostics.training.player}));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:90,y:177}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:139,y:177}]});
  await page.waitForFunction(x=>rallyDiagnostics.entrance.camera[0]>x+.25,beforeMove.camera[0]);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const afterMove=await page.evaluate(()=>({camera:rallyDiagnostics.entrance.camera,player:rallyDiagnostics.training.player}));
  assert.ok(afterMove.player.x>beforeMove.player.x+.25);
  const arcTraining=await keys();
  await screenshot('training-arc-keys');
  await tap('#training-exit');
  for(const id of ['open-solo','start-ai','start-ai-confirm'])await tap('#'+id);
  await page.waitForFunction(()=>window.rallyDiagnostics?.statePhase==='serve');
  await page.waitForFunction(()=>rallyDiagnostics.venue==='match' && rallyDiagnostics.entrance.camera[0]>.05);
  const arcMatch=await keys();
  assert.deepEqual(arcTraining,arcMatch,'stored arc layout');
  assert.notDeepEqual(arcMatch,report.matchServes.drop.buttons,'alternate layout differs from default');
  report.arcLayout={training:arcTraining,match:arcMatch};
  report.followCamera={beforeMove,afterMove,match:await page.evaluate(()=>rallyDiagnostics.entrance.camera)};
  await screenshot('match-arc-keys');
  assert.deepEqual(report.errors,[]);
  report.matchRestored=true;
}catch(error){
  report.failure=error.stack;
  await screenshot('failure').catch(()=>{});
  throw error;
}finally{
  await writeFile(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();
  await app?.close();
}
