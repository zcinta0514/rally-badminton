"""Verify the isolated torso adjustment against its input at 240 Hz."""
import bpy,json,math,sys,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];before=Path(args[0]);after=Path(args[1]);out=Path(args[2]);out.mkdir(parents=True,exist_ok=True)
changed={'CTRL_spine_01','CTRL_spine_02','CTRL_spine_03','CTRL_neck_01','CTRL_Head','CTRL_upperarm_r','CTRL_upperarm_l'}
P=np.array(json.loads(Path('artifacts/rig-rebuild/20261007/integration/reference-camera.json').read_text())['nativeToImageProjection'])
def project(p):
 a=P@np.array(list(p)+[1]);return a[:2]/a[2]
def sceneData(path):
 bpy.ops.wm.open_mainfile(filepath=str(path.resolve()));s=bpy.context.scene;r=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];body=bpy.data.objects['SuperHero_Male'];s.frame_set(0)
 assert s.render.fps==120 and s.frame_start==0 and s.frame_end==480
 hashes={};a=np.empty(len(body.data.vertices)*3,dtype=np.float32);body.data.vertices.foreach_get('co',a);hashes['restMesh']=hashlib.sha256(a.tobytes()).hexdigest()
 h=hashlib.sha256()
 for v in body.data.vertices:
  h.update(np.array([(g.group,g.weight) for g in v.groups],dtype=np.float64).tobytes())
 hashes['vertexGroups']=h.hexdigest();h=hashlib.sha256()
 if body.data.shape_keys:
  for k in body.data.shape_keys.key_blocks:
   h.update(k.name.encode());k.data.foreach_get('co',a);h.update(a.tobytes())
 hashes['shapeKeyGeometry']=h.hexdigest()
 h=hashlib.sha256()
 for b in r.data.bones:h.update(b.name.encode());h.update(np.array(b.matrix_local,dtype=np.float32).tobytes())
 hashes['restBones']=h.hexdigest();sock=bpy.data.objects['Racket_GripCenter'];hashes['racketSocket']=hashlib.sha256(np.array(sock.matrix_basis,dtype=np.float32).tobytes()).hexdigest()
 rows=[];violations=[];lengths=[]
 for half in range(961):
  f=half/2;s.frame_set(int(f),subframe=f%1);row={'frame':f,'protected':{b.name:np.array(b.matrix_basis).copy() for b in r.pose.bones if b.name not in changed},'boneLengths':{b.name:(b.tail-b.head).length for b in r.pose.bones if b.name.startswith('CTRL_')}}
  hand=r.pose.bones['CTRL_hand_r'];row['rightHandWorldQuaternion']=list(hand.matrix.to_quaternion());row['wrist']=project(r.matrix_world@hand.head);row['racketHead']=project(bpy.data.objects['Racket_StringBedCenter'].matrix_world.translation)
  for side in ['l','r']:
   for stem,child,sign in [('upperarm','lowerarm',1),('thigh','calf',-1)]:
    b=r.pose.bones['CTRL_'+child+'_'+side];a=r.pose.bones['CTRL_'+stem+'_'+side];v=a.tail-a.head;vv=b.tail-b.head;xx=(b.parent if b.parent and b.parent.name.startswith('MCH_END_') else a).matrix.to_3x3().col[0].normalized();angle=math.degrees(math.atan2(v.cross(vv).dot(xx),v.dot(vv)))
    if angle*sign<-.01 or angle*sign>158:violations.append({'frame':f,'bone':b.name,'signedAngleDeg':angle})
  rows.append(row)
 return {'hashes':hashes,'rows':rows,'violations':violations}
A=sceneData(before);B=sceneData(after);protected=0;boneDifference=0;rows=[]
for a,b in zip(A['rows'],B['rows']):
 protected=max(protected,max(float(np.max(np.abs(a['protected'][n]-b['protected'][n]))) for n in a['protected']))
 boneDifference=max(boneDifference,max(abs(a['boneLengths'][n]-b['boneLengths'][n]) for n in a['boneLengths']))
 if a['frame']<=288:
  rows.append({'frame':a['frame'],'sourceFrame':480+a['frame']*25/120,'rightWristProjectionChangePixels':float(np.linalg.norm(b['wrist']-a['wrist'])),'racketHeadRelativeWristVectorChangePixels':float(np.linalg.norm((b['racketHead']-b['wrist'])-(a['racketHead']-a['wrist'])))})
coverage={n:A['hashes'][n]==B['hashes'][n] for n in A['hashes']}
report={'before':str(before),'after':str(after),'samples':961,'sampleHz':240,'unchangedDataChecks':coverage,'inputDataHashes':A['hashes'],'outputDataHashes':B['hashes'],'maxProtectedLocalPoseDifference':protected,'maxBoneLengthChangeM':boneDifference,'inputDirectionViolations':A['violations'],'outputDirectionViolations':B['violations'],'racketProjectionRows':rows,'maxRacketRelativeWristVectorChangePixels504To521':max(x['racketHeadRelativeWristVectorChangePixels'] for x in rows if 504<=x['sourceFrame']<=521),'limits':'These checks cover isolated upper-body modification only, not final surface collisions or professional fidelity.'}
report['passed']=all(coverage.values()) and protected<1e-6 and boneDifference<1e-6 and not B['violations']
(out/'isolated-qa.json').write_text(json.dumps(report,indent=2));print('VERIFIED',report['passed'],'protected',protected,'boneChange',boneDifference,'relativeVector',report['maxRacketRelativeWristVectorChangePixels504To521'],flush=True)
assert report['passed'],'Isolated motion QA failed'
