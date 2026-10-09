"""Measure full-state clock parity, including unchanged strike/recovery surfaces."""
import bpy,sys,json,hashlib,math
from pathlib import Path
import numpy as np
src,candidate,out=map(Path,sys.argv[sys.argv.index('--')+1:]);report=json.loads((candidate.parent/'construction.json').read_text());xx=np.array(report['newModelTimes']);yy=np.array(report['oldModelTimes']);frames=sorted(set([i*.25 for i in range(96,213)]+[i*4.8 for i in range(61)]+[0,480]));saved={}
def load(p):
 bpy.ops.wm.open_mainfile(filepath=str(p.resolve()));return bpy.context.scene,bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'],bpy.data.objects['SuperHero_Male']
def state(s,r,b,f):
 s.frame_set(int(f),subframe=f%1);deps=bpy.context.evaluated_depsgraph_get();ev=b.evaluated_get(deps);m=ev.to_mesh();co=np.array([(ev.matrix_world@v.co)[:] for v in m.vertices]);ev.to_mesh_clear();mat=np.array([list(row) for p in r.pose.bones for row in p.matrix]);kv=np.array([k.value for k in b.data.shape_keys.key_blocks]);return co,mat,kv
s,r,b=load(src)
for f in frames:
 old=float(np.interp(f,xx,yy)) if xx[0]<f<xx[-1] else f;saved[f]=state(s,r,b,old)
s,r,b=load(candidate);rows=[]
for f in frames:
 expected=saved[f];actual=state(s,r,b,f);rows.append({'frame':f,'sourceFrame':480+f/4.8,'editedClock':bool(xx[0]<f<xx[-1]),'maxSurfaceErrorM':float(np.linalg.norm(expected[0]-actual[0],axis=1).max()),'maxPoseMatrixDifference':float(np.abs(expected[1]-actual[1]).max()),'maxShapeValueDifference':float(np.abs(expected[2]-actual[2]).max())})
result={'source':str(src),'candidate':str(candidate),'sourceSHA256':hashlib.sha256(src.read_bytes()).hexdigest(),'candidateSHA256':hashlib.sha256(candidate.read_bytes()).hexdigest(),'samples':len(rows),'maxSurfaceErrorM':max(x['maxSurfaceErrorM'] for x in rows),'maxUneditedSurfaceErrorM':max(x['maxSurfaceErrorM'] for x in rows if not x['editedClock']),'surfaceThresholdM':1e-5,'maxPoseMatrixDifference':max(x['maxPoseMatrixDifference'] for x in rows),'maxShapeValueDifference':max(x['maxShapeValueDifference'] for x in rows),'rows':rows,'scope':'Matches final evaluated body/whole-rig/surface keys to original at the common mapped time. All 61 source-frame samples plus dense early timing samples; does not establish professional fidelity.'};result['passed']=result['maxSurfaceErrorM']<1e-5 and result['maxUneditedSurfaceErrorM']<1e-8;out.write_text(json.dumps(result,indent=2));print('CLOCK PARITY',{k:v for k,v in result.items() if k not in ['rows']},flush=True);assert result['passed']
