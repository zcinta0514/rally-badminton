import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from '../server/index.js';
import {createPwaBuild} from './build-pwa.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.RALLY_PLAYWRIGHT_MODULE||'playwright');
await mkdir('artifacts/flight-guide',{recursive:true});
const app=process.env.RALLY_QA_URL?null:createServer({port:0,host:'127.0.0.1',peerMode:true});await app?.listen();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader']});
const report={checks:[],errors:[],build:(await createPwaBuild()).version,environment:'Windows Chrome mobile/touch emulation; not a physical phone'};
try{
 for(const [width,height] of [[844,390],[568,320]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:'reduce'});
  await context.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.usage.enabled','off');});
  const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(process.env.RALLY_QA_URL||app.url);await page.locator('#loading').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>RALLY_CONFIG.buildId),report.build);
  await page.evaluate(async()=>{
   const {CourtView}=await import('/src/view.js');const game=await import('/shared/game.js');
   const render=CourtView.prototype.render;
   CourtView.prototype.render=function(state,side,dt,info){
    if(window.qaIncoming){
     state={...state,phase:'rally',shuttle:{...state.shuttle,x:0,y:3,z:2,vx:0,vy:-1,vz:4,active:true,lastHit:1}};
     const request={shot:info.prepare||'clear',aim:info.aim,charge:info.charge,aimDepth:info.aimDepth};
     info={...info,landing:game.predictLanding(state),intercept:game.getInterceptAdvice(state,side,request),availability:game.getShotAvailability(state,side,request)};
    }
    const result=render.call(this,state,side,dt,info);window.qaView=this;window.qaState=state;return result;
   };
  });
  await page.locator('#open-solo').click();await page.locator('#start-ai').click();await page.locator('#start-ai-confirm').click();await page.locator('#hud').waitFor({state:'visible'});
  const button=page.locator('[data-shot=clear]'),box=await button.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.waitForFunction(()=>qaView.flightGuide.line.visible&&qaView.flightGuide.line.userData.kind==='aim');
  const before=await page.evaluate(()=>[...qaView.flightGuide.positions]);
  await page.mouse.move(box.x+box.width/2+32,box.y+box.height/2-18,{steps:5});
  await page.waitForTimeout(150);const after=await page.evaluate(()=>[...qaView.flightGuide.positions]);assert.notDeepEqual(before,after);
  await page.screenshot({path:`artifacts/flight-guide/${width}-aim.png`});await page.mouse.up();
  await page.waitForFunction(()=>rallyDiagnostics.statePhase==='rally');
  await page.waitForFunction(()=>!qaView.flightGuide.line.visible||qaView.flightGuide.line.userData.kind==='incoming');
  await page.evaluate(()=>{window.qaIncoming=true;});
  await page.waitForFunction(()=>qaView.flightGuide.line.visible&&qaView.flightGuide.line.userData.kind==='incoming');
  await page.screenshot({path:`artifacts/flight-guide/${width}-incoming.png`});
  for(const shot of ['clear','drop','smash']){
   const b=await page.locator(`[data-shot=${shot}]`).boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
   await page.waitForFunction(()=>qaView.flightGuide.line.visible&&qaView.flightGuide.line.userData.kind==='aim');
   await page.screenshot({path:`artifacts/flight-guide/${width}-${shot}.png`});await page.mouse.up();
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  report.checks.push(`${width}x${height}: actual held serve, drag changes arc, release starts rally; incoming fixture and held clear/drop/smash verified`);
  console.log(report.checks.at(-1));await context.close();
 }
 assert.deepEqual(report.errors,[]);
}finally{await writeFile('artifacts/flight-guide/report.json',JSON.stringify(report,null,2));await browser.close();await app?.close();}
