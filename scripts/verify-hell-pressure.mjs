import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from '../server/index.js';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.RALLY_PLAYWRIGHT_MODULE);
const app=createServer({port:0,host:'127.0.0.1'});await app.listen();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader']});
const errors=[];const results=[];
await mkdir('artifacts/hell-pressure',{recursive:true});
try {for(const [width,height] of [[844,390],[667,375]]) {
 const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await context.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.usage.enabled','off');});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(app.url);await page.locator('#loading').waitFor({state:'hidden'});
 await page.locator('#open-solo').click();await page.locator('#start-hell').click();
 assert.equal(await page.locator('#hell-more').evaluate(e=>e.open),false);
 await page.locator('#hell-more summary').click();assert.match(await page.locator('#hell-more').innerText(),/3秒/);
 await page.screenshot({path:`artifacts/hell-pressure/details-${width}.png`});
 await page.locator('#start-hell-confirm').click();
 await page.waitForFunction(()=>rallyDiagnostics.challenge?.kind==='hell'&&!rallyDiagnostics.entrance.active);
 await page.locator('[data-shot="clear"]').click();await page.waitForTimeout(3500);
 assert.ok(await page.evaluate(()=>rallyDiagnostics.challenge));
 await page.screenshot({path:`artifacts/hell-pressure/match-${width}.png`});
 results.push({width,height,diagnostics:await page.evaluate(()=>rallyDiagnostics.challenge)});
 await context.close();
} assert.deepEqual(errors,[]);await writeFile('artifacts/hell-pressure/browser.json',JSON.stringify({results,errors},null,2));console.log('PASS both landscape sizes, folded/expanded skills, actual hell match, no page errors');
}finally{await browser.close();await app.close();}
