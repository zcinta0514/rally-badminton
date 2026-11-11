import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from '../server/index.js';
import {createPwaBuild} from './build-pwa.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.RALLY_PLAYWRIGHT_MODULE||'playwright');
await mkdir('artifacts/lighting',{recursive:true});
const app=process.env.RALLY_QA_URL?null:createServer({port:0,host:'127.0.0.1',peerMode:true});await app?.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.RALLY_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader']});
const report={checks:[],errors:[],environment:'Windows Chrome mobile viewport/touch emulation, not phone hardware',build:(await createPwaBuild()).version};
try{
 for(const [width,height] of [[844,390],[667,375],[568,320],[390,844]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
  await context.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.usage.enabled','off');});
  const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>report.errors.push(e.message));
  const ready=async()=>{await page.locator('#loading').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>RALLY_CONFIG.buildId),report.build);};
  const slider=page.locator('#arena-brightness');
  const adjust=async(value)=>{
   await slider.scrollIntoViewIfNeeded();
   const rect=await slider.boundingBox();assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width+1&&rect.y+rect.height<=height+1);
   await slider.fill(String(value));await slider.dispatchEvent('input');
   assert.equal(await page.locator('#arena-brightness + output').textContent(),value+'%');
   await page.waitForFunction(v=>rallyDiagnostics.renderer.brightness===v,value/100);
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('rally.arena.v1')).brightness),value/100);
  };
  await page.goto(process.env.RALLY_QA_URL||app.url);await ready();
  await page.locator('#match-settings-toggle').click();assert.equal(await slider.inputValue(),'125');
  for(const value of [80,180]){
   await adjust(value);
   if(width===844){await page.locator('#match-settings-toggle').click();await page.screenshot({path:`artifacts/lighting/lobby-${value}.png`});await page.locator('#match-settings-toggle').click();}
  }
  await adjust(150);
  await page.reload();await ready();await page.locator('#match-settings-toggle').click();assert.equal(await slider.inputValue(),'150');
  await page.locator('#arena-reset').click();assert.equal(await slider.inputValue(),'125');
  await page.screenshot({path:`artifacts/lighting/${width}x${height}-settings.png`});
  await page.locator('#match-settings-toggle').click();
  await page.screenshot({path:`artifacts/lighting/${width}x${height}-lobby.png`});
  await page.locator('#open-solo').click();await page.locator('#start-ai').click();await page.locator('#start-ai-confirm').click();
  await page.locator('#hud').waitFor({state:'visible'});await page.locator('#match-settings-toggle').click();
  await adjust(180);await adjust(125);await page.locator('#match-settings-toggle').click();
  await page.screenshot({path:`artifacts/lighting/${width}x${height}-match.png`});
  const button=page.locator('[data-shot=clear]'),box=await button.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(180);await page.mouse.up();
  await page.waitForFunction(()=>rallyDiagnostics.statePhase==='rally');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  report.checks.push(`${width}x${height}: slider bounds, saved reload, reset, lobby/match synchronization and real serve pass`);
  console.log(report.checks.at(-1));await context.close();
 }
 assert.deepEqual(report.errors,[]);
}finally{await writeFile('artifacts/lighting/report.json',JSON.stringify(report,null,2));await browser.close();await app?.close();}
