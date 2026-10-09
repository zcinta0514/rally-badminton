"""Local additive hip/knee/ankle residual after left-leg volume rebake at 240 Hz.

INPUT.blend OUTDIR. Existing shape keys/weights are retained; only new local
residual keys are added. This is not a rig or motion edit. Rest-space vertices
outside explicit shoulder/hip neighborhoods, including soles, cannot move.
"""
import bpy,numpy as np,math,json,sys,hashlib
from pathlib import Path
from mathutils import Vector,geometry
from mathutils.bvhtree import BVHTree
args=sys.argv[sys.argv.index('--')+1:];src=Path(args[0]);out=Path(args[1]);out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(src.resolve()));s=bpy.context.scene;r=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];body=bpy.data.objects['SuperHero_Male'];body.data.calc_loop_triangles()
assert s.render.fps==120 and s.frame_start==0 and s.frame_end==480
assert not next(m for m in body.modifiers if m.type=='ARMATURE').use_deform_preserve_volume,'Requires already baked linear-blend input'
rest=np.array([v.co[:] for v in body.data.vertices]);faces=[tuple(t.vertices) for t in body.data.loop_triangles];weld={};ids=[weld.setdefault(tuple(round(c,6) for c in v.co),len(weld)) for v in body.data.vertices];corners=[{ids[i] for i in f} for f in faces]
edges=np.array([tuple(e.vertices) for e in body.data.edges]);a,b=edges[:,0],edges[:,1];L=np.linalg.norm(rest[a]-rest[b],axis=1);mid=(rest[a]+rest[b])/2
movable=np.zeros(len(rest),bool);edgeMask=np.zeros(len(edges),bool)
for stem in ['thigh','calf','foot']:
 for side in ['l']:
  center=np.array(r.data.bones['CTRL_'+stem+'_'+side].head_local[:]);movable|=np.linalg.norm(rest-center,axis=1)<.18;edgeMask|=np.linalg.norm(mid-center,axis=1)<.155
movable&=(rest[:,2]>.025)&(rest[:,0]>.005)
aa,bb=a[(L>=.005)&edgeMask],b[(L>=.005)&edgeMask];ll=L[(L>=.005)&edgeMask]
names={g.index:g.name for g in body.vertex_groups};boneNames=list(r.pose.bones.keys());boneIds={n:i for i,n in enumerate(boneNames)};weightIds=np.zeros((len(rest),4),int);weights=np.zeros((len(rest),4))
for v in body.data.vertices:
 assert 0<len(v.groups)<=4 and abs(sum(g.weight for g in v.groups)-1)<1e-5
 for k,g in enumerate(v.groups):weightIds[v.index,k]=boneIds[names[g.group]];weights[v.index,k]=g.weight
prefix=body.matrix_world.inverted()@r.matrix_world;suffix=r.matrix_world.inverted()@body.matrix_world
tri=np.array(faces);restCross=np.cross(rest[tri[:,1]]-rest[tri[:,0]],rest[tri[:,2]]-rest[tri[:,0]]);restNormals=restCross/np.maximum(1e-12,np.linalg.norm(restCross,axis=1))[:,None]
oldKeys=list(body.data.shape_keys.key_blocks);keyCountBefore=len(oldKeys);oldHash=hashlib.sha256();scratch=np.empty(len(rest)*3,np.float32)
for key in oldKeys:key.data.foreach_get('co',scratch);oldHash.update(key.name.encode());oldHash.update(scratch.tobytes())
oldDigest=oldHash.hexdigest();newkeys=[];reports=[];previous=np.zeros_like(rest);maxcap=.010
def pairs_at(pts):
 pp=[Vector(p) for p in pts];tree=BVHTree.FromPolygons(pp,faces,all_triangles=True);return pp,[(i,j) for i,j in tree.overlap(tree) if i<j and not corners[i]&corners[j]]
def limit(pts,original):
 delta=pts-original;mag=np.linalg.norm(delta,axis=1);delta*=np.minimum(1,maxcap/np.maximum(1e-12,mag))[:,None];delta[~movable]=0;return original+delta
for half in range(48,145):
 frame=half/2;s.frame_set(int(frame),subframe=frame%1)
 for k,f in newkeys:k.value=0
 bpy.context.view_layer.update();ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();original=np.array([v.co[:] for v in mesh.vertices]);ev.to_mesh_clear();pts=original.copy();pp,initialPairs=pairs_at(pts)
 matrices=np.array([np.array((prefix@r.pose.bones[n].matrix@r.pose.bones[n].bone.matrix_local.inverted()@suffix).to_3x3()) for n in boneNames]);linear=np.sum(matrices[weightIds]*weights[:,:,None,None],axis=1)
 pts=limit(pts+np.einsum('nij,nj->ni',linear,previous)*.90,original)
 initialRatio=np.linalg.norm(original[aa]-original[bb],axis=1)/ll
 if not initialPairs and np.linalg.norm(previous,axis=1).max()<1e-7 and initialRatio.min()>.385 and initialRatio.max()<1.765:
  previous[:]=0;reports.append({'frame':frame,'initialPairs':0,'finalPairs':0,'maxDisplacementM':0,'minEdgeRatio':float(initialRatio.min()),'maxEdgeRatio':float(initialRatio.max())});continue
 refN=np.linalg.solve(linear[tri].mean(axis=1).transpose(0,2,1),restNormals[:,:,None])[:,:,0];refN/=np.maximum(1e-12,np.linalg.norm(refN,axis=1))[:,None]
 for step in range(180):
  pp,pairs=pairs_at(pts);ratio=np.linalg.norm(pts[aa]-pts[bb],axis=1)/ll
  if not pairs and ratio.min()>.385 and ratio.max()<1.765:break
  acc=np.zeros_like(pts);ct=np.zeros(len(pts))
  for i,j in pairs:
   for si,dst in [(i,j),(j,i)]:
    fs,fd=faces[si],faces[dst];n=(pp[fd[1]]-pp[fd[0]]).cross(pp[fd[2]]-pp[fd[0]]).normalized();n=n if n.dot(Vector(refN[dst]))>0 else -n
    for k in fs:
     if not movable[k]:continue
     distance=(pp[k]-pp[fd[0]]).dot(n)
     if distance<.0015:acc[k]+=np.array(n*min(.002,.0015-distance));ct[k]+=1
  pts=limit(pts+.35*acc/np.maximum(1,ct[:,None]),original)
  for repeat in range(12):
   v=pts[aa]-pts[bb];length=np.linalg.norm(v,axis=1);target=np.clip(length,ll*.39,ll*1.76);bad=np.abs(length-target)>1e-7;x,y=aa[bad],bb[bad]
   if not len(x):break
   delta=v[bad]*(1-target[bad]/np.maximum(1e-12,length[bad]))[:,None];share=movable[x].astype(float)+movable[y].astype(float);delta/=np.maximum(1,share)[:,None];ac=np.zeros_like(pts);cnt=np.zeros(len(pts))
   np.add.at(ac,x,-delta*movable[x,None]);np.add.at(ac,y,delta*movable[y,None]);np.add.at(cnt,x,movable[x]);np.add.at(cnt,y,movable[y]);pts=limit(pts+.75*ac/np.maximum(1,cnt[:,None]),original)
 pp,pairs=pairs_at(pts);ratio=np.linalg.norm(pts[aa]-pts[bb],axis=1)/ll;delta=pts-original;restDelta=np.linalg.solve(linear,delta[:,:,None])[:,:,0];restDelta[~movable]=0
 changed=int(np.sum(np.linalg.norm(delta,axis=1)>1e-7));report={'frame':frame,'initialPairs':len(initialPairs),'finalPairs':len(pairs),'iterations':step+1,'minEdgeRatio':float(ratio.min()),'maxEdgeRatio':float(ratio.max()),'maxDisplacementM':float(np.linalg.norm(delta,axis=1).max()),'changedVertices':changed};reports.append(report)
 if changed:
  key=body.shape_key_add(name=f'Oct09LegSurfaceMargin_{half:04}',from_mix=False);key.data.foreach_set('co',(rest+restDelta).astype(np.float32).ravel());key.value=0;newkeys.append((key,frame))
 previous=restDelta
 if half%20==0 or pairs:print('SURFACE',report,flush=True)
 if pairs or ratio.min()<.35 or ratio.max()>1.8:print('UNRESOLVED',report,flush=True)
for key,f in newkeys:
 for at in sorted({0,480,max(0,f-.5),min(480,f+.5)}-{f}):key.value=0;key.keyframe_insert(data_path='value',frame=at)
 key.value=1;key.keyframe_insert(data_path='value',frame=f)
for layer in body.data.shape_keys.animation_data.action.layers:
 for strip in layer.strips:
  for bag in strip.channelbags:
   for fc in bag.fcurves:
    if 'Oct09LegSurfaceMargin_' in fc.data_path:
     for k in fc.keyframe_points:k.interpolation='LINEAR'
h=hashlib.sha256()
for key in oldKeys:key.data.foreach_get('co',scratch);h.update(key.name.encode());h.update(scratch.tobytes())
assert h.hexdigest()==oldDigest,'Old shape geometry changed'
s.frame_set(0);bpy.ops.wm.save_as_mainfile(filepath=str((out/'rebuild.blend').resolve()),compress=True)
report={'source':str(src),'sampleHz':240,'samples':97,'movableRestVertexIndices':np.flatnonzero(movable).tolist(),'maxWorldCorrectionCapM':maxcap,'oldShapeKeyCount':keyCountBefore,'oldShapeKeyGeometrySha256':oldDigest,'oldShapeKeyGeometryPreserved':True,'newShapeKeyCount':len(newkeys),'solesRightLegAndArmsPinned':True,'rows':reports,'gateThresholds':{'minEdge':.35,'maxEdge':1.8},'passed':all(q['finalPairs']==0 and q['minEdgeRatio']>=.35 and q['maxEdgeRatio']<=1.8 for q in reports),'limits':'Only additive left hip/knee/ankle repair after new-pose volume rebake. Original full body/racket/finger/foot audit and visual review still required.'}
(out/'surface-qa.json').write_text(json.dumps(report,indent=2));print('DONE',report['passed'],'keys',len(newkeys),'maxmove',max(q['maxDisplacementM'] for q in reports),flush=True)
assert report['passed'],'Bounded surface repair unresolved'
