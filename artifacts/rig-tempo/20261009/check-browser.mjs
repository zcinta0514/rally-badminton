import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.RALLY_PLAYWRIGHT_MODULE||'playwright');
const base=path.dirname(fileURLToPath(import.meta.url));
const url=process.argv[2]||'http://127.0.0.1:3040/';
const sha=b=>createHash('sha256').update(b).digest('hex');
const output=path.join(base,'browser');await fs.mkdir(output,{recursive:true});
const errors=[], checks=[], responses=new Map();
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error'&&!e.text().includes('favicon'))errors.push(e.text());});
  await page.goto(url);
  await page.waitForFunction(()=>window.matchReview?.ready||window.matchReview?.errors?.length,{timeout:90000});
  assert.equal(await page.evaluate(()=>matchReview.ready),true,JSON.stringify(await page.evaluate(()=>matchReview.errors)));
  await page.evaluate(()=>matchReview.pause());
  const meta=await page.evaluate(()=>({hashes:matchReview.hashes,frames:matchReview.referenceFramesLoaded,viewport:[innerWidth,innerHeight],serviceWorker:navigator.serviceWorker.controller?.scriptURL??null,flight:matchReview.flight,bodyDuration:matchReview.bodyDuration,duration:matchReview.duration,userAgent:navigator.userAgent}));
  const manifest=JSON.parse(await fs.readFile(path.join(base,'served-hashes.json')));
  assert.equal(meta.hashes.model,manifest['/match-rebuild.glb']);assert.equal(meta.hashes.flight,manifest['/flight.json']);
  assert.equal(meta.serviceWorker,null);assert.equal(meta.frames,61);assert.equal(meta.duration,2.4);
  for(const [route,wanted] of Object.entries(manifest)) {
    const r=await page.request.get(new URL(route,url).href);assert.equal(r.status(),200,route);
    const got=sha(await r.body());assert.equal(got,wanted,route);responses.set(route,got);
  }
  const samples=await page.evaluate(()=>Array.from({length:61},(_,i)=>matchReview.sample(i/25)));
  samples.forEach((s,i)=>assert.equal(s.sourceFrame,480+i));
  const repeat=await page.evaluate(()=>{const before=matchReview.sample(.28);matchReview.sample(2);matchReview.sample(0);return {before,after:matchReview.sample(.28)};});
  assert.deepEqual(repeat.before,repeat.after);
  await page.getByRole('button',{name:'起步 487',exact:true}).click();assert.equal(await page.evaluate(()=>matchReview.sourceFrame),487);
  await page.getByRole('button',{name:'触球',exact:true}).click();
  const hit=await page.evaluate(()=>matchReview.sample(matchReview.flight.hitTime));
  assert.ok(hit.shuttle.visible);assert.ok(hit.shuttle.p.every(Number.isFinite));
  const hidden=await page.evaluate(()=>matchReview.sample(2.4));assert.equal(hidden.shuttle.visible,false);
  await page.getByLabel('推算未截击落点',{exact:true}).check();
  const extra=await page.evaluate(()=>matchReview.sample(matchReview.flight.duration));assert.ok(extra.time>=2.4);
  const bodyEnd=await page.evaluate(()=>{const a=matchReview.sample(2.4),b=matchReview.sample(matchReview.duration);return {a:a.pelvis,b:b.pelvis};});assert.deepEqual(bodyEnd.a,bodyEnd.b);
  await page.getByLabel('推算未截击落点',{exact:true}).uncheck();
  assert.equal(await page.evaluate(()=>matchReview.duration),2.4);
  const shots=[];
  for(const view of ['front','three','side','back','wrist','contact','hip','feet','broadcast','court']) {
    await page.evaluate(v=>{matchReview.setView(v);matchReview.sample(matchReview.flight.hitTime);},view);
    const name=`contact-${view}.png`;await page.locator('#stage').screenshot({path:path.join(output,name)});shots.push(name);
  }
  await fs.mkdir(path.join(output,'comparison'),{recursive:true});
  await page.evaluate(()=>matchReview.setView('broadcast'));
  for(let i=0;i<=60;i++) {
    const data=await page.evaluate(t=>{matchReview.sample(t);return matchReview.captureComparison();},i/25);
    await fs.writeFile(path.join(output,'comparison',`${String(i).padStart(4,'0')}.jpg`),Buffer.from(data.split(',')[1],'base64'));
  }
  const playback=await page.evaluate(()=>new Promise(resolve=>{matchReview.setView('three');matchReview.setSpeed(1);matchReview.sample(0);matchReview.play();const start=performance.now(),first=matchReview.time,rendered=matchReview.rendered;setTimeout(()=>{matchReview.pause();resolve({wallSeconds:(performance.now()-start)/1000,advanced:matchReview.time-first,renders:matchReview.rendered-rendered});},1000);}));
  assert.ok(Math.abs(playback.advanced-playback.wallSeconds)<.12,JSON.stringify(playback));
  await page.evaluate(()=>matchReview.sample(.28));await page.screenshot({path:path.join(output,'page.png'),fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>matchReview.errors),[]);
  checks.push('All HTTP and loaded model/flight/reference hashes','61 source frame mapping','Repeat seeking without state leaks','Start and contact buttons','Default hides unmodelled opponent contact','Explicit unreturned flight extension','Body/reference freeze at 2.4 seconds','Ten view APIs','One-times playback clock');
  const report={passed:true,url,meta,resources:Object.fromEntries(responses),checks,samples,hit,hidden,extra,bodyEnd,playback,shots,errors,limits:'Headless desktop browser at 1440×1080; not phone performance, visible Cindy sidebar FPS, or user naturalness acceptance.'};
  await fs.writeFile(path.join(base,'browser-qa.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,resources:responses.size,sourceFrames:61,views:shots.length,playback,errors}));
} finally {await browser.close();}
