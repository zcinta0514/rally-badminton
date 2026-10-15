#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { createServer } from '../server/index.js';
import { COURT_PALETTE_NAMES } from '../src/court-palettes.js';

// Optional external QA tool, like capture-p0.mjs. It is not a game dependency.
//   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-save playwright-core
// Uses the system Chrome by default; set RALLY_CHROME_PATH for another build.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.RALLY_PLAYWRIGHT_MODULE || 'playwright-core');
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--out') throw new Error('Usage: node scripts/capture-fx4-palettes.mjs --out artifacts/fx4/<new-directory>');
const output = resolve(args[1]), rel = relative(resolve('artifacts/fx4'), output);
if (!rel || rel.startsWith('..') || rel.startsWith('/')) throw new Error('Use a new directory inside artifacts/fx4');
await mkdir(output, { recursive: true });
const app = createServer(), errors = [], pictures = [], checks = [];
let browser;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
try {
  await app.listen();
  browser = await chromium.launch({ headless: true, channel: process.env.RALLY_CHROME_CHANNEL || 'chrome',
    ...(process.env.RALLY_CHROME_PATH ? { executablePath: process.env.RALLY_CHROME_PATH } : {}),
    args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(app.url + '/');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 30000 });
  // A first visit opens the beginner tutorial as a modal; skip it so the
  // launch buttons stay clickable.
  await page.waitForTimeout(500);
  if (await page.locator('#onboarding-dialog[open]').count()) await page.click('#onboarding-skip');
  await page.waitForSelector('#start-ai', { state: 'visible', timeout: 10000 });
  await page.click('#start-ai');
  await page.waitForSelector('#start-ai-confirm', { state: 'visible', timeout: 10000 });
  await page.click('#start-ai-confirm');
  await page.waitForSelector('#match-settings-toggle', { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(1500);
  // Selecting a palette must persist at once and recolour the live venue; a
  // reload then proves the stored choice drives the floor on the next visit.
  for (const name of COURT_PALETTE_NAMES) {
    await page.click('#palette-toggle');
    await page.click(`#palette-options button[data-palette="${name}"]`);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rally.arena.v1')).courtPalette);
    assert.equal(stored, name, `selecting ${name} must persist immediately`);
    if (name === 'green') await page.screenshot({ path: resolve(output, 'palette-panel.png') });
    await page.click('#palette-toggle');
    await page.waitForTimeout(900);
    const file = resolve(output, `court-${name}.png`);
    await page.screenshot({ path: file });
    pictures.push({ name, file: relative(output, file), sha256: sha(await readFile(file)) });
    checks.push({ palette: name, stored });
  }
  await page.reload();
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 30000 });
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('rally.arena.v1')).courtPalette);
  assert.equal(restored, 'pink', 'the last selected palette must survive a reload');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(output, 'reload-pink.png') });
  assert.deepEqual(errors, []);
  const report = { generatedAt: new Date().toISOString(), viewport: { width: 1280, height: 800 }, checks, pictures,
    checksSummary: { palettes: checks.length, persisted: true, reloadRestored: restored, errors: errors.length },
    errors, qualityAccepted: false,
    sources: Object.fromEntries(await Promise.all(['src/court-palettes.js', 'src/arena-preferences.js', 'src/view.js', 'src/palette-picker.js', 'src/match-settings.js', 'index.html', 'scripts/capture-fx4-palettes.mjs'].map(async (path) => [path, sha(await readFile(path))]))) };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, palettes: checks.length, pictures: pictures.length, reloadRestored: restored, errors: errors.length, qualityAccepted: false }));
} finally { await browser?.close(); await app.close(); }
