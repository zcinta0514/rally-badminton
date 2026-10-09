import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const base=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(base,'../../..');
const baseline=path.join(root,'artifacts/rig-refine/20261008');
const frames=path.join(root,'artifacts/match-reference/20261006/lift-frames');
const assets=new Map(), hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const add=(url,file,required=true)=>{if(fs.existsSync(file))assets.set(url,fs.readFileSync(file));else if(required)throw Error(`Missing ${file}. Run the reproduction commands in README.md first.`);};
add('/',path.join(base,'preview.html'));
add('/match-rebuild.glb',path.join(base,'final-export/clear.glb'));
add('/baseline.glb',path.join(baseline,'final-export/clear.glb'),false);
add('/match-authoring.blend',path.join(base,'final/rebuild.blend'));
add('/runtime-morph-stream.js',path.join(base,'morph-stream.mjs'));
add('/flight.json',path.join(base,'flight/final/flight.json'));
add('/flight-runtime.mjs',path.join(base,'flight/runtime.mjs'));
add('/flight-view.mjs',path.join(base,'flight-view.mjs'));
add('/reference-camera.json',path.join(base,'reference-camera.json'));
add('/normal-speed-comparison.mp4',path.join(base,'normal-speed-comparison.mp4'),false);
for(let i=480;i<=540;i++)add(`/reference-frames/${i}.jpg`.replace(/\/(\d{3})\.jpg$/,'/0$1.jpg'),path.join(frames,`${String(i).padStart(4,'0')}.jpg`),false);
for(const f of ['three.module.js','three.core.js'])add('/vendor/'+f,path.join(root,'node_modules/three/build',f));
for(const f of ['loaders/GLTFLoader.js','utils/BufferGeometryUtils.js','utils/SkeletonUtils.js','controls/OrbitControls.js'])add('/vendor/addons/'+f,path.join(root,'node_modules/three/examples/jsm',f));
const flight=JSON.parse(assets.get('/flight.json'));
const config=JSON.parse(fs.readFileSync(path.join(base,'review-config.json')));
if(hash(assets.get('/match-rebuild.glb'))!==config.expectedModelHash)throw Error('Model/config SHA256 mismatch');
if(flight.glbSHA256!==config.expectedModelHash)throw Error('Flight/model SHA256 mismatch');
config.flightURL='/flight.json';config.expectedFlightHash=hash(assets.get('/flight.json'));
config.referenceAvailable=Array.from({length:61},(_,i)=>`/reference-frames/${String(i+480).padStart(4,'0')}.jpg`).every(k=>assets.has(k));
config.videoAvailable=assets.has('/normal-speed-comparison.mp4');
config.beforeRebuildURL=assets.has('/baseline.glb')?'/?version=baseline':null;
assets.set('/review-config.json',Buffer.from(JSON.stringify(config,null,2)));
if(assets.has('/baseline.glb'))assets.set('/baseline-config.json',Buffer.from(JSON.stringify({...config,modelURL:'/baseline.glb',expectedModelHash:hash(assets.get('/baseline.glb')),flightURL:null,expectedFlightHash:null,buildLabel:'起步修改前 · 对照',beforeRebuildURL:'/',qaNotes:['这是2026-10-08候选，保留作本輪动作修改前对照。', '专业姿态还原未通过；新球路未校准。']},null,2)));
const manifest=Object.fromEntries([...assets].map(([url,b])=>[url,hash(b)]));
fs.writeFileSync(path.join(base,'served-hashes.json'),JSON.stringify(manifest,null,2)+'\n');
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost').pathname,b=assets.get(url);
 if(!b){res.writeHead(404);res.end('Resource not included in this review bundle.');return;}
 const mime=url.endsWith('.jpg')?'image/jpeg':url.endsWith('.mp4')?'video/mp4':url==='/'?'text/html; charset=utf-8':(url.endsWith('.js')||url.endsWith('.mjs'))?'text/javascript':url.endsWith('.json')?'application/json':url.endsWith('.blend')?'application/octet-stream':'model/gltf-binary';
 const headers={'Content-Type':mime,'Cache-Control':'no-store','Accept-Ranges':'bytes'};
 if(req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!match){res.writeHead(416);res.end();return;}const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),b.length-1):b.length-1;if(start>end||start>=b.length){res.writeHead(416,{'Content-Range':`bytes */${b.length}`});res.end();return;}res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${b.length}`,'Content-Length':end-start+1});res.end(b.subarray(start,end+1));return;}
 res.writeHead(200,{...headers,'Content-Length':b.length});res.end(b);
}).listen(Number(process.argv[2]||3040),'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${process.argv[2]||3040}/`,root,base,modelHash:config.expectedModelHash,referenceAvailable:config.referenceAvailable})));
