"""Export 480 Hz bones/props with every original 240 Hz surface sample retained.

Blender --background --python-exit-code 1 --python export.py -- --input FILE --output DIR
Encoding validation only: this script does not approve poses, contact or collisions.
"""
import argparse, hashlib, json, sys
from pathlib import Path
import bpy
import numpy as np

ap=argparse.ArgumentParser()
ap.add_argument('--input',required=True)
ap.add_argument('--output',required=True)
args=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
src=Path(args.input).resolve(); out=Path(args.output).resolve(); out.mkdir(parents=True,exist_ok=True)
assert src.is_file() and src.parent != out, 'Source must remain separate from export output'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(src))
s=bpy.context.scene; s.frame_start=0; s.frame_end=480; s.render.fps=120; s.render.fps_base=1
body=bpy.data.objects['SuperHero_Male']; rig=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt']
rackets=sorted([o for o in s.objects if o.type=='MESH' and o.get('rally_asset_role')=='racket'],key=lambda o:o.name)
assert len(rackets)==8, ('Expected every one of the 8 runtime racket meshes', [o.name for o in rackets])
root=bpy.data.objects['Racket_GripCenter']
assert root.parent==rig and root.parent_type=='BONE' and root.parent_bone=='DEF_hand_r'
descendants=set(root.children_recursive)
markers=sorted([o for o in s.objects if o.type=='EMPTY' and (o==root or o in descendants)],key=lambda o:o.name)
assert {'Racket_GripCenter','Racket_ContactPoint','Racket_FaceNormal','Racket_ButtEnd'} <= {o.name for o in markers}
assert all(o in descendants for o in rackets)
assert len(body.data.vertices)>0
C=np.array([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]],dtype=np.float64)
Ci=C.T
def coordinates(mesh):
    vertices=mesh.vertices if hasattr(mesh,'vertices') else mesh.data
    a=np.empty(len(vertices)*3,dtype=np.float32); vertices.foreach_get('co',a); return a.reshape((-1,3)).astype(np.float64)
def xyz(a):return a[:,[0,2,1]]*np.array([1,1,-1])
def world_array(obj,deps):
    e=obj.evaluated_get(deps); m=e.to_mesh(); a=coordinates(m); mat=np.array(e.matrix_world); e.to_mesh_clear()
    return xyz(a@mat[:3,:3].T+mat[:3,3])
def matrix_gltf(obj,deps):return (C@np.array(obj.evaluated_get(deps).matrix_world)@Ci).T.astype('<f4').reshape(-1)
def write_array(filename,a):
    arr=np.asarray(a,dtype='<f4'); assert np.isfinite(arr).all(),filename; arr.tofile(out/filename)
    return {'file':filename,'count':int(arr.size),'bytes':int(arr.nbytes),'sha256':sha(out/filename)}

rest=coordinates(body.data); bind=xyz(rest); bindInfo=write_array('body-bind.f32',bind)
keys=list(body.data.shape_keys.key_blocks)[1:] if body.data.shape_keys else []
assert all(k.relative_key==body.data.shape_keys.key_blocks[0] and not k.vertex_group for k in keys)
deltas=[coordinates(k)-rest for k in keys]
mixes=[]; transforms=[]; markerTransforms=[]; static=[]
s.frame_set(0); deps=bpy.context.evaluated_depsgraph_get()
for obj in rackets:
    e=obj.evaluated_get(deps); m=e.to_mesh(); co=coordinates(m); e.to_mesh_clear()
    assert len(co)>0 and np.isfinite(co).all()
    static.append(co)
racketInfo=[{'name':o.name,'vertexCount':len(a),'local':write_array('racket-%02d-local.f32'%i,xyz(a))} for i,(o,a) in enumerate(zip(rackets,static))]
with (out/'body-world.f32').open('wb') as bodyFile:
    for half in range(961):
        frame=half/2; s.frame_set(int(frame),subframe=frame%1); deps=bpy.context.evaluated_depsgraph_get()
        a=world_array(body,deps); assert a.shape==rest.shape and np.isfinite(a).all()
        a.astype('<f4').tofile(bodyFile)
        transforms.append([matrix_gltf(o,deps) for o in rackets]); markerTransforms.append([matrix_gltf(o,deps) for o in markers])
        for obj,base in zip(rackets,static):
            e=obj.evaluated_get(deps); m=e.to_mesh(); co=coordinates(m); e.to_mesh_clear()
            assert co.shape==base.shape and np.array_equal(co,base), ('Racket is not rigid',obj.name,frame)
        # Independent half-frame correctives must survive consolidation. Sampling
        # only integer frames would lose a corrective that is zero at f +/- 0.5.
        mix=rest.copy()
        for k,d in zip(keys,deltas):
            if not k.mute and abs(k.value)>1e-12: mix+=d*k.value
        mixes.append(mix)
        if half%120==0:print('SOURCE',frame,flush=True)
assert len(mixes)==961 and len(transforms)==961
worldInfo={'file':'body-world.f32','count':961*len(rest)*3,'bytes':(out/'body-world.f32').stat().st_size,'sha256':sha(out/'body-world.f32')}
transformInfo=write_array('racket-world-matrices.f32',transforms)
markerInfo=write_array('marker-world-matrices.f32',markerTransforms)

# Collapse additive correction layers, retaining their original integer and half-frame surfaces.
body.shape_key_clear(); body.shape_key_add(name='Basis')
for half,mix in enumerate(mixes):
    f=half/2
    k=body.shape_key_add(name='Surface240_%03d'%half); k.data.foreach_set('co',mix.astype(np.float32).ravel())
    for at in sorted({0,480,max(0,f-.5),min(480,f+.5)}-{f}):
        k.value=0; k.keyframe_insert(data_path='value',frame=at)
    k.value=1; k.keyframe_insert(data_path='value',frame=f)
for layer in body.data.shape_keys.animation_data.action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for fc in bag.fcurves:
                for k in fc.keyframe_points:k.interpolation='LINEAR'
original=np.memmap(out/'body-world.f32',dtype='<f4',mode='r',shape=(961,len(rest),3))
compressionMax=0; compressionFrame=None
for half in range(961):
    frame=half/2; s.frame_set(int(frame),subframe=frame%1)
    actual=world_array(body,bpy.context.evaluated_depsgraph_get())
    err=float(np.linalg.norm(actual-original[half],axis=1).max())
    if err>compressionMax:compressionMax=err;compressionFrame=frame
    if half%120==0:print('COMPRESSION',frame,err,flush=True)
compression={'samples':961,'sourceSampleHz':240,'surfaceKeys':961,'preservesIndependentHalfFrameCorrectives':True,'maxErrorM':compressionMax,'maxErrorFrame':compressionFrame,'thresholdM':2e-6,'passed':compressionMax<2e-6}
(out/'compression-qa.json').write_text(json.dumps(compression,indent=2))
assert compression['passed'],compression
# The exporter only accepts integer sample steps. Quadruple the COPY's animation
# clock to sample the original quarter-frames exactly, without changing real time.
# Surface targets remain 961; only bone/prop and weight time samples are denser.
# Merely exporting at 120 Hz makes constraint interpolation differ between Blender
# and glTF at half-frames; it does not satisfy the 10 micrometre parity contract.
for datablock in list(bpy.data.objects)+list(bpy.data.shape_keys):
    ad=getattr(datablock,'animation_data',None)
    if not ad:continue
    assert not any(not tr.mute for tr in ad.nla_tracks), 'Unsupported active NLA time remapping'
    for driver in ad.drivers:
        assert 'frame' not in driver.driver.expression, 'Frame-dependent driver requires explicit bake'
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    assert not fc.modifiers, 'FCurve modifier requires explicit time remapping'
                    for key in fc.keyframe_points:
                        key.co.x*=4;key.handle_left.x*=4;key.handle_right.x*=4
s.render.fps=480;s.frame_end=1920
s.frame_set(0)
# Match the diagnostic viewer's neutral body material; keep every racket material.
neutral=bpy.data.materials.new('RALLY_NeutralBodyReview');neutral.use_nodes=True;neutral.diffuse_color=(.3,.48,.53,1)
shader=neutral.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.3,.48,.53,1);shader.inputs['Roughness'].default_value=.78
body.data.materials.clear();body.data.materials.append(neutral)
for polygon in body.data.polygons:polygon.material_index=0
selected=[rig,body]+rackets+markers
bpy.ops.object.select_all(action='DESELECT')
for obj in selected:obj.hide_set(False);obj.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.wm.save_as_mainfile(filepath=str(out/'export.blend'))
# Blender 5.2's exporter silently discards weights <= 0.0001. The authored
# four-influence skin intentionally contains smaller positive weights; deleting
# them caused a measured 10.94 micrometre knee error. Preserve those weights in
# this process only, without modifying the installed addon, mesh or source file.
from io_scene_gltf2.blender.exp.primitive_extract import PrimitiveCreator
import io_scene_gltf2.blender.exp.primitive_extract as primitive_extract
smallWeights=[{'vertex':v.index,'group':body.vertex_groups[g.group].name,'weight':g.weight} for v in body.data.vertices for g in v.groups if 0<g.weight<=.0001]
def preserve_positive_bone_data(self):
    self.need_neutral_bone=False
    joint_name_to_index={joint.name:index for index,joint in enumerate(self.skin.joints)}
    group_to_joint=[joint_name_to_index.get(g.name) for g in self.blender_vertex_groups]
    self.vert_bones=[];max_num_influences=0
    for vertex in self.blender_mesh.vertices:
        bones=[]
        for group_element in vertex.groups:
            weight=group_element.weight
            if weight<=0:continue
            joint=group_to_joint[group_element.group] if group_element.group<len(group_to_joint) else None
            if joint is not None:bones.append((joint,weight))
        bones.sort(key=lambda x:x[1],reverse=True)
        assert len(bones)<=4,('More than four positive deform influences; refusing truncation',vertex.index,len(bones))
        if not bones:bones=[(len(self.skin.joints),1.0)];self.need_neutral_bone=True
        self.vert_bones.append(bones);max_num_influences=max(max_num_influences,len(bones))
    self.num_joint_sets=(max_num_influences+3)//4
PrimitiveCreator._PrimitiveCreator__get_bone_data=preserve_positive_bone_data
skinEncoding={'method':'Preserve every positive source weight; process-local exporter method override only','vendorDefaultDiscardThreshold':.0001,'effectiveDiscardThreshold':0,'maxPositiveInfluences':4,'sourceWeightsModified':False,'quantizationCompensationM':0,'affectedVertices':len({x['vertex'] for x in smallWeights}),'preservedSmallWeights':smallWeights,'vendorModule':str(Path(primitive_extract.__file__).resolve()),'vendorModuleSHA256':sha(primitive_extract.__file__)}
(out/'skin-encoding.json').write_text(json.dumps(skinEncoding,indent=2))
bpy.ops.export_scene.gltf(filepath=str(out/'clear.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_force_sampling=True,export_sampling_interpolation_fallback='LINEAR',export_optimize_animation_size=False,export_frame_range=True,export_frame_step=1,export_morph=True,export_morph_animation=True,export_extras=True)
manifest={'schema':'rally-full-export-v1','source':str(src),'sourceSHA256':sha(src),'exporterSHA256':sha(__file__),'checkerSHA256':sha(Path(__file__).with_name('check-export.mjs')),'glbSHA256':sha(out/'clear.glb'),'scope':'Encoding only. No pose, grip, collision, or professional-motion acceptance.','bodyMaterial':'Neutral PBR in export copy, matching diagnostic viewer; source body and all racket materials unchanged.','fps':120,'frameStart':0,'frameEnd':480,'sampleCount':961,'sampleStepFrames':.5,'exportSamplingHz':480,'surfaceSamplingHz':240,'exportCopyFrames':[0,1920],'durationSeconds':4,'coordinateSystem':'glTF Y-up right handed; matrices column major','body':{'name':body.name,'vertexCount':len(rest),'bind':bindInfo,'world':worldInfo},'rackets':racketInfo,'racketWorldMatrices':transformInfo,'markers':[o.name for o in markers],'markerWorldMatrices':markerInfo,'requiredBoneParent':'DEF_hand_r','compression':compression,'selectedObjects':[o.name for o in selected]}
manifest['skinEncoding']={'file':'skin-encoding.json','sha256':sha(out/'skin-encoding.json'),'preservesAllPositiveWeights':True}
(out/'fixture.json').write_text(json.dumps(manifest,indent=2));print('EXPORTED',out,flush=True)
