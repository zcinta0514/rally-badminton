"""Reloaded, independent audit of a split hip-only additive residual."""
import bpy,sys,json,numpy as np,hashlib
from pathlib import Path
from mathutils.bvhtree import BVHTree
args=sys.argv[sys.argv.index('--')+1:];src=Path(args[0]);out=Path(args[1]);bpy.ops.wm.open_mainfile(filepath=str(src.resolve()));s=bpy.context.scene;r=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];body=bpy.data.objects['SuperHero_Male'];body.data.calc_loop_triangles();rest=np.array([v.co[:] for v in body.data.vertices]);faces=[tuple(t.vertices) for t in body.data.loop_triangles];w={};ids=[w.setdefault(tuple(round(c,6) for c in v.co),len(w)) for v in body.data.vertices];corners=[{ids[i] for i in f} for f in faces];edges=np.array([tuple(e.vertices) for e in body.data.edges]);a,b=edges[:,0],edges[:,1];L=np.linalg.norm(rest[a]-rest[b],axis=1);mid=(rest[a]+rest[b])/2;mask=np.zeros(len(edges),bool);movable=np.zeros(len(rest),bool)
for side in ['l','r']:
 c=np.array(r.data.bones['CTRL_thigh_'+side].head_local[:]);mask|=np.linalg.norm(mid-c,axis=1)<.13;movable|=np.linalg.norm(rest-c,axis=1)<.18
movable&=rest[:,2]>=.85;mask&=(L>=.005)&(movable[a]|movable[b]);keys=[k for k in body.data.shape_keys.key_blocks if k.name.startswith('Oct08HipResidual_')];assert keys
outside=0;restMax=0;modified=set();buf=np.empty(len(rest)*3,np.float32)
for key in keys:
 key.data.foreach_get('co',buf);delta=buf.reshape((-1,3))-rest;outside=max(outside,float(np.abs(delta[~movable]).max()));mag=np.linalg.norm(delta,axis=1);restMax=max(restMax,float(mag.max()));modified.update(np.flatnonzero(mag>1e-7).tolist())
frames=[i/2 for i in range(961)] if len(args)<3 else [i/4 for i in range(520,1281)]
rows=[];bad=[];worldMax=0
for f in frames:
 s.frame_set(int(f),subframe=f%1);ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();pts=[v.co.copy() for v in mesh.vertices];arr=np.array(pts);tree=BVHTree.FromPolygons(pts,faces,all_triangles=True);allPairs=[(i,j) for i,j in tree.overlap(tree) if i<j and not corners[i]&corners[j]];pairs=[(i,j) for i,j in allPairs if movable[list(faces[i])].any() or movable[list(faces[j])].any()];ratio=(np.linalg.norm(arr[a]-arr[b],axis=1)/np.maximum(L,1e-12))[mask];row={'frame':f,'hipPairs':len(pairs),'wholeBodyPairsIncludingOtherAgentScope':len(allPairs),'minHipEdgeRatio':float(ratio.min()),'maxHipEdgeRatio':float(ratio.max())};rows.append(row);ev.to_mesh_clear()
 if pairs or ratio.min()<.35 or ratio.max()>1.8:bad.append({**row,'pairs':pairs[:12]})
report={'source':str(src),'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'sampleHz':240 if len(args)<3 else 480,'frameInterval':[frames[0],frames[-1]],'samples':len(frames),'shapeKeyPrefix':'Oct08HipResidual_','addedShapeKeyCount':len(keys),'changedRestVertexIndices':sorted(modified),'maxResidualRestMagnitudeM':restMax,'maximumRestDeltaOutsideSplitM':outside,'rows':rows,'failures':bad,'passed':not bad and outside==0,'limits':'Hip-only audit. Lower-body pairs are disclosed but are outside this independently assigned residual. Merge then audit the whole body/racket and foot support.'};out.write_text(json.dumps(report,indent=2));print('HIP AUDIT',report['passed'],'failures',len(bad),'outside',outside,'keys',len(keys),'changedvertices',len(modified),flush=True);assert report['passed']
