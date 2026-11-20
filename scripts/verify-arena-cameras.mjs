import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createServer } from '../server/index.js';
import { projectRoot } from './build-pwa.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.RALLY_PLAYWRIGHT_MODULE || 'playwright');
const out = path.join(projectRoot, 'artifacts', 'arena-cameras');
await mkdir(out, {recursive: true});
const app = createServer();
await app.listen();
const browser = await chromium.launch({
  executablePath: process.env.RALLY_BROWSER_PATH, headless: true, args: ['--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
const errors = [], samples = [], framing = [];
page.on('pageerror', err => errors.push(err.message));

try {
  const html = await (await fetch(app.url)).text();
  // A deterministic renderer harness loads the exact modules and GLB served by the game.
  const map = html.match(/<script type="importmap">.*?<\/script>/s)[0];
  await page.route('**/camera-inspection', route => route.fulfill({contentType:'text/html',
    body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'+map+
      '<style>*{margin:0}canvas{display:block;width:100vw;height:100vh}.player-stamina-layer{display:none}</style><canvas></canvas>'}));
  await page.goto(app.url + '/camera-inspection');
  await page.evaluate(async () => {
    const THREE = await import('three');
    const { CourtView } = await import('/src/view.js');
    const { CAMERA_DEFAULTS, CAMERA_LIMITS } = await import('/src/camera-settings.js');
    const { createMatch } = await import('/shared/game.js');
    const view = new CourtView(document.querySelector('canvas'));
    await view.prepareTournament();
    view.setMode('match');
    if (!view.tournament) throw new Error('Tournament venue unavailable');
    const state = createMatch(), meshes = [];
    view.tournament.scene.traverseVisible(node => { if (node.isMesh) meshes.push(node); });
    const ray = new THREE.Raycaster(), direction = new THREE.Vector3();
    function inspect(phase) {
      const targets = [];
      if (phase === 'finale') {
        for (const x of [-.9,.9]) for (const h of [.1,1,2.03]) targets.push([x,h,3.4]);
      } else if (phase === 'entrance') {
        for (const z of [-4,0,4]) targets.push([0,1,z]);
      } else {
        for (const x of [-3.05,0,3.05]) for (const z of [-6.7,-3,0,3,6.7])
          for (const y of [.035,1.85]) targets.push([x,y,z]);
      }
      const obstructions = [], outside = [];
      if (phase === 'entrance' || phase === 'match') {
        // Near the edge of the image a stand can fill half the frame without
        // ever covering the centre line. Check the lens clearance there, too.
        for (const x of [-.94,0,.94]) for(const y of [-.9,0,.9]) {
          ray.setFromCamera({x,y},view.camera);
          ray.near=view.camera.near;ray.far=1.35;
          const hit=ray.intersectObjects(meshes,false)[0];
          if(hit)obstructions.push({ndc:[x,y],name:hit.object.name,distance:+hit.distance.toFixed(3)});
        }
      }
      for (const xyz of targets) {
        const position = new THREE.Vector3(...xyz);
        const ndc = position.clone().project(view.camera);
        if (phase !== 'entrance' && Math.max(Math.abs(ndc.x),Math.abs(ndc.y),Math.abs(ndc.z)) > 1.00001) outside.push(xyz);
        ray.set(view.camera.position,direction.subVectors(position, view.camera.position).normalize());
        ray.near = view.camera.near;
        ray.far = position.distanceTo(view.camera.position) - .04;
        const hit = ray.intersectObjects(meshes,false)[0];
        // Courtside equipment may cross a distant sightline during the opening sweep.
        // Grandstand surfaces or any geometry beside the lens would hide the action.
        if (hit && (phase !== 'entrance' || hit.distance < 2.5 || /terrace|audience|seat shells/i.test(hit.object.parent.name + hit.object.name))) {
          obstructions.push({xyz, name:hit.object.name, parent:hit.object.parent.name, distance:+hit.distance.toFixed(3)});
        }
      }
      return {camera:view.camera.position.toArray(), outside, obstructions};
    }
    const {pitchMin,pitchMax,zoomMin,zoomMax} = CAMERA_LIMITS;
    const settings = [CAMERA_DEFAULTS, ...[pitchMin,pitchMax].flatMap(pitchDegrees=>
      [zoomMin,zoomMax].map(zoom=>({pitchDegrees,zoom})))];
    window.probe = {
      resize(){view.resize();view.lobby.layoutCamera(innerWidth,innerHeight,false);},
      framing(side){
        view.updateCamera(side);
        const targets = [];
        for(const x of [-3.05,3.05]) for(const z of [-6.7,6.7]) {
          targets.push(new THREE.Vector3(x,.035,z),new THREE.Vector3(x,1.85,z));
        }
        let count=0, worst=0;
        for(let pitchDegrees=pitchMin;pitchDegrees<=pitchMax;pitchDegrees++){
          for(let percent=Math.round(zoomMin*100);percent<=Math.round(zoomMax*100);percent++){
            view.setCameraSettings({pitchDegrees,zoom:percent/100});
            for(const v of targets){
              const projected=v.clone().project(view.camera);
              worst=Math.max(worst,Math.abs(projected.x),Math.abs(projected.y));
            }
            count++;
          }
        }
        return {count,worst};
      },
      match(side,i){
        view.entrance.cancel(); view.entranceFrom=null;
        view.setCameraSettings(settings[i]);view.render(state,side);
        return {...inspect('match'),settings:settings[i]};
      },
      opening(side,i,progress){
        if(progress===0){view.setCameraSettings(settings[i]);view.beginMatchEntrance({side});}
        view.entrance.progress=progress;view.render(state,side);
        return inspect('entrance');
      },
      finale(side){view.render(state,side,1/60,{finale:{winner:side,loser:1-side,age:1.3}});
        return inspect('finale');},
    };
  });
  for (const [width,height] of [[844,390],[667,320],[1280,720],[390,844]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(()=>window.probe.resize());
    for (const side of [0,1]) {
      framing.push({width,height,side,...await page.evaluate(s=>window.probe.framing(s),side)});
      for (let preset=0;preset<5;preset++) {
        const result = await page.evaluate(([s,i])=>window.probe.match(s,i),[side,preset]);
        samples.push({width,height,side,preset,phase:'match',...result});
        if (width===667 && [1,4].includes(preset)) await page.screenshot({path:path.join(out,`match-${side}-${preset}.png`)});
      }
      for (const preset of [1,4]) for (let step=0;step<=36;step++) {
        const fraction=step/36;
        const result = await page.evaluate(([s,i,t])=>window.probe.opening(s,i,t),[side,preset,fraction]);
        samples.push({width,height,side,preset,fraction,phase:'entrance',...result});
        if(width===667 && preset===1 && [0,15,27].includes(step)) await page.screenshot({path:path.join(out,`opening-${side}-${step}.png`)});
        if(width===390 && side===1 && preset===1 && step===18) await page.screenshot({path:path.join(out,'reverse-mid-orbit.png')});
      }
      const result = await page.evaluate(s=>window.probe.finale(s),side);
      samples.push({width,height,side,phase:'finale',...result});
      if(width===667)await page.screenshot({path:path.join(out,`finale-${side}.png`)});
    }
  }
  await writeFile(path.join(out,'report.json'),JSON.stringify({errors,framing,samples},null,2));
  const failed=samples.filter(s=>s.obstructions.length||s.outside.length);
  console.log(`${samples.length} views checked, ${failed.length} obstructed or cropped`);
  console.log(`${framing.reduce((total,f)=>total+f.count,0)} combinations of pitch, zoom, viewport and side checked`);
  assert.ok(framing.every(f=>f.worst<=1.00001),'Court or athlete is cropped at a supported camera setting');
  assert.deepEqual(errors,[]);
  assert.equal(failed.length,0,JSON.stringify(failed.slice(0,3)));
} finally {
  await browser.close(); await app.close();
}
