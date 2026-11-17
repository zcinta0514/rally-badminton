import test from 'node:test';
import assert from 'node:assert/strict';

test('client endpoint follows HTTPS, accepts explicit WSS and rejects mixed content and credentials', async () => {
  const {getWebSocketURL} = await import('../src/pwa.js');
  assert.equal(getWebSocketURL({href:'http://192.0.2.10:3000/'}, {}), 'ws://192.0.2.10:3000/ws');
  assert.equal(getWebSocketURL({href:'https://play.example/'}, {}), 'wss://play.example/ws');
  assert.equal(getWebSocketURL({href:'https://play.example/'}, {wsUrl:'wss://server.example/ws'}), 'wss://server.example/ws');
  assert.throws(() => getWebSocketURL({href:'https://play.example/'}, {wsUrl:'ws://server.example/ws'}), /HTTPS/);
  assert.throws(() => getWebSocketURL({href:'https://play.example/'}, {wsUrl:'wss://user:secret@server.example/ws'}), /联机地址/);
});
test('fullscreen action reflects actual capability and standalone state', async () => {
  const {displayAction} = await import('../src/pwa.js');
  assert.equal(displayAction({standalone:false, fullscreenEnabled:false, canRequest:true}), 'install');
  assert.equal(displayAction({standalone:false, fullscreenEnabled:true, canRequest:false}), 'install');
  assert.equal(displayAction({standalone:false, fullscreenEnabled:true, canRequest:true}), 'fullscreen');
  assert.equal(displayAction({standalone:true, fullscreenEnabled:true, canRequest:true}), 'standalone');
});
test('worker registration resolves from its module location within the project and demo mode refuses networking', async () => {
  const pwa=await import('../src/pwa.js');
  assert.equal(typeof pwa.getPwaRegistrationURLs,'function');
  assert.deepEqual(pwa.getPwaRegistrationURLs('https://player.example/rally-badminton/src/pwa.js'),{
    scriptURL:'https://player.example/rally-badminton/sw.js',scope:'/rally-badminton/'
  });
  assert.deepEqual(pwa.getPwaRegistrationURLs('https://player.example/src/pwa.js'),{
    scriptURL:'https://player.example/sw.js',scope:'/'
  });
  assert.throws(()=>pwa.getWebSocketURL({href:'https://player.example/rally-badminton/'},{demoMode:true}),/人机/);
});

test('install guide separates platform instructions from browser install capability', async () => {
  const {getInstallGuide} = await import('../src/pwa.js');
  const ios = getInstallGuide({isIOS:true,canPrompt:true});
  assert.equal(ios.canInstall,false);
  assert.match(ios.steps.join(' '),/Safari.*分享.*添加到主屏幕/);
  const wechat = getInstallGuide({inWeChat:true,canPrompt:true});
  assert.equal(wechat.canInstall,false);
  assert.match(wechat.steps[0],/系统浏览器/);
  assert.doesNotMatch(wechat.steps.join(' '),/Safari/);
  const android = getInstallGuide({canPrompt:true});
  assert.equal(android.canInstall,true);
  assert.match(android.steps[0],/安装到手机/);
  const fallback = getInstallGuide({});
  assert.equal(fallback.canInstall,false);
  assert.match(fallback.steps.join(' '),/浏览器.*菜单/);
  const installed = getInstallGuide({standalone:true,canPrompt:true,isIOS:true});
  assert.equal(installed.canInstall,false);
  assert.deepEqual(installed.steps,[]);
});
