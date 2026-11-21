import * as THREE from 'three';
import { CUP_EVENTS } from './cup-draw.js';

const themes = {
  bay: { court: 0x1e757e, apron: 0x174e68, dark: 0x103952, edge: 0x9cdfe4,
    seat: 0x84d6ee, sky: 0xabdae4, light: 0xfff2d5, sign: '#103a51', ink: '#a4f6e9',
    kits: [[0xf2efd7, 0x167983], [0xd36e43, 0x572c40]] },
  crown: { court: 0x454573, apron: 0x222844, dark: 0x17182e, edge: 0xe8bf79,
    seat: 0x9785d7, sky: 0x192236, light: 0xe1dcff, sign: '#252039', ink: '#ffdb92',
    kits: [[0xffc657, 0x733655], [0x867cec, 0x29294e]] },
};

export function cupVenueTheme(eventId) {
  return themes[eventId];
}

function signTexture(event, centerCourt, theme) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = theme.sign; ctx.fillRect(0, 0, 1024, 160);
  ctx.strokeStyle = theme.ink; ctx.lineWidth = 3;
  for (const edge of [0, 1024]) {
    ctx.save(); ctx.translate(edge, 0); ctx.scale(edge ? -1 : 1, 1);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      if (event.id === 'bay') {
        ctx.moveTo(-15, 50 + 19 * i);
        ctx.bezierCurveTo(55, -10 + 19 * i, 100, 150 + 19 * i, 195, 70 + 19 * i);
      } else {
        ctx.moveTo(-24 + 31 * i, 140); ctx.lineTo(31 + 31 * i, 34); ctx.lineTo(68 + 31 * i, 103);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 58px "Microsoft YaHei", sans-serif';
  ctx.fillText(event.name, 512, 78);
  ctx.fillStyle = theme.ink; ctx.font = '500 31px "Microsoft YaHei", sans-serif';
  ctx.fillText(centerCourt ? event.centerVenue : event.venue, 512, 130);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function makeCupBoards(eventId, centerCourt) {
  const event = CUP_EVENTS.find(e => e.id === eventId), theme = themes[eventId];
  const group = new THREE.Group();
  group.name = event.name;
  const face = new THREE.MeshBasicMaterial({ map: signTexture(event, centerCourt, theme), toneMapped: false });
  const panel = new THREE.PlaneGeometry(6.8, 1.06);
  const trim = new THREE.MeshBasicMaterial({ color: theme.edge });
  for (const end of [-1, 1]) {
    const board = new THREE.Mesh(panel, face);
    board.position.set(0, 1.03, end * 8.82);
    board.rotation.y = end < 0 ? 0 : Math.PI;
    group.add(board);
    // Repeat the lockup on the apron for overhead cameras.
    const mark = new THREE.Mesh(panel, face);
    mark.scale.set(.69, .69, 1);
    mark.rotation.order = 'YXZ';
    mark.rotation.set(-Math.PI / 2, board.rotation.y, 0);
    mark.position.set(0, .035, end * 7.32);
    group.add(mark);
    if (centerCourt) {
      for (const side of [-1, 1]) {
        const mast = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.72, .08), trim);
        mast.position.set(side * 3.51, .86, end * 8.85); group.add(mast);
      }
      const crest = new THREE.Mesh(new THREE.BoxGeometry(7.1, .045, .06), trim);
      crest.position.set(0, 1.72, end * 8.85); group.add(crest);
    }
  }
  return group;
}

const normalKits = [[0xf07759, 0xffd69b], [0x86cdbd, 0x36a38e]];

// The procedural avatar stores fabric as vertex colours; the downloaded model
// has named materials. Keep the same kit while the detailed model is loading.
export function applyCupKit(athlete, theme, height) {
  const original = normalKits[athlete.index];
  const kit = theme?.kits[athlete.index] ?? original;
  const previous = athlete.cupKit ?? original;
  athlete.root.scale.y = height ? THREE.MathUtils.clamp(height / 177, .9, 1.13) : 1;
  const from = previous.map(c => new THREE.Color(c)), to = kit.map(c => new THREE.Color(c));
  athlete.root.traverse(obj => {
    const mat = obj.material;
    if (!mat) return;
    if (mat.name === 'rally-shirt') mat.color.setHex(kit[0]);
    if (mat.name === 'rally-accent') mat.color.setHex(kit[1]);
    const rgb = obj.geometry?.getAttribute('color');
    if (kit === previous || !rgb || !mat.vertexColors) return;
    for (let i = 0; i < rgb.count; i++) {
      const index = from.findIndex(c => Math.abs(rgb.getX(i) - c.r) < .00001
        && Math.abs(rgb.getY(i) - c.g) < .00001 && Math.abs(rgb.getZ(i) - c.b) < .00001);
      if (index >= 0) rgb.setXYZ(i, to[index].r, to[index].g, to[index].b);
    }
    rgb.needsUpdate = true;
  });
  athlete.cupKit = kit;
}
