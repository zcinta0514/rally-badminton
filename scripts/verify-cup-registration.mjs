import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from '../server/index.js';
import { CUP_STORAGE_KEY } from '../src/cup-save.js';

const { chromium } = createRequire(import.meta.url)(process.env.RALLY_PLAYWRIGHT_MODULE || 'playwright');
const app = createServer({port:0, host:'127.0.0.1', peerMode:true});
await app.listen();
let browser;
try {
  browser = await chromium.launch({channel:'chrome', args:['--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport:{width:844,height:390}, isMobile:true, hasTouch:true, serviceWorkers:'block'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('rally.playtest.notice.1', '1');
    localStorage.setItem('rally.onboarding.seen', '1');
    localStorage.setItem('rally.usage.enabled', 'off');
    if (!localStorage.getItem('rally.player.v1')) {
      localStorage.setItem('rally.player.v1', JSON.stringify({name:'青屿球友', playerKey:'a'.repeat(64)}));
    }
  });
  await page.goto(app.url);
  async function openCup() {
    await page.locator('#open-solo').click();
    await page.locator('#open-cup').click();
  }
  await openCup();
  await page.locator('[data-cup="preview-crown"]').click();
  const field = page.getByRole('textbox', {name:'参赛 ID'});
  assert.equal(await field.inputValue(), '青屿球友');
  const register = page.locator('#cup-registration');
  assert.match(await register.innerText(), /连赢 6 场夺冠/);
  for (const [width, height] of [[844,390], [568,320], [390,844]]) {
    await page.setViewportSize({width,height});
    const layout = await page.locator('#cup-body').evaluate(el => ({
      width:el.clientWidth, scrollWidth:el.scrollWidth, height:el.clientHeight, scrollHeight:el.scrollHeight
    }));
    assert.ok(layout.scrollWidth <= layout.width, '横向溢出 '+width+'×'+height);
    await register.getByRole('button', {name:'确认参赛'}).scrollIntoViewIfNeeded();
    console.log(`${width} × ${height}`, layout);
  }
  await page.setViewportSize({width:568,height:320});
  for (const [target, cap] of [[21,30],[5,10],[15,21]]) {
    await register.locator('label').filter({has:page.locator('input[value="'+target+'"]')}).click();
    assert.match(await page.locator('#cup-score-rule').innerText(), new RegExp('先到 '+cap+' 分直接胜出'));
  }
  await field.fill('  青屿联队  ');
  await register.getByRole('button', {name:'确认参赛'}).click();
  await page.getByText(/64强赛 · 15 分单局/).waitFor();
  const readDraw = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).draw, CUP_STORAGE_KEY);
  const first = await readDraw();
  assert.equal(first.players[0].name, '青屿联队');
  assert.equal(first.target,15);
  await page.reload();
  await openCup();
  assert.deepEqual(await readDraw(), first);
  await page.locator('[data-cup="withdraw"]').click();
  await page.locator('[data-cup="confirm-withdraw"]').click();
  await page.locator('[data-cup="preview-bay"]').click();
  assert.equal(await field.inputValue(), '青屿联队');
  assert.match(await register.innerText(), /连赢 5 场夺冠/);
  assert.deepEqual(errors, []);
  console.log('杯赛报名、分制、刷新恢复与上届参赛名通过。');
} finally {
  await browser?.close();
  await app.close();
}
