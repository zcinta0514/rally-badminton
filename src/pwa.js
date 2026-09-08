export function getWebSocketURL(page = globalThis.location, config = globalThis.RALLY_CONFIG || {}) {
  if (config.demoMode === true) throw new Error('此入口仅提供人机试玩，不提供联机与排行榜');
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

export function initPWA({ fullscreenButton, showToast = () => {} } = {}) {
  const demoMode = globalThis.RALLY_CONFIG?.demoMode === true;
  let matchActive = false, registration = null, installPrompt = null, cached = false, version = '', failure = false, checking = false;
  const supported = globalThis.isSecureContext && 'serviceWorker' in navigator;
  const standaloneQuery = matchMedia('(display-mode: standalone)');
  const isStandalone = () => standaloneQuery.matches || navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const inWeChat = /MicroMessenger/i.test(navigator.userAgent);
  const entry = document.createElement('button');
  entry.id = 'install-app'; entry.className = 'pwa-entry'; entry.type = 'button';
  entry.innerHTML = '<span>主屏幕版 <b aria-hidden="true">↗</b></span><small id="pwa-status" role="status" aria-live="polite"></small>';
  const menu = document.getElementById('menu');
  menu?.insertBefore(entry, menu.querySelector('.menu-foot'));
  const status = entry.querySelector('#pwa-status');
  const dialog = document.createElement('dialog');
  dialog.id = 'pwa-dialog'; dialog.className = 'pwa-dialog'; dialog.setAttribute('aria-labelledby', 'pwa-title');
  dialog.innerHTML = '<button type="button" class="pwa-close" aria-label="关闭主屏幕说明">×</button><small class="pwa-eyebrow">开拍 / RALLY</small><h2 id="pwa-title">从主屏幕开拍</h2><p id="pwa-intro"></p><ol id="pwa-steps"></ol><p class="pwa-note">把手机手动横置，并关闭系统竖排方向锁定。独立窗口可去掉普通浏览器地址栏和工具栏；方向锁定、通知与系统手势仍由设备控制。</p><p id="pwa-cache-detail" class="pwa-cache-detail" role="status" aria-live="polite"></p><div class="pwa-actions"><button id="pwa-install" type="button">添加到主屏幕</button><button id="pwa-check" type="button">检查更新</button></div>';
  document.body.append(dialog);
  const detail = dialog.querySelector('#pwa-cache-detail'), nativeInstall = dialog.querySelector('#pwa-install'), checkButton = dialog.querySelector('#pwa-check');
  const action = () => displayAction({standalone:isStandalone(), fullscreenEnabled:document.fullscreenEnabled, canRequest:typeof document.documentElement.requestFullscreen === 'function'});
  const close = () => { dialog.close(); entry.focus({preventScroll:true}); };
  dialog.querySelector('.pwa-close').addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) { const rect=dialog.getBoundingClientRect(); if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close(); } });
  function updateUI() {
    let short, long;
    if (!globalThis.isSecureContext) {
      short = '当前网址可玩 · 离线需 HTTPS';
      long = '当前是普通 HTTP 网址，可以在线游玩和添加快捷入口，但不能准备离线缓存。完整离线主屏幕版需要可信的 HTTPS 网址。';
    } else if (!supported) {
      short = '此浏览器未提供离线缓存'; long = '此浏览器未提供离线缓存能力。可继续在线游玩；iPhone 建议用 Safari 打开。';
    } else if (registration?.waiting) {
      short = '新版已备好 · 退出后更新';
      long = '新版资源已下载。请结束比赛，关闭所有开拍浏览器标签页和主屏幕窗口，再重新打开；系统会启用新版。当前比赛不会刷新，单独刷新一个标签页可能仍是旧版。';
    } else if (cached) {
      short = navigator.onLine ? '离线人机已就绪' : '当前离线 · 可人机开打';
      long = `本机离线资源已备好${version ? '（' + version.slice(0,8) + '）' : ''}。断网后仍可从同一网址或主屏幕进入人机。${demoMode ? '此入口仅提供人机试玩，不含联机和排行榜。' : '好友对打需要连接比赛服务器。'}浏览器清理存储后需重新联网下载。`;
    } else if (failure) {
      short = '离线资源未就绪 · 点击重试'; long = '离线资源尚未完整下载，当前可继续在线玩。联网后点击“重试缓存”；若服务器已更新，请关闭全部开拍窗口再重新打开。';
    } else {
      short = '正在准备离线人机…'; long = '首次打开需要联网下载完整游戏资源。请等到“离线人机已就绪”再断网。';
    }
    status.textContent = short; detail.textContent = long;
    entry.setAttribute('aria-label', `主屏幕安装与更新：${short}`);
    nativeInstall.hidden = !installPrompt || isStandalone();
    checkButton.hidden = !supported; checkButton.disabled = checking || matchActive;
    checkButton.textContent = checking ? '检查中…' : failure ? '重试缓存' : '检查更新';
    if (fullscreenButton) {
      const label = document.fullscreenElement ? '退出全屏' : action() === 'fullscreen' ? '全屏' : action() === 'standalone' ? '独立窗口说明' : '主屏幕安装说明';
      fullscreenButton.title = label; fullscreenButton.setAttribute('aria-label', label);
    }
  }
  function openInstall() {
    if (matchActive) { showToast(isStandalone() ? '已在独立窗口中；请手动横置手机' : '主屏幕安装说明在首页；请先结束本场比赛'); return; }
    dialog.querySelector('#pwa-title').textContent = isStandalone() ? '已从主屏幕打开' : '从主屏幕开拍';
    dialog.querySelector('#pwa-intro').textContent = isStandalone() ? '当前以独立窗口运行。' : inWeChat ? '先在微信右上角菜单选择用 Safari 打开此网页，再按下面步骤操作。' : '添加后，从手机主屏幕的“开拍”图标进入。';
    const steps = dialog.querySelector('#pwa-steps'); steps.replaceChildren();
    const lines = isStandalone() ? [] : isIOS || inWeChat ? ['在 Safari 打开此游戏，轻点分享（或“更多”→分享）。','选择“添加到主屏幕”。','如显示“作为网页 App 打开”，将它启用，再轻点“添加”。'] : ['使用浏览器的“安装应用”或“添加到主屏幕”菜单。','安装后从“开拍”图标打开。浏览器未提供安装时，可以继续在网页中游玩。'];
    for (const line of lines) { const li = document.createElement('li'); li.textContent = line; steps.append(li); }
    updateUI(); if (!dialog.open) dialog.showModal();
  }
  entry.addEventListener('click', openInstall);
  fullscreenButton?.addEventListener('click', async () => {
    if (action() !== 'fullscreen' && !document.fullscreenElement) { openInstall(); return; }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen();
        try { await screen.orientation?.lock?.('landscape'); } catch { /* Manual rotation remains supported. */ }
      }
    } catch { showToast('浏览器未允许全屏；可在首页查看主屏幕安装说明，手机请手动横置'); }
    updateUI();
  });
  document.addEventListener('fullscreenchange', updateUI);
  standaloneQuery.addEventListener?.('change', updateUI);
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; updateUI(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; updateUI(); });
  nativeInstall.addEventListener('click', async () => {
    const prompt = installPrompt; if (!prompt) return;
    installPrompt = null;
    try { await prompt.prompt(); await prompt.userChoice; } catch { showToast('请使用浏览器菜单添加到主屏幕'); }
    updateUI();
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
      failure = false; watchWorker(registration.installing);
      registration.addEventListener('updatefound', () => { watchWorker(registration.installing); updateUI(); });
      await cacheStatus(); updateUI();
    } catch { failure = true; updateUI(); }
  }
  checkButton.addEventListener('click', async () => {
    if (checking || matchActive) return;
    checking = true; updateUI();
    try { if (registration) { await registration.update(); await cacheStatus(failure); } else await register(); }
    catch { failure = !cached; showToast('暂时无法检查更新，请联网后重试'); }
    finally { checking = false; updateUI(); }
  });
  window.addEventListener('online', updateUI); window.addEventListener('offline', updateUI);
  updateUI(); if (supported) register();
  return {setMatchActive(value) { matchActive = Boolean(value); if(matchActive && dialog.open)dialog.close(); updateUI(); }, openInstall};
}
