import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from '../server/index.js';
const {chromium}=createRequire(import.meta.url)(process.env.RALLY_PLAYWRIGHT_MODULE||'playwright');
const out='artifacts/responsive-controls';await mkdir(out,{recursive:true});
const app=createServer({port:0,host:'127.0.0.1',leaderboardPath:out+'/leaderboard.json'});await app.listen();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader']});
const report={environment:'Windows Chrome mobile touch emulation (not a physical phone)',checks:[],errors:[]};
try {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.usage.enabled','off');});
 const page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(app.url);await page.locator('#loading').waitFor({state:'hidden'});await page.evaluate(()=>document.fonts.ready);
 report.build=await page.evaluate(()=>RALLY_CONFIG.buildId);
 const row=async(selector,label)=>{
  const boxes=await page.locator(selector).evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().width&&getComputedStyle(e).visibility!=='hidden').map(e=>{const r=e.getBoundingClientRect();return {id:e.id,x:r.x,y:r.y,w:r.width,h:r.height,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}));
  assert.ok(boxes.length>0,label);
  const centers=boxes.map(r=>r.y+r.h/2);assert.ok(Math.max(...centers)-Math.min(...centers)<=1,`${label}: row ${JSON.stringify(boxes)}`);
  boxes.sort((a,b)=>a.x-b.x);
  for(const [i,r] of boxes.entries()) {assert.ok(r.hit,`${label}: blocked ${r.id}`);assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=page.viewportSize().width+1&&r.y+r.h<=page.viewportSize().height+1,`${label}: outside ${r.id}`);if(i)assert.ok(r.x>=boxes[i-1].x+boxes[i-1].w,`${label}: overlap ${JSON.stringify(boxes)}`);}
  return boxes;
 };
 for(const [width,height] of [[390,844],[844,390],[568,320],[320,568],[360,640],[667,375],[932,430],[768,1024],[1366,768],[390,500]]) {
  await page.setViewportSize({width,height});await page.waitForTimeout(250);
  const label=`${width}x${height}`;
  await row('.top-actions button',label+' home header');
  const footer=await row('.menu-foot-actions > button,#lobby-check-update',label+' footer');assert.equal(footer.length,4);
  assert.equal(await page.locator('#menu').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,label+' overflow');
  await page.screenshot({path:`${out}/home-${label}.png`});
  await page.locator('#match-settings-toggle').click();await page.locator('#settings-back').click();
  await page.locator('#install-app').click();await page.locator('.pwa-close').click();
  await page.locator('#open-solo').click();await row('.top-actions button,#entry-back',label+' preparation header');
  await page.locator('#start-ai').click();await row('.top-actions button,#entry-back',label+' AI header');
  await page.locator('#entry-back').click();await page.locator('#entry-back').click();
  await row('.menu-foot-actions > button,#lobby-check-update',label+' returned footer');
  report.checks.push(label+': aligned, in bounds, hit targets unobstructed; settings, install and preparation return work');
 }
 // Safe insets and rotation, including asymmetric landscape notches.
 await page.addStyleTag({content:':root {--safe-left:44px;--safe-right:44px;--safe-top:20px;--safe-bottom:21px;}'});
 await page.setViewportSize({width:844,height:390});await row('.top-actions button','safe header');await row('.menu-foot-actions > button,#lobby-check-update','safe footer');
 await page.setViewportSize({width:390,height:844});await page.setViewportSize({width:844,height:390});await row('.menu-foot-actions > button,#lobby-check-update','rotated footer');
 report.checks.push('Synthetic safe-area insets and portrait/landscape round trip');
 await page.locator('#open-solo').click();await page.locator('#start-ai').click();await page.locator('#start-ai-confirm').click();
 await page.waitForFunction(()=>document.body.dataset.screen==='match'&&document.body.dataset.entering!=='true');
 await page.waitForTimeout(1500);
 await page.evaluate(()=>document.querySelectorAll('style').forEach(e=>{if(e.textContent.includes('--safe-left:44px'))e.remove();}));
 for(const [width,height] of [[844,390],[568,320],[390,844],[320,568]]) {
  await page.setViewportSize({width,height});await page.waitForTimeout(250);await row('.top-actions button',`match ${width}x${height}`);await page.screenshot({path:`${out}/match-${width}x${height}.png`});
 }
 report.checks.push('Actual AI match: toolbar alignment at four phone sizes');assert.deepEqual(report.errors,[]);
 console.log(JSON.stringify(report,null,2));
}finally {await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await app.close();}
