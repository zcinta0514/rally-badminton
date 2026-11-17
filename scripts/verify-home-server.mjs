import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from '../server/index.js';
const {chromium}=createRequire(import.meta.url)('../artifacts/qa/node_modules/playwright');
const external=process.env.RALLY_PUBLIC_TEST_URL;
const app=external?null:createServer({peerMode:false});
if(app)await app.listen();
const base=external||app.url;
const out='artifacts/home-server/'+(external?'public':'local');await mkdir(out,{recursive:true});
const report={url:base,environment:'Two separate Chrome contexts on this PC; phone landscape emulation, not cross-carrier physical phones',checks:[],errors:[],states:[]};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader']});
try{
 const pages=[];
 for(const width of [844,667]){
  const context=await browser.newContext({viewport:{width,height:375},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  await context.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.usage.disabled.v1','1');});
  const page=await context.newPage();page.setDefaultTimeout(90000);
  page.on('pageerror',e=>report.errors.push(e.message));
  const states=[];report.states.push(states);
  page.on('websocket',ws=>ws.on('framereceived',event=>{try{const m=JSON.parse(event.payload);if(m.type==='state'){states.push({seq:m.seq,phase:m.state.phase,score:m.state.score,matchId:m.matchId});if(states.length>300)states.shift();}}catch{}}));
  pages.push(page);
 }
 const [host,guest]=pages;
 await host.goto(base,{waitUntil:'domcontentloaded',timeout:120000});await host.locator('#loading').waitFor({state:'hidden'});
 report.config=await host.evaluate(()=>RALLY_CONFIG);assert.equal(report.config.peerMode,false);
 await host.locator('#open-friends').click();await host.locator('#friend-tabs [data-action=create]').click();
 await host.locator('#player-name').fill('房主验证');
 assert.equal(await host.locator('#friend-lineup [data-lineup=doubles]').isVisible(),false);
 await host.locator('#create-room').click();await host.locator('#waiting-code').waitFor({state:'visible'});
 const code=(await host.locator('#waiting-code').innerText()).trim();assert.match(code,/^[A-Z2-9]{5}$/);
 report.invite=new URL('?room='+code,base).href;
 await guest.goto(report.invite,{waitUntil:'domcontentloaded',timeout:120000});await guest.locator('#loading').waitFor({state:'hidden'});
 assert.equal(await guest.locator('#room-code').inputValue(),code);
 await guest.locator('#player-name').fill('访客验证');await guest.locator('#join-room').click();
 for(const [i,page] of pages.entries()){
  await page.locator('#waiting-players').getByText('访客验证',{exact:false}).waitFor();
  await page.locator('#ready-room').scrollIntoViewIfNeeded();assert.equal(await page.locator('#ready-room').isEnabled(),true);
  await page.screenshot({path:out+`/ready-${i}.png`});
 }
 report.checks.push('Host creates, invitation prefills correct room, independent guest joins; singles-only server choice');
 await host.locator('#ready-room').click();await guest.locator('#ready-room').click();
 for(const [i,page] of pages.entries()){
  await page.waitForFunction(()=>document.body.dataset.screen==='match'&&document.body.dataset.entering!=='true');
  await page.screenshot({path:out+`/match-${i}.png`});
 }
 assert.ok(report.states.every(s=>s.length>0));
 assert.equal(report.states[0].at(-1).matchId,report.states[1].at(-1).matchId);
 report.checks.push('Both ready and receive the same authoritative match over WebSocket');
 await host.locator('[data-shot=clear]').first().dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',bubbles:true});
 await host.locator('[data-shot=clear]').first().dispatchEvent('pointerup',{pointerId:1,pointerType:'touch',bubbles:true});
 await host.waitForTimeout(4000);
 await host.locator('#pause').click();await guest.locator('#pause-dialog').waitFor({state:'visible'});
 report.checks.push('Server broadcasts pause to the other player');
 await host.locator('#leave-game').click();await host.locator('#open-solo').waitFor({state:'visible'});
 assert.deepEqual(report.errors,[]);
 report.checks.push('Host exits cleanly; no page exceptions');
 console.log(JSON.stringify({url:base,checks:report.checks,errors:report.errors,buildId:report.config.buildId},null,2));
}catch(error){report.failure=error.stack;throw error;}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();if(app)await app.close();}
