"""Build the editable Blender arena and its in-game asset. Run with blender -b -P build.py."""
from pathlib import Path
import sys
import bpy
from mathutils import Vector

folder = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(folder))
from architecture import build_architecture
from equipment import build_equipment
from officials import build_officials

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
output = Path(args[0]).resolve() if args else next(p for p in folder.parents if (p/'src'/'view.js').exists())
art = output / 'art' / 'arena'
art.mkdir(parents=True, exist_ok=True)
models = output / 'src' / 'models'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = -.8
scene.cycles.samples = 12
scene.cycles.use_denoising = True
scene.render.fps = 24
scene.frame_start = 1
scene.frame_end = 140
scene.render.resolution_x = 1440
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.world = bpy.data.worlds.new('Arena indirect environment')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.26,.33,.40,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .24
scene.unit_settings.system = 'METRIC'
build_architecture()
build_equipment()
rubber=bpy.data.materials['Court_Mat_Green']
rubber.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.012,.146,.075,1)
noise=rubber.node_tree.nodes.new('ShaderNodeTexNoise')
coord=rubber.node_tree.nodes.new('ShaderNodeTexCoord')
rubber.node_tree.links.new(coord.outputs['Object'],noise.inputs['Vector'])
noise.inputs['Scale'].default_value=170
noise.inputs['Detail'].default_value=2.0
bump=rubber.node_tree.nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value=.19
bump.inputs['Distance'].default_value=.0015
rubber.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height'])
rubber.node_tree.links.new(bump.outputs['Normal'],rubber.node_tree.nodes.get('Principled BSDF').inputs['Normal'])
officials = build_officials()
scene.frame_set(1)

production = bpy.data.collections.new('Broadcast cameras and scoreboard captions')
scene.collection.children.link(production)
players_path=art/'ready-players.glb'
if players_path.exists():
    before=set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(players_path))
    for item in set(scene.objects)-before:
        for collection in list(item.users_collection):
            collection.objects.unlink(item)
        production.objects.link(item)
def camera(name, at, target, lens):
    data = bpy.data.cameras.new(name)
    obj = bpy.data.objects.new(name, data)
    production.objects.link(obj)
    obj.location = at
    obj.rotation_euler = (Vector(target)-Vector(at)).to_track_quat('-Z','Y').to_euler()
    data.lens = lens
    data.clip_end = 120
    if lens >= 40:
        data.dof.use_dof = True
        data.dof.focus_distance = (Vector(target)-Vector(at)).length
        data.dof.aperture_fstop = 2.2
    return obj

wide = camera('A | Centre court', (8.4,-12.9,6.0), (0,0,1.65), 22)
line = camera('B | Baseline call', (2.40,-5.50,1.57), (5.65,-6.70,.94), 55)
chair = camera('C | Chair umpire', (-.97,-1.55,2.66), (-4.14,0,1.97), 48)
bench = camera('D | Scoreboard', (-.9,5.3,1.95), (-4.25,9.45,1.27), 48)
roof = camera('E | Lighting galleries', (-2.0,-9.2,1.68), (0,3,7.10), 25)
for frame, cam in [(1,wide),(15,line),(34,chair),(61,wide),(75,line),(111,chair),(124,bench),(137,wide)]:
    scene.timeline_markers.new(cam.name, frame=frame).camera=cam

fontmat = bpy.data.materials.new('Score pixels | mint')
fontmat.diffuse_color = (.55,.93,.78,1)
fontmat.use_nodes = True
b = fontmat.node_tree.nodes.get('Principled BSDF')
b.inputs['Base Color'].default_value = (.55,.93,.78,1)
b.inputs['Emission Color'].default_value = (.55,.93,.78,1)
b.inputs['Emission Strength'].default_value = .7
def caption(name, body, x,z, size):
    data = bpy.data.curves.new(name,'FONT')
    data.body = body
    data.size = size
    data.materials.append(fontmat)
    obj = bpy.data.objects.new(name,data)
    production.objects.link(obj)
    obj.location = (x,9.428,z)
    obj.rotation_euler.x = 1.5707963268
    return obj
caption('Panel header','RALLY  /  CENTRE COURT',-5.32,1.58,.16)
for label,x in [('NEAR',-5.32),('FAR',-4.12)]:
    caption('Team '+label,label,x,1.35,.14)
for x,values,change in [(-5.32,('00','01'),25),(-4.12,('00','01'),85)]:
    for index,value in enumerate(values):
        number=caption('Score '+value,value,x,.99,.39)
        for f,visible in [(1,index==0),(change-1,index==0),(change,index==1)]:
            number.scale=(1,1,1) if visible else (0,0,0)
            number.keyframe_insert(data_path='scale',frame=f)

# The broadcast timeline shows only the responsible baseline judge.
# All four officials retain their authored clips for the runtime export.
muted = []
for root in officials:
    if root.name in ('Umpire_Main','LJ_Base_Near'):
        continue
    for obj in root.children_recursive:
        if obj.animation_data and obj.animation_data.action:
            muted.append((obj,obj.animation_data.action,obj.animation_data.action_slot))
            obj.animation_data.action.use_fake_user = True
            obj.animation_data.action = None
scene.camera=wide
scene.frame_set(1)
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.overlay.show_overlays=False
        area.spaces.active.shading.color_type='MATERIAL'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(art/'Rally Open.blend'), compress=True)
for obj, action, slot in muted:
    obj.animation_data.action = action
    obj.animation_data.action_slot = slot
for obj in list(production.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
# The game renders its existing impact-responsive cloth between the authored posts.
for obj in list(scene.objects):
    if obj.name.startswith('CompetitionNet_'):
        bpy.data.objects.remove(obj, do_unlink=True)
if (folder/'optimize.py').exists() and '--full' not in args:
    from optimize import prepare_export
    prepare_export()
scene.frame_start = 0
scene.frame_set(0)
out = models/'tournament-hall.glb'
bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', export_apply=True,
    export_extras=True, export_animations=True, export_animation_mode='ACTIVE_ACTIONS',
    export_frame_range=True, export_frame_step=2, export_lights=False, export_cameras=False)
print('ARENA READY',out.stat().st_size,flush=True)
