import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createServer } from '../server/index.js';
import { projectRoot, createPwaBuild } from './build-pwa.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.RALLY_PLAYWRIGHT_MODULE || '../artifacts/qa/node_modules/playwright');
const output=path.join(projectRoot,'artifacts','lobby');
await mkdir(output,{recursive:true});
const report={checks:[],errors:[],consoleErrors:[],screenshots:[],environment:'Headless Chromium; emulated viewport, not iPhone hardware'};
const expectedBuild=await createPwaBuild();
const app=process.env.RALLY_QA_URL?null:createServer({port:0,host:'127.0.0.1',peerMode:true,leaderboardPath:path.join(output,'qa-leaderboard.json')});
await app?.listen();
const browser=await chromium.launch({executablePath:process.env.RALLY_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:900},hasTouch:true,isMobile:true,deviceScaleFactor:1,serviceWorkers:'block'});
await context.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.usage.enabled','off');});
const page=await context.newPage();page.setDefaultTimeout(20000);
page.on('pageerror',error=>report.errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});
const checked=name=>{report.checks.push(name);console.log('PASS '+name);};
async function shot(name){await page.waitForTimeout(220);const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);}
async function fits(selector,minHeight=0){
  const bounds=await page.locator(selector).boundingBox();assert.ok(bounds,selector+' is visible');
  const size=page.viewportSize();
  assert.ok(bounds.x>=-1&&bounds.y>=-1&&bounds.x+bounds.width<=size.width+1&&bounds.y+bounds.height<=size.height+1,selector+' fits viewport '+JSON.stringify(bounds));
  assert.ok(bounds.height>=minHeight,selector+' touch height');
  const clipped=await page.locator(selector).evaluate(e=>{
    const r=e.getBoundingClientRect();const issues=[];
    for(let p=e.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();
      if(/hidden|auto|scroll|clip/.test(s.overflowX)&&(r.left<b.left-1||r.right>b.right+1))issues.push(p.id+' clips horizontally');
      if(/hidden|auto|scroll|clip/.test(s.overflowY)&&(r.top<b.top-1||r.bottom>b.bottom+1))issues.push(p.id+' clips vertically');
    }return issues;
  });assert.deepEqual(clipped,[],selector+' is not clipped by an ancestor');
}
try {
  await page.goto(process.env.RALLY_QA_URL || app.url,{waitUntil:'networkidle',timeout:60000});
  await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
  report.fonts=await page.evaluate(async()=>{
    await document.fonts.ready;
    return {faces:[...document.fonts].map(face=>({family:face.family,status:face.status})),
      title:getComputedStyle(document.querySelector('.lobby-wordmark')).fontFamily,
      menu:getComputedStyle(document.querySelector('#open-solo')).fontFamily};
  });
  for(const family of ['Rally UI','Rally Display','Rally Numerals'])
    assert.ok(report.fonts.faces.some(face=>face.family===family&&face.status==='loaded'),family+' loaded');
  assert.match(report.fonts.title,/Rally Display/);assert.match(report.fonts.menu,/Rally UI/);
  checked('self-hosted title and UI fonts load and are applied');
  await page.waitForTimeout(1500);
  report.buildId=await page.evaluate(()=>globalThis.RALLY_CONFIG.buildId);
  assert.equal(report.buildId,expectedBuild.version,'served build matches current source snapshot');
  checked('served build identity matches source');
  for(const [name,width,height] of [['desktop',1440,900],['phone',844,390],['short-phone',667,375],['portrait',390,844]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(500);
    await shot(name);
    await fits('#open-solo',44);await fits('#open-friends',44);await fits('#match-settings-toggle',44);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
    checked(name+' home choices fit and have 44px touch targets');
    await fits('#open-beta-group',44);
    assert.equal(await page.locator('#open-beta-group').evaluate(e=>!!e.closest('details')),false);
    assert.equal(await page.locator('#onboarding-entry').isVisible(),false,'secondary actions start collapsed');
    await page.locator('.lobby-more summary').click();
    await fits('#onboarding-entry',44);await fits('#open-beta-group',44);await fits('#install-app',44);
    await shot(name+'-more');
    await page.locator('.lobby-more summary').click();
    await page.locator('#open-beta-group').click();await page.locator('#beta-group').waitFor({state:'visible'});await fits('#copy-beta-wechat',44);await page.locator('#beta-group [data-close]').click();
    checked(name+' community always visible; More keeps guide and install accessible');
  }
  for(const [flowName,width,height] of [['phone',844,390],['short-phone',667,375]]) {
  await page.setViewportSize({width,height});await page.waitForTimeout(300);
  await page.locator('#open-solo').click();await page.locator('#start-ai').waitFor({state:'visible'});
  await fits('#start-ai',44);await fits('#start-hell',44);await shot(flowName+'-solo');
  await page.locator('#start-hell').click();await page.locator('#start-hell-confirm').scrollIntoViewIfNeeded();await shot(flowName+'-challenge');
  await page.locator('#start-hell-confirm').click();await page.locator('#hud').waitFor({state:'visible'});
  await page.waitForFunction(()=>globalThis.rallyDiagnostics?.challenge?.kind==='hell');
  await page.locator('#pause').click();await page.locator('#leave-game').click();
  await page.locator('#open-solo').click();
  await page.locator('#start-ai').click();await page.locator('#start-ai-confirm').scrollIntoViewIfNeeded();await fits('#start-ai-confirm',44);
  for(const id of ['roles','difficulties','ai-formats']) {await page.locator('#'+id).scrollIntoViewIfNeeded();await fits('#'+id);}
  assert.match(await page.locator('#rules-note').innerText(),/净胜/);
  assert.equal(await page.locator('#difficulty-note').isVisible(),false);
  await page.locator('#ai-more summary').click();await page.locator('#difficulty-note').waitFor({state:'visible'});await page.locator('#coach-roles').scrollIntoViewIfNeeded();await fits('#coach-roles',44);await page.locator('#ai-more summary').click();
  await shot(flowName+'-ai-setup');
  await page.locator('#start-ai-confirm').click();await page.locator('#hud').waitFor({state:'visible'});await page.waitForTimeout(600);await shot(flowName+'-match');
  assert.equal(await page.locator('body').getAttribute('data-screen'),'match');
  assert.match(await page.locator('#score-self').evaluate(e=>getComputedStyle(e).fontFamily),/Rally Numerals/);
  for(const shot of ['clear','drop','smash']) await fits('[data-shot='+shot+']',44);
  assert.equal(await page.locator('.scoreboard').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(20, 34, 30, 0.91)');
  await page.locator('#pause').click();await shot(flowName+'-pause');await page.locator('#leave-game').click();
  await page.locator('#open-solo').waitFor({state:'visible'});await page.waitForTimeout(500);await shot(flowName+'-returned-home');
  checked(flowName+' solo, ordinary preparation, actual challenge and AI matches, pause-return');
  await page.locator('#open-friends').click();await page.locator('#friend-tabs [data-action="create"]').click();await page.locator('#player-name').fill('球馆测试');
  await page.locator('#create-room').scrollIntoViewIfNeeded();await fits('#create-room',44);await page.locator('#player-name').scrollIntoViewIfNeeded();await fits('#player-name',44);await shot(flowName+'-create');
  assert.equal(await page.locator('#friend-mode-note').isVisible(),false);
  await page.locator('#friend-more summary').click();await page.locator('[data-finale="father-son"]').click();assert.equal(await page.locator('#friend-mode-note').isVisible(),true);
  await page.locator('[data-finale="none"]').click();
  await page.locator('#entry-back').click();await page.locator('#friend-tabs [data-action="join"]').click();await page.locator('#room-code').scrollIntoViewIfNeeded();await shot(flowName+'-friends');
  await page.locator('#entry-back').click();await page.locator('#entry-back').click();checked('friend create/join preparation and return');
  await page.locator('#match-settings-toggle').click();await page.locator('#arena-master').waitFor({state:'visible'});
  await page.locator('#match-settings-toggle').click();checked('lobby audio settings reachable');
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#open-solo').click();await page.locator('#start-ai').click();
  await page.locator('#start-ai-confirm').scrollIntoViewIfNeeded();await fits('#start-ai-confirm',44);
  await page.locator('#entry-back').click();await page.locator('#entry-back').click();
  checked('portrait preparation scroll and return');
  await page.setViewportSize({width:844,height:390});
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#open-solo').click();
  assert.equal(await page.locator('.lobby-reveal').count(),0);checked('reduced-motion menu path');
  await page.locator('#entry-back').click();await page.waitForTimeout(700);
  report.diagnostics=await page.evaluate(()=>globalThis.rallyDiagnostics);
  assert.deepEqual(report.errors,[]);checked('no uncaught page errors');
  assert.ok(!report.consoleErrors.some(message=>/WebGL|Shader|THREE\./i.test(message)));checked('no WebGL shader errors');
} catch(error) {
  report.failure=error.stack;console.log(await page.evaluate(()=>{const e=document.querySelector('#menu'),s=getComputedStyle(e);return {scrollLeft:e.scrollLeft,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,padding:s.padding,inset:s.inset,transform:s.transform,box:e.getBoundingClientRect().toJSON(),body:document.body.scrollLeft,doc:document.documentElement.scrollLeft};}));await shot('failure').catch(()=>{});throw error;
} finally {
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();await app?.close();
}
