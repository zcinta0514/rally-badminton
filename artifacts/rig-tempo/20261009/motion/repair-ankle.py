"""Retimed sub-grid ankle contact, local additive margin; preserves soles and all bones."""
import bpy,sys,json,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
src,out=map(Path,sys.argv[sys.argv.index('--')+1:]);out.mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(src.resolve()));s=bpy.context.scene;r=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];b=bpy.data.objects['SuperHero_Male'];b.data.calc_loop_triangles();rest=np.array([v.co[:] for v in b.data.vertices]);faces=[tuple(t.vertices) for t in b.data.loop_triangles];tri=np.array(faces);weld={};ids=[weld.setdefault(tuple(round(c,6) for c in v.co),len(weld)) for v in b.data.vertices];corners=[{ids[i] for i in f} for f in faces];center=np.array(r.data.bones['CTRL_foot_r'].head_local[:]);movable=(np.linalg.norm(rest-center,axis=1)<.065)&(rest[:,2]>.03)
weights=np.zeros((len(rest),4));wi=np.zeros((len(rest),4),int);names=list(r.pose.bones.keys());bid={n:i for i,n in enumerate(names)};gn={g.index:g.name for g in b.vertex_groups}
for v in b.data.vertices:
 for i,g in enumerate(v.groups):wi[v.index,i]=bid[gn[g.group]];weights[v.index,i]=g.weight
s.frame_set(38,subframe=.5);deps=bpy.context.evaluated_depsgraph_get();ev=b.evaluated_get(deps);m=ev.to_mesh();original=np.array([v.co[:] for v in m.vertices]);ev.to_mesh_clear();pts=original.copy();prefix=b.matrix_world.inverted()@r.matrix_world;suffix=r.matrix_world.inverted()@b.matrix_world;mat=np.array([np.array((prefix@r.pose.bones[n].matrix@r.pose.bones[n].bone.matrix_local.inverted()@suffix).to_3x3()) for n in names]);linear=np.sum(mat[wi]*weights[:,:,None,None],axis=1);rn=np.cross(rest[tri[:,1]]-rest[tri[:,0]],rest[tri[:,2]]-rest[tri[:,0]]);rn/=np.maximum(1e-12,np.linalg.norm(rn,axis=1))[:,None];ref=np.linalg.solve(linear[tri].mean(axis=1).transpose(0,2,1),rn[:,:,None])[:,:,0]
def overlap(p):
 pp=[Vector(x) for x in p];tree=BVHTree.FromPolygons(pp,faces,all_triangles=True);return pp,[(i,j) for i,j in tree.overlap(tree) if i<j and not corners[i]&corners[j]]
pp,initial=overlap(pts)
for step in range(80):
 pp,pairs=overlap(pts)
 if not pairs and step>0:break
 acc=np.zeros_like(pts);ct=np.zeros(len(pts))
 for i,j in pairs:
  for si,dst in [(i,j),(j,i)]:
   fd=faces[dst];n=(pp[fd[1]]-pp[fd[0]]).cross(pp[fd[2]]-pp[fd[0]]).normalized();n=n if n.dot(Vector(ref[dst]))>0 else -n
   for k in faces[si]:
    if movable[k]:
     distance=(pp[k]-pp[fd[0]]).dot(n)
     if distance<.0012:acc[k]+=np.array(n*min(.002,.0012-distance));ct[k]+=1
 pts+=.5*acc/np.maximum(1,ct[:,None]);delta=pts-original;mag=np.linalg.norm(delta,axis=1);delta*=np.minimum(1,.002/np.maximum(1e-12,mag))[:,None];delta[~movable]=0;pts=original+delta
pp,final=overlap(pts);assert not final,final;delta=pts-original;restDelta=np.linalg.solve(linear,delta[:,:,None])[:,:,0];restDelta[~movable]=0;k=b.shape_key_add(name='Oct09Tempo_AnkleContinuousMargin',from_mix=False);k.data.foreach_set('co',(rest+restDelta).astype(np.float32).ravel());keys=[[0,0],[37.5,0],[38,1],[39,1],[39.5,0],[480,0]]
for f,v in keys:k.value=v;k.keyframe_insert(data_path='value',frame=f)
for layer in b.data.shape_keys.animation_data.action.layers:
 for st in layer.strips:
  for bag in st.channelbags:
   for fc in bag.fcurves:
    if k.name in fc.data_path:
     for key in fc.keyframe_points:key.interpolation='LINEAR'
# Fine independent check around the entire envelope, 1920 Hz, before saving.
checks=[]
for i in range(37*16,41*16+1):
 f=i/16;s.frame_set(int(f),subframe=f%1);ev=b.evaluated_get(bpy.context.evaluated_depsgraph_get());m=ev.to_mesh();p=np.array([v.co[:] for v in m.vertices]);ev.to_mesh_clear();_,pairs=overlap(p);checks.append({'frame':f,'pairs':len(pairs)})
s.frame_set(0);bpy.ops.wm.save_as_mainfile(filepath=str((out/'rebuild.blend').resolve()),compress=True);report={'source':str(src),'failureModelFrame':38.5,'initialPairs':initial,'key':k.name,'keyframes':keys,'maxAdditionalWorldDisplacementM':float(np.linalg.norm(delta,axis=1).max()),'changedVertexIndices':np.flatnonzero(np.linalg.norm(restDelta,axis=1)>1e-8).tolist(),'solesPinnedBelowRestZ':.03,'envelopeQAHz':1920,'envelopeQA':checks,'passed':all(x['pairs']==0 for x in checks),'scope':'A local ankle surface interpolation margin; no timing, support window, bone curve or threshold altered.'};(out/'ankle-margin.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='envelopeQA'},indent=2));assert report['passed']
