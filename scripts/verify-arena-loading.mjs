import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from '../server/index.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.RALLY_PLAYWRIGHT_MODULE || 'playwright');
const app = createServer();
await app.listen();
const browser = await chromium.launch({
  executablePath: process.env.RALLY_BROWSER_PATH, headless: true,
  args: ['--enable-unsafe-swiftshader'],
});

async function openSingles(page) {
  for (const id of ['open-solo','start-ai','start-ai-confirm']) await page.locator('#' + id).click();
  await page.waitForFunction(() => document.body.dataset.entering === 'false' && window.rallyDiagnostics?.statePhase === 'serve');
}

async function leaveMatch(page) {
  await page.locator('#pause').click();
  await page.locator('#leave-game').click();
  await page.waitForFunction(() => document.body.dataset.screen === 'menu');
}

async function verify(fail) {
  const context = await browser.newContext({viewport:{width:844,height:390},serviceWorkers:'block'});
  const page = await context.newPage();
  const requests = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/tournament-hall.glb', async route => {
    requests.push(await page.evaluate(() => document.body.dataset.screen || 'menu'));
    if (fail && requests.length <= 2) {
      await route.fulfill({status:503,body:'Venue unavailable'});
    } else {
      if (!fail) await gate;
      await route.continue();
    }
  });
  try {
    await page.goto(app.url,{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden'});
    for (const id of ['dismiss-playtest-notice','onboarding-skip']) {
      const button = page.locator('#'+id);
      if (await button.isVisible()) await button.click();
    }
    await page.evaluate(() => {
      window.venueSwaps=[];
      new MutationObserver(() => window.venueSwaps.push(document.body.dataset.screen)).observe(
        document.querySelector('#court'), {attributes:true,attributeFilter:['data-venue']});
    });
    await openSingles(page);
    assert.equal(requests[0],'menu','download must start in the lobby');
    const initial = await page.locator('#court').getAttribute('data-venue');
    assert.notEqual(initial,'tournament');
    await page.locator('button[data-shot=clear]').click();
    await page.waitForFunction(() => window.rallyDiagnostics?.statePhase === 'rally');
    const transferred = fail ? null : page.waitForResponse(response =>
      response.url().endsWith('/tournament-hall.glb') && response.ok());
    release();
    if (transferred) await (await transferred).finished();
    // Wait through this actual point and into the following service, while
    // the first match remains on its original venue.
    await page.waitForFunction(() => window.rallyDiagnostics?.score.some(score=>score>0) &&
      window.rallyDiagnostics.statePhase==='serve', undefined, {timeout:60000});
    assert.deepEqual(await page.evaluate(()=>window.venueSwaps),[]);
    await leaveMatch(page);
    await page.waitForFunction(()=>document.querySelector('#court').dataset.venue==='tournament');
    assert.deepEqual(await page.evaluate(()=>window.venueSwaps),['menu']);
    await openSingles(page);
    assert.equal(await page.locator('#court').getAttribute('data-venue'),'tournament');
    assert.equal(requests.length,fail?3:1,'no duplicate or unbounded fetch retries');
    assert.deepEqual(errors,[]);
    console.log(fail ? '503 fallback scored normally; recovered after returning to lobby' :
      'Slow download finished during a rally; venue changed once in the lobby and was ready for the rematch');
  } finally {
    release(); await context.close();
  }
}
try {
  await verify(false);
  await verify(true);
} finally {
  await browser.close(); await app.close();
}
