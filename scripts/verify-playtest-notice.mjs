import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from '../server/index.js';

const { chromium, webkit } = createRequire(import.meta.url)(process.env.RALLY_PLAYWRIGHT_MODULE || 'playwright');
const app = createServer({ port: 0, host: '127.0.0.1', peerMode: true });
await app.listen();
try {
  for (const [engine, type] of [['Chromium', chromium], ['WebKit', webkit]]) {
    const browser = await type.launch(engine === 'Chromium' ? { channel: 'chrome', args: ['--enable-unsafe-swiftshader'] } : {});
    try {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
      page.setDefaultTimeout(6000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const notice = page.locator('#playtest-notice');
      const entry = page.locator('#open-playtest-notice');
      const close = page.locator('#close-playtest-notice');
      await page.goto(app.url + '?room=ABCDE');
      await page.locator('#room-code').waitFor();
      assert.equal(await page.locator('#room-code').inputValue(), 'ABCDE');
      assert.equal(await notice.isVisible(), false);
      await page.goto(app.url);
      await notice.waitFor();
      assert.match(await notice.innerText(), /感谢大家关注和支持.*TapTap.*在线匹配/s);
      await close.click();
      await page.locator('#onboarding-dialog').waitFor();
      await page.locator('#onboarding-skip').click();
      for (const [width, height] of [[844, 390], [568, 320], [568, 260], [390, 844]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => document.fonts.ready);
        if (width > height) {
          const layout = await page.evaluate(() => {
            const menu = document.querySelector('#menu');
            const bounds = selector => document.querySelector(selector).getBoundingClientRect();
            const notice = bounds('#open-playtest-notice');
            const friends = bounds('#open-friends');
            const solo = bounds('#open-solo');
            const logoTop = bounds('.lobby-wordmark').top;
            const firstScreen = ['#open-solo', '#open-friends', '#open-playtest-notice'].every(selector => {
              const box = bounds(selector);
              const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
              return hit?.closest('button') === document.querySelector(selector);
            });
            menu.scrollTop = menu.scrollHeight;
            return { firstScreen, scroll: menu.scrollTop, logoShift: bounds('.lobby-wordmark').top - logoTop,
              centered: Math.abs(notice.x + notice.width / 2 - innerWidth / 2) < 1,
              clear: notice.left >= solo.right || notice.bottom <= solo.top,
              aboveCenter: notice.bottom < innerHeight / 2 };
          });
          assert.deepEqual(layout, { firstScreen:true, scroll:0, logoShift:0, centered:true, clear:true, aboveCenter:true }, engine + ' ' + width + '×' + height + ' ' + JSON.stringify(layout));
        }
        for (const selector of ['#open-playtest-notice', '#open-solo', '#open-friends']) {
          const box = await page.locator(selector).boundingBox();
          assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, engine + ' ' + width + '×' + height + ' ' + selector + ' ' + JSON.stringify(box));
          await page.locator(selector).click({ trial: true });
        }
        await entry.click();
        await notice.waitFor();
        const box = await notice.boundingBox();
        assert.ok(box.y >= 0 && box.y + box.height <= height + 1);
        await page.locator('#playtest-beta-group').click({ trial: true });
        await close.click();
      }
      await page.reload();
      await page.locator('#loading').waitFor({ state: 'hidden', timeout: 30000 });
      assert.equal(await notice.isVisible(), false);
      await entry.click();
      await page.locator('#playtest-beta-group').click();
      await page.locator('#beta-group').waitFor();
      assert.ok(await page.locator('#beta-wechat').inputValue());
      await page.locator('#beta-group .close-dialog').click();
      await page.locator('#open-solo').click();
      assert.equal(await entry.isVisible(), false);
      assert.deepEqual(errors, []);
      console.log(engine + ' announcement flow passed');
    } finally { await browser.close(); }
  }
} finally { await app.close(); }
