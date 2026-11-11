import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from '../server/index.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.RALLY_PLAYWRIGHT_MODULE);
const label=process.argv[2]||'after';
await mkdir('artifacts/performance',{recursive:true});
const app=createServer({port:0,host:'127.0.0.1',peerMode:true});await app.listen();
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});
await context.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.usage.enabled','off');});
const page=await context.newPage(),report={label,errors:[],environment:'Chromium Windows mobile emulation; not phone hardware'};
page.on('pageerror',e=>report.errors.push(e.message));
try {
await page.goto(app.url);await page.locator('#loading').waitFor({state:'hidden'});
await page.waitForTimeout(12000);report.lobby=await page.evaluate(()=>rallyDiagnostics);
await page.screenshot({path:`artifacts/performance/${label}-lobby.png`});
await page.locator('#open-solo').click();await page.locator('#start-ai').click();await page.locator('#start-ai-confirm').click();
await page.locator('#hud').waitFor({state:'visible'});await page.waitForTimeout(12000);
report.match=await page.evaluate(()=>rallyDiagnostics);
await page.screenshot({path:`artifacts/performance/${label}-match.png`});
console.log(JSON.stringify(report));
await writeFile(`artifacts/performance/${label}.json`,JSON.stringify(report,null,2));
}finally{await browser.close();await app.close();}
