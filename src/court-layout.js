import { normalizeCameraSettings } from './camera-settings.js';

// The horizontal basis never changes when adjusting pitch or zoom.
export const COURT_CAMERA = Object.freeze({ yaw: 0, pitch: 24 * Math.PI / 180, distance: 18 });

export function screenToCourt(input = {}, side = 0) {
  const yaw = COURT_CAMERA.yaw + (side === 1 ? Math.PI : 0);
  const x = Number.isFinite(input.x) ? input.x : 0;
  const z = Number.isFinite(input.z) ? input.z : 0;
  return { ...input, x: Math.cos(yaw) * x + Math.sin(yaw) * z,
    z: -Math.sin(yaw) * x + Math.cos(yaw) * z };
}

function plane(point, yaw, pitch, distance = COURT_CAMERA.distance) {
  const forward=Math.sin(yaw)*point.x+Math.cos(yaw)*point.z;
  const depth=Math.sin(pitch)*(point.y||0)+Math.cos(pitch)*forward;
  const perspective=distance/(distance-depth);
  return { x: (Math.cos(yaw)*point.x-Math.sin(yaw)*point.z)*perspective,
    y: (Math.cos(pitch)*(point.y||0)-Math.sin(pitch)*forward)*perspective };
}

export function fitCourtViewport(width, height, side = 0, options = {}) {
  width = Math.max(1, width); height = Math.max(1, height);
  const top = Math.min(height * 0.3, options.top ?? 80);
  const bottom = Math.min(height * 0.17, options.bottom ?? 12);
  const margin = options.margin ?? 10;
  const sideMargin=options.sideMargin??(width>height?Math.min(172,width*.25):margin);
  const yaw = COURT_CAMERA.yaw + (side === 1 ? Math.PI : 0);
  const camera = normalizeCameraSettings(options.camera);
  const pitch = camera.pitchDegrees * Math.PI / 180;
  const corners = [];
  for (const x of [-3.35, 3.35]) for (const z of [-6.85, 6.85]) corners.push(plane({x,y:0,z},yaw,pitch));
  for (const x of [-2.65, 2.65]) for (const z of [-6.6, 6.6]) corners.push(plane({x,y:2.05,z},yaw,pitch));
  const minX = Math.min(...corners.map(p=>p.x)), maxX = Math.max(...corners.map(p=>p.x));
  const minY = Math.min(...corners.map(p=>p.y)), maxY = Math.max(...corners.map(p=>p.y));
  const baseScale = Math.min(Math.max(1,width-2*sideMargin)/(maxX-minX), Math.max(1,height-top-bottom-2*margin)/(maxY-minY));
  const screenCenterY=top+(height-top-bottom)/2;
  // Let users bring the scene closer, but keep every baseline/head inside the
  // viewport even at the most extreme pitch on a short landscape screen.
  const visibleScale = Math.min((width-2*margin)/(maxX-minX),
    2*Math.max(1,Math.min(screenCenterY-margin,height-margin-screenCenterY))/(maxY-minY));
  const scale = Math.min(baseScale*camera.zoom,visibleScale);
  return {width,height,side,yaw,pitch,scale,top,bottom,distance:COURT_CAMERA.distance,
    centerX:(minX+maxX)/2, centerY:(minY+maxY)/2,
    zoom:camera.zoom, screenCenterX:width/2, screenCenterY};
}

export function projectCourtPoint(point, fit) {
  const p = plane(point, fit.yaw, fit.pitch, fit.distance);
  return {x:fit.screenCenterX+(p.x-fit.centerX)*fit.scale,
    y:fit.screenCenterY-(p.y-fit.centerY)*fit.scale};
}

// Preserve the true shuttle position. This only reports where to place an edge
// label when the shuttle leaves the viewport or passes behind the scoreboard.
export function getShuttleEdgeHint(shuttle,fit,{hud}={}) {
  const projected=projectCourtPoint(shuttle,fit);
  const outside=projected.x<0||projected.x>fit.width||projected.y<0||projected.y>fit.height;
  const covered=!!hud&&projected.x>=hud.left&&projected.x<=hud.right&&projected.y>=hud.top&&projected.y<=hud.bottom;
  if(!outside&&!covered)return null;
  const left=Math.min(78,fit.width/4),right=fit.width-left;
  const x=Math.max(left,Math.min(right,projected.x));
  // Only clear the scoreboard when the label's horizontal footprint meets it.
  // A side scoreboard must leave the central flight lane unobstructed.
  const meetsHud=!!hud&&x+left>=hud.left&&x-left<=hud.right;
  const top=Math.min(fit.height-56,Math.max(fit.top+14,meetsHud?hud.bottom+18:0));
  const bottom=fit.height-Math.max(42,fit.bottom);
  const y=Math.max(top,Math.min(bottom,projected.y));
  const horizontal=projected.x<0?'left':projected.x>fit.width?'right':null;
  const vertical=projected.y<top?'up':projected.y>bottom?'down':null;
  const arrow=vertical==='up'?(horizontal==='left'?'↖':horizontal==='right'?'↗':'↑'):
    vertical==='down'?(horizontal==='left'?'↙':horizontal==='right'?'↘':'↓'):horizontal==='left'?'←':'→';
  return {x,y,arrow,projected,height:Math.max(0,shuttle.y),reason:outside?'offscreen':'hud'};
}
