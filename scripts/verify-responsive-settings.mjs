import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createPwaBuild } from './build-pwa.js';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require('../artifacts/qa/node_modules/playwright');
const out='artifacts/responsive';await mkdir(out,{recursive:true});
const report={environment:'Chromium and WebKit desktop engines with mobile viewport/touch emulation; not physical iPhone',checks:[],failures:[],errors:[]};
const expected=(await createPwaBuild()).version;
const url=process.env.RALLY_QA_URL||'http://127.0.0.1:3333/';
const sizes=process.env.RALLY_QA_SIZES?JSON.parse(process.env.RALLY_QA_SIZES):[[844,390],[667,375],[568,320],[390,844],[320,568]];
for(const engine of (process.env.RALLY_QA_ENGINE?[process.env.RALLY_QA_ENGINE]:['chromium','webkit'])){
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader']}:{})});
 for(const [width,height] of sizes){
  const name=`${engine}-${width}x${height}`;
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:1,serviceWorkers:'block',reducedMotion:'reduce'});
  await context.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.usage.enabled','off');});
  const page=await context.newPage();page.setDefaultTimeout(12000);
  page.on('pageerror',e=>report.errors.push(name+': '+e.message));
  const check=label=>{report.checks.push(name+' '+label);console.log('PASS '+name+' '+label);};
  async function reachable(selector){
   const element=page.locator(selector).first();await element.scrollIntoViewIfNeeded();
   const issue=await element.evaluate(e=>{const r=e.getBoundingClientRect();if(r.left< -1||r.right>innerWidth+1||r.top< -1||r.bottom>innerHeight+1)return 'viewport '+JSON.stringify(r.toJSON());
    for(let p=e.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(/hidden|auto|scroll|clip/.test(s.overflowX)&&(r.left<b.left-1||r.right>b.right+1))return 'horizontal clip '+p.className;if(/hidden|auto|scroll|clip/.test(s.overflowY)&&(r.top<b.top-1||r.bottom>b.bottom+1))return 'vertical clip '+p.className;}
    const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e.contains(hit)||hit===e?null:'covered by '+hit?.outerHTML.slice(0,150);
   });assert.equal(issue,null,selector+' reachable');
  }
  async function click(selector){await reachable(selector);await page.locator(selector).first().click();}
  async function range(selector,value){await reachable(selector);await page.locator(selector).fill(String(value));await page.locator(selector).dispatchEvent('input');}
  try{
   await page.goto(url,{waitUntil:'networkidle',timeout:60000});await page.locator('#loading').waitFor({state:'hidden'});
   assert.equal(await page.evaluate(()=>RALLY_CONFIG.buildId),expected);report.buildId=expected;
   await click('#match-settings-toggle');
   for(const id of ['master','hits','movement','crowd','environment']){await range('#arena-'+id,37);assert.equal(await page.locator('#arena-'+id+' + output').textContent(),'37%');}
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('rally.arena.v1')).master),.37);
   if(await page.locator('#haptics-enabled').isEnabled())await click('#haptics-enabled');
   else {assert.equal(await page.evaluate(()=>typeof navigator.vibrate),'undefined');assert.match(await page.locator('#haptics-note').textContent(),/不支持/);}
   await click('#arena-reset');assert.equal(await page.locator('#arena-master').inputValue(),'60');
   await click('#match-settings-toggle');check('audio sliders, persistence, haptics and reset');
   await click('#help');await reachable('#operation-hints');await page.locator('#operation-hints').uncheck();await page.locator('#operation-hints').check();await click('#help-dialog button.primary-btn[data-close]');check('help scroll, hint preference and close');
   await click('.lobby-more summary');await click('#install-app');await reachable('#pwa-check');await click('.pwa-close');
   await click('#onboarding-entry');await reachable('#onboarding-next');await click('#onboarding-skip');
   await click('.lobby-more summary');await click('#open-beta-group');await reachable('#copy-beta-wechat');await click('#beta-group [data-close]');
   check('install, onboarding and community dialogs');
   await click('#open-friends');await page.locator('#player-name').fill('横竖屏测试球员');await reachable('#create-room');
   await click('#friend-tabs [data-action="join"]');await reachable('#room-code');await reachable('#join-room');await click('#entry-back');
   await click('#open-solo');await click('#start-ai');await click('#start-ai-confirm');await page.locator('#hud').waitFor({state:'visible'});
   check('room preparation and AI start');
   await click('#camera-toggle');for(const [id,value] of [['pitch',40],['zoom',112],['pitch',18],['zoom',85]])await range('#camera-'+id,value);
   await click('#camera-reset');assert.equal(await page.locator('#camera-pitch').inputValue(),'24');await click('#camera-toggle');
   await click('#palette-toggle');const palettes=page.locator('#palette-options button');for(let i=0;i<await palettes.count();i++){await palettes.nth(i).scrollIntoViewIfNeeded();await palettes.nth(i).click();}await click('#palette-toggle');
   check('camera limits/reset and all court palettes');
   await click('#match-settings-toggle');await click('#edit-shot-layout');await page.locator('#shot-layout-editor').waitFor({state:'visible'});
   await reachable('.shot-layout-title');
   assert.equal(await page.locator('.shot-layout-toolbar').evaluate(toolbar=>{
    const groups=[...toolbar.children].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.getBoundingClientRect());
    return groups.some((a,i)=>groups.slice(i+1).some(b=>Math.min(a.right,b.right)>Math.max(a.left,b.left)+1&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1));
   }),false,'editor toolbar labels and actions do not overlap');
   await page.screenshot({path:`${out}/${name}-editor.png`});
   await click('#shot-layout-editor [data-preset="arc"]');await click('#shot-layout-editor [data-action="save"]');assert.equal(await page.locator('body').getAttribute('data-shot-layout'),'arc');
   await click('#match-settings-toggle');await click('#edit-shot-layout');await click('#shot-layout-editor [data-preset="default"]');await click('#shot-layout-editor [data-action="cancel"]');assert.equal(await page.locator('body').getAttribute('data-shot-layout'),'arc');
   check('shot editor preset/save/cancel');
   for(const viewport of [{width:height,height:width},{width,height}]){await page.setViewportSize(viewport);await page.waitForTimeout(300);for(const shot of ['clear','drop','smash'])await reachable('#game-controls [data-shot="'+shot+'"]');await reachable('#pause');}
   await page.screenshot({path:`${out}/${name}-match.png`});check('rotation cycle, gameplay controls and pause remain reachable');
   await click('#pause');await reachable('#resume');await reachable('#leave-game');
   if(width===568){await page.locator('#result-dialog').waitFor({state:'visible',timeout:45000});await reachable('#rematch');await reachable('#back-menu');await page.screenshot({path:`${out}/${name}-result.png`});await click('#rematch');await page.locator('#hud').waitFor({state:'visible'});await click('#pause');check('real pause timeout result and rematch');}
   await click('#leave-game');await reachable('#open-solo');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));check('return home without horizontal overflow');
  }catch(e){report.failures.push({name,error:e.stack});console.error('FAIL '+name+' '+e.message);await page.screenshot({path:`${out}/${name}-failure.png`}).catch(()=>{});}
  await context.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
 }
 await browser.close();
}
console.log(JSON.stringify({checks:report.checks.length,failures:report.failures,errors:report.errors},null,2));
if(report.failures.length||report.errors.length)process.exitCode=1;
