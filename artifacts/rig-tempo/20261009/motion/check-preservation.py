"""Protected animation/rest/source geometry digest for nonoverlapping start + strike edits."""
import bpy,sys,json,hashlib,numpy as np
from pathlib import Path
src,dst,out=map(Path,sys.argv[sys.argv.index('--')+1:]);allowed=['CTRL_thigh_l','ROLL_thigh_l','CTRL_calf_l','CTRL_foot_l','ROLL_lowerarm_r','CTRL_hand_r']
def digest(o):return hashlib.sha256(json.dumps(o,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def read(p):
 bpy.ops.wm.open_mainfile(filepath=str(p.resolve()));r=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];b=bpy.data.objects['SuperHero_Male'];tracks=[]
 for l in r.animation_data.action.layers:
  for st in l.strips:
   for bag in st.channelbags:
    for f in bag.fcurves:
     if any(f.data_path.startswith('pose.bones["'+n+'"]') for n in allowed):continue
     tracks.append([f.data_path,f.array_index,[[*k.co,k.interpolation] for k in f.keyframe_points]])
 keys={};a=np.empty(len(b.data.vertices)*3,np.float32)
 for k in b.data.shape_keys.key_blocks:k.data.foreach_get('co',a);keys[k.name]=hashlib.sha256(a.tobytes()).hexdigest()
 bones=[[x.name,x.parent.name if x.parent else None,list(x.head_local),list(x.tail_local),[list(row) for row in x.matrix_local]] for x in r.data.bones];mesh=[[v.co[:],[(b.vertex_groups[g.group].name,g.weight) for g in v.groups]] for v in b.data.vertices];rack=[[x.name,x.parent.name if x.parent else None,x.parent_bone,[list(row) for row in x.matrix_parent_inverse],[list(row) for row in x.matrix_basis]] for x in bpy.data.objects if x.get('rally_asset_role')=='racket'];return {'protectedCurveSHA256':digest(tracks),'restBonesSHA256':digest(bones),'restMeshWeightsSHA256':digest(mesh),'racketAttachmentSHA256':digest(rack),'keys':keys}
a=read(src);b=read(dst);checks={k:a[k]==b[k] for k in a if k!='keys'};checks['allPriorShapeGeometryPreserved']=all(b['keys'].get(k)==v for k,v in a['keys'].items());report={'source':str(src),'candidate':str(dst),'allowedBoneEdits':allowed,'checks':checks,'addedShapeKeys':sorted(set(b['keys'])-set(a['keys'])),'passed':all(checks.values())};out.write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));assert report['passed']
