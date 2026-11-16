import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from '../server/index.js';
const {chromium}=createRequire(import.meta.url)(process.env.RALLY_PLAYWRIGHT_MODULE||'playwright');
const out='artifacts/version-corner';await mkdir(out,{recursive:true});
const app=createServer({port:0,host:'127.0.0.1',leaderboardPath:out+'/leaderboard.json'});await app.listen();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader']});
const report={environment:'Windows Chrome mobile/touch emulation, real service worker; not physical phone',checks:[],errors:[]};
try{
 const c=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
 await c.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.usage.enabled','off');});
 const p=await c.newPage();p.setDefaultTimeout(60000);p.on('pageerror',e=>report.errors.push(e.message));
 await p.goto(process.env.RALLY_QA_URL||app.url);await p.locator('#loading').waitFor({state:'hidden'});
 await p.waitForFunction(()=>document.querySelector('.lobby-version')?.textContent.includes('1.21.9'));
 report.build=await p.evaluate(()=>RALLY_CONFIG.buildId);
 for(const [width,height] of [[844,390],[568,320],[390,844],[320,568]]){
  await p.setViewportSize({width,height});
  const corner=p.locator('.lobby-update');await corner.waitFor({state:'visible'});
  const r=await corner.boundingBox();assert.ok(r.x>=0&&r.y>=0&&width-r.x-r.width<=20&&height-r.y-r.height<=16);
  assert.equal(await p.locator('.lobby-more .lobby-version').count(),0);
  const button=p.locator('#lobby-check-update');
  assert.equal(await button.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),true);
  await p.locator('.lobby-more summary').click();
  assert.ok(await corner.isVisible());await p.locator('.lobby-more summary').click();
  await p.screenshot({path:out+`/${width}x${height}.png`});
  await p.locator('#open-solo').click();await p.locator('#start-ai').click();assert.equal(await corner.isVisible(),false);
  await p.locator('#entry-back').click();await p.locator('#entry-back').click();
  report.checks.push(`${width}x${height}: right-bottom, reachable, outside More, hidden in preparation`);
 }
 await p.setViewportSize({width:844,height:390});
 await p.evaluate(()=>navigator.serviceWorker.ready);
 await p.locator('#lobby-check-update').click();
 await p.waitForFunction(()=>document.querySelector('#lobby-check-update').getAttribute('aria-busy')==='false');
 assert.match(await p.locator('#toast').textContent(),/检查完成|新版已备好|正在下载/);
 await p.evaluate(()=>{window.qaUpdate=ServiceWorkerRegistration.prototype.update;ServiceWorkerRegistration.prototype.update=()=>Promise.reject(new Error('QA offline'));});
 await p.locator('#lobby-check-update').click();
 await p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('暂时无法检查更新'));
 assert.equal(await p.locator('#lobby-check-update').isEnabled(),true);
 await p.evaluate(()=>ServiceWorkerRegistration.prototype.update=window.qaUpdate);
 await p.locator('#lobby-check-update').click();await p.waitForFunction(()=>!document.querySelector('#lobby-check-update').disabled);
 assert.match(await p.locator('#toast').textContent(),/检查完成|新版已备好|正在下载/);
 report.checks.push('Real update check, failure feedback, retry; existing worker registration reused');
 assert.deepEqual(report.errors,[]);
 console.log(JSON.stringify(report,null,2));
}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await app.close();}
