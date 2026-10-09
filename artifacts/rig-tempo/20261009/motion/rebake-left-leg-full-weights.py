"""Re-evaluate DQ volume for new left-leg poses, preserving legacy residuals elsewhere.
The frozen file encodes DQ-minus-LBS in FreshVolume shape keys. New joint
orientations need a new DQ-minus-LBS term, not old-pose volume pushed harder.
"""
import bpy,sys,json,numpy as np,hashlib
from pathlib import Path
src,out=map(Path,sys.argv[sys.argv.index('--')+1:]);out.mkdir(parents=True,exist_ok=True)
author=Path('artifacts/rig-rebuild/20261007/integration/author-body-13/rebuild.blend');bpy.ops.wm.open_mainfile(filepath=str(author.resolve()));ab=bpy.data.objects['SuperHero_Male'];authorRest=np.array([v.co[:] for v in ab.data.vertices]);authorWeights=[[(ab.vertex_groups[g.group].name,g.weight) for g in v.groups] for v in ab.data.vertices]
bpy.ops.wm.open_mainfile(filepath=str(src.resolve()));s=bpy.context.scene;r=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];b=bpy.data.objects['SuperHero_Male'];mod=next(m for m in b.modifiers if m.type=='ARMATURE');assert not mod.use_deform_preserve_volume;rest=np.array([v.co[:] for v in b.data.vertices]);keys=list(b.data.shape_keys.key_blocks);fresh=[k for k in keys if k.name.startswith('FreshVolume_')];assert len(fresh)==481
assert np.max(np.abs(rest-authorRest))<1e-8,'Author rest surface mismatch'
probeMesh=bpy.data.meshes.new('TemporaryFullWeightDQMesh');probeMesh.from_pydata(rest.tolist(),[],[list(p.vertices) for p in b.data.polygons]);probe=bpy.data.objects.new('TemporaryFullWeightDQProbe',probeMesh);s.collection.objects.link(probe);probe.matrix_world=b.matrix_world.copy();pm=probe.modifiers.new('Full weight DQ author surface','ARMATURE');pm.object=r;pm.use_deform_preserve_volume=True
for name in {name for v in authorWeights for name,w in v}:probe.vertex_groups.new(name=name)
for i,v in enumerate(authorWeights):
 for name,w in v:probe.vertex_groups[name].add([i],w,'REPLACE')
names=list(r.pose.bones.keys());bid={n:i for i,n in enumerate(names)};gn={g.index:g.name for g in b.vertex_groups};wi=np.zeros((len(rest),4),int);weights=np.zeros((len(rest),4));leftWeight=np.zeros(len(rest))
for v in b.data.vertices:
 for i,g in enumerate(v.groups):
  name=gn[g.group];wi[v.index,i]=bid[name];weights[v.index,i]=g.weight
  if any(stem in name for stem in ['thigh_l','calf_l','foot_l','ball_l']):leftWeight[v.index]+=g.weight
mask=np.minimum(1,leftWeight/.12);mask=mask*mask*(3-2*mask)
prefix=b.matrix_world.inverted()@r.matrix_world;suffix=r.matrix_world.inverted()@b.matrix_world;new=[];reports=[]
def evaluate():
 bpy.context.view_layer.update();ev=b.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();a=np.array([v.co[:] for v in me.vertices]);ev.to_mesh_clear();return a
for half in range(48,145):
 f=half/2;s.frame_set(int(f),subframe=f%1)
 for k,at in new:k.value=0
 vals=[k.value for k in keys];full=evaluate()
 for k in fresh:k.value=0
 noFresh=evaluate()
 for k in keys[1:]:k.value=0
 rawLBS=evaluate();pev=probe.evaluated_get(bpy.context.evaluated_depsgraph_get());pme=pev.to_mesh();rawDQ=np.array([v.co[:] for v in pme.vertices]);pev.to_mesh_clear()
 for k,v in zip(keys,vals):k.value=v
 delta=((rawDQ-rawLBS)-(full-noFresh))*mask[:,None]
 # Changes fade to the unchanged boundary controls. No adjustment outside24..72.
 edge=min(1,(f-24)/1.,(72-f)/1.);edge=max(0.,edge);delta*=edge*edge*(3-2*edge)
 matrices=np.array([np.array((prefix@r.pose.bones[n].matrix@r.pose.bones[n].bone.matrix_local.inverted()@suffix).to_3x3()) for n in names]);linear=np.sum(matrices[wi]*weights[:,:,None,None],axis=1);rd=np.linalg.solve(linear,delta[:,:,None])[:,:,0]
 if np.linalg.norm(delta,axis=1).max()>1e-7:
  key=b.shape_key_add(name=f'Oct09LeftLegDQ_{half:04}',from_mix=False);key.data.foreach_set('co',(rest+rd).astype(np.float32).ravel());key.value=0;new.append((key,f))
 reports.append({'frame':f,'maxWorldDeltaM':float(np.linalg.norm(delta,axis=1).max()),'changedVertices':int(np.sum(np.linalg.norm(delta,axis=1)>1e-7))})
for key,f in new:
 for t in sorted({0,480,max(24,f-.5),min(72,f+.5)}-{f}):key.value=0;key.keyframe_insert(data_path='value',frame=t)
 key.value=1;key.keyframe_insert(data_path='value',frame=f)
for l in b.data.shape_keys.animation_data.action.layers:
 for st in l.strips:
  for bag in st.channelbags:
   for fc in bag.fcurves:
    if 'Oct09LeftLegDQ_' in fc.data_path:
     for k in fc.keyframe_points:k.interpolation='LINEAR'
bpy.data.objects.remove(probe,do_unlink=True);bpy.data.meshes.remove(probeMesh)
s.frame_set(0);bpy.ops.wm.save_as_mainfile(filepath=str((out/'rebuild.blend').resolve()),compress=True);report={'source':str(src),'fullWeightAuthor':str(author),'rangeModelFrames':[24,72],'sampleHz':240,'newKeys':len(new),'maxWorldVolumeReplacementM':max(x['maxWorldDeltaM'] for x in reports),'leftLegWeightMask':'smoothstep(min(1,sum(left thigh/calf/foot/toe weight)/.12))','rows':reports,'scope':'Replace transported old full-weight-DQ-minus-four-weight-LBS volume with new-pose full-weight DQ compensation, while retaining every old key. Additional surface QA required.'};(out/'volume-rebake.json').write_text(json.dumps(report,indent=2));print('REBAKE',report['newKeys'],report['maxWorldVolumeReplacementM'],flush=True)
