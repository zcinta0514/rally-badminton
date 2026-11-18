import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from '../server/index.js';
const {chromium}=createRequire(import.meta.url)(process.env.RALLY_PLAYWRIGHT_MODULE||'playwright');
const out='artifacts/rhythm-browser';await mkdir(out,{recursive:true});
const app=createServer({port:0,host:'127.0.0.1',leaderboardPath:out+'/leaderboard.json'});await app.listen();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader']});
const report={environment:'Windows Chrome mobile/touch emulation; controlled incoming ball in real match; not physical iPhone',checks:[],errors:[]};
try{
 for(const type of ['clear','drop']) for(const [width,height] of [[844,390],[568,320]]){
  const c=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  await c.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.usage.enabled','off');});
  const p=await c.newPage();p.setDefaultTimeout(60000);p.on('pageerror',e=>report.errors.push(e.message));
  await p.route('**/src/main.js*',async route=>{
   const response=await route.fetch();let source=await response.text();assert.ok(source.includes('stepMatch(state,practiceInputs(state,input,settings),1/60);'),'simulation injection matched');
   source=source.replace('stepMatch(state,practiceInputs(state,input,settings),1/60);', `
    {const s=state;    if(window.qaFeed){window.qaFeedFrames=(window.qaFeedFrames||0)+1;s.phase='rally';s.service.active=false;
     Object.assign(s.players[0],{x:0,z:5.2,vx:0,vz:0,cooldown:0,stamina:100});
     Object.assign(s.shuttle,{x:0,y:3.2,z:5.2,vx:0,vy:0,vz:0,lastHit:1,active:true});}
}
    stepMatch(state,practiceInputs(state,input,settings),1/60);`);
   await route.fulfill({response,body:source});
  });
  await p.goto(process.env.RALLY_QA_URL||app.url);await p.locator('#loading').waitFor({state:'hidden'});
  assert.match(await p.locator('.lobby-version').textContent(),/1\.22\.1/);
  report.build=await p.evaluate(()=>RALLY_CONFIG.buildId);
  await p.evaluate(async()=>{
   const {CourtView}=await import('/src/view.js');const render=CourtView.prototype.render;
   CourtView.prototype.render=function(s,...rest){window.qaState=s;window.qaView=this;
    if(window.qaCapture&&s.lastShotInfo?.side===0&&s.lastShotInfo.hitId>window.qaBeforeHit&&!window.qaHit) window.qaHit=structuredClone(s.lastShotInfo);
    return render.call(this,s,...rest);};
  });
  await p.locator('#open-solo').click();await p.locator('#start-ai').click();await p.locator('#start-ai-confirm').click();
  await p.waitForFunction(()=>window.rallyDiagnostics?.statePhase==='serve'&&!rallyDiagnostics.entrance.active);
  await p.locator('[data-shot=clear]').click();await p.waitForFunction(()=>qaState.hitId>=1);
  await p.evaluate(()=>{window.qaFeed=true;window.qaHit=null;window.qaBeforeHit=qaState.hitId;window.qaFeedFrames=0;});await p.waitForFunction(()=>window.qaFeedFrames>=5);
  const b=await p.locator('[data-shot='+type+']').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width&&b.y+b.height<=height);
  await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.waitForTimeout(250);
  await p.evaluate(()=>{window.qaFeed=false;window.qaCapture=true;});await p.mouse.up();
  try{await p.waitForFunction(()=>window.qaHit?.outgoing.verticalDrag>0,{},{timeout:15000});}catch(e){console.log(await p.evaluate(()=>({before:qaBeforeHit,hit:qaHit,last:qaState.lastShotInfo,player:qaState.players[0],ball:qaState.shuttle,phase:qaState.phase,frames:qaFeedFrames})));throw e;}
  const hit=await p.evaluate(()=>qaHit);assert.equal(hit.type,type);const metrics=await p.evaluate(async()=>{const f=await import('/shared/shuttle-flight.js');const b={...qaHit.contact,...qaHit.outgoing};return {duration:f.timeToHeight(b),apex:f.flightApex(b).y,terminal:Math.sqrt(9.81/b.verticalDrag)};});assert.ok(Math.abs(metrics.terminal-6.7)<1e-8);if(type==='clear'){assert.ok(metrics.apex>4.5&&metrics.duration>1.7&&metrics.duration<2.2);}else{assert.ok(metrics.duration<1.3&&metrics.apex<3.4);}
  await p.screenshot({path:out+`/${type}-${width}.png`});
  await p.waitForFunction(()=>qaState.phase==='point'||qaState.hitId>qaHit.hitId);
  report.checks.push({type,width,height,hit,metrics,settledOrReturned:true});console.log(`PASS ${width}x${height}: ${type} button -> shared drag flight -> return/score`);
  await c.close();
 }
 assert.deepEqual(report.errors,[]);
}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await app.close();}
