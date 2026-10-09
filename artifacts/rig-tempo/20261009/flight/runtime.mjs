// Coordinates are glTF/Three metres. p is the cork sphere centre, not the skirt.
export function sampleFlight(data, time) {
  if (!Number.isFinite(time)) throw Error('球路时间必须为有限数字');
  const rows=time < data.hitTime ? data.incoming : data.outgoing;
  if(time < rows[0].time) return {p:rows[0].p.slice(),v:rows[0].v.slice(),phase:'before-feed',visible:false};
  if(time >= rows.at(-1).time) return {p:rows.at(-1).p.slice(),v:rows.at(-1).v.slice(),phase:time<data.hitTime?'incoming':'landed',visible:true};
  let low=0, high=rows.length-1;
  while(high-low>1){const mid=(low+high)>>1;if(rows[mid].time<=time)low=mid;else high=mid;}
  const a=rows[low],b=rows[high],dt=b.time-a.time,u=(time-a.time)/dt;
  // Hermite position and its analytic velocity keep the flight C1 inside each
  // ballistic side. A real velocity impulse is retained at contact.
  const p=a.p.map((x,i)=>(2*u**3-3*u*u+1)*x+(u**3-2*u*u+u)*dt*a.v[i]+(-2*u**3+3*u*u)*b.p[i]+(u**3-u*u)*dt*b.v[i]);
  const v=a.p.map((x,i)=>((6*u*u-6*u)*x+(3*u*u-4*u+1)*dt*a.v[i]+(-6*u*u+6*u)*b.p[i]+(3*u*u-2*u)*dt*b.v[i])/dt);
  return {p,v,phase:time<data.hitTime?'incoming':'outgoing',visible:true};
}
