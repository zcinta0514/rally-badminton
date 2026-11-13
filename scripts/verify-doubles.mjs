import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from '../server/index.js';
import {projectRoot,createPwaBuild} from './build-pwa.js';
const {chromium}=createRequire(import.meta.url)(process.env.RALLY_PLAYWRIGHT_MODULE||'playwright');
const out=projectRoot+'/artifacts/doubles';await mkdir(out,{recursive:true});
const app=createServer({port:0,host:'127.0.0.1',peerMode:true,leaderboardPath:out+'/leaderboard.json'});await app.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.RALLY_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader']});
const report={environment:'Windows Chrome mobile/touch emulation, software WebGL, real PeerJS/WebRTC; not physical phones',checks:[],errors:[]};
const contexts=[],pages=[];const check=s=>{report.checks.push(s);console.log('PASS '+s);};
const readyGame=async p=>p.waitForFunction(()=>window.rallyDiagnostics?.statePhase==='serve'&&!rallyDiagnostics.entrance.active,null,{timeout:20000});
async function resumeIfPaused(){
 if(await pages[0].evaluate(()=>rallyDiagnostics.statePhase==='paused'))await Promise.all(pages.map(p=>p.locator('#resume').click()));
 await Promise.all(pages.map(readyGame));
}
try{
 for(const [width,height] of [[844,390],[667,375],[844,390],[667,375]]){
  const c=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,serviceWorkers:'block'});contexts.push(c);
  await c.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.usage.enabled','off');});
  const p=await c.newPage();pages.push(p);p.setDefaultTimeout(30000);p.on('pageerror',e=>report.errors.push(e.message));
  await p.goto(app.url);await p.locator('#loading').waitFor({state:'hidden'});
  assert.deepEqual(await p.evaluate(()=>{
   const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);
   return ids.filter((id,index)=>ids.indexOf(id)!==index);
  }),[],'merged markup must retain unique controls');
  assert.equal(await p.locator('#dialog-backdrop > #pause-dialog').count(),1);
  assert.equal(await p.locator('#waiting-dialog #room-role').count(),1);
  await p.evaluate(async()=>{
   await import('/vendor/peerjs.min.js');const Original=globalThis.Peer||globalThis.peerjs.Peer;
   globalThis.Peer=class extends Original{constructor(...args){super(...args);globalThis.qaPeer=this;}};
   const {CourtView}=await import('/src/view.js'),render=CourtView.prototype.render;
   CourtView.prototype.render=function(...args){window.qaState=args[0];window.qaView=this;return render.apply(this,args);};
  });
 }
 report.build=await pages[0].evaluate(()=>RALLY_CONFIG.buildId);assert.equal(report.build,(await createPwaBuild()).version);
 // Actual local controls and three independently moving AI, then return to singles.
 const p=pages[0];await p.locator('#open-solo').click();await p.locator('#start-ai').click();await p.locator('#ai-lineup [data-lineup=doubles]').click();
 for(const [width,height] of [[844,390],[667,375],[390,844]]){
  await p.setViewportSize({width,height});await p.locator('#menu').evaluate(el=>el.scrollTop=0);
  assert.equal(await p.locator('#ai-more').evaluate(el=>el.open),false);
  const back=await p.locator('#entry-back').boundingBox();assert.ok(back.x<30&&back.y<30);
  const menu=await p.locator('#menu').boundingBox();if(width>height)assert.ok(menu.x+menu.width<width*.56);
  await p.screenshot({path:out+`/setup-${width}.png`});
  await p.locator('#start-ai-confirm').scrollIntoViewIfNeeded();assert.ok((await p.locator('#start-ai-confirm').boundingBox()).height>=44);
 }
 await p.setViewportSize({width:844,height:390});await p.locator('#ai-more summary').click();
 await p.locator('#teammate-difficulties [data-partner-difficulty=hard]').click();
 await p.locator('#ai-more summary').click();
 await p.locator('#start-ai-confirm').click();await readyGame(p);
 assert.equal(await p.evaluate(()=>qaState.players.length),4);
 await p.locator('[data-shot=clear]').click();await p.waitForFunction(()=>rallyDiagnostics.hitId>=2,null,{timeout:20000});
 assert.equal(await p.evaluate(()=>qaView.players.filter(a=>a.root.visible).length),4);
 await p.screenshot({path:out+'/practice-844.png'});
 await p.locator('#pause').click();assert.doesNotMatch(await p.locator('#pause-description').innerText(),/四人确认/);
 await p.locator('#leave-game').click();check('844x390: one fixed human + three AI, real serve/return, four visible athletes, local pause');
 await p.setViewportSize({width:667,height:375});await p.locator('#open-solo').click();await p.locator('#start-ai').click();
 await p.locator('#start-ai-confirm').click();await readyGame(p);await p.screenshot({path:out+'/practice-667.png'});
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:out+'/practice-portrait.png'});await p.setViewportSize({width:667,height:375});
 await p.locator('#pause').click();await p.locator('#leave-game').click();await p.setViewportSize({width:844,height:390});
 await p.locator('#open-solo').click();await p.locator('#start-ai').click();await p.locator('#ai-lineup [data-lineup=singles]').click();await p.locator('#start-ai-confirm').click();await readyGame(p);
 assert.equal(await p.evaluate(()=>qaView.players.filter(a=>a.root.visible).length),2);
 await p.locator('#pause').click();await p.locator('#leave-game').click();check('667x375 gameplay and portrait layout inspected; returning to singles hides extra athletes');
 for(let i=0;i<4;i++){
  await pages[i].locator('#open-friends').click();assert.equal(await pages[i].locator('#friend-form').isVisible(),false);
  await pages[i].locator(`#friend-tabs [data-action=${i===0?'create':'join'}]`).click();
  await pages[i].locator('#entry-back').click();assert.equal(await pages[i].locator('#friend-tabs').isVisible(),true);
  await pages[i].locator(`#friend-tabs [data-action=${i===0?'create':'join'}]`).click();
  await pages[i].locator('#player-name').fill('双打测试'+(i+1));await pages[i].locator('#friend-lineup [data-lineup=doubles]').click();
  await pages[i].screenshot({path:out+`/friend-${i===0?'create':'join'}-${i}.png`});
 }
 await pages[0].locator('#create-room').click();await pages[0].locator('#waiting-dialog').waitFor({state:'visible'});
 const code=(await pages[0].locator('#waiting-code').innerText()).trim();
 for(let i=1;i<4;i++){await pages[i].locator('#room-code').fill(code);await pages[i].locator('#join-room').click();await pages[i].locator('#waiting-dialog').waitFor({state:'visible'});}
 for(const p of pages)assert.equal(await p.locator('#ready-room').isEnabled(),true);
 await pages[1].screenshot({path:out+'/lobby-667.png'});
 for(const p of pages)await p.locator('#ready-room').click();
 await pages[0].waitForFunction(()=>['serve','paused'].includes(window.rallyDiagnostics?.statePhase)&&!rallyDiagnostics.entrance.active);
 await resumeIfPaused();
 assert.deepEqual(await Promise.all(pages.map(p=>p.evaluate(()=>rallyDiagnostics.playerSlot))),[0,1,2,3]);
 assert.deepEqual(await Promise.all(pages.map(p=>p.evaluate(()=>qaView.cameraSide))),[0,1,0,1]);
 await pages[0].locator('[data-shot=clear]').click();await pages[0].waitForFunction(()=>rallyDiagnostics.score.some(n=>n>0));
 const score=await pages[0].evaluate(()=>rallyDiagnostics.score);
 await Promise.all(pages.map(p=>p.waitForFunction(expected=>JSON.stringify(rallyDiagnostics.score)===JSON.stringify(expected),score)));
 await pages[2].screenshot({path:out+'/online-slot2.png'});check('Four independent identities join real PeerJS room, consent, score and team camera agree');
 await Promise.all(pages.map(readyGame));
 const oldConnection=await pages[2].evaluate(()=>{const c=Object.values(qaPeer.connections).flat().find(c=>c.open);window.qaOldConnection=c;const id=c.connectionId;c.close();return id;});
 await pages[2].waitForFunction(old=>Object.values(qaPeer.connections).flat().some(c=>c.open&&c.connectionId!==old),oldConnection,{timeout:20000});
 await Promise.all(pages.map(p=>p.waitForFunction(()=>rallyDiagnostics.statePhase==='paused')));
 assert.deepEqual(await pages[2].evaluate(()=>[rallyDiagnostics.playerSlot,rallyDiagnostics.score]),[2,score]);
 await resumeIfPaused();check('A real data-channel loss reconnects to original slot and score, all four consent to resume');
 await pages[3].evaluate(()=>qaPeer.destroy());
 await pages[0].waitForFunction(()=>rallyDiagnostics.statePhase==='over',null,{timeout:40000});
 const ended=await pages[0].evaluate(()=>({winner:qaState.winner,endReason:qaState.endReason}));assert.equal(ended.winner,null);assert.equal(ended.endReason,'disconnect');
 check('30-second unrecoverable disconnect ends without a winner');
 assert.deepEqual(report.errors,[]);
 }catch(error){
 report.failure=error.message;
 report.clients=await Promise.all(pages.map(p=>p.evaluate(()=>({diagnostics:window.rallyDiagnostics,phase:window.qaState?.phase,message:window.qaState?.message,reconnect:window.qaState?.reconnect,pause:window.qaState?.pause,peerDestroyed:window.qaPeer?.destroyed,channels:window.qaPeer?Object.values(qaPeer.connections).flat().map(c=>({open:c.open,id:c.connectionId})):[]})).catch(e=>({error:e.message}))));
 throw error;
}finally{
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await app.close();
}
