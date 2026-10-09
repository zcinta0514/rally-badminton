import * as T from 'three';
import { sampleFlight } from '/flight-runtime.mjs';

// Local +Y points from the cork toward the skirt. Flight p is the cork centre.
export function createFlightView(scene, data) {
  const shuttle = new T.Group();
  const cork = new T.Mesh(new T.SphereGeometry(data.contact.corkRadius, 12, 8), new T.MeshStandardMaterial({color:0xf4e9d3, roughness:.8}));
  shuttle.add(cork);
  const skirt = new T.Mesh(new T.CylinderGeometry(.031, .010, .055, 16, 1, true), new T.MeshStandardMaterial({color:0xf6f5ea, side:T.DoubleSide, transparent:true, opacity:.8, roughness:.7}));
  skirt.position.y = .04; shuttle.add(skirt); scene.add(shuttle);
  const axis = new T.Vector3(0,1,0), velocity = new T.Vector3();
  const incomingOrientation=new T.Quaternion().setFromUnitVectors(axis,new T.Vector3(...data.contact.shuttleIncoming).normalize().negate());
  const desiredOrientation=new T.Quaternion();
  const traceMaterial = new T.LineBasicMaterial({color:0xe3d796, transparent:true, opacity:.45});
  const trace = new T.Line(new T.BufferGeometry(),traceMaterial); scene.add(trace);
  const positions = new Float32Array((data.incoming.length+data.outgoing.length)*3);
  const rows=[...data.incoming,...data.outgoing.slice(1)];
  rows.forEach((r,i)=>positions.set(r.p,i*3));
  trace.geometry.setAttribute('position',new T.BufferAttribute(positions,3));
  trace.geometry.setDrawRange(0,0);
  let current;
  function update(time, extrapolate = false) {
    current=sampleFlight(data,time);
    if(!extrapolate && time>data.nextOpponentContactTime){current={...current,visible:false,phase:'opponent-contact-not-modelled'};}
    shuttle.visible=current.visible;
    if(current.visible) {
      shuttle.position.fromArray(current.p); velocity.fromArray(current.v);
      if(velocity.lengthSq()>1e-10){
        desiredOrientation.setFromUnitVectors(axis,velocity.normalize().negate());
        if(time>=data.hitTime&&time<data.hitTime+.065){
          // Authored visual turn, not measured feather aerodynamics. The cork
          // leaves the bed before the skirt rotates, instead of flipping into it.
          const u=T.MathUtils.clamp((time-data.hitTime-.008)/.057,0,1);
          shuttle.quaternion.copy(incomingOrientation).slerp(desiredOrientation,u*u*(3-2*u));
        }else shuttle.quaternion.copy(desiredOrientation);
      }
    }
    // Only display the trajectory already travelled; do not reveal future landing.
    let lo=0,hi=rows.length;
    while(lo<hi){const m=(lo+hi)>>1;if(rows[m].time<=Math.min(time,extrapolate?time:data.nextOpponentContactTime))lo=m+1;else hi=m;}
    trace.geometry.setDrawRange(0,lo);
    return current;
  }
  return {update,get state(){return current;},setTrace(visible){trace.visible=visible;}};
}

export function addReferenceNet(scene, court) {
  const points=[]; const x=court.netX, top=court.groundY+court.netHeight;
  for(let z=-3.05;z<=3.051;z+=.15)points.push(x,top,z,x,top-.76,z);
  for(let y=top-.76;y<=top+.001;y+=.095)points.push(x,y,-3.05,x,y,3.05);
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));
  scene.add(new T.LineSegments(geometry,new T.LineBasicMaterial({color:0x889b96,transparent:true,opacity:.35})));
  const tape=new T.Mesh(new T.BoxGeometry(.018,.025,6.10),new T.MeshStandardMaterial({color:0xdfebe7}));tape.position.set(x,top-.0125,0);scene.add(tape);
}
