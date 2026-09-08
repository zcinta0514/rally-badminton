import * as THREE from 'three';
import { fitCourtViewport, getShuttleEdgeHint } from './court-layout.js';
import { normalizeCameraSettings } from './camera-settings.js';
import { makeAthlete, updateAthlete } from './athlete.js';
import { makeArena, makeCourtMaterial } from './arena.js';
import { makeNetVisual, updateNetVisual } from './net-visual.js';
import { makeShuttleModel, RallyEndPresentation } from './shuttle-visual.js';
import { COURT } from '../shared/game.js';

const COLORS = {
  background: 0x101e29,
  floor: 0x132b34,
  apron: 0x1c4248,
  court: 0x0c7054,
  farCourt: 0x0c7054,
  line: 0xf0f5e7,
  coral: 0xfb7959,
  mint: 0xb7e2cb,
  navy: 0x213f49,
};

const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...options });
}

function box(parent, width, height, depth, mat, x = 0, y = 0, z = 0, shadow = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function ring(parent, radius, thickness, color, opacity = 1) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(radius - thickness, radius, 48),
    new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  parent.add(mesh);
  return mesh;
}

export class CourtView {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.background);
    this.scene.fog = new THREE.Fog(COLORS.background, 32, 65);
    this.camera = new THREE.PerspectiveCamera(45,1,0.1,100);
    this.cameraSide = null;
    this.cameraSettings = normalizeCameraSettings();
    // One shadowed soft key plus a cheap opposite fill gives bodies and rackets
    // readable depth from either end of the court. Fixtures remain unlit meshes.
    this.scene.add(new THREE.HemisphereLight(0xe4f0fb, 0x43584f, 1.35));
    const sunlight = new THREE.DirectionalLight(0xffefd6, 2.65);
    sunlight.position.set(-6, 15, 4);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(1024, 1024);
    Object.assign(sunlight.shadow.camera, { left: -10, right: 10, top: 12, bottom: -12, near: 1, far: 35 });
    sunlight.shadow.bias = -0.0004;
    sunlight.shadow.normalBias = 0.018;
    this.scene.add(sunlight);
    const fill = new THREE.DirectionalLight(0xc3e2f4, .8);
    fill.position.set(8, 9, -6); this.scene.add(fill);
    this.makeCourt();
    this.players = [makeAthlete(this.scene, 0), makeAthlete(this.scene, 1)];
    this.mode = 'menu';
    this.makeShuttle();
    this.makeHints();
    this.edgeIndicator=document.createElement('div');
    this.edgeIndicator.className='shuttle-edge-indicator';
    this.edgeIndicator.setAttribute('aria-hidden','true');
    Object.assign(this.edgeIndicator.style,{position:'fixed',zIndex:'6',pointerEvents:'none',
      transform:'translate(-50%,-50%)',padding:'6px 10px',borderRadius:'20px',
      border:'1px solid #ffe6a899',background:'#123c36ed',color:'#fff0be',
      font:'600 11px Arial,sans-serif',whiteSpace:'nowrap',boxShadow:'0 2px 10px #082c2960'});
    this.edgeIndicator.hidden=true;
    document.body.appendChild(this.edgeIndicator);
    this.initialized = false;
    this.lastPoint = null;
    this.lastPhase = null;
    this.lastStateTime = null;
    this.lastHit = null;
    this.elapsed = 0;
    this.resize();
  }

  makeCourt() {
    const scene = this.scene;
    const floorMat = material(COLORS.floor);
    const apronMat = material(COLORS.apron);
    const courtMat = makeCourtMaterial(COLORS.court);
    const lineMat = material(COLORS.line);
    const darkMat = material(0x14383c);
    const edgeMat = material(0x3d7069);
    box(scene, 90, 0.15, 90, floorMat, 0, -0.27, 0);
    box(scene, 10.2, 0.14, 18.5, darkMat, 0, -0.135, 0);
    box(scene, 9.7, 0.055, 18, apronMat, 0, -0.042, 0);
    box(scene, 6.5, 0.025, 14.8, courtMat, 0, -0.007, 0);
    box(scene, 5.18, 0.007, 6.7, courtMat, 0, 0.01, -3.35);

    const lineY = 0.018;
    const lineWidth = 0.04;
    const doublesWidth = 6.1;
    const baseline = COURT.halfLength-lineWidth/2;
    // BWF Diagram A: 0.720 m clear space between the two 40 mm rear lines.
    // Their centres are 0.760 m apart; the short line starts 1.980 m from the net.
    const longService = baseline-0.76;
    const shortService = 1.98+lineWidth/2;
    for (const sign of [-1, 1]) box(scene, lineWidth, 0.008, COURT.halfLength*2, lineMat, sign*(COURT.halfWidth-lineWidth/2), lineY, 0);
    for (const sign of [-1, 1]) {
      box(scene, lineWidth, 0.008, COURT.halfLength*2, lineMat, sign*(doublesWidth/2-lineWidth/2), lineY, 0);
      for (const z of [baseline, longService, shortService]) box(scene, doublesWidth, 0.008, lineWidth, lineMat, 0, lineY, sign*z);
    }
    for (const z of [-4.34, 4.34]) box(scene, lineWidth, 0.008, 4.72, lineMat, 0, lineY, z);

    const postMat = material(0xd4e6cf, { roughness: 0.5 });
    for (const x of [-3.23, 3.23]) {
      box(scene, 0.2, 0.07, 0.28, darkMat, x, 0.03, 0, true);
      box(scene, 0.066, 1.6, 0.066, postMat, x, 0.8, 0, true);
      box(scene, 0.09, 0.052, 0.09, material(COLORS.coral), x, 1.61, 0);
    }
    this.netVisual = makeNetVisual(scene);
    this.netGeometry = this.netVisual.wires.geometry;
    this.netAtRest = true;

    // Only low apron accents: the court and athletes own the available pixels.
    for (const z of [-7.15, 7.15]) box(scene, 6.6, 0.012, 0.055, edgeMat, 0, 0.008, z);
    this.arena = makeArena(scene);
  }

  makeShuttle() {
    this.shuttle = makeShuttleModel();
    // A fixed visual enlargement keeps the shuttle readable on a phone. Its
    // leading cork stays at the flight point; collision and shot reach are unchanged.
    this.shuttle.scale.setScalar(1.8);
    this.scene.add(this.shuttle);
    this.endPresentation = new RallyEndPresentation();
    this.rallyEnding = false;
    this.impactMarker = ring(this.scene, .15, .025, 0xff9270, .6);
    this.impactMarker.position.y = .034;
    this.impactMarker.visible = false;
    this.shuttlePosition = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.groundMarker = new THREE.Group();
    this.scene.add(this.groundMarker);
    this.groundRing = ring(this.groundMarker, .062, .012, 0x224c43, .18);
    this.groundRing.position.y = .029;
    this.groundDot = new THREE.Mesh(new THREE.CircleGeometry(.045, 24), new THREE.MeshBasicMaterial({ color: 0x163b35, transparent: true, opacity: .33, depthWrite: false }));
    this.groundDot.rotation.x = -Math.PI / 2;
    this.groundDot.position.y = .030;
    this.groundMarker.add(this.groundDot);
    const trailGeo = new THREE.BufferGeometry();
    this.trailPositions = new Float32Array(18 * 3);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    trailGeo.setDrawRange(0, 0);
    this.trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xfff8de, transparent: true, opacity: .35, depthWrite: false }));
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);
    this.trailPoints = [];
  }

  makeHints() {
    // Keep UI marks saturated under the scene's ACES exposure. A narrow dark
    // edge supplies contrast on the pale floor without filling the playing area.
    const outline = (mesh, padding = .026) => {
      const p = mesh.geometry.parameters;
      const edge = new THREE.Mesh(new THREE.RingGeometry(
        Math.max(0, p.innerRadius - padding), p.outerRadius + padding,
        p.thetaSegments, p.phiSegments, p.thetaStart, p.thetaLength,
      ), new THREE.MeshBasicMaterial({ color: 0x12383f,
        side: THREE.DoubleSide, depthWrite: true, toneMapped: false }));
      edge.position.z = -.001;
      edge.renderOrder = 2;
      mesh.material.toneMapped = false;
      mesh.material.transparent = false;
      mesh.material.opacity = 1;
      mesh.material.depthWrite = true;
      mesh.renderOrder = 3;
      mesh.add(edge);
    };
    const marker = (color, radius, arcs = false, floorY = .042) => {
      const group = new THREE.Group();
      group.position.y = floorY;
      this.scene.add(group);
      const circle = ring(group, radius, arcs ? 0.075 : 0.065, color, .98);
      circle.position.y = 0;
      if (arcs) {
        circle.geometry.dispose();
        circle.geometry = new THREE.RingGeometry(radius - .075, radius, 40, 1, Math.PI / 8, Math.PI * 3 / 4);
        outline(circle);
        const opposite = circle.clone();
        opposite.rotation.z = Math.PI;
        group.add(opposite);
      } else {
        outline(circle);
        const center = new THREE.Mesh(new THREE.CircleGeometry(.065, 16),
          new THREE.MeshBasicMaterial({ color,
            depthWrite: true, side: THREE.DoubleSide, toneMapped: false }));
        center.rotation.x = -Math.PI / 2;
        center.renderOrder = 3;
        const dotEdge = new THREE.Mesh(new THREE.CircleGeometry(.095, 16),
          new THREE.MeshBasicMaterial({ color: 0x12383f,
            depthWrite: true, side: THREE.DoubleSide, toneMapped: false }));
        dotEdge.position.z = -.001;
        dotEdge.renderOrder = 2;
        center.add(dotEdge);
        group.add(center);
      }
      group.visible = false;
      return { group, circle, floorY };
    };
    this.landingHint = marker(0x00d5e8, .34);
    this.landingHint.countdown = ring(this.landingHint.group, .49, .035, 0x00d5e8);
    this.landingHint.countdown.position.y = .002;
    outline(this.landingHint.countdown, .024);
    this.interceptHint = marker(0xffd580, .5, true, .049);
    this.targetHint = marker(0xff4f8d, .32);
    this.targetHint.riskRing = ring(this.targetHint.group, 1, .024, 0xffb1c6, .55);
    this.targetHint.riskRing.position.y = .003;
    outline(this.targetHint.riskRing, .014);
    this.targetHint.riskRing.visible = false;
    this.readyHint = marker(0x8feee1, .61, true, .057);
    this.hintCache = null;
    this.hintFlightKey = null;
    this.hintSide = null;
    this.interceptFlightKey = null;
    this.hintDisplayTime = null;
  }

  setMode(mode) {
    if(this.mode===mode)return;
    this.mode=mode;
    if(mode!=='match')this.edgeIndicator.hidden=true;
    this.resize();
  }

  resize() {
    const bounds=this.canvas.getBoundingClientRect();
    this.width=Math.max(1,bounds.width||window.innerWidth);
    this.height=Math.max(1,bounds.height||window.innerHeight);
    this.renderer.setSize(this.width,this.height,false);
    this.hudBounds=document.querySelector('#hud')?.getBoundingClientRect();
    this.updateCamera(this.cameraSide??0);
  }

  setCameraSettings(settings) {
    this.cameraSettings = normalizeCameraSettings(settings);
    this.updateCamera(this.cameraSide ?? 0);
    return { ...this.cameraSettings };
  }

  setQuality({ pixelRatio, shadows } = {}) {
    if (Number.isFinite(pixelRatio)) this.renderer.setPixelRatio(clamp(pixelRatio, .75, 1.6));
    if (typeof shadows === 'boolean' && shadows !== this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse((object) => {
        for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
          if (mat) mat.needsUpdate = true;
        }
      });
    }
    return this.getRendererMetrics();
  }

  getRendererMetrics() {
    const { render, memory } = this.renderer.info;
    return { pixelRatio: this.renderer.getPixelRatio(), shadows: this.renderer.shadowMap.enabled,
      calls: render.calls, triangles: render.triangles, geometries: memory.geometries, textures: memory.textures };
  }

  updateCamera(side) {
    const lobby=this.mode==='menu';
    const fit=fitCourtViewport(this.width,this.height,side,lobby?{top:38,bottom:60,sideMargin:18}:{camera:this.cameraSettings});
    this.layout=fit;
    const camera=this.camera;
    // Face the net from the baseline. A symmetric perspective keeps both
    // baselines level, with enough room for the complete court and both players.
    const distance=fit.distance;
    camera.aspect=fit.width/fit.height;
    camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(fit.height/(2*fit.scale*distance)));
    camera.setViewOffset(fit.width,fit.height,
      fit.width/2-fit.screenCenterX+fit.centerX*fit.scale,
      fit.height/2-fit.screenCenterY-fit.centerY*fit.scale,fit.width,fit.height);
    camera.position.set(Math.sin(fit.yaw)*Math.cos(fit.pitch)*distance,Math.sin(fit.pitch)*distance,Math.cos(fit.yaw)*Math.cos(fit.pitch)*distance);
    camera.up.set(0,1,0);
    camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    this.cameraSide=side;
  }

  updateHints(state, info, freeze, reset, side = 0) {
    const markers = [this.landingHint, this.interceptHint, this.targetHint, this.readyHint];
    const clear = () => {
      for (const marker of markers) marker.group.visible = false;
      this.hintCache = null;
      this.hintFlightKey = null;
      this.interceptFlightKey = null;
      this.hintDisplayTime = null;
    };
    // CourtView's presentation clock advances between network snapshots. A
    // standalone hint view can instead use authoritative time for deterministic QA.
    const displayTime = Number.isFinite(this.elapsed) ? this.elapsed : (state.time || 0);
    if (reset || this.hintSide !== side) clear();
    this.hintSide = side;
    // Mesh transforms already hold copied values. Keeping them unchanged avoids
    // any pause movement when mutable input objects or charge state are cleared.
    if (freeze) {
      if (!['paused', 'countdown'].includes(state.phase) || !this.hintCache) clear();
      this.hintDisplayTime = displayTime;
      return;
    }
    const live = state.phase === 'rally' || state.phase === 'serve';
    if (!live) { clear(); return; }
    const displayDelta = this.hintDisplayTime === null ? 0 : clamp(displayTime - this.hintDisplayTime, 0, .05);
    this.hintDisplayTime = displayTime;
    const sign = side === 0 ? 1 : -1;
    const onHalf = (point, halfSign) => !!point && Number.isFinite(point.x) && Number.isFinite(point.z) &&
      Math.abs(point.x) <= COURT.halfWidth && Math.abs(point.z) <= COURT.halfLength && point.z * halfSign > 0;
    const show = (marker, point, enabled) => {
      marker.group.visible = !!enabled;
      if (enabled) marker.group.position.set(point.x, marker.floorY, point.z);
    };
    const landing = info?.landing;
    const incoming = state.phase === 'rally' && state.shuttle.active && state.shuttle.lastHit === 1 - side;
    const safeArrival = incoming && landing?.event === 'landing' && landing.side === side &&
      !landing.out && !landing.serviceFault && onHalf(landing, sign);
    show(this.landingHint, landing, safeArrival);
    if (safeArrival) {
      const key = `${state.pointId}:${state.hitId}:${side}`;
      const remaining = Number.isFinite(landing.time) ? Math.max(0, landing.time) : 0;
      if (key !== this.hintFlightKey) {
        this.hintFlightKey = key;
        this.hintFlightDuration = Math.max(.12, remaining);
      }
      const ratio = clamp(remaining / this.hintFlightDuration, 0, 1);
      // The landmark never expands or flashes. Only this fixed-radius arc
      // shortens as the shuttle approaches the floor.
      const count = Math.ceil(ratio * this.landingHint.countdown.geometry.parameters.thetaSegments) * 6;
      this.landingHint.countdown.geometry.setDrawRange(0, count);
      for (const edge of this.landingHint.countdown.children) edge.geometry.setDrawRange(0, count);
    } else this.hintFlightKey = null;
    const intercept = info?.intercept;
    const interceptVisible = safeArrival && ['ready', 'approach'].includes(intercept?.status) && onHalf(intercept?.point, sign);
    const interceptKey = `${state.pointId}:${state.hitId}:${side}`;
    if (interceptVisible) {
      const group = this.interceptHint.group, point = intercept.point;
      if (!group.visible || this.interceptFlightKey !== interceptKey) group.position.set(point.x, this.interceptHint.floorY, point.z);
      else {
        // Reachability can switch from an early interception to a later one in
        // one simulation step. Move the advice continuously instead of teleporting.
        const dx = point.x - group.position.x, dz = point.z - group.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance > .025) {
          const step = Math.min(distance * (1 - Math.exp(-displayDelta * 20)), displayDelta * 12);
          group.position.x += dx / distance * step;
          group.position.z += dz / distance * step;
        }
      }
      this.interceptFlightKey = interceptKey;
      group.visible = true;
    } else {
      this.interceptHint.group.visible = false;
      this.interceptFlightKey = null;
    }
    const target = info?.target;
    const intention = target && { x: target.aimX ?? target.x, z: target.aimZ ?? target.z };
    const validAim = intention && Number.isFinite(intention.x) && Number.isFinite(intention.z) &&
      Math.abs(intention.x) <= COURT.halfWidth + .7 && Math.abs(intention.z) <= COURT.halfLength + .7 && intention.z * -sign > 0;
    show(this.targetHint, intention, ['clear', 'drop', 'smash'].includes(info?.prepare) && validAim);
    const risk = clamp(target?.quality?.risk || 0, 0, 1);
    const spread = Number.isFinite(target?.quality?.spread) ? clamp(target.quality.spread, 0, COURT.halfLength) : 0;
    this.targetHint.riskRing.visible = !!target?.quality && spread > .025;
    this.targetHint.riskRing.scale.setScalar(.34 + spread);
    this.targetHint.riskRing.material.color.setHex(risk > .55 ? 0xff775e : risk > .25 ? 0xffc77d : 0xffb1c6);
    this.targetHint.riskRing.material.opacity = 1;
    const player = state.players?.[side], available = info?.availability;
    const canServe = state.phase === 'serve' && state.server === side;
    show(this.readyHint, player, !!available?.canHit && (safeArrival || canServe) && onHalf(player, sign));
    // A warm foot arc means a smash can be played now, not merely at a future interception.
    this.readyHint.circle.material.color.setHex(available?.canSmash ? 0xff9b56 : 0x8feee1);
    this.hintCache = { side, pointId: state.pointId, hitId: state.hitId };
  }

  render(state, side=0, dt=1/60, info={}) {
    if(!state?.players||!state.shuttle)return;
    dt=clamp(Number.isFinite(dt)?dt:1/60,0,.06);
    if(this.cameraSide!==side)this.updateCamera(side);
    const reset=!this.initialized||state.pointId!==this.lastPoint||state.time<this.lastStateTime||
      (state.phase==='serve'&&this.lastPhase!=='serve');
    const freeze=['paused','countdown','over'].includes(state.phase);
    if(reset)this.hudBounds=document.querySelector('#hud')?.getBoundingClientRect();
    if(!freeze)this.elapsed+=dt;
    const shuttle=state.shuttle;
    const tail=this.endPresentation.update(state,dt);
    this.rallyEnding=this.endPresentation.active;
    // A scored final shot can still be in follow-through. Finish the body motion
    // alongside the falling shuttle, without advancing the finished rule state.
    const finalTail=state.phase==='over'&&!!tail;
    const athleteTime=finalTail?state.rallyEnd.at+tail.age:state.time;
    const athleteFreeze=freeze&&!(finalTail&&this.rallyEnding);
    const athleteReset=!this.initialized||state.time<this.lastStateTime||
      (state.phase==='serve'&&this.lastPhase!=='serve')||(freeze&&state.pointId!==this.lastPoint);
    state.players.forEach((player,index)=>{
      if(this.players[index])updateAthlete(this.players[index],player,index,shuttle,athleteTime,dt,index===side,athleteFreeze,athleteReset);
    });
    const ballReset=reset||this.shuttlePosition.distanceToSquared(new THREE.Vector3(shuttle.x,shuttle.y,shuttle.z))>100;
    const position=tail?.position||shuttle;
    this.shuttlePosition.set(position.x,position.y,position.z);
    this.shuttle.position.copy(this.shuttlePosition);
    const axis=tail?.axis;
    this.direction.set(axis?.x??shuttle.vx??0,axis?.y??shuttle.vy??0,axis?.z??shuttle.vz??0);
    if(this.direction.lengthSq()>.01)this.shuttle.quaternion.setFromUnitVectors(UP,this.direction.normalize());
    else this.shuttle.rotation.set(.3,0,.2);
    if(tail)this.shuttle.rotateY(tail.roll);
    this.shuttle.visible=!!tail||state.phase!=='over'||shuttle.active;
    this.groundMarker.visible=this.shuttle.visible;
    this.groundMarker.position.set(position.x,0,position.z);
    // This small, muted disk is only the current vertical shadow; cyan is the forecast.
    this.groundDot.material.opacity=clamp(.33-position.y*.018,.13,.33);
    this.impactMarker.visible=!!tail&&tail.grounded&&tail.markOpacity>.001;
    if(tail){
      this.impactMarker.position.set(tail.impact.x,.034,tail.impact.z);
      this.impactMarker.material.opacity=tail.markOpacity;
      this.impactMarker.material.color.setHex(state.rallyEnd.kind==='in'?0xb7e2cb:0xff9270);
    }
    if(this.netVisual){
      updateNetVisual(this.netVisual,tail?state.rallyEnd:null,tail?.age||0);
      this.netAtRest=this.netVisual.atRest;
    }
    this.updateHints(state,info,freeze,reset,side);
    const showEdge=this.mode==='match'&&shuttle.active&&['rally','paused','countdown'].includes(state.phase);
    const edge=showEdge?getShuttleEdgeHint(shuttle,this.layout,{hud:this.hudBounds}):null;
    this.edgeIndicator.hidden=!edge;
    if(edge){
      this.edgeIndicator.style.left=`${edge.x}px`;this.edgeIndicator.style.top=`${edge.y}px`;
      const label=`${edge.arrow} ${edge.reason==='offscreen'?'屏外来球':'高位来球'} · ${edge.height.toFixed(1)}m`;
      if(this.edgeIndicator.textContent!==label)this.edgeIndicator.textContent=label;
    }
    if(ballReset||state.phase!=='rally'||!shuttle.active)this.trailPoints.length=0;
    else if(!freeze&&(!this.trailPoints.length||this.trailPoints[0].distanceToSquared(this.shuttlePosition)>.006)){
      this.trailPoints.unshift(this.shuttlePosition.clone());if(this.trailPoints.length>18)this.trailPoints.pop();
      // A fine, short trail improves readability without filling the court
      // with a long luminous streak.
      let length=0;
      for(let i=1;i<this.trailPoints.length;i++){
        const segment=this.trailPoints[i-1].distanceTo(this.trailPoints[i]);
        if(length+segment>.65){
          this.trailPoints[i].lerp(this.trailPoints[i-1],1-(.65-length)/segment);
          this.trailPoints.length=i+1;break;
        }
        length+=segment;
      }
    }
    for(let i=0;i<this.trailPoints.length;i++)this.trailPoints[i].toArray(this.trailPositions,i*3);
    this.trail.geometry.attributes.position.needsUpdate=true;this.trail.geometry.setDrawRange(0,this.trailPoints.length);
    this.lastPoint=state.pointId;this.lastPhase=state.phase;this.lastStateTime=state.time;this.lastHit=state.hitId;this.initialized=true;
    this.renderer.render(this.scene,this.camera);
  }
  dispose() {
    this.edgeIndicator.remove();
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    const skeletons = new Set();
    this.scene.traverse((object) => {
      if (object.isSkinnedMesh && object.skeleton) skeletons.add(object.skeleton);
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat);
    });
    for (const mat of materials) {
      if (mat.map) textures.add(mat.map);
      mat.dispose();
    }
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
    for (const skeleton of skeletons) skeleton.dispose();
    this.renderer.dispose();
  }
}
