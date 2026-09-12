import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from '../server/index.js';
import { createPwaBuild, projectRoot } from './build-pwa.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.RALLY_PLAYWRIGHT_MODULE || 'playwright');
const output=path.join(projectRoot,'artifacts','player-experience'); await mkdir(output,{recursive:true});
const testDir=await mkdtemp(path.join(output,'run-'));
const token=randomBytes(32).toString('hex');
const report={checks:[],pageErrors:[],consoleErrors:[],requestFailures:[],staticFailures:[],loadFailures:[]};
// Software WebGL on a shared host can spend tens of seconds rebuilding a court.
// This allowance is only for browser QA; production coordination stays bounded.
const browserLoadTimeout=120000;
const offlineContexts=new WeakSet();
const isStaticURL=url=>/\/(?:src|shared|vendor|assets|icons)\/|\/(?:runtime-config\.js|sw\.js|manifest\.webmanifest)$/.test(new URL(url).pathname);
const checked=name=>{report.checks.push(name);console.log('PASS '+name);};
const browser=await chromium.launch({executablePath:process.env.RALLY_BROWSER_PATH,headless:true,
  args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
let app, snapshotServer;
const watch=page=>{
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push({page:page.url(),message:message.text(),location:message.location(),expectedOffline:offlineContexts.has(page.context())});});
  page.on('requestfailed',request=>report.requestFailures.push({page:page.url(),url:request.url(),method:request.method(),resourceType:request.resourceType(),errorText:request.failure()?.errorText||'',static:isStaticURL(request.url()),expectedOffline:offlineContexts.has(page.context())}));
  page.on('response',response=>{if(response.status()>=400&&isStaticURL(response.url()))report.staticFailures.push({url:response.url(),status:response.status()});});
};
async function loaded(page) {
  try { await page.locator('#loading').waitFor({state:'hidden',timeout:browserLoadTimeout}); }
  catch(error) {
    const diagnostic={url:page.url(),loadingText:await page.locator('#loading').textContent({timeout:2000}).catch(failure=>'unavailable: '+failure.message),screenshot:path.join(testDir,`loading-failure-${report.loadFailures.length+1}.png`)};
    await page.screenshot({path:diagnostic.screenshot,timeout:10000}).catch(failure=>{diagnostic.screenshotError=failure.message;});
    report.loadFailures.push(diagnostic);throw error;
  }
}
async function setOffline(context,offline) {
  if(offline)offlineContexts.add(context);else offlineContexts.delete(context);
  await context.setOffline(offline);
}
async function waitForActiveWorker(context,version) {
  const deadline=Date.now()+browserLoadTimeout;
  while(Date.now()<deadline) {
    for(const worker of context.serviceWorkers()) {
      const state=await worker.evaluate(()=>({version:VERSION,active:self.registration.active?.state,waiting:Boolean(self.registration.waiting)})).catch(()=>null);
      if(state?.version===version&&state.active==='activated'&&!state.waiting)return;
    }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.fail('the prepared legacy update did not activate after all game windows closed');
}
async function confirmModalFits(page,selector) {
  const bounds=await page.locator(selector).evaluate(el=>{
    const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:el.scrollWidth>el.clientWidth+2};
  });
  assert.ok(bounds.left>=-1&&bounds.top>=-1&&bounds.right<=bounds.width+1&&bounds.bottom<=bounds.height+1&&!bounds.overflow,JSON.stringify(bounds));
}
async function confirmFeedbackFooter(page) {
  const buttons=await page.locator('#feedback-dialog footer .feedback-cancel, #feedback-dialog footer .feedback-submit').evaluateAll(elements=>elements.map(el=>{
    const r=el.getBoundingClientRect();return {text:el.textContent,height:r.height,width:r.width,left:r.left,top:r.top,right:r.right,bottom:r.bottom,viewportWidth:innerWidth,viewportHeight:innerHeight};
  }));
  assert.equal(buttons.length,2,'both feedback actions must be in the footer');
  for(const bounds of buttons)assert.ok(bounds.height>=44&&bounds.width>=44&&bounds.left>=0&&bounds.top>=0&&bounds.right<=bounds.viewportWidth&&bounds.bottom<=bounds.viewportHeight,JSON.stringify(bounds));
}
async function confirmFeedbackStatus(page) {
  const bounds=await page.locator('.feedback-status').evaluate(el=>{
    const r=el.getBoundingClientRect();return {height:r.height,top:r.top,bottom:r.bottom,viewportHeight:innerHeight};
  });
  assert.ok(bounds.height>0&&bounds.top>=0&&bounds.bottom<=bounds.viewportHeight,JSON.stringify(bounds));
  await confirmFeedbackFooter(page);
}
async function readSelectedPreferences(page) {
  return page.evaluate(()=>({role:document.querySelector('#roles [aria-pressed="true"]')?.dataset.role,
    difficulty:document.querySelector('#difficulties [aria-pressed="true"]')?.dataset.difficulty,
    ruleset:document.querySelector('#rulesets [aria-pressed="true"]')?.dataset.ruleset,
    target:document.querySelector('#targets [aria-pressed="true"]')?.dataset.target,
    targetsDisabled:document.getElementById('targets').getAttribute('aria-disabled'),
    roleNote:document.getElementById('role-note').textContent,rulesNote:document.getElementById('rules-note').textContent,
    muted:document.getElementById('sound').dataset.muted,soundLabel:document.getElementById('sound').getAttribute('aria-label')}));
}
try {
  const feedbackPath=path.join(testDir,'feedback.json');
  app=createServer({feedbackPath,feedbackAdminToken:token});await app.listen();
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  const page=await context.newPage();watch(page);await page.goto(app.url);await loaded(page);
  await page.locator('#onboarding-dialog').waitFor({state:'visible'});
  assert.doesNotMatch(await page.locator('#onboarding-dialog').innerText(),/添加到主屏幕|Safari|安装应用/);
  await confirmModalFits(page,'#onboarding-dialog');
  await page.screenshot({path:path.join(output,'onboarding-landscape.png')});
  await page.locator('#onboarding-next').click();await page.locator('#onboarding-next').click();
  assert.match(await page.locator('#onboarding-title').innerText(),/右手/);
  await page.locator('#onboarding-next').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('rally.onboarding.seen')),'1');
  checked('integrated onboarding, no installation card, completion remembered');
  await page.locator('#help').click();await page.locator('#operation-hints').uncheck();
  assert.equal(await page.locator('body').getAttribute('data-operation-hints'),'off');
  await page.locator('#onboarding-replay').click();await page.locator('#onboarding-skip').click();
  await page.locator('#help-dialog [data-close]').first().click();
  await page.locator('#start-ai').click();
  await page.waitForFunction(()=>document.body.dataset.screen==='match');
  assert.equal(await page.locator('[data-shot="clear"] strong').isVisible(),true);
  assert.equal(await page.locator('[data-shot="clear"] small').isVisible(),false);
  await page.locator('#pause').click();await page.locator('#leave-game').click();
  checked('hint preference and normal AI start/pause/return preserve controls');
  await page.locator('#open-feedback').click();await confirmModalFits(page,'#feedback-dialog');await confirmFeedbackFooter(page);
  await page.locator('#feedback-form [name="category"]').selectOption('suggestion');
  await page.locator('#feedback-form [name="content"]').fill('浏览器验收用例：希望击球说明更容易找到。');
  await page.screenshot({path:path.join(output,'feedback-landscape.png')});
  await page.setViewportSize({width:667,height:320});await confirmModalFits(page,'#feedback-dialog');await confirmFeedbackFooter(page);
  await page.screenshot({path:path.join(output,'feedback-landscape-667.png')});
  await page.setViewportSize({width:844,height:390});await confirmFeedbackFooter(page);
  checked('feedback footer keeps both 44px actions inside 844×390 and 667×320 viewports');
  await page.locator('.feedback-submit').click();
  await page.waitForFunction(()=>document.querySelector('.feedback-status').textContent.includes('提交成功'));
  await confirmFeedbackStatus(page);await page.setViewportSize({width:667,height:320});
  await confirmFeedbackStatus(page);await page.screenshot({path:path.join(output,'feedback-success-667.png')});
  await page.setViewportSize({width:844,height:390});
  const stored=JSON.parse(await readFile(feedbackPath,'utf8'));assert.equal(stored.items.length,1);
  const admin=await context.newPage();watch(admin);await admin.setViewportSize({width:1280,height:800});await admin.goto(app.url+'/feedback-admin/');
  assert.equal((await context.request.get(app.url+'/api/feedback')).status(),401);
  await admin.locator('#token').fill(token);await admin.locator('#login-form button').click();
  await admin.locator('#inbox').waitFor({state:'visible'});
  await admin.locator('#detail select').selectOption('resolved');await admin.getByRole('button',{name:'保存状态'}).click();
  await admin.waitForFunction(()=>document.querySelector('#notice').textContent.includes('处理状态已保存'));
  assert.equal(JSON.parse(await readFile(feedbackPath,'utf8')).items[0].status,'resolved');
  await admin.screenshot({path:path.join(output,'feedback-admin.png')});
  checked('anonymous submission reaches authenticated private inbox and status persists');
  await page.bringToFront();await page.locator('.feedback-close').click();await page.locator('#open-feedback').click();
  await page.locator('#feedback-form [name="content"]').fill('断网草稿：请保留这段内容。');
  await setOffline(context,true);await page.locator('.feedback-submit').click();
  await page.waitForFunction(()=>document.querySelector('.feedback-status').textContent.includes('草稿已保留'));
  await confirmFeedbackStatus(page);
  await setOffline(context,false);await page.locator('.feedback-close').click();await page.reload();await loaded(page);
  assert.equal(await page.locator('#onboarding-dialog').isVisible(),false);
  await page.locator('#open-feedback').click();assert.equal(await page.locator('[name="content"]').inputValue(),'断网草稿：请保留这段内容。');
  assert.equal(await page.locator('body').getAttribute('data-operation-hints'),'off');
  checked('failed submission and page reload preserve draft and preferences');
  await context.close();const oldPort=app.server.address().port;await app.close();
  app=createServer({port:oldPort,feedbackPath,feedbackAdminToken:token});await app.listen();
  const persisted=await fetch(app.url+'/api/feedback',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
  assert.equal(persisted.items[0].status,'resolved');checked('private feedback survives a real service restart');
  await app.close();app=null;

  const buildA=await createPwaBuild();
  const buildB=await createPwaBuild({feedbackURL:'/api/feedback'});
  const buildC=await createPwaBuild({feedbackURL:'/api/feedback',demoMode:true});
  let deployed=buildA;
  snapshotServer=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const basePath=deployed.basePath||'/';
    if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    if(pathname==='/feedback-admin/'||pathname===basePath+'feedback-admin/') {res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Private admin shell</title><p>Private admin</p>');return;}
    const assetPath=pathname===basePath+'index.html'?basePath:pathname;
    const body=assetPath===basePath+'sw.js'?deployed.worker:deployed.assets.get(assetPath);
    if(!body){res.writeHead(404);res.end();return;}
    const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.glb':'model/gltf-binary','.json':'application/json','.webmanifest':'application/manifest+json','.wav':'audio/wav','.png':'image/png','.svg':'image/svg+xml'};
    res.writeHead(200,{'Content-Type':assetPath===basePath?'text/html':mime[path.extname(assetPath)]||'text/plain','Cache-Control':'no-cache','Service-Worker-Allowed':basePath});res.end(body);
  });
  await new Promise(resolve=>snapshotServer.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+snapshotServer.address().port;
  // Two simultaneous software-rendered 3D courts at desktop resolution can
  // starve Chromium's renderer on shared CI hosts. Use the actual phone layout.
  const updateContext=await browser.newContext({viewport:{width:844,height:390}});
  await updateContext.addInitScript(()=>localStorage.setItem('rally.onboarding.seen','1'));
  const first=await updateContext.newPage();watch(first);await first.goto(url);await loaded(first);
  await first.evaluate(()=>navigator.serviceWorker.ready);await first.reload();await loaded(first);
  assert.equal(await first.evaluate(()=>RALLY_CONFIG.buildId),buildA.version);
  await first.evaluate(()=>{
    localStorage.setItem('rally.qa.preserve','saved');
    const frame=document.createElement('iframe');frame.id='qa-analytics';frame.src='/src/analytics-frame.html';frame.hidden=true;document.body.append(frame);
  });
  await first.waitForFunction(()=>document.getElementById('qa-analytics').contentDocument?.readyState==='complete');
  await first.locator('#roles [data-role="power"]').click();
  await first.locator('#difficulties [data-difficulty="hard"]').click();
  await first.locator('#targets [data-target="11"]').click();
  await first.locator('#rulesets [data-ruleset="standard21"]').click();await first.locator('#sound').click();
  const selectedPreferences=await readSelectedPreferences(first);
  assert.equal(selectedPreferences.role,'power');assert.equal(selectedPreferences.difficulty,'hard');assert.equal(selectedPreferences.ruleset,'standard21');assert.equal(selectedPreferences.muted,'true');
  const second=await updateContext.newPage();watch(second);await second.goto(url);await loaded(second);
  const adminShell=await updateContext.newPage();await adminShell.goto(url+'/feedback-admin/');
  await second.bringToFront();await second.locator('#start-ai').click();
  deployed=buildB;
  await first.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
  await first.waitForFunction(async()=>Boolean((await navigator.serviceWorker.getRegistration())?.waiting));
  // More than one coordination interval, while the other page is in a match.
  await new Promise(resolve=>setTimeout(resolve,17000));
  assert.equal(await first.evaluate(()=>RALLY_CONFIG.buildId),buildA.version);
  assert.equal(await second.evaluate(()=>document.body.dataset.screen),'match');
  checked('new build waits while another game window is in a match');
  await second.locator('#pause').click();await second.locator('#leave-game').click();
  await first.waitForFunction(expected=>globalThis.RALLY_CONFIG?.buildId===expected,buildB.version,{timeout:browserLoadTimeout});
  await second.waitForFunction(expected=>globalThis.RALLY_CONFIG?.buildId===expected,buildB.version,{timeout:browserLoadTimeout});
  await loaded(first);await loaded(second);
  assert.equal(await first.evaluate(()=>localStorage.getItem('rally.qa.preserve')),'saved');
  assert.deepEqual(await readSelectedPreferences(first),selectedPreferences);
  await first.locator('#rulesets [data-ruleset="quick"]').click();assert.equal(await first.locator('#targets [data-target="11"]').getAttribute('aria-pressed'),'true');
  await first.locator('#rulesets [data-ruleset="standard21"]').click();
  checked('automatic update preserves non-default role, difficulty, rules, quick-score preference and mute');
  checked('both idle windows update automatically with analytics iframe and admin page present');
  await second.close();await adminShell.close();await first.bringToFront();
  await first.locator('#open-feedback').click();await first.locator('[name="content"]').fill('等待更新时保留的意见草稿');
  deployed=buildC;
  await first.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
  await first.waitForFunction(async()=>Boolean((await navigator.serviceWorker.getRegistration())?.waiting));
  await new Promise(resolve=>setTimeout(resolve,6500));
  assert.equal(await first.evaluate(()=>RALLY_CONFIG.buildId),buildB.version);
  assert.equal(await first.locator('[name="content"]').inputValue(),'等待更新时保留的意见草稿');
  await first.locator('.feedback-close').click();
  await first.waitForFunction(expected=>globalThis.RALLY_CONFIG?.buildId===expected,buildC.version,{timeout:browserLoadTimeout});await loaded(first);
  assert.deepEqual(await readSelectedPreferences(first),selectedPreferences);
  await first.locator('#open-feedback').click();assert.equal(await first.locator('[name="content"]').inputValue(),'等待更新时保留的意见草稿');
  await first.locator('.feedback-close').click();await first.screenshot({path:path.join(output,'lobby.png')});
  checked('editing postpones update; automatic switch preserves the saved draft');
  report.versions={a:buildA.version,b:buildB.version,c:buildC.version};
  await updateContext.close();
  const subpathBuild=await createPwaBuild({basePath:'/rally-badminton/',feedbackURL:'/api/feedback'});deployed=subpathBuild;
  const subpathContext=await browser.newContext({viewport:{width:844,height:390}});
  await subpathContext.addInitScript(()=>localStorage.setItem('rally.onboarding.seen','1'));
  const bookmark=await subpathContext.newPage();watch(bookmark);
  const bookmarkURL=url+subpathBuild.basePath+'index.html?entry=bookmark';
  await bookmark.goto(bookmarkURL);await loaded(bookmark);assert.equal(bookmark.url(),bookmarkURL);
  assert.equal(await bookmark.evaluate(()=>RALLY_CONFIG.buildId),subpathBuild.version);
  await bookmark.evaluate(()=>navigator.serviceWorker.ready);await bookmark.reload();await loaded(bookmark);
  await bookmark.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  assert.equal(await bookmark.evaluate(()=>RALLY_CONFIG.basePath),'/rally-badminton/');
  assert.equal(await bookmark.evaluate(()=>navigator.serviceWorker.controller.scriptURL),url+'/rally-badminton/sw.js');
  await setOffline(subpathContext,true);await bookmark.reload();await loaded(bookmark);
  assert.equal(bookmark.url(),bookmarkURL);assert.equal(await bookmark.evaluate(()=>RALLY_CONFIG.buildId),subpathBuild.version);
  const offlineModules=await bookmark.evaluate(async()=>{
    const modules={'src/onboarding.js':'initOnboarding','src/update-client.js':'createUpdateClient','src/update-preferences.js':'restoreUpdatePreferences','src/feedback.js':'initFeedback'};
    return Promise.all(Object.entries(modules).map(async([file,exportName])=>{
      // A fresh module URL proves the offline worker path, not the document's
      // already instantiated module registry. The cache is keyed by pathname.
      const module=await import(new URL(file+'?qa=offline',location.href).href);
      return {file,exportName,type:typeof module[exportName]};
    }));
  });
  for(const module of offlineModules)assert.equal(module.type,'function',JSON.stringify(module));
  report.offlineModules=offlineModules;report.versions.subpath=subpathBuild.version;
  await bookmark.screenshot({path:path.join(output,'subpath-bookmark-offline.png')});
  await setOffline(subpathContext,false);await subpathContext.close();
  checked('subpath index.html bookmark loads first, reloads under worker control and runs new modules offline');
  if(process.env.RALLY_LEGACY_ROOT) {
    const legacy=await createPwaBuild({root:process.env.RALLY_LEGACY_ROOT});deployed=legacy;
    const legacyContext=await browser.newContext({viewport:{width:1280,height:720}});
    const oldPage=await legacyContext.newPage();watch(oldPage);await oldPage.goto(url);await loaded(oldPage);
    await oldPage.evaluate(()=>navigator.serviceWorker.ready);await oldPage.reload();await loaded(oldPage);
    await oldPage.evaluate(()=>localStorage.setItem('rally.qa.legacy','preserved'));
    deployed=buildC;await oldPage.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
    await oldPage.waitForFunction(async()=>Boolean((await navigator.serviceWorker.getRegistration())?.waiting));
    assert.equal(await oldPage.evaluate(()=>RALLY_CONFIG.buildId),legacy.version);
    await oldPage.close();await waitForActiveWorker(legacyContext,buildC.version);
    const migrated=await legacyContext.newPage();watch(migrated);await migrated.goto(url);await loaded(migrated);
    assert.equal(await migrated.evaluate(()=>RALLY_CONFIG.buildId),buildC.version);
    assert.equal(await migrated.evaluate(()=>localStorage.getItem('rally.qa.legacy')),'preserved');
    checked('legacy installation migrates after closing old game windows without deleting its icon or records');
    await legacyContext.close();
  }
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.staticFailures,[]);
  checked('no browser page errors or failed cached application resources');
  report.ok=true;
} catch(error) {
  report.ok=false;report.failure=error.stack;throw error;
} finally {
  await writeFile(path.join(output,'browser-verification.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();if(app)await app.close();
  if(snapshotServer){snapshotServer.closeAllConnections();await new Promise(resolve=>snapshotServer.close(resolve));}
}
