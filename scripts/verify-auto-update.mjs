import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createPwaBuild} from './build-pwa.js';
const old=await createPwaBuild({root:path.resolve(process.env.RALLY_OLD_ROOT||'../rally-update-baseline')});
const next=await createPwaBuild();let deployed=old;
const server=http.createServer((req,res)=>{
 const key=new URL(req.url,'http://localhost').pathname;
 const body=key==='/sw.js'?deployed.worker:deployed.assets.get(key==='/index.html'?'/':key);
 if(!body){res.writeHead(404);res.end();return;}
 const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.woff2':'font/woff2','.glb':'model/gltf-binary'};
 res.writeHead(200,{'Content-Type':key==='/'?'text/html':mime[path.extname(key)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(body);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.RALLY_BROWSER_PATH,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const errors=[],checks=[];
const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
await context.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.release.notice.2026-11-13-doubles','1');});
const url='http://127.0.0.1:'+server.address().port;
const loaded=async p=>{await p.locator('#loading').waitFor({state:'hidden',timeout:120000});console.log('loaded',p.url());};
try {
 const lobby=await context.newPage();lobby.on('pageerror',e=>errors.push(e.message));
 await lobby.goto(url+'/?source=homescreen');await loaded(lobby);
 console.log('initial page ready');await lobby.evaluate(()=>navigator.serviceWorker.ready);console.log('worker ready');await lobby.reload();await loaded(lobby);
 const match=await context.newPage();match.on('pageerror',e=>errors.push(e.message));await match.goto(url);await loaded(match);
 await match.locator('#open-solo').evaluate(el=>el.click());await match.locator('#start-ai').evaluate(el=>el.click());await match.locator('#start-ai-confirm').evaluate(el=>el.click());
 await match.waitForFunction(()=>document.body.dataset.screen==='match');
 console.log('match started');await lobby.bringToFront();deployed=next;
 await lobby.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update();});
 await lobby.waitForFunction(v=>globalThis.RALLY_CONFIG?.buildId===v,next.version,{timeout:120000});await loaded(lobby);
 console.log('lobby upgraded');assert.equal(await match.evaluate(()=>RALLY_CONFIG.buildId),old.version);
 assert.equal(await match.evaluate(()=>document.body.dataset.screen),'match');checks.push('1.21.4 lobby upgrades while another 1.21.4 match remains running');
 await match.bringToFront();await match.locator('#pause').evaluate(el=>el.click());await match.locator('#leave-game').evaluate(el=>el.click());
 await match.waitForFunction(v=>globalThis.RALLY_CONFIG?.buildId===v,next.version,{timeout:120000});await loaded(match);checks.push('old match upgrades after returning home');
 assert.match(await lobby.locator('.lobby-version').textContent(),/1.21.7/);
 await context.setOffline(true);await lobby.reload();await loaded(lobby);assert.equal(await lobby.evaluate(()=>RALLY_CONFIG.buildId),next.version);checks.push('homescreen URL reopens latest cache offline');
 await mkdir('artifacts/auto-update',{recursive:true});await lobby.screenshot({path:'artifacts/auto-update/844x390.png'});
 await lobby.setViewportSize({width:667,height:375});await lobby.screenshot({path:'artifacts/auto-update/667x375.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,errors,old:old.version,next:next.version}));
 await writeFile('artifacts/auto-update/report.json',JSON.stringify({checks,errors,old:old.version,next:next.version},null,2));
}catch(error){console.error(error);for(const p of context.pages())console.error(await p.evaluate(()=>({url:location.href,loading:document.getElementById('loading')?.textContent,screen:document.body.dataset.screen,version:globalThis.RALLY_CONFIG?.buildId})).catch(()=>null));throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}



