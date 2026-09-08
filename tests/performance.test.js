import test from 'node:test';
import assert from 'node:assert/strict';
import {PerformanceMonitor} from '../src/performance.js';

function record(monitor,{frameMs=16.67,renderMs=3,count=180,visible=true}={}){
  for(let i=0;i<count;i++)monitor.record({frameMs,renderMs,guidanceMs:.2,uiMs:.3,visible});
}
test('frame intervals and CPU submission are separately summarized',()=>{
  const monitor=new PerformanceMonitor({devicePixelRatio:2});record(monitor);
  const data=monitor.summary();assert.ok(data.fps>59&&data.fps<61);assert.equal(data.renderMs,3);
  assert.equal(data.guidanceMs,.2);assert.equal(data.uiMs,.3);assert.equal(data.quality.pixelRatio,1.6);
});
test('sustained slow frames reduce drawing quality while hidden gaps do not',()=>{
  const monitor=new PerformanceMonitor({devicePixelRatio:2});
  record(monitor,{frameMs:1500,renderMs:40,count:100,visible:false});
  assert.equal(monitor.summary().quality.pixelRatio,1.6);
  record(monitor,{frameMs:32,renderMs:15,count:220});
  assert.ok(monitor.summary().quality.pixelRatio<1.6);
});
test('network jitter alone cannot change quality and recovery is conservative',()=>{
  const monitor=new PerformanceMonitor({devicePixelRatio:2});
  record(monitor,{count:1000});assert.equal(monitor.summary().quality.pixelRatio,1.6);
  record(monitor,{frameMs:35,renderMs:15,count:220});const low=monitor.summary().quality.pixelRatio;
  record(monitor,{count:60});assert.equal(monitor.summary().quality.pixelRatio,low);
  record(monitor,{count:2000});assert.ok(monitor.summary().quality.pixelRatio>=low);
});
test('long tab-return gaps are excluded and quality has a readable floor',()=>{
  const monitor=new PerformanceMonitor({devicePixelRatio:1});
  record(monitor,{frameMs:10000,renderMs:2,count:4});assert.equal(monitor.summary().fps,null);
  record(monitor,{frameMs:45,renderMs:22,count:3000});
  assert.equal(monitor.summary().quality.pixelRatio,1);assert.equal(monitor.summary().quality.shadows,false);
});
