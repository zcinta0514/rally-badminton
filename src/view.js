import { localTeam } from './match-lineup.js';
import { normalizeBrightness } from './arena-preferences.js';
import * as THREE from 'three';
import { fitCourtViewport, getShuttleEdgeHint } from './court-layout.js';
import { normalizeCameraSettings } from './camera-settings.js';
import { normalizeCourtPalette, resolveCourtPalette } from './court-palettes.js';
import { makeAthlete, updateAthlete, applyAthletePose } from './athlete.js';
import { upgradeAthlete } from './athlete-import.js';
import { sampleFinalePose } from './finale-pose.js';
import { makeArena, makeHallShell, makeCourtMaterial, resetArenaCrowd, updateArenaCrowd } from './arena.js';
import { makeNetVisual, updateNetVisual } from './net-visual.js';
import { makeShuttleModel, RallyEndPresentation } from './shuttle-visual.js';
import { COURT } from '../shared/game.js';
import { StaminaHUD } from './stamina-hud.js';
import { phantomPositions } from '../shared/hell-mode.js';
import { TournamentLobby } from './tournament-lobby.js';
import { MatchEntrance, applyEntranceCamera, entranceEase } from './match-entrance.js';
import { makeContactShadow, shuttleShadowSample } from './contact-shadow.js';

// Venue-wide colours. The court floor, apron and accent strip come from the
// selected court palette instead; see court-palettes.js.
const COLORS = {
  background: 0x131c1b,
  floor: 0x303734,
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
  constructor(canvas, { courtPalette } = {}) {
    this.canvas = canvas;
    this.courtPalette = normalizeCourtPalette(courtPalette);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = normalizeBrightness();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.background);
    this.scene.fog = new THREE.Fog(COLORS.background, 32, 65);
    this.camera = new THREE.PerspectiveCamera(45,1,0.1,100);
    this.cameraSide = null;
    this.entrance = new MatchEntrance();this.entranceFrom = null;this.entranceTo = this.camera.clone();
    this.cameraSettings = normalizeCameraSettings();
    // One shadowed soft key plus a cheap opposite fill gives bodies and rackets
    // readable depth from either end of the court. Fixtures remain unlit meshes.
    this.ambient = new THREE.HemisphereLight(0xe6edf0, 0x343b37, .76);this.scene.add(this.ambient);
    const sunlight = new THREE.DirectionalLight(0xf6f2e9, 1.15);
    sunlight.position.set(-3.5, 12, 2);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    Object.assign(sunlight.shadow.camera, { left: -10, right: 10, top: 12, bottom: -12, near: 1, far: 35 });
    sunlight.shadow.bias = -0.0004;
    sunlight.shadow.normalBias = 0.009;
    this.scene.add(sunlight);this.matchKey = sunlight;
    const fill = new THREE.DirectionalLight(0xe1eaf0, .32);
    fill.position.set(8, 9, -6); this.scene.add(fill);
    // Symmetric feathered fixtures keep both ends readable. Gameplay lighting
    // is steady; only the lobby has an entrance ramp. No extra shadow passes.
    this.courtLights = [];
    for (const end of [-1, 1]) {
      const top = new THREE.SpotLight(0xf1f3ed, 185, 24, 1.04, 1, 2);
      top.name = 'match-court-soft-top'; top.position.set(end * 1.8, 8, end * 4.5);
      top.target.position.set(0, 0, end * 3.2); this.scene.add(top, top.target);this.courtLights.push(top);
    }
    this.makeCourt();
    this.players = [makeAthlete(this.scene, 0), makeAthlete(this.scene, 1)];
    for (const player of this.players) void upgradeAthlete(player);
    this.mode = 'menu';
    this.lobby = new TournamentLobby();
    this.lobby.setCourtPalette(this.courtPalette);
    this.reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.staminaHUD = new StaminaHUD();
    this.staminaProjection = new THREE.Vector3();
    this.makeShuttle();
    this.makeHints();
    this.edgeIndicator=document.createElement('div');
    this.edgeIndicator.className='shuttle-edge-indicator';
    this.edgeIndicator.setAttribute('aria-hidden','true');
    Object.assign(this.edgeIndicator.style,{position:'fixed',zIndex:'6',pointerEvents:'none',
      transform:'translate(-50%,-50%)',padding:'6px 10px',borderRadius:'20px',
      border:'1px solid #ffe6a899',background:'#123c36ed',color:'#fff0be',
      font:'500 11px "Rally UI",sans-serif',whiteSpace:'nowrap',boxShadow:'0 2px 10px #082c2960'});
    this.edgeIndicator.hidden=true;
    document.body.appendChild(this.edgeIndicator);
    this.initialized = false;
    this.lastPoint = null;
    this.lastPhase = null;
    this.lastStateTime = null;
    this.lastHit = null;
    this.elapsed = 0;
    this.onVisibilityChange = () => { resetArenaCrowd(this.arena); };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.resize();
  }

  makeCourt() {
    const scene = this.scene;
    const palette = resolveCourtPalette(this.courtPalette);
    const floorMat = material(COLORS.floor);
    const apronMat = material(palette.apron);
    const courtMat = makeCourtMaterial(palette.court);
    const lineMat = material(COLORS.line);
    const darkMat = material(palette.dark);
    const edgeMat = material(palette.edge);
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

    const postMat = material(0x89988d, { roughness: 0.4, metalness: .45 });
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
    // Kept live so the local settings panel can recolour the venue in place.
    this.courtMaterials = { court: courtMat, apron: apronMat, edge: edgeMat, dark: darkMat };
    this.arena = makeArena(scene);
    this.hallShell = makeHallShell(scene);
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
    this.groundDot = makeContactShadow(this.groundMarker,{name:"shuttle-soft-shadow"});
    this.groundDot.position.y = .030;
    const trailGeo = new THREE.BufferGeometry();
    this.trailPositions = new Float32Array(18 * 3);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    trailGeo.setDrawRange(0, 0);
    this.trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xfff8de, transparent: true, opacity: .35, depthWrite: false }));
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);
    this.trailPoints = [];
    this.phantoms = Array.from({length:3}, () => {
      const ghost = makeShuttleModel();
      ghost.scale.setScalar(1.8); ghost.visible = false;
      ghost.traverse(object => {
        if (!object.isMesh) return;
        object.material = object.material.clone();
        object.material.transparent = true; object.material.opacity = .4;
        object.material.depthWrite = false; object.castShadow = false;
      });
      this.scene.add(ghost); return ghost;
    });
    this.bossRing = ring(this.scene, .7, .045, 0xffb998, .8);
    this.bossRing.visible = false;
    const cannonGeometry = new THREE.BufferGeometry();
    cannonGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
    this.cannonLine = new THREE.Line(cannonGeometry,new THREE.LineDashedMaterial({color:0xffb998,dashSize:.24,gapSize:.16,transparent:true,opacity:.8,depthWrite:false}));
    this.cannonLine.frustumCulled=false;this.cannonLine.visible=false;this.scene.add(this.cannonLine);
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

  resetCrowd() {
    resetArenaCrowd(this.arena);
  }

  get entranceActive(){return this.entrance?.active===true;}

  beginMatchEntrance(options={}) {
    this.entrance.begin({...options,reducedMotion:this.reducedMotion?.matches===true});
    this.updateCamera(options.side??0);
    this.entranceFrom=this.lobby.camera.clone();
    this.entranceFrom.aspect=this.width/this.height;this.entranceFrom.updateProjectionMatrix();
    this.entranceTo.copy(this.camera);
    this.applyEntrance();
    return this.entranceActive;
  }

  advanceEntrance(dt,options={}) {
    this.entrance.advance(dt,{...options,reducedMotion:this.reducedMotion?.matches===true});
  }

  applyEntrance() {
    const progress=this.entranceActive?this.entrance.progress:1,t=entranceEase(progress);
    if(this.entranceFrom)applyEntranceCamera(this.camera,this.entranceFrom,this.entranceTo,progress);
    this.ambient.intensity=.63+.13*t;this.matchKey.intensity=.95+.20*t;
    this.courtLights.forEach((light,index)=>{
      const end=index===0?-1:1;
      light.target.position.set(end*5.8*(1-t),0,end*(6-2.8*t));
      light.intensity=110+75*t;light.angle=1.2-.16*t;
      light.target.updateMatrixWorld(true);
    });
  }

  setMode(mode) {
    if(this.mode===mode)return;
    this.mode=mode;
    if(mode!=="match"){this.entrance?.cancel();this.entranceFrom=null;}
    this.resetCrowd();
    if (mode !== 'match') this.staminaHUD?.hide();
    if(mode!=='match')this.edgeIndicator.hidden=true;
    this.resize();
  }

  resize() {
    const bounds=this.canvas.getBoundingClientRect();
    this.width=Math.max(1,bounds.width||window.innerWidth);
    this.height=Math.max(1,bounds.height||window.innerHeight);
    this.renderer.setSize(this.width,this.height,false);
    if(this.entranceFrom){this.entranceFrom.aspect=this.width/this.height;this.entranceFrom.updateProjectionMatrix();}
    this.hudBounds=document.querySelector('#hud')?.getBoundingClientRect();
    this.staminaHUD?.refreshObstacles();
    this.updateCamera(this.cameraSide??0);
  }

  setCameraSettings(settings) {
    this.cameraSettings = normalizeCameraSettings(settings);
    this.updateCamera(this.cameraSide ?? 0);
    return { ...this.cameraSettings };
  }

  setCourtPalette(name) {
    this.courtPalette = normalizeCourtPalette(name);
    this.lobby?.setCourtPalette(this.courtPalette);
    const palette = resolveCourtPalette(this.courtPalette);
    if (this.courtMaterials) {
      this.courtMaterials.court.color.setHex(palette.court);
      this.courtMaterials.apron.color.setHex(palette.apron);
      this.courtMaterials.edge.color.setHex(palette.edge);
      this.courtMaterials.dark.color.setHex(palette.dark);
    }
    return this.courtPalette;
  }

  setLightingBrightness(value) {
    const brightness=normalizeBrightness(value);
    this.renderer.toneMappingExposure=brightness;
    this.lobby.brightness=brightness;
    return brightness;
  }

  setQuality({ pixelRatio, shadows, shadowSize } = {}) {
    if (Number.isFinite(pixelRatio)) {
      const ratio=clamp(pixelRatio,1,2);
      if(this.renderer.getPixelRatio()!==ratio)this.renderer.setPixelRatio(ratio);
    }
    if(typeof shadows==='boolean'&&shadows!==this.renderer.shadowMap.enabled){
      this.renderer.shadowMap.enabled=shadows;
      // Both scenes share the renderer, but each owns shader material variants.
      const materials=new Set();
      for(const scene of [this.scene,this.lobby?.scene])scene?.traverse(object=>{
        for(const mat of [].concat(object.material||[]))materials.add(mat);
      });
      for(const mat of materials)mat.needsUpdate=true;
      if(shadows&&this.lobby)this.lobby.lights.key.shadow.needsUpdate=true;
    }
    if(shadowSize===1024||shadowSize===2048)for(const light of [this.matchKey,this.lobby.lights.key]){
      if(light.shadow.mapSize.x===shadowSize)continue;
      light.shadow.map?.dispose();light.shadow.map=null;
      light.shadow.mapSize.set(shadowSize,shadowSize);light.shadow.needsUpdate=true;
    }
    return this.getRendererMetrics();
  }

  getRendererMetrics() {
    const { render, memory } = this.renderer.info;
    return { pixelRatio: this.renderer.getPixelRatio(), shadows: this.renderer.shadowMap.enabled,
      brightness:this.renderer.toneMappingExposure, shadowSize:this.matchKey.shadow.mapSize.x, calls: render.calls, triangles: render.triangles, geometries: memory.geometries, textures: memory.textures };
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
    this.entranceTo?.copy(camera);
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
    const team=localTeam(state,side),sign=team===0?1:-1;
    const onHalf = (point, halfSign) => !!point && Number.isFinite(point.x) && Number.isFinite(point.z) &&
      Math.abs(point.x) <= (state.format==='doubles'?3.05:COURT.halfWidth) && Math.abs(point.z) <= COURT.halfLength && point.z * halfSign > 0;
    const show = (marker, point, enabled) => {
      marker.group.visible = !!enabled;
      if (enabled) marker.group.position.set(point.x, marker.floorY, point.z);
    };
    const landing = info?.landing;
    const incoming = state.phase === 'rally' && state.shuttle.active && state.shuttle.lastHit === 1 - team;
    const safeArrival = incoming && landing?.event === 'landing' && landing.side === team &&
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
    const beginnerAssist = info?.availability?.assist === 'beginner';
    this.interceptHint.group.scale.setScalar(beginnerAssist ? 1.12 : 1);
    this.interceptHint.circle.material.color.setHex(beginnerAssist ? 0xffe1a1 : 0xffd580);
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
    const canServe = state.phase === 'serve' && (state.serverPlayer??state.server) === side;
    show(this.readyHint, player, !!available?.canHit && (safeArrival || canServe) && onHalf(player, sign));
    // A warm foot arc means a smash can be played now, not merely at a future interception.
    this.readyHint.circle.material.color.setHex(available?.canSmash ? 0xff9b56 : 0x8feee1);
    this.hintCache = { side, pointId: state.pointId, hitId: state.hitId };
  }

  clearFinale() {
    if(!this.finaleActive)return;
    this.finaleActive=false;this.finaleAnchors=null;this.cameraSide=null;this.initialized=false;
    for(const player of this.players){player.motion=null;player.racket.visible=true;player.ground.visible=true;}
    this.trail.visible=true;
  }

  renderFinale(state,finale,side) {
    this.finaleActive=true;this.rallyEnding=false;
    const camera=this.camera,aspect=this.width/this.height;
    camera.clearViewOffset();camera.aspect=aspect;camera.fov=42;
    const distance=aspect<1.2?7.7:5.8;
    camera.position.set(0,2.2,3.4+distance);camera.up.set(0,1,0);camera.lookAt(0,.85,3.4);
    camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    this.finaleAnchors=[];
    for(let index=0;index<2;index++){
      const loser=index===finale.loser,player=this.players[index],x=loser?-.9:.9;
      const pose=sampleFinalePose(loser?'loser':'winner',finale.age,loser?-Math.PI/2:Math.PI/2);
      applyAthletePose(player,pose,{x,z:3.4,side:0,selected:false});
      player.racket.visible=false;player.ground.visible=false;
      // Keep identity labels steady while the head bows down; the voice bubble
      // shares the loser's column and never migrates to the other player.
      const anchor=new THREE.Vector3(x,2.03,3.4).project(camera);
      this.finaleAnchors[index]={x:(anchor.x+1)*this.width/2,y:(1-anchor.y)*this.height/2};
    }
    for(const object of [this.shuttle,this.groundMarker,this.impactMarker,this.trail,
      this.landingHint,this.interceptHint,this.targetHint,this.readyHint])if(object)object.visible=false;
    this.edgeIndicator.hidden=true;
    this.renderer.render(this.scene,camera);
  }

  renderLobby(dt=1/60) {
    this.staminaHUD?.hide();
    this.edgeIndicator.hidden=true;
    this.lobby.render(this.renderer,globalThis.document?.hidden?0:dt,this.width,this.height,
      {reducedMotion:this.reducedMotion?.matches===true});
  }

  render(state, side=0, dt=1/60, info={}) {
    if(!state?.players||!state.shuttle)return;
    updateArenaCrowd(this.arena,state,dt,{enabled:this.mode==='match',hidden:globalThis.document?.hidden===true});
    if(info.finale){this.staminaHUD?.hide();this.renderFinale(state,info.finale,side);return;}
    this.clearFinale();
    dt=clamp(Number.isFinite(dt)?dt:1/60,0,.06);
    const team=localTeam(state,side);
    if(this.cameraSide!==team)this.updateCamera(team);
    while(this.players.length<state.players.length){const athlete=makeAthlete(this.scene,this.players.length%2);this.players.push(athlete);void upgradeAthlete(athlete);}
    this.players.forEach((athlete,index)=>{athlete.root.visible=index<state.players.length;athlete.ground.visible=index<state.players.length;});
    this.applyEntrance();
    const reset=!this.initialized||state.pointId!==this.lastPoint||state.time<this.lastStateTime||
      (state.phase==='serve'&&this.lastPhase!=='serve');
    const freeze=['paused','countdown','over'].includes(state.phase);
    if(reset){this.hudBounds=document.querySelector('#hud')?.getBoundingClientRect();this.staminaHUD?.refreshObstacles();}
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
      if(this.players[index])updateAthlete(this.players[index],player,localTeam(state,index),shuttle,athleteTime,dt,index===side,athleteFreeze,athleteReset,
        state.challenge?.bossSide===index?state.challenge.rescue:null);
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
    const shadow=shuttleShadowSample(position.y);
    this.groundMarker.position.set(position.x+shadow.x,0,position.z+shadow.z);
    this.groundDot.scale.set(shadow.width,shadow.depth,1);
    this.groundDot.material.opacity=shadow.opacity;
    this.impactMarker.visible=!!tail&&tail.grounded&&tail.markOpacity>.001;
    if(tail){
      this.impactMarker.position.set(tail.impact.x,.034,tail.impact.z);
      this.impactMarker.material.opacity=tail.markOpacity;
      this.impactMarker.material.color.setHex(state.rallyEnd.kind==='in'?0xb7e2cb:0xff9270);
    }
    if(this.netVisual){
      const contacts = state.netContacts?.length ? state.netContacts
        : state.rallyEnd?.kind === 'net' && state.rallyEnd.netImpact !== null ? [state.rallyEnd] : [];
      updateNetVisual(this.netVisual, contacts, tail ? state.rallyEnd.at + tail.age : state.time);
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
    this.staminaHUD?.update(state, side, (x, y, z) => {
      const point = this.staminaProjection.set(x, y, z).project(this.camera);
      return { x: (point.x + 1) * this.width / 2, y: (1 - point.y) * this.height / 2, depth: point.z };
    }, { left: 0, right: this.width, top: 0, bottom: this.height }, this.mode === 'match', info.playerNames);
    const ghosts = phantomPositions(state), h = state.challenge, boss = state.players[1];
    this.phantoms.forEach((ghost,index) => {
      const point = ghosts[index];ghost.visible = this.mode === 'match' && !!point;
      if (!point) return;
      ghost.position.set(point.x,point.y,point.z);ghost.quaternion.copy(this.shuttle.quaternion);
      ghost.traverse(object => { if(object.isMesh)object.material.opacity=point.opacity; });
    });
    this.bossRing.visible=this.mode==='match'&&!!h&&state.phase==='rally'&&!!(h.warning||h.rescue&&!h.rescue.hit||state.time<h.recoverUntil);
    if(this.bossRing.visible){
      this.bossRing.position.set(boss.x,.04,boss.z);
      this.bossRing.scale.setScalar(h.warning?1+.12*Math.sin(state.time*15):1);
    }
    this.cannonLine.visible=this.mode==='match'&&state.phase==='rally'&&!!h?.warning;
    if(this.cannonLine.visible){
      const points=this.cannonLine.geometry.attributes.position;
      points.setXYZ(0,boss.x,.055,boss.z);points.setXYZ(1,h.warning.aim*(COURT.halfWidth-.3),.055,4.8);
      points.needsUpdate=true;this.cannonLine.computeLineDistances();
    }
    this.trail.material.opacity=['phantom','netDrop','drive'].includes(h?.active?.kind)&&h.active.hitId===state.hitId? .95 : .35;
    if(this.entranceActive){
      this.staminaHUD?.hide();this.edgeIndicator.hidden=true;
      for(const hint of [this.landingHint,this.interceptHint,this.targetHint,this.readyHint])hint.group.visible=false;
      for(const player of this.players){player.halo.visible=false;player.selected.visible=false;}
    }else for(const player of this.players)player.halo.visible=true;
    this.renderer.render(this.scene,this.camera);
  }
  dispose() {
    this.lobby?.dispose();
    for (const player of this.players || []) player.disposed = true;
    if (this.onVisibilityChange) globalThis.document?.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.edgeIndicator.remove();
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    const skeletons = new Set();
    this.scene.traverse((object) => {
      object.shadow?.dispose();
      if (object.isSkinnedMesh && object.skeleton) skeletons.add(object.skeleton);
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat);
    });
    for (const mat of materials) {
      for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
      mat.dispose();
    }
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
    for (const skeleton of skeletons) skeleton.dispose();
    this.renderer.dispose();
  }
}
