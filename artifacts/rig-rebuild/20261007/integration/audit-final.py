"""Explicit new-rig coverage, body/racket BVH, same gates, original + terminal support windows."""
import bpy,json,math,sys,argparse,numpy as np
from pathlib import Path
from collections import Counter,defaultdict
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ap=argparse.ArgumentParser();ap.add_argument('--input',required=True);ap.add_argument('--output',required=True);ap.add_argument('--racket-manifest');ap.add_argument('--support-contract');args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);src=Path(args.input);out=Path(args.output);out.mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(src.resolve()));s=bpy.context.scene;r=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];body=bpy.data.objects['SuperHero_Male'];body.data.calc_loop_triangles();rest=np.array([v.co[:] for v in body.data.vertices]);faces=[tuple(t.vertices) for t in body.data.loop_triangles];w={};ids=[w.setdefault(tuple(round(c,6) for c in v.co),len(w)) for v in body.data.vertices];corners=[{ids[i] for i in f} for f in faces];seams=defaultdict(list)
for i,k in enumerate(ids):seams[k].append(i)
seams=[v for v in seams.values() if len(v)>1];edges=np.array([e.vertices[:] for e in body.data.edges]);restLen=np.linalg.norm(rest[edges[:,0]]-rest[edges[:,1]],axis=1);mid=(rest[edges[:,0]]+rest[edges[:,1]])/2;regions={}
for joint,stem,rad in [('shoulder','upperarm',.13),('elbow','lowerarm',.085),('wrist','hand',.065),('hip','thigh',.13),('knee','calf',.09),('ankle','foot',.065)]:
 for side in ['l','r']:
  center=np.array(r.data.bones['CTRL_'+stem+'_'+side].head_local[:]);regions[joint+'_'+side]=np.flatnonzero((np.linalg.norm(mid-center,axis=1)<rad)&(restLen>=.005))
assert len(regions)==12 and all(len(ix)>0 for ix in regions.values())
stats={name:{'min':1e9,'max':0,'severeEdges':0} for name in regions};soles={side:[v.index for v in body.data.vertices if v.co.z<.012 and v.co.x*sign>0] for side,sign in [('l',1),('r',-1)]}
assert all(soles.values())
legacyWindows={'r':[[0,24],[82,96],[160,192],[236,254],[288,480]],'l':[[0,24],[88,100],[174,182],[232,254],[288,480]]}
contract=json.loads(Path(args.support_contract).read_text()) if args.support_contract else None
windows=contract['windows'] if contract else legacyWindows
assert set(windows)=={'r','l'} and all(len(ww)>=4 for ww in windows.values()),'Missing support coverage'
assert all(0<=a<b<=480 for ww in windows.values() for a,b in ww),'Invalid support windows'
allWindows={side:sorted(set(tuple(x) for x in legacyWindows[side]+windows[side])) for side in ['r','l']}
anchors={};support={};floor=-.013
for side,ww in allWindows.items():
 for a,b in ww:
  f=(a+b)/2;s.frame_set(int(f),subframe=f%1);e=body.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();anchors[(side,a,b)]=np.array([(e.matrix_world@m.vertices[i].co)[:] for i in soles[side]]);e.to_mesh_clear();support[(side,a,b)]={'side':side,'frames':[a,b],'maximumDriftM':0,'soleMinZRange':[1e9,-1e9]}
rackets=[o for o in s.objects if o.type=='MESH' and o.get('rally_asset_role')=='racket']
expected=[]
if args.racket_manifest:
 expected=json.loads(Path(args.racket_manifest).read_text())['meshNames'];assert expected and set(expected)=={o.name for o in rackets},'Racket coverage mismatch'

collisions=[];racketRows=[];direction=[];allRows=[];prev={};maxrot={};maxseam=0;maxlength=0
for half in range(961):
 f=half/2;s.frame_set(int(f),subframe=f%1);deps=bpy.context.evaluated_depsgraph_get();e=body.evaluated_get(deps);m=e.to_mesh();pts=[e.matrix_world@v.co for v in m.vertices];array=np.array([v[:] for v in pts]);assert np.isfinite(array).all(),('Nonfinite body surface',f);tree=BVHTree.FromPolygons(pts,faces,all_triangles=True);pairs=[(a,b) for a,b in tree.overlap(tree) if a<b and not corners[a]&corners[b]]
 if pairs:collisions.append({'frame':f,'pairs':len(pairs),'examples':pairs[:12]})
 for part in rackets:
  ev=part.evaluated_get(deps);mesh=ev.to_mesh();mesh.calc_loop_triangles();tris=[tuple(t.vertices) for t in mesh.loop_triangles];rt=BVHTree.FromPolygons([ev.matrix_world@v.co for v in mesh.vertices],tris,all_triangles=True);hits=tree.overlap(rt)
  if hits:racketRows.append({'frame':f,'part':part.name,'pairs':len(hits)})
  ev.to_mesh_clear()
 ratio=np.linalg.norm(array[edges[:,0]]-array[edges[:,1]],axis=1)/np.maximum(1e-12,restLen)
 for name,ix in regions.items():
  rr=ratio[ix];stats[name]['min']=min(stats[name]['min'],float(rr.min()));stats[name]['max']=max(stats[name]['max'],float(rr.max()));stats[name]['severeEdges']=max(stats[name]['severeEdges'],int(np.sum((rr<.35)|(rr>1.8))))
 for ix in seams:maxseam=max(maxseam,float(np.linalg.norm(array[ix]-array[ix[0]],axis=1).max()))
 for (side,a,b),qa in support.items():
  if a<=f<=b:
   foot=array[soles[side]];qa['maximumDriftM']=max(qa['maximumDriftM'],float(np.linalg.norm(foot-anchors[(side,a,b)],axis=1).max()));z=float(foot[:,2].min());qa['soleMinZRange'][0]=min(qa['soleMinZRange'][0],z);qa['soleMinZRange'][1]=max(qa['soleMinZRange'][1],z)
 for side in ['r','l']:
  for stem,child,sign in [('upperarm','lowerarm',1),('thigh','calf',-1)]:
   a=r.pose.bones['CTRL_'+stem+'_'+side];b=r.pose.bones['CTRL_'+child+'_'+side];v=a.tail-a.head;vv=b.tail-b.head;xx=(b.parent if b.parent and b.parent.name.startswith('MCH_END_') else a).matrix.to_3x3().col[0].normalized();angle=math.degrees(math.atan2(v.cross(vv).dot(xx),v.dot(vv)))
   if angle*sign< -.01 or angle*sign>158:direction.append({'frame':f,'bone':b.name,'signedAngleDeg':angle})
 for bone in r.pose.bones:
  if not bone.name.startswith('CTRL_'):continue
  maxlength=max(maxlength,abs((bone.tail-bone.head).length-bone.bone.length));q=bone.matrix.to_quaternion().normalized()
  if bone.name in prev:
   deg=math.degrees(q.rotation_difference(prev[bone.name]).angle);deg=min(deg,360-deg)
   if deg>maxrot.get(bone.name,{}).get('degrees',0):maxrot[bone.name]={'frame':f,'degrees':deg}
  prev[bone.name]=q
 e.to_mesh_clear()
report={'source':str(src),'sampleHz':240,'samples':961,'bodyIntersectionRows':collisions,'racketMeshCoverage':[o.name for o in rackets],'racketCoverageRequired':bool(args.racket_manifest),'racketIntersectionRows':racketRows,'regions':stats,'directionViolations':direction,'maxSeamGapM':maxseam,'maxBoneLengthErrorM':maxlength,'maxHalfFrameRotation':maxrot,'support':[v for (side,a,b),v in support.items() if [a,b] in windows[side]],'legacySupportComparison':[v for (side,a,b),v in support.items() if [a,b] in legacyWindows[side]],'supportContract':str(args.support_contract) if args.support_contract else 'original inferred windows','courtFloorZ':floor,'limits':'Original 1.8/0.35 surface screen, geometric hinge checks. Does not establish professional motion fidelity.'}
for qa in report['support']+report['legacySupportComparison']:qa['floorGapRangeM']=[z-floor for z in qa['soleMinZRange']]
report['gates']={'body':not collisions,'racket':not racketRows and (not args.racket_manifest or bool(rackets)),'edges':all(d['severeEdges']==0 for d in stats.values()),'directions':not direction,'seams':maxseam<1e-5,'boneLengths':maxlength<1e-5,'supportDrift':max(x['maximumDriftM'] for x in report['support'])<.003,'supportFloor':all(-.001<=x['floorGapRangeM'][0] and x['floorGapRangeM'][1]<=.005 for x in report['support'])};report['passed']=all(report['gates'].values());(out/'final-qa.json').write_text(json.dumps(report,indent=2));print('GATES',report['gates']);print('BODY ROWS',len(collisions),'RACKET ROWS',len(racketRows),'SUPPORT',report['support']);assert report['passed'],'Final acceptance gates failed; inspect final-qa.json'
