import bpy,json,numpy as np,sys
from pathlib import Path
BASE=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else Path('artifacts/rig-rebuild/20261007/integration/aligned-skin-10');bpy.ops.wm.open_mainfile(filepath=str((BASE/'rebuild.blend').resolve()));b=bpy.data.objects['SuperHero_Male'];s=bpy.context.scene;rest=np.array([v.co[:] for v in b.data.vertices]);ed=np.array([e.vertices[:] for e in b.data.edges]);L=np.linalg.norm(rest[ed[:,0]]-rest[ed[:,1]],axis=1);labels=[]
for v in b.data.vertices:labels.append(max([(b.vertex_groups[g.group].name,g.weight) for g in v.groups],key=lambda p:p[1])[0])
rep={};sels={}
for name in ['thumb','index','middle','ring','pinky']:
 mask=np.array([x.startswith('DEF_'+name+'_') and x.endswith('_r') for x in labels]);sels[name]=mask[ed].any(axis=1)&(L>=.005);rep[name]={'min':100,'max':0,'severeFrames':0}
for h in range(961):
 f=h/2;s.frame_set(int(f),subframe=f%1);ev=b.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();pts=np.array([v.co[:] for v in me.vertices]);rat=np.linalg.norm(pts[ed[:,0]]-pts[ed[:,1]],axis=1)/np.maximum(1e-9,L)
 for name,sel in sels.items():
  lo=float(rat[sel].min());hi=float(rat[sel].max());rep[name]['min']=min(rep[name]['min'],lo);rep[name]['max']=max(rep[name]['max'],hi);rep[name]['severeFrames']+=int(lo<.35 or hi>1.8)
 ev.to_mesh_clear()
rep={'samples':961,'sampleHz':240,'restEdgeMinM':.005,'threshold':[.35,1.8],'regions':rep};(BASE/'finger-full-qa.json').write_text(json.dumps(rep,indent=2));print(json.dumps(rep,indent=2))

assert all(v['severeFrames']==0 for v in rep['regions'].values()), 'Finger edge gate failed'
