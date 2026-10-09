"""Audit exported/runtime 480 Hz surfaces, not just authored Blender poses.
Blender --background --python audit-runtime-dense.py -- RUNTIME_DIR SUPPORT_CONTRACT
"""
import bpy,sys,json,hashlib,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from collections import defaultdict
args=sys.argv[sys.argv.index('--')+1:];out=Path(args[0]);f=json.loads((out/'runtime-fixture.json').read_text());contract=json.loads(Path(args[1]).read_text())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert sha(f['source'])==f['sourceSHA256']
assert sha(f['bodyFile'])==f['bodySHA256'] and sha(f['racketFile'])==f['racketSHA256']
assert f['splitComparisonPassed'] and f['maximumExportSplitGapM']<1e-5, 'Export splits were not independently checked'
bpy.ops.wm.open_mainfile(filepath=str(Path(f['source']).resolve()));body=bpy.data.objects['SuperHero_Male'];rig=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];body.data.calc_loop_triangles()
actual_rackets={o.name for o in bpy.context.scene.objects if o.type=='MESH' and o.get('rally_asset_role')=='racket'}
assert len(f['rackets'])==8 and len(actual_rackets)==8 and {r['name'] for r in f['rackets']}==actual_rackets, 'Incomplete racket mesh coverage'
rest=np.array([v.co[:] for v in body.data.vertices]);faces=[tuple(t.vertices) for t in body.data.loop_triangles];edges=np.array([e.vertices[:] for e in body.data.edges]);rest_len=np.linalg.norm(rest[edges[:,0]]-rest[edges[:,1]],axis=1);mid=(rest[edges[:,0]]+rest[edges[:,1]])/2
assert len(rest)==f['bodyVertices'] and f['samples']==1921
ids={};weld=[ids.setdefault(tuple(round(c,6) for c in v.co),len(ids)) for v in body.data.vertices];corners=[{weld[i] for i in tri} for tri in faces];seams=defaultdict(list)
for i,k in enumerate(weld):seams[k].append(i)
seams=[v for v in seams.values() if len(v)>1]
regions={}
for joint,stem,rad in [('shoulder','upperarm',.13),('elbow','lowerarm',.085),('wrist','hand',.065),('hip','thigh',.13),('knee','calf',.09),('ankle','foot',.065)]:
 for side in ['l','r']:
  center=np.array(rig.data.bones['CTRL_'+stem+'_'+side].head_local[:]);regions[joint+'_'+side]=np.flatnonzero((np.linalg.norm(mid-center,axis=1)<rad)&(rest_len>=.005))
stats={name:{'min':1e9,'max':0,'severeEdges':0} for name in regions};soles={side:[v.index for v in body.data.vertices if v.co.z<.012 and v.co.x*sign>0] for side,sign in [('l',1),('r',-1)]}
world=np.memmap(f['bodyFile'],dtype='<f4',mode='r',shape=(1921,len(rest),3));matrices=np.memmap(f['racketFile'],dtype='<f4',mode='r',shape=(1921,8,16));parts=[]
for row in f['rackets']:
 assert sha(row['localFile'])==row['local']['sha256'] and Path(row['localFile']).stat().st_size==row['local']['bytes']==row['vertexCount']*12
 obj=bpy.data.objects[row['name']];obj.data.calc_loop_triangles();local=np.fromfile(row['localFile'],dtype='<f4').reshape((-1,3));assert len(local)==len(obj.data.vertices);parts.append((row['name'],local,[tuple(t.vertices) for t in obj.data.loop_triangles]))
anchors={};support={}
for side,windows in contract['windows'].items():
 for a,b in windows:
  ix=round((a+b)/2*4);anchors[(side,a,b)]=world[ix,soles[side]].copy();support[(side,a,b)]={'side':side,'frames':[a,b],'maximumDriftM':0,'floorGapRangeM':[1e9,-1e9]}
collisions=[];racket_hits=[];max_seam=0
for sample in range(1921):
 frame=sample/4;arr=np.array(world[sample],dtype=float);assert np.isfinite(arr).all();tree=BVHTree.FromPolygons([Vector(x) for x in arr],faces,all_triangles=True);pairs=[(a,b) for a,b in tree.overlap(tree) if a<b and not corners[a]&corners[b]]
 if pairs:collisions.append({'frame':frame,'pairs':len(pairs),'examples':pairs[:12]})
 for k,(name,local,tris) in enumerate(parts):
  mat=np.array(matrices[sample,k]).reshape((4,4)).T;pts=local@mat[:3,:3].T+mat[:3,3];rt=BVHTree.FromPolygons([Vector(x) for x in pts],tris,all_triangles=True);hits=tree.overlap(rt)
  if hits:racket_hits.append({'frame':frame,'part':name,'pairs':len(hits)})
 ratio=np.linalg.norm(arr[edges[:,0]]-arr[edges[:,1]],axis=1)/np.maximum(1e-12,rest_len)
 for name,ix in regions.items():
  rr=ratio[ix];stats[name]['min']=min(stats[name]['min'],float(rr.min()));stats[name]['max']=max(stats[name]['max'],float(rr.max()));stats[name]['severeEdges']=max(stats[name]['severeEdges'],int(np.sum((rr<.35)|(rr>1.8))))
 for ix in seams:max_seam=max(max_seam,float(np.linalg.norm(arr[ix]-arr[ix[0]],axis=1).max()))
 for (side,a,b),qa in support.items():
  if a<=frame<=b:
   foot=arr[soles[side]];qa['maximumDriftM']=max(qa['maximumDriftM'],float(np.linalg.norm(foot-anchors[(side,a,b)],axis=1).max()));gap=float(foot[:,1].min()+.013);qa['floorGapRangeM'][0]=min(qa['floorGapRangeM'][0],gap);qa['floorGapRangeM'][1]=max(qa['floorGapRangeM'][1],gap)
 if sample%240==0:print('RUNTIME',sample,flush=True)
gates={'body':not collisions,'racket':not racket_hits,'edges':all(x['severeEdges']==0 for x in stats.values()),'seams':max_seam<1e-5,'supportDrift':max(x['maximumDriftM'] for x in support.values())<.003,'supportFloor':all(-.001<=x['floorGapRangeM'][0] and x['floorGapRangeM'][1]<=.005 for x in support.values())}
report={'schema':'rally-runtime-surface-qa-v1','checkerSHA256':sha(__file__),'samplerSHA256':f['samplerSHA256'],'sourceSHA256':f['sourceSHA256'],'glbSHA256':f['glbSHA256'],'sampleHz':480,'samples':1921,'gates':gates,'passed':all(gates.values()),'bodyIntersectionRows':collisions,'racketIntersectionRows':racket_hits,'regions':stats,'support':list(support.values()),'maximumSeamGapM':max_seam,'maximumExportSplitGapM':f['maximumExportSplitGapM'],'limits':'Actual CPU streamed geometry in GLTFLoader at export knots and midpoints. Same body/racket, 0.35—1.8 edge, 3mm support and floor gates. Source bone-direction checks are reported separately; not a professional or user visual acceptance.'};(out/'runtime-surface-qa.json').write_text(json.dumps(report,indent=2));print('GATES',gates,flush=True);assert report['passed'], 'Runtime surface gates failed'
