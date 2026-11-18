import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from '../server/index.js';
const {chromium}=createRequire(import.meta.url)(process.env.RALLY_PLAYWRIGHT_MODULE||'playwright');
const out='artifacts/ai-tactics-browser';await mkdir(out,{recursive:true});
const app=createServer({port:0,host:'127.0.0.1',leaderboardPath:out+'/leaderboard.json'});await app.listen();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader']});
const report={environment:'Windows Chrome mobile/touch emulation, real UI and game loop; AI drives the human side after button verification; not a physical phone',checks:[],errors:[]};
try{
  for(const level of ['easy','medium','hard'])for(const [width,height] of [[844,390],[568,320]]){
    const c=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,serviceWorkers:'block'});
    await c.addInitScript(()=>{localStorage.setItem('rally.onboarding.seen','1');localStorage.setItem('rally.usage.enabled','off');});
    const p=await c.newPage();p.setDefaultTimeout(60000);p.on('pageerror',e=>report.errors.push(e.message));
    await p.route('**/src/main.js*',async route=>{
      const response=await route.fetch();let source=await response.text();
      const marker='stepMatch(state,practiceInputs(state,input,settings),1/60);';assert.ok(source.includes(marker));
      source=source.replace(marker,"stepMatch(state,practiceInputs(state,window.qaAuto?window.qaAuto(state,0,'hard'):input,settings),1/60);");
      await route.fulfill({response,body:source});
    });
    await p.goto(app.url);await p.locator('#loading').waitFor({state:'hidden'});
    assert.match(await p.locator('.lobby-version').textContent(),/1\.22\.1/);
    await p.evaluate(async()=>{
      const {CourtView}=await import('/src/view.js');const render=CourtView.prototype.render;
      window.qaHits=[];
      CourtView.prototype.render=function(s,...rest){window.qaState=s;
        if(s.lastShotInfo&&s.lastShotInfo.hitId!==window.qaHits.at(-1)?.hitId)window.qaHits.push(structuredClone(s.lastShotInfo));
        return render.call(this,s,...rest);};
    });
    await p.locator('#open-solo').click();await p.locator('#start-ai').click();
    await p.locator(`[data-difficulty=${level}]`).click();await p.locator('#start-ai-confirm').click();
    await p.waitForFunction(()=>window.rallyDiagnostics?.statePhase==='serve'&&!rallyDiagnostics.entrance.active);
    for(const type of ['clear','drop','smash']){
      const box=await p.locator(`[data-shot=${type}]`).boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);
    }
    await p.locator('[data-shot=drop]').click();await p.waitForFunction(()=>qaState.hitId>=1);
    assert.equal(await p.evaluate(()=>qaHits[0].type),'drop');
    await p.evaluate(async()=>{window.qaAuto=(await import('/shared/game.js')).aiInput;});
    await p.waitForFunction(()=>qaHits.filter(h=>h.playerSlot===1).length>=6||qaState.phase==='over',null,{timeout:60000});
    const result=await p.evaluate(()=>({version:document.querySelector('.lobby-version').textContent,rules:qaState.rulesVersion,difficulty:qaState.difficulty,
      hits:qaHits.filter(h=>h.playerSlot===1).map(h=>({type:h.type,serving:h.serving,x:h.aimX,z:h.aimZ})),score:qaState.score,phase:qaState.phase}));
    assert.equal(result.rules,17);assert.equal(result.difficulty,level);assert.ok(result.hits.length>=3);
    await p.screenshot({path:`${out}/${level}-${width}.png`});report.checks.push({width,height,...result});
    console.log(`PASS ${level} ${width}x${height}: short-serve button, reachable controls, ${result.hits.length} real AI contacts`);
    await c.close();
  }
  assert.deepEqual(report.errors,[]);
}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await app.close();}
