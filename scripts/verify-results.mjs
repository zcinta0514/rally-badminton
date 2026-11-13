import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from '../server/index.js';
import {projectRoot,createPwaBuild} from './build-pwa.js';

const {chromium}=createRequire(import.meta.url)(process.env.RALLY_PLAYWRIGHT_MODULE||'playwright');
const out=projectRoot+'/artifacts/results';await mkdir(out,{recursive:true});
const app=createServer({port:0,host:'127.0.0.1'});await app.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.RALLY_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader']});
const report={environment:'Chrome mobile/touch emulation; synthetic match endings through production finishMatch; no physical device',checks:[],errors:[]};
try {
  const page=await browser.newPage({viewport:{width:667,height:375},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.release.notice.2026-11-13-doubles','1');});
  // Browser-only instrumentation: no mutable test hooks enter the shipped bundle.
  await page.route('**/src/main.js*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+`\nwindow.qaFinish=(o={})=>{
      state.ruleset=o.standard?'standard21':'quick';state.games=o.games||[2,1];state.score=o.score||[5,3];
      finishMatch(state,o.winner===undefined?0:o.winner,o.message||'近场获胜',o.reason||'scored');
    };`});
  });
  await page.goto(app.url);await page.locator('#loading').waitFor({state:'hidden'});
  report.build=await page.evaluate(()=>RALLY_CONFIG.buildId);
  assert.equal(report.build,(await createPwaBuild()).version);
  await page.locator('#open-solo').click();await page.locator('#start-ai').click();
  await page.locator('#ai-lineup [data-lineup=doubles]').click();await page.locator('#start-ai-confirm').click();
  const ready=()=>page.waitForFunction(()=>rallyDiagnostics.statePhase==='serve'&&!rallyDiagnostics.entrance.active);
  await ready();await page.evaluate(()=>qaFinish());await page.locator('#result-dialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#result-name-self').innerText(),'你与队友');
  for(const [width,height] of [[844,390],[667,375],[568,320],[390,844]]){
    await page.setViewportSize({width,height});
    const bounds=await page.locator('#result-dialog').evaluate(el=>({box:el.getBoundingClientRect().toJSON(),overflow:el.scrollWidth>el.clientWidth||el.scrollHeight>el.clientHeight}));
    assert.ok(bounds.box.x>=0&&bounds.box.y>=0&&bounds.box.right<=width&&bounds.box.bottom<=height);
    assert.equal(bounds.overflow,false,`${width}x${height} needs no scrolling for ordinary results`);
    for(const id of ['rematch','back-menu'])assert.ok((await page.locator('#'+id).boundingBox()).height>=44);
    await page.screenshot({path:out+`/win-${width}.png`});
    report.checks.push(`${width}x${height}: readable result, no overflow, actions >=44px`);
  }
  await page.setViewportSize({width:667,height:375});await page.locator('#rematch').click();await ready();
  assert.equal(await page.locator('#result-dialog').isHidden(),true);
  assert.equal(await page.evaluate(()=>rallyDiagnostics.playerCount),4);
  await page.evaluate(()=>qaFinish({standard:true,score:[18,21],games:[1,2],winner:1,message:'远场获胜'}));
  await page.locator('#result-dialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#result-title').innerText(),'本场失利');
  assert.equal(await page.locator('#result-score-label').innerText(),'最终局数');
  assert.match(await page.locator('#result-reason').innerText(),/最后一局 18:21/);
  await page.screenshot({path:out+'/standard-loss.png'});
  // Stress only the presentation with four long names and all online actions.
  await page.evaluate(()=>{
    document.querySelector('#result-name-self').textContent='羽毛球爱好者甲 / 羽毛球爱好者乙';
    document.querySelector('#result-name-other').textContent='羽毛球爱好者丙 / 羽毛球爱好者丁';
    document.querySelector('#result-leaderboard').style.setProperty('display','flex','important');
    document.querySelector('#result-record').style.setProperty('display','block','important');
    document.querySelector('#result-record').textContent='战绩已记录在本机';
  });
  await page.screenshot({path:out+'/long-names.png'});
  assert.equal(await page.locator('#result-leaderboard').isVisible(),true);
  assert.equal(await page.locator('#result-dialog').evaluate(el=>el.scrollWidth>el.clientWidth),false);
  assert.equal(await page.locator('#result-dialog').evaluate(el=>el.scrollHeight>el.clientHeight),false);
  await page.locator('#result-leaderboard').evaluate(el=>el.style.removeProperty('display'));
  await page.locator('#result-record').evaluate(el=>el.style.removeProperty('display'));
  await page.locator('#back-menu').click();assert.equal(await page.locator('#result-dialog').isHidden(),true);
  await page.locator('#open-solo').click();await page.locator('#start-hell').click();await page.locator('#start-hell-confirm').click();await ready();
  await page.evaluate(()=>qaFinish({winner:1,score:[1,5],message:'远场获胜'}));await page.locator('#result-dialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#result-title').innerText(),'挑战失败');
  assert.match(await page.locator('#rematch').innerText(),/再次挑战/);
  await page.screenshot({path:out+'/challenge.png'});
  report.checks.push('doubles rematch preserves four players; standard games vs last-game score; long-name layout; return home; challenge result');
  assert.deepEqual(report.errors,[]);
}finally{
  await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await app.close();
}
console.log(JSON.stringify(report,null,2));
