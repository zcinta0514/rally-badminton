"""Independent evaluated-surface audit of appended lower-limb shapes."""
import bpy,json,sys,math,numpy as np
from pathlib import Path
from mathutils.bvhtree import BVHTree
args=sys.argv[sys.argv.index('--')+1:];p=Path(args[0]);dense='--dense' in args;bpy.ops.wm.open_mainfile(filepath=str((p/'rebuild.blend').resolve()));s=bpy.context.scene;r=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];body=bpy.data.objects['SuperHero_Male'];rest=np.array([v.co[:] for v in body.data.vertices]);body.data.calc_loop_triangles();faces=[tuple(t.vertices) for t in body.data.loop_triangles];w={};ids=[w.setdefault(tuple(round(c,6) for c in v.co),len(w)) for v in body.data.vertices];corners=[{ids[i] for i in f} for f in faces];edges=np.array([e.vertices[:] for e in body.data.edges]);mid=rest[edges].mean(axis=1);ll=np.linalg.norm(rest[edges[:,0]]-rest[edges[:,1]],axis=1);regions={}
for stem,rad in [('calf',.09),('foot',.065)]:
 for side in ['l','r']:
  regions[stem+'_'+side]=np.flatnonzero((np.linalg.norm(mid-np.array(r.data.bones['CTRL_'+stem+'_'+side].head_local),axis=1)<rad)&(ll>=.005))
assert len(regions)==4 and all(len(v)>0 for v in regions.values())
keys=[k for k in body.data.shape_keys.key_blocks if k.name.startswith('Oct08Lower_')];assert keys,'No added keys';sole=rest[:,2]<.035;outside=rest[:,2]>=.85;rows=[];stats={k:{'min':1e9,'max':0,'severeEdges':0} for k in regions};maxdelta=0.;maxsupport=0.;maxoutside=0.;failures=[];keyOutside=0;keySole=0
for k in keys:
 delta=np.array([v.co[:] for v in k.data])-rest;keyOutside=max(keyOutside,float(np.linalg.norm(delta[outside],axis=1).max()));keySole=max(keySole,float(np.linalg.norm(delta[sole],axis=1).max()))
def points():
 bpy.context.view_layer.update();e=body.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();v=np.array([x.co[:] for x in m.vertices]);e.to_mesh_clear();return v
frames=np.arange(132,285.01,.25) if dense else np.arange(0,480.01,.5)
for f in frames:
 s.frame_set(int(f),subframe=f%1);pp=points();tree=BVHTree.FromPolygons(pp.tolist(),faces,all_triangles=True);allPairs=[(a,b) for a,b in tree.overlap(tree) if a<b and not corners[a]&corners[b]];pairs=[(a,b) for a,b in allPairs if any(rest[v,2]<.85 for t in [a,b] for v in faces[t])];rat=np.linalg.norm(pp[edges[:,0]]-pp[edges[:,1]],axis=1)/np.maximum(1e-12,ll);severe=0
 for k,ix in regions.items():
  val=rat[ix];stats[k]['min']=min(stats[k]['min'],float(val.min()));stats[k]['max']=max(stats[k]['max'],float(val.max()));n=int(np.sum((val<.35)|(val>1.8)));severe+=n;stats[k]['severeEdges']=max(stats[k]['severeEdges'],n)
 vals=[k.value for k in keys]
 for k in keys:k.value=0
 before=points()
 for k,v in zip(keys,vals):k.value=v
 diff=np.linalg.norm(pp-before,axis=1);maxdelta=max(maxdelta,float(diff.max()));maxsupport=max(maxsupport,float(diff[sole].max()));maxoutside=max(maxoutside,float(diff[outside].max()))
 row={'frame':float(f),'bodyPairs':len(allPairs),'lowerPairs':len(pairs),'lowerExamples':pairs[:16],'severeJointEdges':severe,'maximumAdditionalDisplacementM':float(diff.max())};rows.append(row)
 if pairs or severe:failures.append(row)
report={'source':str(p/'rebuild.blend'),'sampleHz':480 if dense else 240,'samples':len(rows),'modelFrameRange':[float(frames[0]),float(frames[-1])],'keyPrefix':'Oct08Lower_','addedKeys':len(keys),'regions':stats,'maximumAdditionalDisplacementM':maxdelta,'maximumSoleSurfaceDifferenceM':maxsupport,'maximumOutsideSurfaceDifferenceM':maxoutside,'maximumKeyOutsideRestDifferenceM':keyOutside,'maximumKeySoleRestDifferenceM':keySole,'failures':failures,'rows':rows,'passed':not failures and maxsupport<1e-7 and maxoutside<1e-7 and keyOutside<1e-9 and keySole<1e-9,'scope':'Only lower-limb added corrections; full-body pairs still recorded. Does not assert hips/whole-body accepted.'};(p/('dense-lower-qa.json' if dense else 'lower-qa.json')).write_text(json.dumps(report,indent=2));print('QA', {k:v for k,v in report.items() if k not in ['rows','failures','regions']});print('REGIONS',stats);print('FAILURES',failures[:15]);assert report['passed'],'Lower-limb surface gates failed; report saved'
