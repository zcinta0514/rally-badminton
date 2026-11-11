import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from '../server/index.js';
import { projectRoot } from './build-pwa.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.RALLY_PLAYWRIGHT_MODULE || '../artifacts/qa/node_modules/playwright');
const output=path.join(projectRoot,'artifacts','lobby');await mkdir(output,{recursive:true});
// Exercise the real room UI with two independent identities on the local WS
// transport. This deliberately does not claim public PeerJS / TURN coverage.
const app=createServer({port:0,host:'127.0.0.1',peerMode:false,leaderboardPath:path.join(output,'rooms-qa-leaderboard.json')});
const report={environment:'Chromium touch/mobile emulation; local WebSocket transport; two browser contexts',checks:[],errors:[]};
await app.listen();
const browser=await chromium.launch({executablePath:process.env.RALLY_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try {
  const pages=[];
  for(const width of [844,667]){
    const context=await browser.newContext({viewport:{width,height:375},hasTouch:true,isMobile:true,serviceWorkers:'block'});
    await context.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.usage.enabled','off');});
    const page=await context.newPage();page.setDefaultTimeout(25000);
    page.on('pageerror',e=>report.errors.push(e.message));
    await page.goto(app.url);await page.locator('#loading').waitFor({state:'hidden'});
    await page.locator('#open-friends').click();await page.locator('#player-name').fill(width===844?'房主测试':'访客测试');
    pages.push(page);
  }
  const [host,guest]=pages;
  await host.locator('#create-room').click();await host.locator('#waiting-code').waitFor({state:'visible'});
  const code=(await host.locator('#waiting-code').innerText()).trim();assert.match(code,/^[A-Z2-9]{5}$/);
  await host.screenshot({path:path.join(output,'room-created.png')});
  await guest.locator('#friend-tabs [data-action=join]').click();await guest.locator('#room-code').fill(code);await guest.locator('#join-room').click();
  for(const page of pages){
    await page.locator('#waiting-players').getByText('访客测试',{exact:false}).waitFor();
    await page.locator('#ready-room').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#ready-room').isEnabled(),true);
    assert.match(await page.locator('#waiting-rules').innerText(),/5分单局.*普通对局/);
    assert.equal(await page.locator('#waiting-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
    await page.screenshot({path:path.join(output,page===host?'room-host-ready.png':'room-guest-ready.png')});
  }
  report.checks.push('Create and join a real room with two identities; rules and ready controls remain readable at 844x375 and 667x375');
  await host.locator('#ready-room').click();await guest.locator('#ready-room').click();
  for(const page of pages){
    assert.equal(await page.locator('body').getAttribute('data-entering'),'true');
    assert.equal(await page.locator('#game-controls').isVisible(),false);
  }
  await guest.screenshot({path:path.join(output,'room-guest-entrance.png')});
  for(const page of pages){await page.locator('#hud').waitFor({state:'visible'});assert.equal(await page.locator('body').getAttribute('data-entering'),'false');}
  report.checks.push('Both player sides animate within the existing ready countdown and release the HUD before play');
  await host.waitForTimeout(3500);
  await host.locator('[data-shot=clear]').dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',clientX:700,clientY:220,bubbles:true});
  await host.locator('[data-shot=clear]').dispatchEvent('pointerup',{pointerId:1,pointerType:'touch',clientX:700,clientY:220,bubbles:true});
  await host.screenshot({path:path.join(output,'room-match.png')});
  await host.locator('#pause').click();await host.locator('#pause-dialog').waitFor({state:'visible'});
  await host.locator('#leave-game').click();await host.locator('#open-solo').waitFor({state:'visible'});
  report.checks.push('Both players prepare, enter the match, and host pauses and exits');
  assert.deepEqual(report.errors,[]);
  for(const name of report.checks)console.log('PASS '+name);
}catch(error){report.failure=error.stack;throw error;}
finally{await writeFile(path.join(output,'rooms-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();await app.close();}
