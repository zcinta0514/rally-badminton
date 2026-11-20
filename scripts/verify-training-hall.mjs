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
const report = {environment:'Windows Chrome, touch emulation, WebGL', errors:[], rounds:{}, layouts:[]};
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
  const {x,y}=await center(selector);
  await page.touchscreen.tap(x,y);
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
async function round(drill,shot,hold=65,file=drill,{continuing=false}={}){
  if(!continuing){
    await page.locator('#training-drill').selectOption(drill);
    await tap('#training-start');
  }
  let feed;
  if(drill==='serve'){
    await page.clock.runFor(1300);
    const s=await sample();
    assert.equal(s.shuttle.active,false,'serve waits for player release');
  }else feed=await until(s=>s.stage==='feed');
  const xy=await center(shotButton(shot));
  // Use OS-level touch input with the actual game's press/release controls.
  if(drill!=='serve')await until(s=>s.canHit);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[xy]});
  await page.clock.runFor(hold);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
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
    if(drill==='lift' && flight.length===9)await screenshot('lift-flight');
    if(drill==='cross' && flight.length===4)await screenshot('cross-flight');
  }
  assert.ok(s.lastResult,file+' produced a landing');
  if(file!=='serve-deep'&&file!=='serve-short')assert.equal(s.lastResult.outcome,'hit',file+': '+JSON.stringify(s.lastResult));
  report.rounds[file]={feed:feed?.stroke?.outgoing,impact:{time:impact.time,pose:impact.pose,contact:impact.stroke?.contact,feedAt:impact.feedAt},follow:follow.pose,target:s.target,result:s.lastResult,feedback:s.feedback,flight};
  console.log(file,JSON.stringify(s.lastResult));
  await screenshot(file+'-landing');
  return s;
}
try{
  await page.clock.install();
  await page.goto(process.env.RALLY_QA_URL||app.url);
  await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#court').dataset.venue==='tournament' && window.rallyDiagnostics);
  await page.evaluate(()=>document.fonts.ready);
  report.build=await page.evaluate(()=>({id:RALLY_CONFIG.buildId,version:RALLY_CONFIG.releaseNotice.id}));
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
  for(const [drill,shot] of [['cross','drop'],['lift','clear'],['defense','drop'],['smash','smash']]){
    const s=await round(drill,shot);
    await until(next=>next.feedCount>s.feedCount);
    await tap('#training-adjust');
  }
  const {cross,lift}=report.rounds;
  assert.deepEqual(cross.feed,lift.feed);
  assert.ok(Math.abs(cross.result.contact.y-lift.result.contact.y)<.15);
  assert.ok(lift.result.apex>cross.result.apex+2);
  assert.ok(lift.follow.racketHead.y>cross.follow.racketHead.y+.1);
  assert.ok(cross.result.x<0 && lift.result.z<cross.result.z-3);
  await page.setViewportSize({width:667,height:320});
  await page.clock.runFor(80);
  await page.locator('#training-drill').selectOption('netFree');
  await page.locator('#training-line').selectOption('left');
  await page.locator('#training-power').selectOption('0.8');
  await page.locator('#training-interval').selectOption('0.6');
  const freeA=await round('netFree','drop',64,'free-cross');
  const freeB=await round('netFree','clear',64,'free-lift',{continuing:true});
  assert.equal(freeB.hits,freeA.hits+1);
  assert.ok(freeA.lastResult.x>0 && freeB.lastResult.x<0);
  assert.equal(freeB.power,.8);
  assert.equal(freeB.interval,.6);
  assert.ok(report.rounds['free-lift'].flight.every(({screen})=>screen.y>0 && screen.y<320));
  await tap('#training-adjust');
  await page.setViewportSize({width:844,height:390});
  await page.clock.runFor(80);
  await round('serve','clear',64,'serve-short');
  await tap('#training-adjust');
  await round('serve','clear',680,'serve-deep');
  assert.ok(Math.abs(report.rounds['serve-deep'].result.z)>Math.abs(report.rounds['serve-short'].result.z)+2);
  assert.equal(report.rounds['serve-short'].result.outcome,'offTarget');
  assert.equal(report.rounds['serve-deep'].result.outcome,'hit');
  await tap('#training-exit');
  await page.clock.resume();
  for(const id of ['open-solo','start-ai','start-ai-confirm'])await tap('#'+id);
  await page.waitForFunction(()=>window.rallyDiagnostics?.statePhase==='serve');
  assert.equal(await page.locator('#court').getAttribute('data-venue'),'tournament');
  await screenshot('match-restored');
  await page.keyboard.press('j');
  await page.waitForFunction(()=>window.rallyDiagnostics?.statePhase==='rally');
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
