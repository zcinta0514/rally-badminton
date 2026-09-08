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
