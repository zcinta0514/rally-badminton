import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createServer} from '../server/index.js';
import {CUP_STORAGE_KEY} from '../src/cup-save.js';
import {getCupOpponent} from '../src/cup-draw.js';

const {chromium} = createRequire(import.meta.url)(process.env.RALLY_PLAYWRIGHT_MODULE || 'playwright');
const out = process.env.RALLY_CUP_SCREENSHOTS;
if (out) await mkdir(out,{recursive:true});
const app = process.env.RALLY_QA_URL ? null : createServer({host:'127.0.0.1',port:0});
await app?.listen();
let browser;
try {
  browser = await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    localStorage.setItem('rally.playtest.notice.1','1');
    localStorage.setItem('rally.onboarding.seen','1');
    localStorage.setItem('rally.usage.enabled','off');
    localStorage.setItem('rally.racketHand','left');
  });
  const cup = action => page.locator('[data-cup="'+action+'"]');
  const read = () => page.evaluate(key=>JSON.parse(localStorage.getItem(key)),CUP_STORAGE_KEY);
  async function shot(label) {
    if (out) await page.screenshot({path:path.join(out,label+'.png'),scale:'css'});
  }
  async function observe() {
    await page.evaluate(async()=>{
      const {CourtView} = await import('/src/view.js');
      const original = CourtView.prototype.renderLobby;
      CourtView.prototype.renderLobby = function(...args) {
        if (!window.cupQAView) {
          window.cupQAView=this;
          // Observe the scene submitted to WebGL, including lobby/preview swaps.
          const render=this.renderer.render.bind(this.renderer);
          this.renderer.render=(scene,camera)=>{
            window.cupQAFrame={scene,camera};
            return render(scene,camera);
          };
        }
        return original.apply(this,args);
      };
    });
    await page.waitForFunction(()=>!!window.cupQAFrame);
  }
  async function hall(id,central) {
    await page.waitForFunction(({id,central})=>{
      let actual;
      window.cupQAFrame?.scene.traverseVisible(node=>{
        if (node.name==='cup-hall-'+id) actual=node;
      });
      return actual?.userData.centerCourt===central;
    },{id,central});
    const features = await page.evaluate(id=>{
      const hall=cupQAFrame.scene.getObjectByName('cup-hall-'+id);
      const names=[];
      hall.traverseVisible(o=>{if(o.name) names.push(o.name);});
      return {names,tierCount:hall.userData.tierCount};
    },id);
    assert.ok(features.names.includes(id==='bay'?'bay-canopy':'crown-halo'),'missing overhead architecture');
    if(id==='crown') assert.ok(features.names.includes('crown-score-cube'));
  }
  async function actor(phase, rival) {
    const slot = rival ? 1 : 0;
    await page.waitForFunction(({phase,slot,rival})=>{
      const actual=rallyDiagnostics.cupScene;
      return actual?.phase===phase && (phase!=='preview' || actual.athlete===(slot?'opponent':'self')) &&
        (!rival || actual.opponentName===rival.name && actual.opponentId===rival.id && actual.opponentHeight===rival.height);
    },{phase,slot,rival});
    return page.evaluate(({phase,slot})=>{
      const v=cupQAView, p=v.players[slot];
      if (phase==='preview' && v.lobby.cupAthlete!==p) throw Error('Preview uses a different athlete object');
      if (!p.root.visible) throw Error('Athlete is hidden');
      return {kit:p.cupKit,height:p.root.scale.y,hand:p.root.scale.x};
    },{phase,slot});
  }
  async function openFromHome() {
    await page.locator('#open-solo').click();
    await page.locator('#open-cup').click();
  }
  async function leaveCourt() {
    await page.locator('#pause').click();
    await page.locator('#leave-game').click();
    await cup('play').waitFor();
  }
  async function waitServe() {
    await page.waitForFunction(()=>rallyDiagnostics?.statePhase==='serve' && !rallyDiagnostics.entrance.active);
  }
  async function pitch(degrees) {
    await page.locator('#match-settings-toggle').click();
    await page.locator('#camera-pitch').press(degrees===18?'Home':'End');
    await page.locator('#settings-back').click();
    await page.waitForFunction(degrees=>cupQAView.cameraSettings.pitchDegrees===degrees,degrees);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  }
  async function seedFinal() {
    // Accelerate the prior rounds, then restore a genuine deciding rally through
    // the public checkpoint API. Scoring, champion transition and award run live.
    await page.evaluate(async()=>{
      const {getCupOpponent,advanceCup}=await import('./src/cup-draw.js');
      const {createMatch}=await import('./shared/game.js');
      const {readCupSave,writeCupSave}=await import('./src/cup-save.js');
      const save=readCupSave(localStorage);
      let draw=save.draw;
      while(draw.rounds.at(-1).length>1) draw=advanceCup(draw,true);
      const rival=getCupOpponent(draw);
      const m=createMatch({target:draw.target,humanSlots:[0],cupOpponent:rival,roles:['balanced',rival.role],difficulty:rival.difficulty});
      m.phase='rally';m.score=[draw.target-1,0];m.rally=2;m.service=null;
      Object.assign(m.shuttle,{x:1.8,y:.03,z:-5,vx:0,vy:-4,vz:0,active:true,lastHit:0,lastHitPlayer:0});
      writeCupSave(localStorage,save,draw,m);
    });
  }

  await page.goto(process.env.RALLY_QA_URL||app.url);
  await page.locator('#loading').waitFor({state:'hidden'});
  await observe();
  await openFromHome();
  await cup('preview-crown').click();
  await hall('crown',false);
  await page.keyboard.press('Escape');
  await cup('preview-bay').waitFor();
  await page.waitForFunction(()=>rallyDiagnostics.cupScene===null);
  for(const id of ['bay','crown']) {
    await cup('preview-'+id).click();
    await hall(id,false);
    const self=await actor('preview',null);
    assert.equal(self.hand,-1);
    await shot(id+'-entry');
    await page.locator('#cup-registration input[name=athlete]').fill('许嘉禾');
    await cup('create').click();
    const draw=(await read()).draw;
    const rival=getCupOpponent(draw);
    await hall(id,false);
    assert.ok((await page.locator('#cup-body').innerText()).includes(rival.name));
    const preview=await actor('preview',rival);
    assert.equal(preview.hand,1);
    assert.notDeepEqual(preview.kit,self.kit);
    await shot(id+'-opponent');
    for(const [width,height] of [[667,375],[390,844]]) {
      await page.setViewportSize({width,height});
      await hall(id,false);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await shot(id+'-opponent-'+width);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
    await page.setViewportSize({width:844,height:390});
    await cup('play').click();
    await waitServe();
    await hall(id,false);
    assert.equal(await page.locator('#name-other').innerText(),rival.name);
    assert.deepEqual(await actor('match',rival),preview);
    for(const degrees of [18,40]) {
      await pitch(degrees);
      await hall(id,false);
      await shot(id+'-pitch-'+degrees);
    }
    await leaveCourt();
    await page.reload();
    await page.locator('#loading').waitFor({state:'hidden'});
    await observe();
    await openFromHome();
    const restored=await read();
    assert.deepEqual(restored.draw,draw);
    await cup('play').click();
    if(restored.match?.phase==='paused') await page.locator('#resume').click();
    await waitServe();
    await hall(id,false);
    await leaveCourt();
    await cup('close').click();
    await seedFinal();
    await page.locator('#open-cup').click();
    await hall(id,true);
    await shot(id+'-final');
    await cup('play').click();
    await page.locator('body[data-cup-award="true"]').waitFor();
    await hall(id,true);
    await page.waitForFunction(()=>cupQAView.cupAward?.age > 2.5);
    await shot(id+'-award');
    if(id==='bay') await page.locator('#skip-cup-award').click();
    await page.getByRole('heading',{name:'夺冠之路'}).waitFor();
    assert.equal((await read()).draw.status,'champion');
    await cup('finish').click();
    await cup('close').click();
    assert.equal(await read(),null);
    await page.waitForFunction(()=>cupQAView.mode==='menu'&&!cupQAView.cupVenue);
    await shot(id+'-exit');
    await page.locator('#open-cup').click();
    console.log('PASS',id,rival.name,'preview, both fixed-camera limits, resume, center court, award, exit');
  }
  await cup('close').click();
  await page.locator('#start-ai').click();
  await page.locator('#start-ai-confirm').click();
  await waitServe();
  assert.equal(await page.evaluate(()=>cupQAView.cupVenue),null);
  assert.deepEqual(errors,[]);
  console.log('PASS ordinary singles uses the ordinary hall; no page errors');
} finally {
  await browser?.close();
  await app?.close();
}
