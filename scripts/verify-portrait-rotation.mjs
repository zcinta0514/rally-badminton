import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from '../server/index.js';
const {chromium,webkit}=createRequire(import.meta.url)(process.env.RALLY_PLAYWRIGHT_MODULE||'playwright');
const out='artifacts/portrait-refine';await mkdir(out,{recursive:true});
const app=createServer({port:0,host:'127.0.0.1'});await app.listen();const report={environment:'Windows Chrome and WebKit mobile viewport emulation; not physical iPhone',checks:[],errors:[]};
try{for(const [engine,type] of [['chrome',chromium],['webkit',webkit]]){
 const b=await type.launch({headless:true,...(engine==='chrome'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader']}: {})});
 try{const p=await b.newPage({viewport:{width:568,height:260},isMobile:true,hasTouch:true,serviceWorkers:'block'});p.setDefaultTimeout(60000);p.on('pageerror',e=>report.errors.push(e.message));await p.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.usage.enabled','off')});await p.goto(process.env.RALLY_QA_URL||app.url);await p.locator('#loading').waitFor({state:'hidden'});
 const readPortrait=()=>p.evaluate(()=>{const menu=document.querySelector('#menu'),c=document.querySelector('#court').getBoundingClientRect(),u=document.querySelector('.lobby-update'),r=u.getBoundingClientRect(),style=getComputedStyle(u);return {scroll:menu.scrollTop,windowScroll:scrollY,height:innerHeight,court:{top:c.top,bottom:c.bottom},title:document.querySelector('#menu h1').getBoundingClientRect().top,footer:{width:r.width,height:r.height},background:style.backgroundColor,border:style.borderTopColor}});
 await p.setViewportSize({width:320,height:480});
 const baseline=await readPortrait();
 for(let i=0;i<3;i++){
  await p.setViewportSize({width:568,height:260});await p.waitForTimeout(200);await p.locator('#menu').evaluate(e=>e.scrollTop=999);
  assert.ok(await p.locator('#menu').evaluate(e=>e.scrollTop)>0,'reproduce landscape scroll');
  await p.setViewportSize({width:320,height:480});await p.waitForTimeout(300);
  const metrics=await readPortrait();
  assert.equal(metrics.scroll,0);assert.equal(metrics.windowScroll,0);assert.equal(metrics.court.top,0);assert.equal(metrics.court.bottom,metrics.height);
  assert.deepEqual(metrics,baseline,'rotating restores the current portrait home layout');
  report.checks.push({engine,cycle:i+1,...metrics});
 }
 await p.screenshot({path:`${out}/${engine}-portrait.png`});
 await p.locator('#install-app').scrollIntoViewIfNeeded();
 const more=await p.locator('#install-app').boundingBox(),corner=await p.locator('.lobby-update').boundingBox();assert.ok(more.x+more.width<=corner.x+.5||more.y+more.height<=corner.y+.5,JSON.stringify({more,corner}));
 await p.locator('#install-app').click();await p.locator('#pwa-dialog').waitFor({state:'visible'});assert.equal(await p.locator('#pwa-check').count(),0);assert.equal(await p.getByRole('button',{name:'检查更新',exact:true,includeHidden:true}).count(),1);
 await p.locator('#pwa-dialog .pwa-close').click();await p.setViewportSize({width:844,height:390});await p.screenshot({path:`${out}/${engine}-landscape.png`});
 console.log(`PASS ${engine}: three scroll/rotation cycles; portrait layout restored; no duplicate update action`);
 }finally{await b.close()}
}assert.deepEqual(report.errors,[]);}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await app.close()}
