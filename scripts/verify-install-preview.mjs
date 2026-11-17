import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from '../server/index.js';
const {chromium}=createRequire(import.meta.url)(process.env.RALLY_PLAYWRIGHT_MODULE||'playwright');
const out='artifacts/install-preview';await mkdir(out,{recursive:true});
const app=createServer({port:0,host:'127.0.0.1',leaderboardPath:out+'/leaderboard.json'});await app.listen();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader']});
const report={environment:'Windows Chrome mobile/touch emulation; real SW/cache/offline; synthetic install events, not native phone installation',checks:[],errors:[]};
const setup=async options=>{
 const c=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,...options});
 await c.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.usage.enabled','off');});
 const p=await c.newPage();p.setDefaultTimeout(60000);p.on('pageerror',e=>report.errors.push(e.message));
 await p.goto(app.url);await p.locator('#loading').waitFor({state:'hidden'});return {c,p};
};
try{
 const {c,p}=await setup({});
 report.build=await p.evaluate(()=>RALLY_CONFIG.buildId);
 assert.match(await p.locator('.lobby-version').textContent(),/1.21.11/);
 for(const [width,height] of [[844,390],[568,320],[390,844],[320,568]]){
  await p.setViewportSize({width,height});
  await p.locator('#install-app').click();await p.locator('#pwa-dialog').waitFor({state:'visible'});
  const box=await p.locator('#pwa-dialog').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
  assert.equal(await p.locator('#pwa-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
  await p.locator('#pwa-retry').scrollIntoViewIfNeeded();
  assert.equal(await p.locator('#pwa-retry').evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),true);
  await p.locator('#pwa-dialog').evaluate(e=>e.scrollTop=0);
  await p.screenshot({path:out+`/install-${width}x${height}.png`});
  await p.locator('.pwa-close').click();await p.screenshot({path:out+`/home-${width}x${height}.png`});
  report.checks.push(`${width}x${height}: entrance clickable, sheet within viewport, no horizontal overflow, resource action reachable, close works`);
 }
 await p.setViewportSize({width:844,height:390});await p.locator('#install-app').click();
 await p.waitForFunction(()=>document.querySelector('#pwa-resource-status').textContent==='离线模式已就绪');
 await p.locator('#pwa-retry').click();await p.waitForFunction(()=>!document.querySelector('#pwa-retry').disabled);
 assert.match(await p.locator('#toast').textContent(),/检查完成|新版已备好|正在下载/);
 // Browser-owned install prompt is simulated; the application handling is real.
 for(const outcome of ['dismissed','accepted']){
  await p.evaluate(outcome=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{window.promptCalls=(window.promptCalls||0)+1;};e.userChoice=Promise.resolve({outcome});window.dispatchEvent(e);},outcome);
  await p.locator('#pwa-install').click();
  if(outcome==='dismissed')assert.match(await p.locator('#toast').textContent(),/取消安装/);
  else await p.waitForFunction(()=>document.querySelector('#pwa-title').textContent==='已提交安装');
 }
 assert.equal(await p.evaluate(()=>window.promptCalls),2);
 await p.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));
 assert.equal(await p.locator('#pwa-title').textContent(),'已安装到手机');
 assert.match(await p.locator('#install-app').textContent(),/已安装到手机/);
 report.checks.push('Install prompt dismissed/accepted handling; acceptance does not claim completed OS installation');
 await p.locator('.pwa-close').click();await p.reload();await p.locator('#loading').waitFor({state:'hidden'});
 await p.evaluate(()=>navigator.serviceWorker.ready);assert.ok(await p.evaluate(()=>!!navigator.serviceWorker.controller));
 await c.setOffline(true);await p.reload();await p.locator('#loading').waitFor({state:'hidden'});
 await p.locator('#install-app').click();await p.waitForFunction(()=>document.querySelector('#pwa-resource-status').textContent.includes('当前离线 · 可进行人机对战'));
 await p.locator('.pwa-close').click();await p.locator('#open-solo').click();await p.locator('#start-ai').click();await p.locator('#start-ai-confirm').click();
 await p.waitForFunction(()=>document.body.dataset.screen==='match');
 report.checks.push('Real service worker: cache ready, offline reload, actual AI match starts');await c.close();
 for(const [name,userAgent,expected] of [
  ['ios','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',/Safari.*分享.*添加到主屏幕/],
  ['wechat-android','Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0',/系统浏览器/]
 ]){
  const {c,p}=await setup({userAgent});await p.locator('#install-app').click();assert.match(await p.locator('#pwa-steps').textContent(),expected);
  assert.equal(await p.locator('#pwa-install').isVisible(),false);await p.screenshot({path:out+`/${name}.png`});report.checks.push(`${name}: correct guide and no unsupported install button`);await c.close();
 }
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await app.close();}
