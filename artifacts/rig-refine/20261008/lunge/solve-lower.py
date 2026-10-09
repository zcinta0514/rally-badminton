"""Couple surface contact separation with joint edge bounds; do not erase intersections by collapsing tissue."""
import bpy,numpy as np,math,json,sys
from pathlib import Path
from mathutils import Vector,geometry
from mathutils.bvhtree import BVHTree
args=sys.argv[sys.argv.index('--')+1:];src=Path(args[0]);out=Path(args[1]);out.mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(src.resolve()));s=bpy.context.scene;r=next(o for o in s.objects if o.type=='ARMATURE');body=bpy.data.objects['SuperHero_Male'];body.data.calc_loop_triangles();faces=[tuple(t.vertices) for t in body.data.loop_triangles];corners=[set(f) for f in faces];rest=np.array([v.co[:] for v in body.data.vertices]);edges=np.array([tuple(e.vertices) for e in body.data.edges]);a,b=edges[:,0],edges[:,1];L=np.linalg.norm(rest[a]-rest[b],axis=1);mid=(rest[a]+rest[b])/2;mask=np.zeros(len(edges),dtype=bool)
for stem,rad in [('calf',.32),('foot',.13)]:
 for side in ['r','l']:mask|=np.linalg.norm(mid-np.array(r.data.bones['CTRL_'+stem+'_'+side].head_local[:]),axis=1)<rad
modifiable=np.zeros(len(rest),dtype=bool)
for stem,rad in [('calf',.32),('foot',.15)]:
 for side in ['r','l']:modifiable|=np.linalg.norm(rest-np.array(r.data.bones['CTRL_'+stem+'_'+side].head_local[:]),axis=1)<rad
pinned=(rest[:,2]<.035)|(rest[:,2]>=.85)|(~modifiable)
valid=(L>.005)&mask&(mid[:,2]<.85);aa,bb=a[valid],b[valid];ll=L[valid];names={g.index:g.name for g in body.vertex_groups};prefix=body.matrix_world.inverted()@r.matrix_world;suffix=r.matrix_world.inverted()@body.matrix_world;newkeys=[];reports=[];previousRestDelta=np.zeros_like(rest);boneNames=list(r.pose.bones.keys());boneIds={n:i for i,n in enumerate(boneNames)};weightIds=np.zeros((len(rest),4),dtype=int);weights=np.zeros((len(rest),4))
for v in body.data.vertices:
 assert 0 < len(v.groups) <= 4 and abs(sum(g.weight for g in v.groups)-1)<1e-5, ('Invalid skin influences',v.index)
 assert all(names[g.group] in boneIds and math.isfinite(g.weight) and g.weight>=0 for g in v.groups), ('Invalid skin mapping',v.index)
 for k,g in enumerate(v.groups):
  if k<4 and names[g.group] in boneIds:weightIds[v.index,k]=boneIds[names[g.group]];weights[v.index,k]=g.weight
tri=np.array(faces);restCross=np.cross(rest[tri[:,1]]-rest[tri[:,0]],rest[tri[:,2]]-rest[tri[:,0]]);restArea=np.linalg.norm(restCross,axis=1)*.5;restNormals=restCross/np.maximum(1e-12,np.linalg.norm(restCross,axis=1))[:,None];triMask=np.zeros(len(tri),bool)
for stem,rad in [('calf',.32),('foot',.13)]:
 for side in ['r','l']:
  center=np.array(r.data.bones['CTRL_'+stem+'_'+side].head_local[:]);triMask|=np.linalg.norm(rest[tri].mean(axis=1)-center,axis=1)<rad
ti=tri[triMask];areaTarget=restArea[triMask]*.10
def pairs_at(pts):
 pp=[Vector(p) for p in pts];tree=BVHTree.FromPolygons(pp,faces,all_triangles=True);return pp,[(i,j) for i,j in tree.overlap(tree) if i<j and not corners[i]&corners[j] and any(not pinned[v] for tt in [i,j] for v in faces[tt])]
for frame in np.arange(133,284.01,.5):
 s.frame_set(int(frame),subframe=frame%1)
 for key,f in newkeys:key.value=0
 bpy.context.view_layer.update();e=body.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();pts=np.array([v.co[:] for v in m.vertices]);e.to_mesh_clear();original=pts.copy();pp,pairs=pairs_at(pts);initial=len(pairs)
 matrices=np.array([np.array((prefix@r.pose.bones[n].matrix@r.pose.bones[n].bone.matrix_local.inverted()@suffix).to_3x3()) for n in boneNames]);linears=np.sum(matrices[weightIds]*weights[:,:,None,None],axis=1);refN=np.linalg.solve(linears[tri].mean(axis=1).transpose(0,2,1),restNormals[:,:,None])[:,:,0];refN/=np.maximum(1e-12,np.linalg.norm(refN,axis=1))[:,None];areaN=refN[triMask];
 # Compress only posterior soft tissue toward each unmodified limb axis.
 # Existing morphs remain. This resolves thigh/calf contact without inflation.
 tissue=np.zeros_like(rest)
 for side,sign in [('l',1),('r',-1)]:
  center=r.data.bones['CTRL_calf_'+side].head_local;dz=rest[:,2]-center.z;axisY=center.y+np.maximum(0,-dz)*(.0514/.4559);backDepth=np.maximum(0,rest[:,1]-axisY);axial=np.clip((.30-np.abs(dz))/.1,0,1);lateral=np.clip((rest[:,0]*sign-.015)/.035,0,1);posterior=np.clip(backDepth/.035,0,1);region=axial*lateral*posterior
  u=np.array(r.pose.bones['CTRL_thigh_'+side].head)-np.array(r.pose.bones['CTRL_calf_'+side].head);v=np.array(r.pose.bones['CTRL_calf_'+side].tail)-np.array(r.pose.bones['CTRL_calf_'+side].head);angle=np.pi-np.arccos(np.clip(u@v/np.linalg.norm(u)/np.linalg.norm(v),-1,1));activation=np.clip((angle-np.deg2rad(104))/np.deg2rad(24),0,1);activation=activation*activation*(3-2*activation);tissue[:,1]+=-.32*backDepth*region*activation
 tissue[pinned]=0;pts+=np.einsum('nij,nj->ni',linears,tissue);seed=pts.copy()

 if not pairs and np.linalg.norm(previousRestDelta,axis=1).max()<1e-7 and np.all((np.linalg.norm(pts[aa]-pts[bb],axis=1)/ll>.43)&(np.linalg.norm(pts[aa]-pts[bb],axis=1)/ll<1.745)):reports.append({'frame':frame,'initialPairs':0,'finalPairs':0,'maxDisplacementM':0});previousRestDelta[:]=0;continue
 stable=0
 for step in range(180):
  pp,pairs=pairs_at(pts);ratio=np.linalg.norm(pts[aa]-pts[bb],axis=1)/ll
  if not pairs and ratio.min()>.43 and ratio.max()<1.745:
   stable+=1
   if stable>=3:break
  else:stable=0
  acc=np.zeros_like(pts);count=np.zeros(len(pts));normals={i:(pp[faces[i][1]]-pp[faces[i][0]]).cross(pp[faces[i][2]]-pp[faces[i][0]]).normalized() for pair in pairs for i in pair}
  for i,j in pairs:
   for src,dst in [(i,j),(j,i)]:
    fa=faces[src];fb=faces[dst];n=normals[dst];n=n if n.dot(Vector(refN[dst]))>0 else -n;trip=[pp[k] for k in fb]
    for k in fa:
     distance=(pp[k]-trip[0]).dot(n);proj=pp[k]-n*distance;near=geometry.closest_point_on_tri(proj,*trip)
     if distance<.002:acc[k]+=np.array(n*min(.003,.002-distance));count[k]+=1
  pts+=.4*acc/np.maximum(1,count[:,None])
  for _ in range(4):
   pa,pb,pc=pts[ti[:,0]],pts[ti[:,1]],pts[ti[:,2]];ar=.5*np.sum(np.cross(pb-pa,pc-pa)*areaN,axis=1);bad=ar<areaTarget;gg=np.stack([.5*np.cross(pb-pc,areaN),.5*np.cross(pc-pa,areaN),.5*np.cross(pa-pb,areaN)],axis=1);factor=np.maximum(0,areaTarget-ar)/np.maximum(1e-12,np.sum(gg*gg,axis=(1,2)));cor=gg*factor[:,None,None];ac=np.zeros_like(pts);ct=np.zeros(len(pts))
   for corner in range(3):np.add.at(ac,ti[bad,corner],cor[bad,corner]);np.add.at(ct,ti[bad,corner],1)
   move=.5*ac/np.maximum(1,ct[:,None]);mag=np.linalg.norm(move,axis=1);move*=np.minimum(1,.003/np.maximum(1e-12,mag))[:,None];pts+=move
  for repeat in range(8):
   v=pts[aa]-pts[bb];ln=np.linalg.norm(v,axis=1);target=np.clip(ln,ll*.44,ll*1.74);bad=np.abs(ln-target)>1e-7;x,y=aa[bad],bb[bad];delta=v[bad]*(1-target[bad]/np.maximum(1e-9,ln[bad]))[:,None];ac=np.zeros_like(pts);ct=np.zeros(len(pts));np.add.at(ac,x,-delta*.5);np.add.at(ac,y,delta*.5);np.add.at(ct,x,1);np.add.at(ct,y,1);pts+=.4*ac/np.maximum(1,ct[:,None])
  delta=pts-seed;size=np.linalg.norm(delta,axis=1);pts=seed+delta*np.minimum(1,.012/np.maximum(1e-9,size))[:,None];pts[pinned]=original[pinned]
 _,pairs=pairs_at(pts);delta=pts-original;report={'frame':frame,'initialPairs':initial,'finalPairs':len(pairs),'iterations':step+1,'minEdgeRatio':float(ratio.min()),'maxEdgeRatio':float(ratio.max()),'maxDisplacementM':float(np.linalg.norm(delta,axis=1).max())};reports.append(report);key=body.shape_key_add(name=f'Oct08Lower_{frame:06.2f}',from_mix=False);newkeys.append((key,frame))
 restDelta=np.linalg.solve(linears,delta[:,:,None])[:,:,0];key.data.foreach_set('co',(rest+restDelta).astype(np.float32).ravel())
 if not pairs:previousRestDelta=restDelta
 key.value=0
 if True:print('CONTACT',report,flush=True)
for key,f in newkeys:
 for at in sorted({0,480,max(0,f-.5),min(480,f+.5)}-{f}):key.value=0;key.keyframe_insert(data_path='value',frame=at)
 key.value=1;key.keyframe_insert(data_path='value',frame=f)
for layer in body.data.shape_keys.animation_data.action.layers:
 for strip in layer.strips:
  for bag in strip.channelbags:
   for fc in bag.fcurves:
    if fc.data_path.startswith('key_blocks["Oct08Lower_'):
     for key in fc.keyframe_points:key.interpolation='LINEAR'
s.frame_set(0);bpy.ops.wm.save_as_mainfile(filepath=str((out/'rebuild.blend').resolve()));(out/'contact-skin.json').write_text(json.dumps({'maxAdditionalFromCompressionSeedM':.012,'posteriorCompressionFraction':.32,'prefix':'Oct08Lower_','modifiableRestZRange':[.035,.85],'sourceSupportContractUnchanged':True,'upperSurfaceAndSolesPinned':True,'solver':'Contact separation2mm, joint edge bounds, rest-transported outward normals and signed triangle area barriers; warm-started in rest space','rows':reports},indent=2));print('COMPLETE',len(newkeys),'unresolved',sum(x['finalPairs']>0 for x in reports))

assert all(x['finalPairs']==0 for x in reports), 'Unresolved body intersections'
