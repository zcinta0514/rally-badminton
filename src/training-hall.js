import * as THREE from 'three';
import { COURT } from '../shared/game.js';
import { makeCourtMaterial } from './arena.js';

// The three courts share the game's metre scale. Keep the side curtains and
// equipment outside the doubles tramlines so the baseline camera sees the shuttle.
const COURT_SPACING = 9.8;
const DOUBLES_WIDTH = 6.10;
const LINE = .04;
const palette = {
  steel: 0x435756, rubber: 0x384b49, wood: 0xb9926b, teal: 0x326763,
  chalk: 0xeaece0, seam: 0x294944, copper: 0xe58b59, aluminium: 0x8b9a94,
};

// Batch the fixed geometry by finish and shape. Each architectural component
// stays a named group, while repeated battens, posts and court lines share draws.
function fixtures(parent, name) {
  const group = new THREE.Group();
  group.name = name;
  parent.add(group);
  const shapes = new Map(), frame = new THREE.Object3D();
  function place(shape, color, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0) {
    if (!shapes.has(shape)) shapes.set(shape, []);
    frame.position.set(x, y, z);
    frame.rotation.set(rx, ry, rz);
    frame.scale.set(w, h, d);
    frame.updateMatrix();
    shapes.get(shape).push({ matrix: frame.matrix.clone(), color: new THREE.Color(color) });
  }
  return {
    box: (...args) => place('box', ...args),
    wheel: (...args) => place('wheel', ...args),
    skirt: (...args) => place('skirt', ...args),
    finish(shadows = false) {
      for (const [shape, parts] of shapes) {
        const geometry = shape === 'box' ? new THREE.BoxGeometry() : shape === 'skirt'
          ? new THREE.CylinderGeometry(.5, .15, 1, 12, 1, true)
          : new THREE.CylinderGeometry(.5, .5, 1, 12);
        const mesh = new THREE.InstancedMesh(geometry,
          new THREE.MeshStandardMaterial({ roughness: .83, side: shape === 'skirt' ? THREE.DoubleSide : THREE.FrontSide }),
          parts.length);
        parts.forEach(({matrix, color}, index) => {
          mesh.setMatrixAt(index, matrix);
          mesh.setColorAt(index, color);
        });
        mesh.castShadow = shadows;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    },
  };
}

function wireSegments(parent, name, coords, color, opacity) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
  const wires = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color, transparent: true, opacity, depthWrite: false,
  }));
  wires.name = name;
  parent.add(wires);
}

function court(parent, center) {
  const main = center === 0;
  const group = new THREE.Group();
  group.name = main ? 'main-training-court' : 'adjacent-court';
  group.position.x = center;
  parent.add(group);
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 16.4),
    main ? makeCourtMaterial(0x286f64) : new THREE.MeshStandardMaterial({color: 0x426666, roughness: .95}));
  mat.rotation.x = -Math.PI / 2;
  mat.receiveShadow = true;
  group.add(mat);

  const f = fixtures(group, 'court-markings-and-posts'), white = main ? palette.chalk : 0xaebfba;
  const length = COURT.halfLength * 2, baseline = COURT.halfLength - LINE / 2;
  for (const s of [-1, 1]) {
    for (const x of [COURT.halfWidth, DOUBLES_WIDTH / 2]) {
      f.box(white, s * (x - LINE / 2), .007, 0, LINE, .008, length);
    }
    for (const z of [baseline, baseline - .76, 1.98 + LINE / 2]) {
      f.box(white, 0, .007, s * z, DOUBLES_WIDTH, .008, LINE);
    }
    f.box(white, 0, .007, s * (COURT.halfLength + 1.98) / 2, LINE, .008, COURT.halfLength - 1.98);
    const x = s * DOUBLES_WIDTH / 2;
    f.box(palette.steel, x, .055, 0, .17, .1, .32);
    f.box(palette.aluminium, x, .79, 0, .052, 1.55, .052);
    f.box(palette.copper, x, 1.562, 0, .065, .035, .065);
  }
  if (!main) {
    f.box(0xc6cabb, 0, COURT.netHeight, 0, DOUBLES_WIDTH, .044, .018);
    const net = [];
    for (let n = 0; n <= 76; n++) {
      const x = DOUBLES_WIDTH * (n / 76 - .5);
      net.push(x, .79, 0, x, COURT.netHeight, 0);
    }
    for (let y = .79; y < COURT.netHeight; y += .085) net.push(-3.05, y, 0, 3.05, y, 0);
    wireSegments(group, 'neighbour-net', net, 0x314541, .42);
  }
  f.finish();
}

function curtains(parent) {
  const f = fixtures(parent, 'divider-curtain-tracks'), strands = [];
  // A flexible diamond mesh with a shallow scallop along its lower hem.
  for (const x of [-COURT_SPACING / 2, COURT_SPACING / 2]) {
    const start = -9, end = 7.8, top = 3.2, rows = 16, columns = 84;
    const knot = (row, col) => {
      const z = start + (end - start) * col / columns;
      const low = .15 + .035 * (1 - Math.cos(z * 2));
      return [x + .041 * Math.cos(z * 1.8) * (1 - row / rows),
        low + (top - low) * row / rows, z];
    };
    for (let row = 0; row < rows; row++) {
      for (let col = row % 2; col <= columns; col += 2) {
        if (col < columns) strands.push(...knot(row,col), ...knot(row+1,col+1));
        if (col > 0) strands.push(...knot(row,col), ...knot(row+1,col-1));
      }
    }
    for (const z of [start, (start+end)/2, end]) f.box(palette.steel, x, top/2, z, .06, top, .06);
    f.box(palette.aluminium, x, top+.035, (start+end)/2, .07, .065, end-start);
    f.box(0x688479, x, .15, (start+end)/2, .034, .07, end-start);
  }
  f.finish();
  wireSegments(parent, 'divider-diamond-mesh', strands, 0x3d5650, .27);
}

function shuttleCart(parent) {
  // A shallow open wire basket at feeding height, with an orange bumper,
  // casters and real tapered shuttle silhouettes visible above the lip.
  const group = new THREE.Group();
  group.name = 'coach-shuttle-cart';
  group.position.set(-3.78, 0, -1.78);
  group.rotation.y = -.24;
  parent.add(group);
  const f = fixtures(group, 'trolley'), width = .88, depth = .54;
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      const x=s*(width/2-.045), z=t*(depth/2-.035);
      f.box(palette.aluminium, x, .53, z, .036, .93, .036);
      f.wheel(palette.rubber, x, .074, z, .134, .053, .134, 0, 0, Math.PI/2);
    }
    f.box(palette.copper, 0, 1.035, s*depth/2, width+.035, .052, .035);
    f.box(palette.copper, s*width/2, 1.035, 0, .035, .052, depth);
    for(let j=0;j<4;j++){
      const y=.67+j*.09;
      f.box(palette.aluminium, 0, y, s*depth/2, width, .013, .013);
      f.box(palette.aluminium, s*width/2, y, 0, .013, .013, depth);
    }
    for (let j=1;j<8;j++) f.box(palette.steel, width*(j/8-.5), .84, s*depth/2, .014, .36, .014);
    for (let j=1;j<5;j++) f.box(palette.steel, s*width/2, .84, depth*(j/5-.5), .014, .36, .014);
  }
  f.box(palette.seam, 0, .22, 0, width-.04, .035, depth-.035);
  f.box(palette.steel, 0, .65, 0, width, .045, depth);
  for (let i=0;i<7;i++) for(let j=0;j<4;j++) {
    const angle=i*2.71+j*4.37, x=(i-3)*.109, z=(j-1.5)*.11;
    f.skirt(0xf4eedd, x, 1.008+.032*Math.cos(angle), z, .084, .092, .084,
      .47*Math.sin(angle), 0, .55*Math.cos(angle));
  }
  f.finish(true);
}

function architecture(parent) {
  const f = fixtures(parent, 'training-hall-architecture');
  f.box(0x927960, 0, -.076, 1, 36, .13, 43);
  // Impact pads below acoustic timber slats. Columns divide the hall into
  // three bays aligned with the courts. The near wall stays behind the camera.
  const rear = -11.9;
  f.box(0x93877a, 0, 5, rear, 36, 10, .20);
  for (let x=-17.6; x<18; x+=.78) {
    f.box(0x45625e, x, .89, rear+.14, .755, 1.78, .08);
  }
  f.box(palette.wood, 0, 2.83, rear+.16, 36, 2.1, .06);
  for (let x=-17.95; x<18; x+=.16) {
    f.box(0x9f7751, x, 2.83, rear+.20, .032, 2.1, .035);
  }
  for (let x=-17; x<18; x+=2) {
    f.box(0x9eb6b6, x, 4.88, rear+.14, 1.90, 1.38, .05);
    f.box(0x728b8d, x, 4.62, rear+.17, 1.90, .035, .025);
    f.box(0x728b8d, x, 4.88, rear+.17, .038, 1.38, .025);
  }
  for(const x of [-14.7,-4.9,4.9,14.7]) {
    f.box(0x63716b, x, 4.35, rear+.27, .23, 8.7, .36);
    f.box(0x8b9690, x, 7.46, -.5, .18, .32, 23);
  }
  for(const x of [-17.8,17.8]) f.box(0x758781, x, 4.4, 3, .22, 8.8, 30);
  for(const z of [-8.5,-2.6,3.3,9.2]) {
    f.box(0x5d6865, 0, 7.78, z, 35.6, .22, .16);
    for(const x of [-9.8,-2.85,2.85,9.8]) {
      f.box(0x677976, x, 7.43, z, 1.84, .13, .24);
      f.box(0xffe8c2, x, 7.348, z, 1.70, .027, .21);
    }
  }
  // A slatted bench in each side bay, outside all run-offs.
  for(const x of [-8.1,6.7]) {
    for(const step of [-1,0,1]) f.box(palette.wood,x,.5,-9.75+step*.16,2.95,.065,.13);
    for(const end of [-1,1]) f.box(palette.steel,x+end*1.1,.24,-9.75,.115,.48,.48);
  }
  f.finish();

  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#264641'; ctx.fillRect(0,0,1024,192);
  ctx.fillStyle = '#ee995e'; ctx.fillRect(0,0,18,192);
  ctx.fillStyle = '#f2eee0'; ctx.font = 'bold 105px Arial';
  ctx.fillText('RALLY', 43, 132);
  ctx.fillStyle = '#a8c3b8'; ctx.font = 'bold 56px Arial';
  ctx.fillText('TRAINING HALL', 462, 114);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.2),
    new THREE.MeshBasicMaterial({map}));
  sign.name = 'hall-sign'; sign.position.set(0, 2.82, rear+.245); parent.add(sign);
}

function landingZone(parent, name, color, borderColor, cornerColor) {
  const zone = new THREE.Group();
  zone.name = name;
  parent.add(zone);
  zone.visible = false;
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1,1),
    new THREE.MeshBasicMaterial({color, transparent:true, opacity:.22,
      toneMapped:false, depthWrite:false}));
  fill.rotation.x = -Math.PI/2;
  fill.position.y = .019;
  zone.add(fill);
  const vertices = [], colors = [];
  const stripe = (tint, x, z, w, d, y) => {
    const color = new THREE.Color(tint);
    for (const [dx,dz] of [[-1,-1],[-1,1],[1,-1],[1,-1],[-1,1],[1,1]]) {
      vertices.push(x+dx*w/2,y,z+dz*d/2);
      colors.push(color.r,color.g,color.b);
    }
  };
  for (const side of [-1,1]) {
    stripe(borderColor,0,side*.48,1,.04,.021);
    stripe(borderColor,side*.48,0,.04,1,.021);
    for (const end of [-1,1]) {
      stripe(cornerColor,end*.401,side*.47,.198,.06,.023);
      stripe(cornerColor,side*.47,end*.402,.06,.196,.023);
    }
  }
  stripe(cornerColor,0,0,.21,.035,.023);
  stripe(cornerColor,0,0,.033,.2,.023);
  const border = new THREE.BufferGeometry();
  border.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  border.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  zone.add(new THREE.Mesh(border,new THREE.MeshBasicMaterial({ vertexColors:true,toneMapped:false })));
  return target => {
    zone.visible = !!target && Number.isFinite(target.x) && Number.isFinite(target.z)
      && target.width > 0 && target.depth > 0;
    if (zone.visible) {
      zone.position.set(target.x, 0, target.z);
      zone.scale.set(target.width, 1, target.depth);
    }
  };
}

export function makeTrainingHall() {
  const group = new THREE.Group();
  group.name = 'training-hall';
  architecture(group);
  for (const center of [-COURT_SPACING,0,COURT_SPACING]) court(group,center);
  curtains(group);
  shuttleCart(group);
  const markNear = landingZone(group,'training-target',0xffb84d,0xffc664,0xfff1c5);
  const markDeep = landingZone(group,'training-deep-target',0x26c2ec,0x72dcff,0xd3fbff);
  function setTarget(single, targets, technique) {
    if (!targets?.length) {
      markNear(single);
      markDeep(null);
      return;
    }
    markNear(technique === 'lift' ? null : targets.find(t => t.technique === 'cross'));
    markDeep(technique === 'cross' ? null : targets.find(t => t.technique === 'lift'));
  }
  return { group, setTarget };
}
