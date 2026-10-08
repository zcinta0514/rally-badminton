"""Reference-informed torso coordination, applied additively to INPUT.blend.

Only spine/neck/head and upper-arm rotation channels are edited. Root, legs,
wrists, fingers, weights, shape keys and racket socket are byte-value protected.
World rotation compensation preserves right-arm release/grip orientation while
the shoulder follows the thorax. No measured 3D reconstruction is claimed.
"""
import bpy,json,sys,math,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector,Quaternion,Matrix
args=sys.argv[sys.argv.index('--')+1:];src=Path(args[0]);out=Path(args[1]);out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(src.resolve()));s=bpy.context.scene;r=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];action=r.animation_data.action
# source frame, additional forward lean, chest yaw, lateral lean. Degree values
# are manual 3D inference. The change of side at 481-485 and the 487-490 turn peak
# are directly visible; their angles are not directly measurable in one camera.
nodes=[
 [480,6,8,5], [482,7,1,0], [484,9,-13,-8],
 [487,11,-30,-16], [490,10,-28,-16], [493,8,-15,-11],
 [496,5,-6,-6], [500,2,0,-1], [504,0,0,0],
 [510,2,-2,-1], [514,4,-3,-1], [518,3,0,0],
 [521,2,3,1], [524,1,4,1], [527,2,1,-1],
 [530,2,-2,-1], [533,1,0,0], [536,0,0,0], [540,0,0,0]]
if len(args)>2:nodes=json.loads(Path(args[2]).read_text())['nodes']
def cv(n,t):
 x=np.array([z[0] for z in n],float);y=np.array([z[1:] for z in n],float);h=np.diff(x);d=np.diff(y,axis=0)/h[:,None];m=np.zeros_like(y)
 for i in range(1,len(x)-1):
  same=d[i-1]*d[i]>0;w1=2*h[i]+h[i-1];w2=h[i]+2*h[i-1];m[i]=np.where(same,(w1+w2)/(w1/np.where(same,d[i-1],1)+w2/np.where(same,d[i],1)),0)
 if t<=x[0]:return y[0]
 if t>=x[-1]:return y[-1]
 i=int(np.searchsorted(x,t)-1);u=(t-x[i])/h[i]
 return (2*u**3-3*u*u+1)*y[i]+(u**3-2*u*u+u)*h[i]*m[i]+(-2*u**3+3*u*u)*y[i+1]+(u**3-u*u)*h[i]*m[i+1]
changed=['CTRL_spine_01','CTRL_spine_02','CTRL_spine_03','CTRL_neck_01','CTRL_Head','CTRL_upperarm_r','CTRL_upperarm_l']
protected=[b for b in r.pose.bones if b.name not in changed]
def basis(b):return np.array(b.matrix_basis).copy()
original={};oldWorld={};oldScale={};restLengths={b.name:b.length for b in r.data.bones};inputBoneLengthError=0
for f in range(s.frame_start,s.frame_end+1):
 s.frame_set(f);original[f]={b.name:basis(b) for b in protected};oldWorld[f]={n:r.pose.bones[n].matrix.copy() for n in changed};oldScale[f]={n:r.pose.bones[n].scale.copy() for n in changed}
 for b in r.pose.bones:
  if b.name.startswith('CTRL_'):inputBoneLengthError=max(inputBoneLengthError,abs((b.tail-b.head).length-restLengths[b.name]))
def rot(b,q):
 b.matrix=Matrix.LocRotScale(b.head,q,Vector((1,1,1)));bpy.context.view_layer.update()
rows=[];previous={}
for f in range(s.frame_start,s.frame_end+1):
 s.frame_set(f);r.animation_data.action=None;bpy.context.view_layer.update();sf=min(540,480+f*25/s.render.fps);pitch,yaw,bank=[math.radians(v) for v in cv(nodes,sf)]
 root=r.pose.bones['CTRL_root'];fw=root.matrix.to_3x3()@root.bone.matrix_local.to_3x3().inverted()@Vector((0,-1,0));fw.z=0;fw.normalize();left=Vector((-fw.y,fw.x,0))
 shoulderOld=r.pose.bones['CTRL_upperarm_r'].head.copy()
 for n,weight in [('CTRL_spine_01',.45),('CTRL_spine_02',.35),('CTRL_spine_03',.20)]:
  b=r.pose.bones[n];q=Quaternion((0,0,1),yaw*weight)@Quaternion(-fw,bank*weight)@Quaternion(left,pitch*weight);rot(b,q@b.matrix.to_quaternion())
 # Retain a small coordinated arm contribution in running, preserve the already
 # fitted forearm/wrist release orientation around contact. No wrist keys edited.
 armFollow=float(cv([[480,.28],[497,.28],[504,0],[521,0],[531,.16],[540,.16]],sf)[0])
 for n,follow in [('CTRL_upperarm_r',armFollow),('CTRL_upperarm_l',.65)]:
  b=r.pose.bones[n];rot(b,oldWorld[f][n].to_quaternion().slerp(b.matrix.to_quaternion(),follow))
 # Neck absorbs most torso tilt; head keeps the original gaze orientation instead
 # of inheriting the side bank. This is not an independent head wobble track.
 n=r.pose.bones['CTRL_neck_01'];rot(n,oldWorld[f][n.name].to_quaternion().slerp(n.matrix.to_quaternion(),.20))
 head=r.pose.bones['CTRL_Head'];rot(head,Quaternion((0,0,1),yaw*.35)@oldWorld[f][head.name].to_quaternion())
 for n in changed:r.pose.bones[n].scale=oldScale[f][n]
 bpy.context.view_layer.update();shoulderNew=r.pose.bones['CTRL_upperarm_r'].head.copy()
 r.animation_data.action=action
 for n in changed:
  b=r.pose.bones[n];assert b.rotation_mode=='QUATERNION',(n,b.rotation_mode)
  if n in previous:b.rotation_quaternion.make_compatible(previous[n])
  previous[n]=b.rotation_quaternion.copy();b.keyframe_insert(data_path='rotation_quaternion',frame=f,group=n)
 rows.append({'frame':f,'sourceFrame':sf,'additionalPitchYawBankDeg':list(map(math.degrees,[pitch,yaw,bank])),'headAdditionalYawDeg':math.degrees(yaw*.35),'rightArmFollow':armFollow,'rightShoulderDisplacementM':(shoulderNew-shoulderOld).length})
for layer in action.layers:
 for strip in layer.strips:
  for bag in strip.channelbags:
   for fc in bag.fcurves:
    if any(fc.data_path=='pose.bones["'+n+'"].rotation_quaternion' for n in changed):
     for k in fc.keyframe_points:k.interpolation='LINEAR'
maxProtected=0;maxLength=0;maxStep=0;prev={};headErr=0
for f in range(s.frame_start,s.frame_end+1):
 s.frame_set(f)
 for b in protected:maxProtected=max(maxProtected,float(np.max(np.abs(basis(b)-original[f][b.name]))))
 for b in r.pose.bones:
  if b.name.startswith('CTRL_'):maxLength=max(maxLength,abs((b.tail-b.head).length-restLengths[b.name]))
 for n in changed:
  q=r.pose.bones[n].matrix.to_quaternion()
  if n in prev:maxStep=max(maxStep,math.degrees(q.rotation_difference(prev[n]).angle))
  prev[n]=q
 targetHead=Quaternion((0,0,1),math.radians(rows[f-s.frame_start]['headAdditionalYawDeg']))@oldWorld[f]['CTRL_Head'].to_quaternion()
 headErr=max(headErr,math.degrees(r.pose.bones['CTRL_Head'].matrix.to_quaternion().rotation_difference(targetHead).angle))
assert maxProtected<1e-6,maxProtected
s.frame_set(0);bpy.ops.wm.save_as_mainfile(filepath=str((out/'rebuild.blend').resolve()))
report={'source':str(src),'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'nodes':nodes,'changedBones':changed,'changedChannels':'rotation_quaternion only','protectedMaxMatrixBasisDifference':maxProtected,'inputMaxControlBoneLengthErrorM':inputBoneLengthError,'maxControlBoneLengthErrorM':maxLength,'maxChangedBoneWorldAngularStepDegAt120Hz':maxStep,'maxHeadWorldRotationTargetErrorDeg':headErr,'headTarget':'Only 35 percent of added chest yaw; original world pitch/roll preserved. No head side bank added.','maximumRightShoulderDisplacementM':max(z['rightShoulderDisplacementM'] for z in rows),'rows':rows,'scope':'Manual source-video-informed upper-body adjustment. Root, legs, wrist/finger channels, racket parent/socket, mesh rest, weights and shape keys unchanged. New surface and video fidelity QA remains required.'}
(out/'build.json').write_text(json.dumps(report,indent=2));print('BUILT',out, {k:v for k,v in report.items() if k not in ['rows','nodes']},flush=True)
