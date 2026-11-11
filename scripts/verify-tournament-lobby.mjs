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
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
await context.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.usage.enabled','off');});
const page=await context.newPage();page.setDefaultTimeout(20000);
page.on('pageerror',error=>report.errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});
const checked=name=>{report.checks.push(name);console.log('PASS '+name);};
async function shot(name){const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);}
async function fits(selector,minHeight=0){
  const bounds=await page.locator(selector).boundingBox();assert.ok(bounds,selector+' is visible');
  const size=page.viewportSize();
  assert.ok(bounds.x>=-1&&bounds.y>=-1&&bounds.x+bounds.width<=size.width+1&&bounds.y+bounds.height<=size.height+1,selector+' fits viewport '+JSON.stringify(bounds));
  assert.ok(bounds.height>=minHeight,selector+' touch height');
}
try {
  await page.goto(process.env.RALLY_QA_URL || app.url,{waitUntil:'networkidle',timeout:60000});
  await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
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
  await page.locator('#start-ai').click();await page.locator('#start-ai-confirm').scrollIntoViewIfNeeded();await shot(flowName+'-ai-setup');
  await page.locator('#start-ai-confirm').click();await page.locator('#hud').waitFor({state:'visible'});await page.waitForTimeout(600);await shot(flowName+'-match');
  assert.equal(await page.locator('body').getAttribute('data-screen'),'match');
  await page.locator('#pause').click();await page.locator('#leave-game').click();
  await page.locator('#open-solo').waitFor({state:'visible'});await page.waitForTimeout(500);await shot(flowName+'-returned-home');
  checked(flowName+' solo, ordinary preparation, actual challenge and AI matches, pause-return');
  await page.locator('#open-friends').click();await page.locator('#player-name').fill('球馆测试');
  await page.locator('#friend-tabs [data-action="join"]').click();await page.locator('#room-code').scrollIntoViewIfNeeded();await shot(flowName+'-friends');
  await page.locator('#entry-back').click();checked('friend create/join preparation and return');
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
  report.failure=error.stack;await shot('failure').catch(()=>{});throw error;
} finally {
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();await app?.close();
}
