import { createUpdateClient } from './update-client.js';

export function getWebSocketURL(page = globalThis.location, config = globalThis.RALLY_CONFIG || {}) {
  if (config.demoMode === true) throw new Error('本页可进行人机对战；好友对战请直接打开主机的局域网游戏网址。');
  const base = new URL(page.href);
  const url = new URL(config.wsUrl || `${base.protocol === 'https:' ? 'wss:' : 'ws:'}//${base.host}/ws`);
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash || url.search || url.pathname !== '/ws') throw new Error('联机地址配置无效');
  if (base.protocol === 'https:' && url.protocol !== 'wss:') throw new Error('HTTPS 页面需要安全的 WSS 联机地址');
  return url.href;
}

export function getPwaRegistrationURLs(moduleURL = import.meta.url) {
  return {scriptURL:new URL('../sw.js', moduleURL).href, scope:new URL('../', moduleURL).pathname};
}

export function displayAction({standalone, fullscreenEnabled, canRequest}) {
  return standalone ? 'standalone' : fullscreenEnabled && canRequest ? 'fullscreen' : 'install';
}

export function getInstallGuide({standalone = false, isIOS = false, inWeChat = false, canPrompt = false} = {}) {
  if (standalone) return {canInstall:false, steps:[]};
  const steps = isIOS ? ['在 Safari 打开此游戏，轻点分享（或“更多”→分享）。', '选择“添加到主屏幕”；如有“作为网页 App 打开”，请开启。', '轻点“添加”，以后从桌面“开拍”图标进入。'] :
    canPrompt && !inWeChat ? ['点击下方“安装到手机”，在系统提示中确认。', '安装后，从桌面“开拍”图标进入游戏。'] :
    ['打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。', '若没有该选项，可换用支持安装的浏览器；也可继续在线玩。'];
  if (inWeChat) steps.unshift(isIOS ? '点击微信右上角菜单，选择在 Safari 打开。' : '点击微信右上角菜单，选择在系统浏览器打开。');
  return {canInstall:!isIOS && !inWeChat && canPrompt, steps};
}

export function initPWA({ fullscreenButton, landscapeButton, showToast = () => {}, isSafeToUpdate = () => false, onUpdateLock = () => {} } = {}) {
  const demoMode = globalThis.RALLY_CONFIG?.demoMode === true;
  const peerMode = globalThis.RALLY_CONFIG?.peerMode === true;
  let matchActive = false, registration = null, installPrompt = null, cached = false, version = '', failure = false, checking = false;
  const supported = globalThis.isSecureContext && 'serviceWorker' in navigator;
  const standaloneQuery = matchMedia('(display-mode: standalone)');
  const landscapeQuery = matchMedia('(orientation: landscape)');
  const isStandalone = () => standaloneQuery.matches || navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const inWeChat = /MicroMessenger/i.test(navigator.userAgent);
  const entry = document.createElement('button');
  entry.id = 'install-app'; entry.className = 'pwa-entry'; entry.type = 'button';
  entry.innerHTML = '<span id="pwa-entry-label">安装到手机 ↗</span><small id="pwa-status" role="status" aria-live="polite"></small>';
  const menu = document.getElementById('menu');
  const extras = menu?.querySelector('.menu-foot-actions');
  if (extras) extras.appendChild(entry);
  else menu?.insertBefore(entry, menu.querySelector('.menu-foot'));
  const status = entry.querySelector('#pwa-status');
  const dialog = document.createElement('dialog');
  dialog.id = 'pwa-dialog'; dialog.className = 'pwa-dialog'; dialog.setAttribute('aria-labelledby', 'pwa-title');
  dialog.innerHTML = '<button type="button" class="pwa-close" aria-label="关闭主屏幕说明">×</button><small class="pwa-eyebrow">开拍 / RALLY</small><h2 id="pwa-title">安装到手机</h2><p id="pwa-intro"></p><div class="pwa-benefits"><span>桌面直接打开</span><span>离线人机练习</span><span>联网自动更新</span></div><ol id="pwa-steps"></ol><div class="pwa-actions"><button id="pwa-install" type="button">安装到手机</button></div><section class="pwa-resource" aria-labelledby="pwa-resource-title"><h3 id="pwa-resource-title">离线资源</h3><strong id="pwa-resource-status" role="status" aria-live="polite"></strong><progress id="pwa-download" aria-label="正在下载游戏资源"></progress><p id="pwa-cache-detail" class="pwa-cache-detail"></p><button id="pwa-retry" type="button">检查更新</button></section><p class="pwa-update-note">以后如何更新？联网打开游戏后自动检查，下载完成后在首页空闲时更新，不中断正在进行的对局。</p><p class="pwa-note">这是可安装的网页版，无需下载 APK。请手动横屏并关闭方向锁定；清理网站数据后需重新下载离线资源。</p>';
  document.body.append(dialog);
  const releaseNotice = globalThis.RALLY_CONFIG?.releaseNotice;
  const validReleaseNotice = releaseNotice && typeof releaseNotice.id === 'string' && /^[a-z0-9][a-z0-9._-]{1,64}$/i.test(releaseNotice.id) &&
    typeof releaseNotice.title === 'string' && typeof releaseNotice.summary === 'string' &&
    Array.isArray(releaseNotice.items) && releaseNotice.items.length > 0 && releaseNotice.items.every(item => typeof item === 'string');
  const releaseDialog = document.createElement('dialog');
  releaseDialog.id = 'release-notice-dialog'; releaseDialog.className = 'release-dialog'; releaseDialog.setAttribute('aria-labelledby', 'release-notice-title');
  releaseDialog.innerHTML = '<button type="button" class="release-close" aria-label="关闭更新公告">×</button><small class="pwa-eyebrow">开拍 / RALLY · 更新公告</small><h2 id="release-notice-title"></h2><p id="release-notice-summary"></p><ul id="release-notice-items"></ul><button type="button" class="release-dismiss">关闭</button>';
  document.body.append(releaseDialog);
  const cornerCheck = document.getElementById('lobby-check-update');
  const detail = dialog.querySelector('#pwa-cache-detail'), nativeInstall = dialog.querySelector('#pwa-install');
  const retryButton = dialog.querySelector('#pwa-retry'), download = dialog.querySelector('#pwa-download');
  let installAccepted = false, installCompleted = false;
  const releaseDismiss = releaseDialog.querySelector('.release-dismiss');
  let updateState = '', previousInert = false, updateStorage, releasePending = false, releaseTimer = null, releaseFocus = null;
  try { updateStorage = sessionStorage; } catch { /* Auto reload needs a working loop guard. */ }
  const pageVersion = globalThis.RALLY_CONFIG?.buildId || '';
  function closeReleaseNotice() {
    if (!releaseDialog.open) return;
    releaseDialog.close(); releaseFocus?.focus?.({preventScroll:true}); releaseFocus = null;
  }
  function releaseNoticeCanOpen() {
    return releasePending && validReleaseNotice && !matchActive && !document.hidden && document.body?.dataset.screen !== 'match' &&
      !releaseDialog.open && !document.querySelector('dialog[open]');
  }
  function scheduleReleaseNotice() {
    if (!releasePending || releaseTimer) return;
    const attempt = () => {
      releaseTimer = null;
      if (!releasePending) return;
      if (!releaseNoticeCanOpen()) { releaseTimer = setTimeout(attempt, 500); return; }
      releasePending = false;
      const title = releaseDialog.querySelector('#release-notice-title');
      const summary = releaseDialog.querySelector('#release-notice-summary');
      const items = releaseDialog.querySelector('#release-notice-items');
      title.textContent = releaseNotice.title; summary.textContent = releaseNotice.summary;
      items.replaceChildren(...releaseNotice.items.slice(0, 5).map(item => { const li = document.createElement('li'); li.textContent = item; return li; }));
      releaseFocus = document.activeElement;
      try { releaseDialog.showModal(); releaseDismiss.focus({preventScroll:true}); try { localStorage.setItem('rally.release.notice.' + releaseNotice.id, '1'); } catch {} }
      catch { releaseFocus = null; showToast('已更新到新版：' + releaseNotice.summary); }
    };
    attempt();
  }
  function queueReleaseNotice() {
    if (!validReleaseNotice) return;
    try {
      const key = 'rally.release.notice.' + releaseNotice.id;
      if (localStorage.getItem(key) === '1') return;
    } catch { /* The automatic-reload marker still limits this to the current update. */ }
    releasePending = true; scheduleReleaseNotice();
  }
  releaseDialog.querySelector('.release-close').addEventListener('click', closeReleaseNotice);
  releaseDismiss.addEventListener('click', closeReleaseNotice);
  releaseDialog.addEventListener('cancel', event => { event.preventDefault(); closeReleaseNotice(); });
  const updater = supported ? createUpdateClient({serviceWorker:navigator.serviceWorker,storage:updateStorage,version:pageVersion,
    isSafe:context => !matchActive && isSafeToUpdate(context),
    lock(context) { previousInert=document.body.inert; document.body.inert=true; onUpdateLock(context); showToast('新版已就绪，正在自动更新…'); },
    unlock() { document.body.inert=previousInert; },
    onStatus(value) { updateState=value.state; updateUI(); }
  }) : null;
  const action = () => displayAction({standalone:isStandalone(), fullscreenEnabled:document.fullscreenEnabled, canRequest:typeof document.documentElement.requestFullscreen === 'function'});
  const close = () => dialog.close();
  dialog.querySelector('.pwa-close').addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) { const rect=dialog.getBoundingClientRect(); if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close(); } });
  function updateUI() {
    let short, long;
    if (!globalThis.isSecureContext) {
      short = '当前网址可玩 · 离线需 HTTPS';
      long = '当前是普通 HTTP 网址，可以在线游玩和添加快捷入口，但不能准备离线缓存。完整离线主屏幕版需要可信的 HTTPS 网址。';
    } else if (!supported) {
      short = '此浏览器未提供离线缓存'; long = '此浏览器未提供离线缓存能力。可继续在线游玩；iPhone 建议用 Safari 打开。';
    } else if (updateState === 'applying') {
      short = '新版已备好 · 正在自动更新';
      long = '正在切换到完整准备好的新版。昵称、战绩和设置会保留。';
    } else if (registration?.waiting) {
      short = '新版已备好 · 空闲时自动更新';
      long = '结束对局并返回首页后，游戏会在没有进行中的操作时自动更新。若其他游戏窗口仍在使用，将继续等待；很久未更新时，可关闭所有开拍窗口后重新打开，无需删除主屏幕图标。';
    } else if (registration?.installing) {
      short = cached ? '正在下载新版 · 当前版本仍可用' : '正在下载离线资源…';
      long = '请保持联网，完整下载并校验后才会显示“离线模式已就绪”。添加桌面图标与下载资源是两个步骤。';
    } else if (cached) {
      short = navigator.onLine ? '离线模式已就绪' : '当前离线 · 可进行人机对战';
      long = `完整游戏资源已保存到此设备，断网也能打开人机练习。${peerMode ? '好友对战创建和加入房间仍需联网。' : demoMode ? '好友对战请打开主机的局域网游戏网址。' : '好友对战需要与游戏服务器保持连接。'}`;
    } else if (!navigator.onLine) {
      short = '当前离线 · 资源尚未就绪'; long = '请恢复网络后点击“重试下载”。完整资源准备好之前，不能保证离线打开游戏。';
    } else if (failure) {
      short = '离线资源未就绪'; long = '资源尚未完整下载，请保持联网并点击“重试下载”。若反复失败，可关闭所有开拍窗口后重新打开。';
    } else {
      short = '正在准备离线资源…'; long = '首次打开需联网下载完整游戏资源；显示「离线模式已就绪」后即可断网。';
    }
    status.textContent = short; detail.textContent = long;
    const installed = isStandalone();
    entry.querySelector('#pwa-entry-label').textContent = installed ? '已从桌面打开 ✓' : installCompleted ? '已安装到手机 ✓' : '安装到手机 ↗';
    entry.setAttribute('aria-label', `${installed ? '桌面版与离线资源' : '安装到手机'}：${short}`);
    const guide = getInstallGuide({standalone:installed || installAccepted,isIOS,inWeChat,canPrompt:!!installPrompt});
    dialog.querySelector('#pwa-steps').replaceChildren(...guide.steps.map(text => { const li=document.createElement('li'); li.textContent=text; return li; }));
    nativeInstall.hidden = !guide.canInstall;
    dialog.querySelector('#pwa-resource-status').textContent = short;
    download.hidden = !supported || failure || !navigator.onLine || cached && !registration?.installing || !!registration?.waiting;
    retryButton.hidden = !supported;
    retryButton.disabled = checking || matchActive || !!registration?.installing || !navigator.onLine;
    retryButton.textContent = checking ? '检查中…' : !cached && failure ? '重试下载' : '检查更新';
    if (cornerCheck) {
      cornerCheck.disabled = checking || matchActive;
      cornerCheck.textContent = checking ? '检查中…' : '检查更新';
      cornerCheck.setAttribute('aria-busy', String(checking));
    }
    if (fullscreenButton) {
      const label = document.fullscreenElement ? '退出全屏' : isStandalone() ? '独立窗口' : '全屏';
      fullscreenButton.textContent = label;
    }
  }
  function openInstall(fullscreenUnavailable = false) {
    if (matchActive) { showToast(isStandalone() ? '已在独立窗口中' : '当前浏览器无法全屏。赛后可从首页添加到主屏幕。'); return; }
    dialog.querySelector('#pwa-title').textContent = isStandalone() ? '已从桌面打开' : installCompleted ? '已安装到手机' : installAccepted ? '已提交安装' : '安装到手机';
    const intro = isStandalone() ? '当前以独立窗口运行，浏览器地址栏和工具栏已隐藏。' :
      inWeChat ? '先在微信右上角菜单选择用系统浏览器打开，再按下面步骤操作。' :
      installCompleted ? '以后从桌面“开拍”图标进入。离线游玩前，请确认下方资源已就绪。' : installAccepted ? '请查看系统安装结果，完成后从桌面“开拍”图标进入。' : '添加到桌面，以后点图标就能开拍。首次使用请等待离线资源准备完成。';
    dialog.querySelector('#pwa-intro').textContent = (fullscreenUnavailable ? '当前浏览器无法直接全屏。' : '') + intro;
    updateUI(); if (!dialog.open) dialog.showModal();
  }
  entry.addEventListener('click', () => openInstall());
  let displayPending = false;
  async function changeDisplay(wantsLandscape) {
    if (displayPending) return;
    displayPending = true;
    try {
      if (!wantsLandscape && document.fullscreenElement) {
        try { await document.exitFullscreen(); showToast('已退出全屏'); }
        catch { showToast('暂时无法退出全屏，请使用浏览器的退出全屏操作。'); }
        return;
      }
      if (wantsLandscape && landscapeQuery.matches) {
        showToast('当前已是横屏');
        return;
      }
      const display = action();
      if (!wantsLandscape && display !== 'fullscreen') {
        openInstall(display === 'install');
        return;
      }
      if (display === 'fullscreen' && !document.fullscreenElement) {
        try { await document.documentElement.requestFullscreen(); }
        catch {
          if (!wantsLandscape) { openInstall(true); return; }
        }
      }
      const fullscreen = document.fullscreenElement;
      if (wantsLandscape || matchMedia('(pointer: coarse)').matches) {
        try {
          if (typeof screen.orientation?.lock === 'function') {
            await screen.orientation.lock('landscape');
            showToast(fullscreen ? '已进入横屏全屏' : '已切换横屏');
            return;
          }
        } catch { /* The browser may require manual rotation. */ }
      }
      if (!landscapeQuery.matches && (wantsLandscape || matchMedia('(pointer: coarse)').matches)) {
        showToast((fullscreen ? '已全屏。' : '') + '请关闭系统方向锁定，再横置手机。');
      } else if (fullscreen) showToast('已进入全屏');
    } finally {
      displayPending = false;
      updateUI();
    }
  }
  fullscreenButton?.addEventListener('click', () => changeDisplay(false));
  landscapeButton?.addEventListener('click', () => changeDisplay(true));
  document.addEventListener('fullscreenchange', updateUI);
  standaloneQuery.addEventListener?.('change', updateUI);
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; updateUI(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; installAccepted = true; installCompleted = true; updateUI(); if(dialog.open)openInstall(); showToast('安装完成，请从桌面“开拍”图标打开。'); });
  nativeInstall.addEventListener('click', async () => {
    const prompt = installPrompt; if (!prompt) return;
    installPrompt = null;
    try { await prompt.prompt(); const choice = await prompt.userChoice; installAccepted = choice?.outcome === 'accepted'; if(!installAccepted)showToast('已取消安装，仍可继续在网页游玩。'); } catch { showToast('请使用浏览器菜单添加到主屏幕'); }
    updateUI();
    if(dialog.open)openInstall();
  });
  async function cacheStatus(repair = false) {
    if (!registration?.active) return;
    const result = await new Promise(resolve => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, repair ? 30000 : 4000);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
      registration.active.postMessage({type:repair?'REPAIR_CACHE':'CACHE_STATUS'}, [channel.port2]);
    });
    cached = result?.complete === true; version = result?.version || ''; failure = !cached; updateUI();
  }
  function watchWorker(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'redundant') failure = !cached;
      if (worker.state === 'activated') cacheStatus();
      updateUI();
    });
  }
  async function register() {
    try {
      const {scriptURL, scope} = getPwaRegistrationURLs();
      registration = await navigator.serviceWorker.register(scriptURL, {scope, updateViaCache:'none'});
      updater?.setRegistration(registration);
      failure = false; watchWorker(registration.installing);
      registration.addEventListener('updatefound', () => { watchWorker(registration.installing); updateUI(); });
      await cacheStatus(); updateUI();
      try {
        const key='rally.update.reload.'+pageVersion;
        if (pageVersion && updateStorage?.getItem(key)) {
          updateStorage.removeItem(key); showToast('已自动更新到新版，欢迎回来。'); queueReleaseNotice();
        }
      } catch { /* A success notice is optional. */ }
    } catch { failure = true; updateUI(); }
  }
  async function checkForUpdates() {
    if (checking || matchActive) return;
    if (!supported) { showToast('当前浏览器或网址不支持自动检查更新，请联网后重新打开正式网址。'); return; }
    checking = true; updateUI();
    try {
      if (registration) { await registration.update(); await cacheStatus(failure); } else await register();
      showToast(registration?.waiting ? '新版已备好，空闲时将自动更新。'
        : registration?.installing ? '正在下载更新，请保持联网。'
        : failure ? '检查未完成，请联网后重试。' : '检查完成，未发现可用更新。');
    }
    catch { failure = !cached; showToast('暂时无法检查更新，请联网后重试'); }
    finally { checking = false; updateUI(); }
  }
  cornerCheck?.addEventListener('click', checkForUpdates);
  retryButton.addEventListener('click', checkForUpdates);
  window.addEventListener('online', updateUI); window.addEventListener('offline', updateUI);
  updateUI(); if (supported) register();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleReleaseNotice(); });
  return {setMatchActive(value) { matchActive = Boolean(value); if(matchActive && dialog.open)dialog.close(); updateUI(); if(!matchActive)scheduleReleaseNotice(); }, openInstall};
}
