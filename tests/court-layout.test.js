import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CourtView } from '../src/view.js';
import { COURT } from '../shared/game.js';
import { fitCourtViewport, projectCourtPoint, screenToCourt, getShuttleEdgeHint } from '../src/court-layout.js';

test('both players face a level net and a vertically centred court, never a diagonal court',()=>{
  for(const side of [0,1])for(const [width,height] of [[667,320],[844,390],[1280,720]]){
    const fit=fitCourtViewport(width,height,side);
    const netLeft=projectCourtPoint({x:-3.23,y:1.52,z:0},fit);
    const netRight=projectCourtPoint({x:3.23,y:1.52,z:0},fit);
    assert.ok(Math.abs(netLeft.y-netRight.y)<1e-8,'net must be horizontal');
    for(const z of [-6.7,0,6.7]){
      const middle=projectCourtPoint({x:0,y:0,z},fit);
      assert.ok(Math.abs(middle.x-width/2)<1e-8,'court centre must stay centred');
      const left=projectCourtPoint({x:-2.59,y:0,z},fit),right=projectCourtPoint({x:2.59,y:0,z},fit);
      assert.ok(Math.abs(left.y-right.y)<1e-8,'baselines must be horizontal');
    }
    const local=projectCourtPoint({x:0,y:0,z:side===0?3.8:-3.8},fit);
    const opponent=projectCourtPoint({x:0,y:0,z:side===0?-3.8:3.8},fit);
    assert.ok(local.y>opponent.y,'own player stays below the opponent');
  }
});

for (const [width, height] of [[667, 320], [844, 390], [1280, 720], [390, 844]]) {
  for (const side of [0, 1]) test(`complete court and athlete heads fit ${width}×${height}, side ${side}`, () => {
    const fit = fitCourtViewport(width, height, side);
    for (const x of [-3.25, 3.25]) for (const z of [-6.7, 6.7]) {
      const screen = projectCourtPoint({x, y: 0, z}, fit);
      assert.ok(screen.x >= 10 && screen.x <= width - 10, JSON.stringify(screen));
      assert.ok(screen.y >= fit.top && screen.y <= height - fit.bottom, JSON.stringify(screen));
    }
    for (const x of [-2.43, 2.43]) for (const z of [-6.5, 6.5]) {
      const screen = projectCourtPoint({x, y: 1.9, z}, fit);
      assert.ok(screen.y >= fit.top && screen.y <= height - fit.bottom, JSON.stringify(screen));
    }
    if (width > height) {
      for(const z of [-3.8,3.8]){
        const foot=projectCourtPoint({x:0,y:0,z},fit),head=projectCourtPoint({x:0,y:1.85,z},fit);
        assert.ok(foot.y-head.y>38,'both players must remain readable');
      }
      const near=projectCourtPoint({x:0,y:0,z:6.7},fit),far=projectCourtPoint({x:0,y:0,z:-6.7},fit);
      assert.ok(Math.abs(near.y-far.y)>100,'court keeps visible depth');
    }
  });
}

test('screen directions project correctly for both court sides without axis stretching', () => {
  for (const side of [0, 1]) {
    const fit = fitCourtViewport(844, 390, side);
    const center = projectCourtPoint({x:0,y:0,z:0}, fit);
    const right = screenToCourt({x:1,z:0},side);
    const down = screenToCourt({x:0,z:1},side);
    const sr = projectCourtPoint({...right,y:0},fit), sd = projectCourtPoint({...down,y:0},fit);
    assert.ok(sr.x > center.x);
    assert.ok(Math.abs(sr.y-center.y) < 1e-8);
    assert.ok(sd.y > center.y);
    assert.ok(Math.abs(sd.x-center.x) < 1e-8);
    assert.ok(Math.abs(Math.hypot(right.x,right.z)-1)<1e-10);
    assert.ok(Math.abs(Math.hypot(down.x,down.z)-1)<1e-10);
    assert.ok(Math.abs(right.x*down.x+right.z*down.z)<1e-10);
  }
});

test('actual CourtView camera projection matches the fitted layout for every boundary',()=>{
  for(const [width,height]of [[667,320],[844,390],[1280,720]])for(const side of [0,1]){
    const view={width,height,camera:new THREE.PerspectiveCamera(45,1,.1,100)};
    CourtView.prototype.updateCamera.call(view,side);
    for(const x of [-3.05,3.05])for(const z of [-6.7,6.7]){
      const actual=new THREE.Vector3(x,0,z).project(view.camera),expected=projectCourtPoint({x,y:0,z},view.layout);
      assert.ok(Math.abs((actual.x*.5+.5)*width-expected.x)<1e-8);
      assert.ok(Math.abs((.5-actual.y*.5)*height-expected.y)<1e-8);
    }
    const ball={x:1,y:4,z:-2};
    const actual=new THREE.Vector3(ball.x,ball.y,ball.z).project(view.camera),expected=projectCourtPoint(ball,view.layout);
    assert.ok(Math.abs((actual.x*.5+.5)*width-expected.x)<1e-8);
    assert.ok(Math.abs((.5-actual.y*.5)*height-expected.y)<1e-8);
  }
});

test('a truly offscreen high shuttle gets a bounded indicator based on its actual projection',()=>{
  for(const [width,height]of [[667,320],[844,390],[1280,720]])for(const side of [0,1]){
    const fit=fitCourtViewport(width,height,side),ball={x:0,y:10,z:0};
    const raw=projectCourtPoint(ball,fit),hint=getShuttleEdgeHint(ball,fit);
    assert.ok(raw.y<0);
    assert.equal(hint.reason,'offscreen');
    assert.equal(hint.arrow,'↑');
    assert.equal(hint.height,10);
    assert.ok(hint.x>=70&&hint.x<=width-70);
    assert.ok(hint.y>=58&&hint.y<=height-42);
    assert.deepEqual(hint.projected,raw);
    assert.equal(getShuttleEdgeHint({x:0,y:1,z:0},fit),null);
  }
});

test('HUD occlusion is distinguished from a shuttle outside the viewport',()=>{
  const fit=fitCourtViewport(844,390,0),ball={x:0,y:4.5,z:0};
  const projected=projectCourtPoint(ball,fit);
  assert.ok(projected.y>0);
  const hint=getShuttleEdgeHint(ball,fit,{hud:{left:245,right:599,top:7,bottom:86}});
  assert.equal(hint.reason,'hud');
  assert.ok(hint.y>86);
});

test('a side scoreboard leaves the central high-shuttle indicator at its normal height',()=>{
  for(const [width,height] of [[667,320],[844,390],[1280,720]]){
    const fit=fitCourtViewport(width,height),ball={x:0,y:10,z:0};
    const normal=getShuttleEdgeHint(ball,fit);
    const beside=getShuttleEdgeHint(ball,fit,{hud:{left:16,right:154,top:48,bottom:154}});
    assert.equal(beside.x,normal.x);
    assert.equal(beside.y,normal.y,'the side HUD must not push a central indicator down into the court');
  }
});

test('an edge indicator beside the scoreboard clears its full label width',()=>{
  const fit=fitCourtViewport(844,390),ball={x:-10,y:10,z:0};
  const hud={left:16,right:154,top:48,bottom:154};
  const hint=getShuttleEdgeHint(ball,fit,{hud});
  assert.ok(hint.x-78<hud.right);
  assert.ok(hint.y>=hud.bottom+18);
});

test('painted singles boundary outer edges coincide with rule boundaries',()=>{
  const view={scene:new THREE.Scene()};CourtView.prototype.makeCourt.call(view);
  const boxes=view.scene.children.filter(m=>m.geometry?.type==='BoxGeometry');
  const sideLines=boxes.filter(m=>Math.abs(Math.abs(m.position.x)-COURT.halfWidth)<.04&&m.geometry.parameters.depth>13);
  const baseLines=boxes.filter(m=>Math.abs(Math.abs(m.position.z)-COURT.halfLength)<.04&&m.geometry.parameters.width>5);
  assert.equal(sideLines.length,2);assert.equal(baseLines.length,2);
  for(const line of sideLines)assert.ok(Math.abs(Math.abs(line.position.x)+line.geometry.parameters.width/2-COURT.halfWidth)<1e-8);
  for(const line of baseLines)assert.ok(Math.abs(Math.abs(line.position.z)+line.geometry.parameters.depth/2-COURT.halfLength)<1e-8);
});
