import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createServer } from '../server/index.js';
import { CUP_STORAGE_KEY } from '../src/cup-save.js';
import { advanceCup } from '../src/cup-draw.js';

const { chromium } = createRequire(import.meta.url)(process.env.RALLY_PLAYWRIGHT_MODULE || 'playwright');
const shots = process.env.RALLY_CUP_SCREENSHOTS;
if (shots) await mkdir(shots, {recursive:true});
const app = createServer({port:0, host:'127.0.0.1', peerMode:true});
await app.listen();
let browser;
try {
  browser = await chromium.launch({channel:'chrome', args:['--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport:{width:844,height:390}, isMobile:true, hasTouch:true, serviceWorkers:'block'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('rally.playtest.notice.1','1');
    localStorage.setItem('rally.onboarding.seen','1');
    localStorage.setItem('rally.usage.enabled','off');
    if (!localStorage.getItem('rally.player.v1')) {
      localStorage.setItem('rally.player.v1',JSON.stringify({name:'青屿球友',playerKey:'a'.repeat(64)}));
    }
  });
  const action = name => page.locator('[data-cup="'+name+'"]');
  const screenshot = async name => {
    if (shots) await page.screenshot({path:path.join(shots,name+'.png'),animations:'disabled'});
  };
  async function openCup() {
    await page.locator('#open-solo').click();
    await page.locator('#open-cup').click();
  }
  const readSave = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), CUP_STORAGE_KEY);
  async function checkPrimary() {
    // The game-wide button reset can leave dark text directly over the dark
    // court. Check resolved colours after the entire cascade has loaded.
    const ratio=await page.locator('#cup-dialog .cup-primary').evaluate(el=>{
      const style=getComputedStyle(el);
      const channels=s=>s.match(/[\d.]+/g).map(Number);
      const luminance=rgb=>rgb.slice(0,3).map(n=>{
        const c=n/255;
        return c<=.04045 ? c/12.92 : ((c+.055)/1.055)**2.4;
      }).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
      const bg=channels(style.backgroundColor);
      const a=luminance(channels(style.color)),b=luminance(bg[3]===0 ? [14,30,23] : bg);
      return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
    assert.ok(ratio>=4.5,'cup primary action contrast '+ratio);
  }
  async function dialogFits() {
    const metrics = await page.locator('#cup-dialog').evaluate(el => {
      const {left,right,top,bottom} = el.getBoundingClientRect();
      return {left,right,top,bottom,w:innerWidth,h:innerHeight,scroll:document.documentElement.scrollWidth};
    });
    assert.ok(metrics.left >= -1 && metrics.right <= metrics.w+1 && metrics.top >= -1 &&
      metrics.bottom <= metrics.h+1 && metrics.scroll <= metrics.w+1,JSON.stringify(metrics));
  }

  // Test positions in the scrollport, not just existence in the DOM. An
  // offscreen player counts as visible to the default Playwright visibility test.
  async function myMatchInView() {
    await page.waitForFunction(() => {
      const scroller = document.querySelector('.cb-scroll');
      const mine = document.querySelector('[data-cb-current]');
      if (!mine || !scroller) return false;
      const panel = scroller.getBoundingClientRect(), node = mine.getBoundingClientRect();
      return node.left>=panel.left-1 && node.right<=panel.right+1 &&
        node.top>=panel.top+22 && node.bottom<=panel.bottom+1;
    },null,{timeout:6000});
  }
  async function inspectTree(size, roundIndex, playerName) {
    const rounds=Math.log2(size);
    assert.equal(await page.locator('.cb-match[data-node]').count(),size-1);
    assert.equal(await page.locator('.cb-map path[data-from][data-to]').count(),size-2);
    const pairs=await page.locator('.cb-map path[data-from]').evaluateAll(paths=>paths.map(el=>[el.dataset.from,el.dataset.to]));
    for(const [from,to] of pairs) {
      const [round,slot]=from.split('-').map(Number);
      assert.equal(to,(round+1)+'-'+Math.floor(slot/2));
      assert.ok(round>=0 && round<rounds-1);
    }
    const current=page.locator('[data-cb-current]');
    assert.equal((await current.getAttribute('data-node')).split('-')[0],String(roundIndex));
    assert.ok((await current.innerText()).includes(playerName));
    await myMatchInView();
    await page.locator('.cb-jump').selectOption({index:rounds-1});
    await page.waitForFunction(()=>{
      const s=document.querySelector('.cb-scroll');
      return s.scrollWidth<=s.clientWidth+1 || s.scrollLeft>0;
    });
    await page.locator('.cb-locate').click();
    await myMatchInView();
    assert.equal(await page.locator('.cb-map path.cb-route').count(),roundIndex);
    await dialogFits();
  }

  await page.goto(app.url);
  await page.locator('#loading').waitFor({state:'hidden'});
  for (const name of ['cup-ui.css','cup-bracket.css','cup-ui.js','cup-bracket.js']) {
    const asset = '/src/'+name;
    const served = await page.evaluate(async asset=>(await fetch(asset)).text(),asset);
    assert.equal(served,await readFile(new URL('..'+asset,import.meta.url),'utf8'),'served stale '+name);
  }
  await openCup();
  const longName='青屿羽球俱乐部海湾赛区第一单打';
  for(const [event,size] of [['crown',64],['bay',32]]) {
    await screenshot(event+'-events');
    await action('preview-'+event).click();
    const field=page.locator('#cup-registration input[name=athlete]');
    assert.equal(await field.inputValue(),event==='crown'?'青屿球友':longName);
    await field.fill(longName);
    const form=page.locator('#cup-registration');
    for(const [target,cap] of [[21,30],[5,10],[15,21]]) {
      await form.locator('label').filter({has:page.locator('input[value="'+target+'"]')}).click();
      assert.match(await page.locator('#cup-score-rule').innerText(),new RegExp(String(cap)));
    }
    for(const [width,height] of [[844,390],[568,320],[390,844]]) {
      await page.setViewportSize({width,height});
      await dialogFits();
      await checkPrimary();
      await screenshot(event+'-register-'+width);
    }
    await page.setViewportSize({width:844,height:390});
    await form.locator('[type=submit]').click();
    await action('draw').waitFor();
    const first=await readSave();
    assert.equal(first.draw.players[0].name,longName);
    assert.equal(first.draw.target,15);
    assert.equal(first.draw.players.length,size);
    await page.reload();await openCup();
    assert.deepEqual((await readSave()).draw,first.draw);
    for(const [width,height] of [[844,390],[568,320],[390,844]]) {
      await page.setViewportSize({width,height});
      await dialogFits();
      await checkPrimary();
      await screenshot(event+'-hub-'+width);
      await action('draw').click();
      await inspectTree(size,0,longName);
      await screenshot(event+'-draw-'+width);
      await action('hub').click();
      await action('play').waitFor();
      assert.deepEqual((await readSave()).draw,first.draw);
    }
    await page.setViewportSize({width:844,height:390});

    // A checkpoint fixture exercises reopening the real advanced bracket,
    // including node routing from both halves of the draw, without fake clicks.
    const advanced=advanceCup(advanceCup(first.draw,true),true);
    await page.evaluate(({key,saved})=>localStorage.setItem(key,JSON.stringify(saved)),{
      key:CUP_STORAGE_KEY,saved:{...first,draw:advanced,match:null}});
    await page.reload();await openCup();await action('draw').click();
    await inspectTree(size,2,longName);
    await screenshot(event+'-advanced');
    await action('hub').click();
    await action('withdraw').click();await action('confirm-withdraw').click();
    assert.equal(await readSave(),null);
    console.log('PASS',event,'registration, three viewport sizes, all nodes/edges, round jumps, resumed winner path');
  }
  await action('close').click();
  await page.locator('#start-ai').click();
  await page.locator('#start-ai-confirm').click();
  await page.waitForFunction(()=>window.rallyDiagnostics?.statePhase==='serve'&&!rallyDiagnostics.entrance.active);
  await page.locator('#game-controls [data-shot=clear]').click();
  await page.waitForFunction(()=>rallyDiagnostics.hitId>=1);
  await page.locator('#pause').click();await page.locator('#leave-game').click();
  await page.locator('#open-training').click();
  await page.locator('#training-kind').selectOption('free');
  await page.locator('#training-start').click();
  await page.waitForFunction(()=>document.body.dataset.training==='playing');
  await page.locator('#training-exit').click();
  await page.locator('#open-friends').click();
  await page.locator('#friend-tabs [data-action=create]').click();
  await page.locator('#friend-form').waitFor();
  assert.equal(await readSave(),null);
  assert.deepEqual(errors,[]);
  console.log('PASS existing AI match serve/pause/leave, free training enter/exit, friend room setup; browser errors 0');
} finally {
  await browser?.close();
  await app.close();
}
