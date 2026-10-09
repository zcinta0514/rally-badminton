"""Sample actual rebuilt racket markers; kinematics only, no inferred flight.

Run Blender --background --python sample-racket.py -- INPUT.blend OUTPUT.json.
Coordinates named preview are Three.js x/up/z = Blender x/z/-y.
"""
import bpy, sys, json, hashlib, math
from pathlib import Path
from mathutils import Vector

src, output = map(Path, sys.argv[sys.argv.index('--') + 1:])
bpy.ops.wm.open_mainfile(filepath=str(src.resolve()))
scene = bpy.context.scene
rig = bpy.data.objects['RALLY_AnatomicalRig_Rebuilt']
fps = scene.render.fps / scene.render.fps_base
hz = 240
duration = scene.frame_end / fps
def preview(v): return [v.x, v.z, -v.y]
rows = []
for i in range(round(duration * hz) + 1):
    t = i / hz
    frame = t * fps
    scene.frame_set(int(frame), subframe=frame % 1)
    center = bpy.data.objects['Racket_ContactPoint'].matrix_world.translation.copy()
    marker = bpy.data.objects['Racket_FaceNormal'].matrix_world.translation.copy()
    normal = marker - center
    assert normal.length > 1e-5
    normal.normalize()
    row = {'time': t, 'modelFrame': frame, 'sourceFrame': 480 + t * 25,
           'center': preview(center), 'normal': preview(normal),
           'grip': preview(bpy.data.objects['Racket_GripCenter'].matrix_world.translation),
           'wrist': preview(rig.matrix_world @ rig.pose.bones['CTRL_hand_r'].head)}
    rows.append(row)
for i, row in enumerate(rows):
    a, b = rows[max(0,i-1)], rows[min(len(rows)-1,i+1)]
    row['velocity'] = [(y-x)/(b['time']-a['time']) for x,y in zip(a['center'],b['center'])]
    assert all(math.isfinite(v) for k in ['center','normal','grip','wrist','velocity'] for v in row[k])
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps({'source':str(src), 'sourceSHA256':hashlib.sha256(src.read_bytes()).hexdigest(),
  'sampleHz':hz, 'sceneFps':fps, 'rows':rows,
  'scope':'Geometric markers and finite-difference velocity only; no measured impact or flight.'}, indent=2))
print('SAMPLED', len(rows), 'CONTACT_CANDIDATE', rows[326])
