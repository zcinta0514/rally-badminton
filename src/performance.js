const percentile=(values,q)=>values.length?[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*q))]:null;

// Frame cadence measures delivery to the screen; renderMs measures CPU submission,
// not GPU execution. Network samples are deliberately not inputs to this policy.
export class PerformanceMonitor {
  constructor({devicePixelRatio=1}={}){
    this.maxPixelRatio=Math.max(1,Math.min(Number(devicePixelRatio)||1,2));
    // Preserve sharp edges first: reduce shadow work before render resolution.
    this.levels=[{pixelRatio:this.maxPixelRatio,shadows:true,shadowSize:2048},
      {pixelRatio:this.maxPixelRatio,shadows:true,shadowSize:1024},
      {pixelRatio:Math.max(1,this.maxPixelRatio*.8),shadows:true,shadowSize:1024},
      {pixelRatio:Math.max(1,this.maxPixelRatio*.65),shadows:false,shadowSize:1024}];
    this.targetFrameMs=1000/60;
    this.level=0;this.samples=[];this.window=[];this.windowMs=0;
    this.slowMs=0;this.fastMs=0;
  }
  record({frameMs,renderMs=0,guidanceMs=0,uiMs=0,visible=true}){
    if(!visible||!Number.isFinite(frameMs)||frameMs<=0||frameMs>250)return;
    const sample={frameMs,renderMs,guidanceMs,uiMs};
    this.samples.push(sample);if(this.samples.length>180)this.samples.shift();
    this.window.push(sample);this.windowMs+=frameMs;
    if(this.windowMs<1000)return;
    const frames=this.window.map(x=>x.frameMs),median=percentile(frames,.5),tail=percentile(frames,.95);
    // Detect a sustained faster screen cadence; never infer it from one short frame.
    if(median<11.8)this.targetFrameMs=Math.min(this.targetFrameMs,median<7.5?1000/144:1000/120);
    if(median>this.targetFrameMs*1.38||tail>this.targetFrameMs*1.8){this.slowMs+=this.windowMs;this.fastMs=0;}
    else if(median<this.targetFrameMs*1.1&&tail<this.targetFrameMs*1.4){this.fastMs+=this.windowMs;this.slowMs=0;}
    else {this.slowMs=0;this.fastMs=0;}
    if(this.slowMs>=2500){this.level=Math.min(this.levels.length-1,this.level+1);this.slowMs=0;this.fastMs=0;}
    // Hysteresis: recover only after a sustained healthy period, one step at a time.
    if(this.fastMs>=12000){this.level=Math.max(0,this.level-1);this.fastMs=0;}
    this.window=[];this.windowMs=0;
  }
  summary(){
    const median=key=>percentile(this.samples.map(x=>x[key]),.5);
    const frameMs=median('frameMs');
    return {fps:frameMs?1000/frameMs:null,frameMs,frameP95:percentile(this.samples.map(x=>x.frameMs),.95),
      renderMs:median('renderMs'),guidanceMs:median('guidanceMs'),uiMs:median('uiMs'),
      quality:{...this.levels[this.level]}};
  }
}

export function formatPerformance(render,network,rtt,renderer,transport){
  const n=(value,digits=1)=>Number.isFinite(value)?value.toFixed(digits):'—';
  const rows=[`画面 ${n(render.fps,0)} FPS · 帧间隔 ${n(render.frameMs)} ms · P95 ${n(render.frameP95)} ms`,
    `CPU 提交 ${n(render.renderMs)} ms · 建议 ${n(render.guidanceMs)} ms · UI ${n(render.uiMs)} ms`,
    `画质 ${n(renderer?.pixelRatio??render.quality.pixelRatio,2)}× · 阴影 ${(renderer?.shadows??render.quality.shadows)?'开':'关'} · 绘制 ${renderer?.calls??'—'} 次`];
  if(network){
    rows.push(`网络快照 ${n(network.snapshotHz)} /秒 · 间隔 ${n(network.intervalMs)} ms · 抖动 ${n(network.jitterMs)} ms`,
      `RTT ${n(rtt,0)} ms · 播放缓冲 ${n(network.bufferMs,0)} ms · 快照已过 ${n(network.ageMs,0)} ms`);
  }else rows.push('本地人机 · 不使用网络快照');
  if(transport){
    const pairs=Array.isArray(transport.candidatePairs)?transport.candidatePairs:[];
    const transportRtt=pairs.find(pair=>Number.isFinite(pair.currentRoundTripTime))?.currentRoundTripTime;
    rows.push(`直连通道 ${transport.connected?'已连接':'已断开'} · 信令 ${transport.signalingConnected?'在线':'断开'} · WebRTC RTT ${Number.isFinite(transportRtt)?n(transportRtt*1000,0):'—'} ms`);
  }
  rows.push('CPU 提交耗时不等于 GPU 耗时；当前设备采样。');
  return rows.join('\n');
}
