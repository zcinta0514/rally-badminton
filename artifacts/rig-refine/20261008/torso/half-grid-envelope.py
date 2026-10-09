"""Lift quarter-frame diagnostic residuals onto an export-safe half-frame envelope."""
import bpy,numpy as np,json,sys
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:];base=Path(args[0]);probe=Path(args[1]);out=Path(args[2]);out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(probe.resolve()));b=bpy.data.objects['SuperHero_Male'];rest=np.array([v.co[:] for v in b.data.vertices]);d=[];names=[]
for key in b.data.shape_keys.key_blocks:
 if key.name.startswith('Oct08HipResidual_') and '.' in key.name:
  d.append(np.array([v.co[:] for v in key.data])-rest);names.append(key.name)
assert len(d)==2,(len(d),names)
delta=d[0]+d[1]
bpy.ops.wm.open_mainfile(filepath=str(base.resolve()));b=bpy.data.objects['SuperHero_Male'];r=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];s=bpy.context.scene;rest=np.array([v.co[:] for v in b.data.vertices]);assert np.max(np.abs(delta[rest[:,2]<.85]))==0
key=b.shape_key_add(name='Oct08HipResidual_RecoveryEnvelope',from_mix=False);key.data.foreach_set('co',(rest+delta).astype(np.float32).ravel())
for f,v in [(0,0),(198,0),(198.5,1),(199.5,1),(200,0),(480,0)]:key.value=v;key.keyframe_insert(data_path='value',frame=f)
for layer in b.data.shape_keys.animation_data.action.layers:
 for strip in layer.strips:
  for bag in strip.channelbags:
   for fc in bag.fcurves:
    if 'RecoveryEnvelope' in fc.data_path:
     for k in fc.keyframe_points:k.interpolation='LINEAR'
s.frame_set(0);bpy.ops.wm.save_as_mainfile(filepath=str((out/'rebuild.blend').resolve()));(out/'envelope.json').write_text(json.dumps({'base':str(base),'quarterDiagnosticOnly':str(probe),'diagnosticKeysUsed':names,'finalKey':key.name,'keyframes':[[0,0],[198,0],[198.5,1],[199.5,1],[200,0],[480,0]],'maximumRestResidualM':float(np.linalg.norm(delta,axis=1).max()),'outsideZSplitDelta':float(np.max(np.abs(delta[rest[:,2]<.85]))),'quarterKeysCopied':False,'gateStatus':'pending independent audit'},indent=2));print('ENVELOPE',float(np.linalg.norm(delta,axis=1).max()),flush=True)
