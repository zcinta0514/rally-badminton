import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from '../server/index.js';
const {chromium}=createRequire(import.meta.url)(process.env.RALLY_PLAYWRIGHT_MODULE||'playwright');
const out='artifacts/ai-defense';await mkdir(out,{recursive:true});
const app=createServer({port:0,host:'127.0.0.1',leaderboardPath:out+'/leaderboard.json'});await app.listen();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader']});
const report={environment:'Windows Chrome mobile/touch emulation; controlled incoming ball in real match; not physical iPhone',checks:[],errors:[]};
try{
 for(const level of ['easy','medium','hard']) for(const [width,height] of [[844,390],[568,320]]){
  const c=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  await c.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.usage.enabled','off');});
  const p=await c.newPage();p.setDefaultTimeout(60000);p.on('pageerror',e=>report.errors.push(e.message));
  await p.route('**/src/main.js',async route=>{
   const response=await route.fetch();let source=await response.text();
   source=source.replace('stepMatch(state,practiceInputs(state,input,settings),1/60);', `
    {const s=state;    if(window.qaFeed){s.phase='rally';s.service.active=false;
     Object.assign(s.players[1],{x:0,z:-3.55,vx:0,vz:0,cooldown:0,stamina:100});
     Object.assign(s.players[0],{x:0,z:3.8,vx:0,vz:0,cooldown:0,stamina:100});
     Object.assign(s.shuttle,{x:0,y:3.2,z:3.8,vx:0,vy:0,vz:0,lastHit:1,active:true});}
}
    stepMatch(state,practiceInputs(state,input,settings),1/60);`);
   await route.fulfill({response,body:source});
  });
  await p.goto(app.url);await p.locator('#loading').waitFor({state:'hidden'});
  assert.match(await p.locator('.lobby-version').textContent(),/1\.21\.6/);
  report.build=await p.evaluate(()=>RALLY_CONFIG.buildId);
  await p.evaluate(async()=>{
   const {CourtView}=await import('/src/view.js');const render=CourtView.prototype.render;
   CourtView.prototype.render=function(s,...rest){window.qaState=s;window.qaView=this;
    if(s.lastShotInfo?.type==='smash'&&!window.qaHit) window.qaHit=structuredClone(s.lastShotInfo);
    return render.call(this,s,...rest);};
  });
  await p.locator('#open-solo').click();await p.locator('#start-ai').click();await p.locator('[data-difficulty='+level+']').click();await p.locator('#start-ai-confirm').click();
  await p.waitForFunction(()=>window.rallyDiagnostics?.statePhase==='serve'&&!rallyDiagnostics.entrance.active);
  await p.locator('[data-shot=clear]').click();await p.waitForFunction(()=>qaState.hitId>=1);
  await p.evaluate(()=>window.qaFeed=true);
  const b=await p.locator('[data-shot=smash]').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width&&b.y+b.height<=height);
  await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.waitForTimeout(level==='easy'?30:level==='medium'?500:1100);
  await p.evaluate(()=>window.qaFeed=false);await p.mouse.up();
  await p.waitForFunction(()=>window.qaHit?.outgoing.drag===.035);
  const hit=await p.evaluate(()=>qaHit);assert.ok(hit.outgoing.vy<0);if(level==='easy')assert.ok(hit.charge<.3);if(level==='hard')assert.ok(hit.charge>.95);
  await p.screenshot({path:out+`/${level}-${width}-smash.png`});
  await p.waitForFunction(()=>qaState.phase==='point'||qaState.hitId>qaHit.hitId);
  if(level!=='easy'){assert.ok(await p.evaluate(()=>qaState.hitId>qaHit.hitId),'defender returns centered smash');}
  report.checks.push({level,width,height,hit,settledOrReturned:true});console.log(`PASS ${level} ${width}x${height}: real button release -> downward smash -> return/score`);
  await c.close();
 }
 assert.deepEqual(report.errors,[]);
}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await app.close();}
