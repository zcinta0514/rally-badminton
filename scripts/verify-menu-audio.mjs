import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from '../server/index.js';
import { createPwaBuild } from './build-pwa.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.RALLY_PLAYWRIGHT_MODULE || 'playwright');
const output = 'artifacts/menu-audio';
await mkdir(output, { recursive: true });
const app = process.env.RALLY_QA_URL ? null : createServer();
await app?.listen();
const url = process.env.RALLY_QA_URL || app.url;
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.RALLY_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--enable-unsafe-swiftshader', '--autoplay-policy=user-gesture-required'] });
const report = { build: (await createPwaBuild()).version, checks: [], errors: [] };

try {
  for (const [width, height] of [[844, 390], [568, 320], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true,
      serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('rally.onboarding.seen', '1');
      localStorage.setItem('rally.usage.enabled', 'off');
      window.interfaceOscillators = 0;
      const oscillator = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function () {
        window.interfaceOscillators++;
        return oscillator.call(this);
      };
    });
    const ready = async () => {
      await page.locator('#loading').waitFor({ state: 'hidden' });
      assert.equal(await page.evaluate(() => RALLY_CONFIG.buildId), report.build);
    };
    const music = page.locator('#lobby-music-player');
    const playing = async source => page.waitForFunction(expected => {
      const audio = document.getElementById('lobby-music-player');
      return !audio.paused && audio.currentTime > 0 && audio.currentSrc.includes(expected);
    }, source);
    const paused = async () => page.waitForFunction(() => document.getElementById('lobby-music-player').paused);
    const countClicks = () => page.evaluate(() => window.interfaceOscillators);
    const tap = selector => page.locator(selector).tap();
    const settings = '#match-settings-toggle';
    const track = page.locator('#arena-music-track');
    await page.goto(url);
    await ready();
    assert.equal(await music.getAttribute('src'), null);
    await tap(settings);
    await playing('lobby-warmup.mp3');
    assert.equal(await countClicks(), 1, 'one touch creates one sound on first activation');
    await track.selectOption('highlights');
    await playing('lobby-highlights.mp3');
    await page.locator('#arena-choose-music').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${width}x${height}-settings.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('rally.arena.v1')).musicTrack), 'highlights');
    await page.locator('#arena-music-file').setInputFiles('src/audio/lobby-warmup.mp3');
    await playing('blob:');
    assert.equal(await track.inputValue(), 'local');
    await track.selectOption('highlights');
    await playing('lobby-highlights.mp3');
    await track.selectOption('local');
    await playing('blob:');
    await track.selectOption('highlights');

    await page.reload();
    await ready();
    await tap(settings);
    await playing('lobby-highlights.mp3');
    assert.equal(await track.inputValue(), 'highlights');
    const ui = page.locator('#arena-ui');
    await ui.fill('0');
    const clicks = await countClicks();
    await tap(settings);
    assert.equal(await countClicks(), clicks);
    await playing('lobby-highlights.mp3');
    await tap(settings);
    await ui.fill('45');
    await page.locator('#arena-music').fill('0');
    await paused();
    await page.locator('#arena-music').fill('25');
    await playing('lobby-highlights.mp3');
    await tap(settings);
    await tap('#sound');
    await paused();
    await tap('#sound');
    await playing('lobby-highlights.mp3');

    if (width !== 390) {
      await tap('#open-solo');
      await tap('#start-ai');
      await tap('#start-ai-confirm');
      await page.locator('#hud').waitFor({ state: 'visible' });
      await paused();
      const beforeServe = await countClicks();
      const key = await page.locator('[data-shot=clear]').boundingBox();
      await page.mouse.move(key.x + key.width / 2, key.y + key.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(180);
      await page.mouse.up();
      await page.waitForFunction(() => rallyDiagnostics.statePhase === 'rally');
      assert.equal(await countClicks(), beforeServe, 'a real serve uses arena audio only');
      await tap('#pause');
      await paused();
      await tap('#leave-game');
      await playing('lobby-highlights.mp3');
    }
    report.checks.push(`${width}×${height}: touch audio, switching, local file, saved selection and mute`);
    console.log(report.checks.at(-1));
    await context.close();
  }
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await app?.close();
}
