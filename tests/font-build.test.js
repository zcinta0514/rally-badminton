import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPwaBuild } from '../scripts/build-pwa.js';
import { createServer } from '../server/index.js';

test('both deployment paths include licensed self-hosted fonts in the offline inventory',async()=>{
  for(const basePath of ['/','/rally-badminton/']) {
    const build=await createPwaBuild({basePath});
    let bytes=0;
    for(const name of ['rally-ui.woff2','rally-display.woff2']) {
      const url=basePath+'src/fonts/'+name,asset=build.assets.get(url);
      assert.ok(asset, name+' must be served and available offline');
      assert.equal(asset.subarray(0,4).toString(),'wOF2');bytes+=asset.length;
      assert.equal(build.inventory.find(item=>item.url===url).hash,createHash('sha256').update(asset).digest('hex'));
    }
    assert.ok(bytes<800_000,'subset fonts must not ship the 17MB source font');
    for(const name of ['LICENSE-NotoSansSC.txt','LICENSE-SmileySans.txt'])
      assert.match(build.assets.get(basePath+'src/fonts/'+name)?.toString() || '',/SIL OPEN FONT LICENSE/);
    assert.match(build.assets.get(basePath+'src/fonts/NOTICE.txt')?.toString() || '',/Rally Display/);
  }
});

test('local preview serves font files with the font MIME type',async()=>{
  const app=createServer({port:0,host:'127.0.0.1'});
  await app.listen();
  try {
    const response=await fetch(app.url+'/src/fonts/rally-ui.woff2');
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/^font\/woff2/);
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,4).toString(),'wOF2');
  } finally {await app.close();}
});
