"""Blender: --python extract-racket.py -- INPUT.blend OUTPUT.json [--hit-source-frame 513.3].

Read-only extraction. The cork centre is solved against the actual woven string
triangles, not a legacy contact marker plus a guessed string thickness.
"""
import argparse, bpy, hashlib, json, math, sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ap = argparse.ArgumentParser()
ap.add_argument('source', type=Path)
ap.add_argument('output', type=Path)
ap.add_argument('--hit-source-frame', type=float, default=513.3)
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:])
bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
scene = bpy.context.scene
fps = scene.render.fps / scene.render.fps_base
assert fps == 120 and scene.frame_start == 0 and scene.frame_end == 480
root = bpy.data.objects['Racket_GripCenter']
strings = bpy.data.objects['RacketBatch_Racket_StringIvory']
contact = bpy.data.objects['Racket_ContactPoint']
normal_marker = bpy.data.objects['Racket_FaceNormal']
radius = .013
hit_time = (args.hit_source_frame - 480) / 25
assert 513 <= args.hit_source_frame <= 514, 'Contact outside observed uncertain frame interval'

def gltf(p): return [p.x, p.z, -p.y]
def native(p): return Vector((p[0], -p[2], p[1]))
def set_time(t):
    frame = min(480, max(0, t * fps))
    scene.frame_set(int(frame), subframe=frame % 1)
def pose(t):
    set_time(t)
    c = contact.matrix_world.translation.copy()
    n = (normal_marker.matrix_world.translation-c).normalized()
    return c, n

# Solve a sphere supported by real strings along the marked bed normal. The
# marker defines the intended tangential target only; no hidden surface offset.
c, n = pose(hit_time)
strings.data.calc_loop_triangles()
vertices = [strings.matrix_world @ v.co for v in strings.data.vertices]
triangles = [tuple(t.vertices) for t in strings.data.loop_triangles]
tree = BVHTree.FromPolygons(vertices, triangles, all_triangles=True)
low, high = 0., radius * 2
for _ in range(60):
    offset = (low+high)/2
    if tree.find_nearest(c+n*offset)[3] < radius: low = offset
    else: high = offset
cork = c+n*((low+high)/2)
surface, surface_normal, triangle, separation = tree.find_nearest(cork)
local_surface = root.matrix_world.inverted() @ surface
local_cork = root.matrix_world.inverted() @ cork
dt = 1/4800
positions=[]
for t in [hit_time-dt, hit_time+dt]:
    set_time(t)
    positions.append(root.matrix_world @ local_surface)
velocity = (positions[1]-positions[0])/(2*dt)

# A complete 4 s marker trace plus dense contact interval, all in actual seconds.
times = {i/480 for i in range(1921)} | {hit_time}
times.update(hit_time+i/4800 for i in range(-240,241))
rows=[]
for t in sorted(times):
    cc, nn = pose(t)
    point = root.matrix_world @ local_surface
    rows.append({'time':t,'sourceFrame':480+25*t if t<=2.4 else None,
      'modelFrame':120*t,'center':gltf(cc),'normal':gltf(nn),'surface':gltf(point),
      'corkSupport':gltf(root.matrix_world @ local_cork),
      'grip':gltf(root.matrix_world.translation)})
set_time(hit_time)
config = {'head_width':float(root['head_width']), 'head_height':float(root['head_height']),
          'head_tip':float(root['head_tip']), 'frame_radial_radius':float(root['frame_radial_radius'])}
bed_z = config['head_tip']-config['head_height']/2
width = config['head_width']/2-config['frame_radial_radius']
height = config['head_height']/2-config['frame_radial_radius']
ellipse = (local_surface.x/width)**2+((local_surface.z-bed_z)/height)**2
result = {'schema':'rally-racket-contact-extraction-v1','source':str(args.source.resolve()),
 'sourceSHA256':hashlib.sha256(args.source.read_bytes()).hexdigest(),
 'extractorSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
 'coordinateSystem':'glTF Y-up metres; Blender [x,y,z] -> [x,z,-y]',
 'modelFps':fps,'sourceFps':25,'referenceDuration':2.4,'authoringDuration':4,
 'hitSourceFrame':args.hit_source_frame,'hitTime':hit_time,
 'contact':{'markerCenter':gltf(c),'bedPoint':gltf(surface),'corkCenter':gltf(cork),
   'normal':gltf(n),'racketVelocity':gltf(velocity),'corkRadius':radius,
   'stringMesh':strings.name,'sourceStringTriangle':triangle,'stringVertices':len(vertices),
   'localSurfaceNative':list(local_surface),'localCorkCenterNative':list(local_cork),
   'actualStringDistanceM':separation,'surfaceGapM':separation-radius,
   'bedPlaneOffsetM':(cork-c).dot(n),'ellipse':ellipse,'racketDimensions':config},
 'rows':rows,'limits':['Source513—514 is a visually inferred contact interval, not a measured subframe.',
   'The sphere touches the actual rigid strings. Woven-string deformation and cork compression are not simulated.',
   'The restitution impulse uses the stringbed resultant normal, not a claim about measured impact forces.',
   'Source540 ends the observed segment at2.4s; 2.4—4s is the authored final hold.']}
assert abs(separation-radius)<1e-6 and ellipse<.8
args.output.parent.mkdir(parents=True,exist_ok=True)
args.output.write_text(json.dumps(result,indent=2))
print(json.dumps({k:result[k] for k in ['sourceSHA256','hitTime','contact']},indent=2))
