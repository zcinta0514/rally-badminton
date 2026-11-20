import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from '../server/index.js';

const {chromium} = createRequire(import.meta.url)(process.env.RALLY_PLAYWRIGHT_MODULE || 'playwright');
const app = createServer();
await app.listen();
const browser = await chromium.launch({executablePath:process.env.RALLY_BROWSER_PATH, args:['--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage();
  const map = (await (await fetch(app.url)).text()).match(/<script type="importmap">.*?<\/script>/s)[0];
  await page.route('**/follow-check', route => route.fulfill({contentType:'text/html',body:map+'<style>*{margin:0}canvas{width:100vw;height:100vh}</style><canvas></canvas>'}));
  await page.goto(app.url+'/follow-check');
  await page.evaluate(async()=>{
    const THREE = await import('three');
    const {CourtView} = await import('/src/view.js');
    const {createMatch} = await import('/shared/game.js');
    const view = new CourtView(document.querySelector('canvas'));
    await view.prepareTournament();
    const state = createMatch();
    state.phase='rally';
    window.check = (mode,side,pitchDegrees)=>{
      view.setMode(mode);
      view.resize();
      view.setCameraSettings({mode:'follow',distance:11,pitchDegrees});
      const venue = mode==='training'?view.trainingHall.group:view.tournament.scene;
      const meshes=[];
      venue.traverseVisible(n=>{if(n.isMesh)meshes.push(n);});
      const ray = new THREE.Raycaster(), target = new THREE.Vector3(), sign=side?-1:1;
      let clippingEnabled;
      view.scene.onBeforeRender = renderer => { clippingEnabled = renderer.localClippingEnabled; };
      const blocked = new Set();
      for(let frame=0;frame<=32;frame++){
        const t=frame/32;
        Object.assign(state.players[side],{x:2.5*Math.sin(Math.PI*t),z:sign*(3+3*t)});
        Object.assign(state.shuttle,{x:0,y:1+7*Math.sin(Math.PI*t),z:sign*(-5+11*t),active:true});
        state.time+=1/30;
        view.render(state,side,1/30);
        for(const p of [new THREE.Vector3(-.85,.7,.99).unproject(view.camera),new THREE.Vector3(.85,.7,.99).unproject(view.camera),state.shuttle,{x:0,y:1,z:state.players[side].z},{x:0,y:1,z:0}]){
          target.set(p.x,p.y,p.z);
          ray.set(view.camera.position,target.clone().sub(view.camera.position).normalize());
          ray.near=view.camera.near;ray.far=Math.min(target.distanceTo(view.camera.position)-.05,p.isVector3?2:Infinity);
          for(const hit of ray.intersectObjects(meshes,false)){
            const planes=clippingEnabled ? hit.object.material.clippingPlanes||[] : [];
            if(planes.every(plane=>plane.distanceToPoint(hit.point)>=0))blocked.add(hit.object.name||hit.object.parent.name);
          }
        }
      }
      return [...blocked];
    };
  });
  const results=[];
  for(const [width,height] of [[667,320],[844,390]]){
    await page.setViewportSize({width,height});
    for(const mode of ['match','training'])for(const side of [0,1])for(const pitch of [18,24,40]){
      const blocked=await page.evaluate(([m,s,p])=>window.check(m,s,p),[mode,side,pitch]);
      results.push({width,height,mode,side,pitch,blocked});
    }
  }
  console.log(JSON.stringify(results));
  assert.ok(results.every(r=>!r.blocked.length));
} finally {await browser.close();await app.close();}
