import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from '../server/index.js';

const { chromium, webkit } = createRequire(import.meta.url)(process.env.RALLY_PLAYWRIGHT_MODULE || 'playwright');
const app = createServer({ port: 0, host: '127.0.0.1', peerMode: false });
const sizes = [[320, 568], [568, 260], [390, 844], [844, 390]];
const savedLayout = {
  mode: 'custom',
  positions: { clear: { x: .8, y: .52 }, drop: { x: .8, y: .70 }, smash: { x: .8, y: .88 } },
  sizes: { clear: 120, drop: 120, smash: 120 }
};
const storageKey = 'rally.shotLayout.v1';
const issues = [];
const homeTargets = '#match-settings-toggle, #help, .menu-foot-actions > button:not([hidden]), #lobby-check-update';
let rotations = 0;

await app.listen();
try {
  for (const [engine, type] of [['Chromium', chromium], ['WebKit', webkit]]) {
    const browser = await type.launch(engine === 'Chromium' ? { channel: 'chrome', args: ['--enable-unsafe-swiftshader'] } : {});
    try {
      const page = await browser.newPage({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });
      page.setDefaultTimeout(12000);
      page.on('pageerror', error => issues.push(`${engine}: ${error.message}`));
      await page.addInitScript(({ storageKey, savedLayout }) => {
        localStorage.setItem('rally.playtest.notice.1', '1');
        localStorage.setItem('rally.onboarding.seen', '1');
        localStorage.setItem('rally.usage.enabled', 'off');
        localStorage.setItem(storageKey, JSON.stringify(savedLayout));
      }, { storageKey, savedLayout });
      await page.route('**/src/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()) + '\nwindow.qaFinish = () => finishMatch(state, 0, "近场获胜", "scored");' });
      });
      await page.goto(app.url);
      await page.locator('#loading').waitFor({ state: 'hidden' });
      await page.evaluate(() => document.fonts.ready);

      const click = selector => page.locator(selector).click();
      const checkTargets = selector => page.locator(selector).evaluateAll(elements => elements.map(element => {
        const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
        const hit = document.elementFromPoint(left + width / 2, top + height / 2);
        const pausePanel = element.closest('#pause-dialog')?.getBoundingClientRect();
        return { target: element.id || element.dataset.shot || element.textContent.trim(),
          left, right, top, bottom, hit: width > 0 && height > 0 && element.contains(hit),
          inside: left >= -1 && top >= (pausePanel?.top ?? 0) - 1 &&
            right <= innerWidth + 1 && bottom <= (pausePanel?.bottom ?? innerHeight) + 1 };
      }));
      const check = (condition, label, detail) => {
        if (!condition) {
          const issue = `${engine} ${label}: ${JSON.stringify(detail)}`;
          issues.push(issue);
          if (process.env.RALLY_QA_VERBOSE) console.log(issue);
        }
      };
      const rotate = async (stage, targets, { shots, scroll, cycles = 2, viewports = sizes } = {}) => {
        const reference = new Map();
        for (let cycle = 0; cycle < cycles; cycle++) {
          for (const [width, height] of viewports) {
            if (scroll) await page.locator(scroll).evaluate(element => { element.scrollTop = element.scrollHeight; });
            await page.setViewportSize({ width, height });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            rotations++;
            const viewport = `${width}×${height}`;
            const label = `${stage} ${viewport} #${cycle + 1}`;
            const edges = await page.locator('#court').boundingBox();
            check(edges && edges.x === 0 && edges.y === 0 && edges.width === width && edges.height === height, label + ' court edges', edges);
            const boxes = await checkTargets(targets);
            for (const box of boxes) check(box.hit && box.inside, label, box);
            const offsets = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
            check(!offsets.x && !offsets.y, `${label} root scroll`, offsets);
            if (reference.has(viewport)) check(JSON.stringify(boxes) === reference.get(viewport), `${label} position drift`, boxes);
            else reference.set(viewport, JSON.stringify(boxes));
            if (!shots) continue;
            const keys = boxes.filter(box => ['clear', 'drop', 'smash'].includes(box.target));
            check(keys.length === 3, `${label} shot count`, keys);
            for (const [index, a] of keys.entries()) {
              for (const b of keys.slice(index + 1)) {
                check(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1,
                  `${label} overlapping shot targets`, [a, b]);
              }
            }
          }
        }
      };

      await rotate('home', homeTargets, { scroll: '#menu' });
      await click('#install-app');
      await rotate('install', '#pwa-dialog .pwa-close');
      await click('#pwa-dialog .pwa-close');
      await click('#open-beta-group');
      await rotate('community', '#beta-group .close-dialog');
      await click('#beta-group .close-dialog');
      await click('#match-settings-toggle');
      await rotate('settings', '#settings-back', { scroll: '.settings-scroll' });
      await click('#edit-shot-layout');
      await rotate('custom editor', '.shot-layout-key, #shot-layout-editor button[data-action]', { shots: true });
      await click('#shot-layout-editor [data-action=save]');
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey), savedLayout);
      await click('#settings-back');
      await click('#open-friends');
      await click('#friend-tabs [data-action=join]');
      await page.locator('#room-code').fill('ABCDE');
      await rotate('join room', '#entry-back, #match-settings-toggle');
      assert.equal(await page.locator('#room-code').inputValue(), 'ABCDE');
      await click('#entry-back');
      await click('#friend-tabs [data-action=create]');
      await page.locator('#player-name').fill('Rotation Tester');
      await rotate('create room', '#entry-back, #match-settings-toggle', { scroll: '#menu' });
      await click('#create-room');
      await page.locator('#waiting-dialog').waitFor({ state: 'visible' });
      await rotate('waiting room', '#leave-waiting, #copy-invite');
      await click('#leave-waiting');
      await click('#entry-back');
      await click('#open-solo');
      await rotate('solo', '#entry-back, #match-settings-toggle');
      await click('#start-hell');
      await rotate('hell setup', '#entry-back, #match-settings-toggle', { scroll: '#menu' });
      await click('#entry-back');
      await click('#start-ai');
      await rotate('AI setup', '#entry-back, #match-settings-toggle', { scroll: '#menu' });
      await click('#start-ai-confirm');
      await page.waitForFunction(() => !document.querySelector('#game-controls [data-shot=clear]').disabled);
      await rotate('custom match', '#game-controls .shot-btn, #match-settings-toggle, #pause, #fullscreen', { shots: true });
      await page.setViewportSize({ width: 568, height: 260 });
      await click('#match-settings-toggle');
      await click('#edit-shot-layout');
      const editorKey = await page.locator('.shot-layout-key[data-shot=clear]').boundingBox();
      const editorX = editorKey.x + editorKey.width / 2, editorY = editorKey.y + editorKey.height / 2;
      await page.mouse.move(editorX, editorY);
      await page.mouse.down();
      await page.mouse.move(editorX - 310, editorY);
      await page.mouse.up();
      const edited = await checkTargets('.shot-layout-key');
      check(edited[0].left < editorKey.x - 250, 'dragged key moved', edited);
      await click('#shot-layout-editor [data-action=save]');
      const updatedLayout = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
      assert.deepEqual(updatedLayout.positions.drop, savedLayout.positions.drop);
      assert.deepEqual(updatedLayout.positions.smash, savedLayout.positions.smash);
      await click('#edit-shot-layout');
      const reopened = await checkTargets('.shot-layout-key');
      for (const [index, box] of edited.entries()) {
        check(Math.abs(box.left - reopened[index].left) <= 1 && Math.abs(box.top - reopened[index].top) <= 1,
          'saved editor matches preview', [box, reopened[index]]);
      }
      await click('#shot-layout-editor [data-action=cancel]');
      await click('#settings-back');
      for (const preset of ['arc', 'default']) {
        await click('#match-settings-toggle');
        await click('#edit-shot-layout');
        await click(`#shot-layout-editor [data-preset=${preset}]`);
        await rotate(`${preset} editor`, '.shot-layout-key, #shot-layout-editor button[data-action]', { shots: true });
        await click('#shot-layout-editor [data-action=save]');
        await click('#settings-back');
        await rotate(`${preset} match`, '#game-controls .shot-btn, #match-settings-toggle, #pause, #fullscreen', { shots: true });
      }
      const key = page.locator('#game-controls [data-shot=clear]');
      const rect = await key.boundingBox();
      const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      const touch = engine === 'Chromium' ? await page.context().newCDPSession(page) : null;
      if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      else {
        await page.mouse.move(x, y);
        await page.mouse.down();
      }
      await page.locator('#game-controls [data-shot=clear].charging').waitFor();
      await page.setViewportSize({ width: 320, height: 568 });
      await page.locator('#game-controls [data-shot=clear].charging').waitFor({ state: 'hidden' });
      if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      else await page.mouse.up();
      await click('#pause');
      await page.addStyleTag({ content: '@media (orientation: landscape) { :root { --safe-top: 20px; --safe-bottom: 21px; --safe-left: 44px; --safe-right: 44px; } }' });
      await rotate('pause with safe insets', '#pause-dialog #resume, #pause-dialog #leave-game', {
        viewports: [[320, 568], [568, 260], [390, 844], [568, 330], [320, 568], [568, 350], [390, 844], [667, 375], [390, 844], [844, 390]]
      });
      await click('#resume');
      await page.waitForFunction(() => rallyDiagnostics.statePhase === 'serve');
      await page.evaluate(() => qaFinish());
      await page.locator('#result-dialog').waitFor({ state: 'visible' });
      await rotate('results with safe insets', '#rematch, #back-menu');
      await click('#back-menu');
      await rotate('returned home', homeTargets);
      console.log(`${engine}: completed rotation checks`);
    } catch (error) {
      issues.push(`${engine}: ${error.stack}`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await app.close();
}
assert.equal(issues.length, 0, `${issues.length} issues across ${rotations} viewport changes\n${issues.join('\n')}`);
console.log(`PASS ${rotations} viewport changes in Chromium and WebKit`);
