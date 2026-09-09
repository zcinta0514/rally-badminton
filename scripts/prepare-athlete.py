"""Build the CC0 athlete derivative with Blender, without paid source files.

Run Blender --background --factory-startup --python scripts/prepare-athlete.py.
See docs/CHARACTER-ASSETS.md for the source archive and reproducible paths.
"""
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'artifacts/assets-source/base/Universal Base Characters[Standard]'
OUTPUT = ROOT / 'src/models/athlete.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE / 'Base Characters/Godot - UE/Superhero_Male_FullBody.gltf'))
armature = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
body = bpy.data.objects['SuperHero_Male']
eyebrows = bpy.data.objects['Eyebrows']
eyes = bpy.data.objects['Eyes']

def game(p):
    return Vector((-p.x, p.z, p.y))

def blender(p):
    return Vector((p.x, -p.z, p.y))

bind = {'pelvis': (0, .92, 0), 'spineLow': (0, 1.04, 0), 'spine': (0, 1.15, 0),
        'chest': (0, 1.43, 0), 'neck': (0, 1.52, 0), 'head': (0, 1.69, 0)}
source_names = {'pelvis': 'pelvis', 'spine_01': 'spineLow', 'spine_02': 'spine',
                'spine_03': 'chest', 'neck_01': 'neck', 'Head': 'head'}
segments = {}
for side, sign, suffix in [('left', -1, 'l'), ('right', 1, 'r')]:
    bind.update({side+'Shoulder': (sign*.245, 1.435, 0), side+'Elbow': (sign*.565, 1.435, 0),
                 side+'Wrist': (sign*.875, 1.435, 0), side+'Hip': (sign*.145, .875, 0),
                 side+'Knee': (sign*.145, .425, 0), side+'Ankle': (sign*.145, -.005, 0)})
    for old, new in [('upperarm', 'Shoulder'), ('lowerarm', 'Elbow'), ('hand', 'Wrist'),
                     ('thigh', 'Hip'), ('calf', 'Knee'), ('foot', 'Ankle')]:
        source_names[old+'_'+suffix] = side+new
    segments.update({side+'Shoulder': (side+'Elbow', .78), side+'Elbow': (side+'Wrist', .86),
                     side+'Hip': (side+'Knee', .85), side+'Knee': (side+'Ankle', .92)})
bind = {k: Vector(v) for k, v in bind.items()}
origin = {new: game(armature.data.bones[old].head_local) for old, new in source_names.items()}
# The game's head joint is the face centre, while the author bone is at the neck.
origin['head'] = Vector((0, 1.69, .0174))
transforms = {}
for name, target in bind.items():
    if name in segments:
        end, radial = segments[name]
        before = origin[end] - origin[name]
        after = bind[end] - target
        transforms[name] = (before.normalized(), before.rotation_difference(after), after.length/before.length, radial)

def converted(p, weights):
    result = Vector()
    for name, weight in weights.items():
        d = game(p) - origin[name]
        if name in transforms:
            axis, rotation, stretch, radial = transforms[name]
            along = axis * d.dot(axis)
            d = rotation @ (along*stretch + (d-along)*radial)
        elif name in ('head', 'neck'):
            d *= .96
            # The cut nape tucks inside the retained neck instead of leaving a
            # small shoulder-surface point behind the jaw in side view.
            if name == 'head' and p.z < 1.65 and p.y > .05:
                d.z = min(d.z, .028)
        else:
            d.x *= .88
            d.z *= .88
        result += (bind[name] + d) * weight
    return result

all_objects = []
def material(name, hex_color):
    m = bpy.data.materials.new(name)
    # Blender socket colours are linear; match THREE.Color(hex).
    def linear(v):
        v = v/255
        return v/12.92 if v < .04045 else ((v+.055)/1.055)**2.4
    rgb = [linear((hex_color>>n)&255) for n in (16, 8, 0)]
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = .82
    return m

mats = {name: material('rally-'+name, color) for name, color in
        [('skin', 0xd8a27b), ('shirt', 0xf07759), ('dark', 0x16313d), ('accent', 0xffd69b), ('hair', 0x222c2d)]}

def mesh(name, vertices, faces, weights, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata([blender(Vector(v)) for v in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for bone_name in bind:
        group = obj.vertex_groups.new(name=bone_name)
        for i, values in enumerate(weights):
            if values.get(bone_name, 0) > .00001:
                group.add([i], values[bone_name], 'REPLACE')
    for p in data.polygons:
        p.use_smooth = True
    all_objects.append(obj)
    return obj

def source_mesh(obj, keep, mat, fixed=None):
    vertices, weights, faces, lookup = [], [], [], {}
    group_names = {g.index: g.name for g in obj.vertex_groups}
    for vertex in obj.data.vertices:
        p = obj.matrix_world @ vertex.co
        if not keep(p):
            continue
        mapped = {}
        for group in vertex.groups:
            old = group_names[group.group]
            name = source_names.get(old)
            if name is None:
                name = 'chest' if old.startswith('clavicle') else 'head'
            mapped[name] = mapped.get(name, 0) + group.weight
        fixed_name = fixed(p) if callable(fixed) else fixed
        if fixed_name:
            mapped = {fixed_name: 1}
        total = sum(mapped.values())
        if total == 0:
            mapped, total = {'head': 1}, 1
        mapped = {n: w/total for n, w in mapped.items()}
        lookup[vertex.index] = len(vertices)
        vertices.append(converted(p, mapped))
        weights.append(mapped)
    for face in obj.data.polygons:
        if all(i in lookup for i in face.vertices):
            faces.append([lookup[i] for i in face.vertices])
    return mesh('Rally-'+obj.name, vertices, faces, weights, mat)

source_mesh(body, lambda p: (p.z > 1.59 and abs(p.x) < .135) or
            (.301 < abs(p.x) < .704 and p.z > 1.25) or (.075 < p.z < .76), mats['skin'],
            lambda p: 'head' if p.z > 1.59 and abs(p.x) < .135 else None)
source_mesh(eyebrows, lambda p: True, mats['hair'], 'head')
# Small dark eyes keep their sculpted shape without multi-megabyte source maps.
source_mesh(eyes, lambda p: True, mats['dark'], 'head')
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(SOURCE / 'Hairstyles/Origin at 0/glTF (Godot)/Hair_SimpleParted.gltf'))
for obj in set(bpy.data.objects)-before:
    if obj.type == 'MESH' and 'Icosphere' not in obj.name:
        source_mesh(obj, lambda p: True, mats['hair'], 'head')

def loft(name, rings, axis, weights_for, mat, sides=24):
    vertices, faces, weights = [], [], []
    for distance, r1, r2, c1, c2 in rings:
        for i in range(sides):
            angle = i/sides*math.tau
            p = Vector((c1+math.cos(angle)*r1, distance, c2+math.sin(angle)*r2)) if axis=='y' else Vector((distance, c1+math.cos(angle)*r1, c2+math.sin(angle)*r2))
            vertices.append(p)
            weights.append(weights_for(p))
    for r in range(len(rings)-1):
        for i in range(sides):
            a, b = r*sides+i, r*sides+(i+1)%sides
            faces.append((a, a+sides, b+sides, b) if axis=='y' else (a, b, b+sides, a+sides))
    return mesh(name, vertices, faces, weights, mat)

def trunk(p):
    lower, upper = ('pelvis', 'spine') if p.y < 1.15 else ('spine', 'chest')
    t = min(1, max(0, (p.y-bind[lower].y)/(bind[upper].y-bind[lower].y)))
    return {lower: 1-t, upper: t}

loft('Sport-jersey', [(.89,.171,.116,0,0),(.97,.176,.116,0,0),(1.07,.178,.116,0,0),(1.18,.18,.113,0,0),
    (1.31,.209,.124,0,0),(1.41,.245,.125,0,0),(1.465,.25,.112,0,0),
    (1.50,.145,.086,0,0),(1.525,.064,.052,0,0)], 'y', trunk, mats['shirt'])
loft('Collar', [(1.511,.078,.060,0,0),(1.531,.067,.054,0,0)], 'y', trunk, mats['dark'])
loft('Jersey-hem', [(.89,.172,.117,0,0),(.912,.174,.117,0,0)], 'y', trunk, mats['accent'])
for side, sign in [('left',-1),('right',1)]:
    def weight(p, side=side):
        t = min(1, max(0, (abs(p.x)-.15)/.12))
        t = t*t*(3-2*t)
        return {'chest': 1-t, side+'Shoulder': t}
    rings=[(sign*d,r,r*.96,1.435,0) for d,r in [(.14,.032),(.195,.064),(.24,.080),(.28,.079),(.34,.073),(.393,.066)]]
    if sign < 0: rings.reverse()
    loft(side+'-sleeve',rings,'x',weight,mats['shirt'],20)
    rings=[(sign*d,r,r*.96,1.435,0) for d,r in [(.376,.069),(.397,.067)]]
    if sign < 0: rings.reverse()
    loft(side+'-cuff',rings,'x',weight,mats['accent'],20)

# A pair of cloth inlays follows the chest rather than floating above it.
for stripe in range(2):
    vertices, faces = [], []
    for step in range(10):
        x = -.12 + step/9*.27
        for edge in (-1, 1):
            y = 1.255 + x*.48 + stripe*.036 + edge*.007
            rx = .18 + (y-1.18)/.13*.029
            rz = .113 + (y-1.18)/.13*.011
            z = -math.sqrt(max(0, 1-(x/rx)**2))*rz-.002
            vertices.append(Vector((x,y,z)))
        if step:
            a=(step-1)*2
            faces.append((a,a+1,a+3,a+2))
    mesh('Jersey-inlay-'+str(stripe),vertices,faces,[trunk(p) for p in vertices],mats['accent'])

# Flat semantic rig: the runtime supplies exact contact/foot positions each frame.
data=bpy.data.armatures.new('Rally-Semantic-Rig')
rig=bpy.data.objects.new('Rally-Semantic-Rig',data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,p in bind.items():
    bone=data.edit_bones.new(name)
    bone.head=blender(p)
    bone.tail=bone.head+Vector((0,0,.08))
bpy.ops.object.mode_set(mode='OBJECT')
for obj in all_objects:
    modifier=obj.modifiers.new('Rally-Skin','ARMATURE')
    modifier.object=rig
    obj.parent=rig
# Join into one mesh; the export retains material groups and weight names.
bpy.ops.object.select_all(action='DESELECT')
for obj in all_objects: obj.select_set(True)
bpy.context.view_layer.objects.active=all_objects[0]
bpy.ops.object.join()
athlete=bpy.context.object
athlete.name='Rally-Athlete'
athlete['source']='Quaternius Universal Base Characters Standard, CC0; modified for RALLY'
athlete['adapter']='rally-semantic-v1'
bpy.ops.object.select_all(action='DESELECT')
athlete.select_set(True)
rig.select_set(True)
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT),export_format='GLB',use_selection=True,
    export_animations=False,export_skins=True,export_yup=True,export_apply=False,
    export_extras=True,export_texcoords=False,export_tangents=False)
print('RALLY_ASSET',json.dumps({'bytes':OUTPUT.stat().st_size,'vertices':len(athlete.data.vertices),
    'polygons':len(athlete.data.polygons),'bones':len(bind),'materials':[m.name for m in athlete.data.materials]}))
