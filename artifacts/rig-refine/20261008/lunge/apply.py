"""Video-informed load transfer; preserve upper local channels, feet, bone lengths.
Single camera landmarks are inferred silhouette targets with 8-12px uncertainty.
"""
import bpy,json,math,sys,argparse,numpy as np
from pathlib import Path
from mathutils import Vector,Quaternion,Matrix
ap=argparse.ArgumentParser();ap.add_argument('--input',required=True);ap.add_argument('--output',required=True);ap.add_argument('--strength',type=float,default=1.);args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(Path(args.input).resolve()));s=bpy.context.scene;r=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];act=r.animation_data.action;rest={b.name:b.bone.matrix_local.copy() for b in r.pose.bones};P=np.array(json.loads(Path('artifacts/rig-rebuild/20261007/integration/reference-camera.json').read_text())['nativeToImageProjection']);names=['CTRL_root']+[f'CTRL_{p}_{side}' for side in ['l','r'] for p in ['thigh','calf','foot','ball']]+[f'IK_{p}_{side}' for side in ['l','r'] for p in ['ankle_target','knee_pole']]
# Preserve original support windows. Foot/toe world transforms are frozen per input pose.
parameters={
 'root':[(508,[0,0,0]),(511,[.01,-.005,-.025]),(513,[.02,-.015,-.067]),(515,[.02,0,-.135]),(517,[.005,0,-.155]),(519,[-.015,0,-.08]),(521,[-.04,-.01,0]),(524,[-.14,-.09,.035]),(527,[-.18,-.17,.045]),(530,[-.13,-.20,0]),(533,[-.07,-.13,.005]),(536,[0,-.045,0]),(539,[0,0,0])],
 'kneePixelDelta':[(508,[0,0]),(511,[-1,4]),(513,[-3,15]),(515,[-5,19]),(517,[-5,21]),(519,[-4,17]),(521,[-3,6]),(524,[0,0]),(539,[0,0])],
 'footYaw':[(508,0),(511,-12),(513,-30),(515,-40),(518,-40),(521,-12),(524,0),(539,0)],
 'returnKnee':[(508,0),(520,0),(524,1),(533,1),(539,0)],
 'extraHeel':[(508,0),(511,3),(513,5),(515,10),(518,10),(519,5),(521,2),(524,0),(539,0)]}
def cv(nodes,t):
 x=np.array([v[0] for v in nodes]);y=np.array([v[1] for v in nodes],dtype=float);h=np.diff(x);d=np.diff(y,axis=0)/h.reshape((-1,)+(1,)*(y.ndim-1));m=np.zeros_like(y)
 for i in range(1,len(x)-1):
  same=d[i-1]*d[i]>0;w1=2*h[i]+h[i-1];w2=h[i]+2*h[i-1];m[i]=np.where(same,(w1+w2)/(w1/np.where(same,d[i-1],1)+w2/np.where(same,d[i],1)),0)
 if t<=x[0]:return y[0].copy()
 if t>=x[-1]:return y[-1].copy()
 i=np.searchsorted(x,t)-1;u=(t-x[i])/h[i];return (2*u**3-3*u*u+1)*y[i]+(u**3-2*u*u+u)*h[i]*m[i]+(-2*u**3+3*u*u)*y[i+1]+(u**3-u*u)*h[i]*m[i+1]
def project(v):
 q=P@np.array(list(v)+[1]);return q[:2]/q[2]-[240,130]
def rot(b,q):b.matrix=Matrix.LocRotScale(b.head,q,Vector((1,1,1)));bpy.context.view_layer.update()
def orient(b,y,z):
 y=y.normalized();z=(z-y*z.dot(y)).normalized();x=y.cross(z).normalized();rot(b,Matrix((x,y,z)).transposed().to_quaternion())
def solve(side,target,wanted,kneeWanted):
 a=r.pose.bones['CTRL_thigh_'+side];b=r.pose.bones['CTRL_calf_'+side];foot=r.pose.bones['CTRL_foot_'+side];start=a.head.copy();v=target-start;d=v.length;l1=a.bone.length;l2=b.bone.length;dc=max(abs(l1-l2)+.002,min(l1+l2-.002,d));axis=v.normalized();proj=(l1*l1-l2*l2+dc*dc)/(2*dc);height=math.sqrt(max(0,l1*l1-proj*proj));pole=(b.head-start)-axis*(b.head-start).dot(axis);original=pole.normalized();footRest=rest[foot.name].to_quaternion();calfRest=rest[b.name].to_quaternion()
 def trial(theta):
  bb=Quaternion(axis,theta)@original;mid=start+axis*proj+bb*height;uy=(mid-start).normalized();ly=(start+axis*dc-mid).normalized();uz=-(ly-uy*uy.dot(ly));xx=uy.cross(uz).normalized();lz=xx.cross(ly).normalized();lowerQ=Matrix((xx,ly,lz)).transposed().to_quaternion();ankleQ=footRest.inverted()@calfRest@lowerQ.inverted()@wanted;ang=[math.degrees(x) for x in ankleQ.to_euler()];limits=[(-34.5,54.5),(-19.5,19.5),(-29.5,29.5)];ex=sum(max(lo-v,v-hi,0)**2 for v,(lo,hi) in zip(ang,limits));cost=100000*ex+sum((project(mid)-kneeWanted)**2)+.003*math.degrees(theta)**2
  return cost,bb,ang,ex
 theta=min((trial(math.radians(k))[0],math.radians(k)) for k in range(-160,161,2))[1];lo=theta-math.radians(2);hi=theta+math.radians(2);gold=(math.sqrt(5)-1)/2
 for _ in range(24):
  c=hi-gold*(hi-lo);d2=lo+gold*(hi-lo)
  if trial(c)[0]<trial(d2)[0]:hi=d2
  else:lo=c
 cost,bend,ang,ex=trial((hi+lo)/2);mid=start+axis*proj+bend*height;u=(mid-start).normalized();w=(start+axis*dc-mid).normalized();z=-(w-u*u.dot(w));orient(a,u,z);hinge=u.cross(z).normalized();orient(b,w,hinge.cross(w));rot(foot,wanted)
 return {'targetErrorM':(foot.head-target).length,'reachClampM':abs(dc-d),'ankleDeg':ang,'ankleExcessSq':ex,'kneePlaneChangeDeg':math.degrees((hi+lo)/2),'kneePixelAfter':project(b.head).tolist(),'kneeFlexionDeg':math.degrees(u.angle(w))}
original={};upper={};boundary={};rows=[]
for f in range(s.frame_end+1):
 s.frame_set(f);original[f]={n:r.pose.bones[n].matrix_basis.copy() for n in names};upper[f]={b.name:b.matrix_basis.copy() for b in r.pose.bones if b.name.startswith(('CTRL_','ROLL_')) and b.name not in names}
for sf in [508,539]:
 f=(sf-480)*s.render.fps/25;s.frame_set(int(f),subframe=f%1);boundary[f]={n:r.pose.bones[n].matrix_basis.copy() for n in names}
for f in range(s.frame_end+1):
 sf=480+f*25/s.render.fps
 if not 508<sf<539:continue
 s.frame_set(f);basis={b.name:b.matrix_basis.copy() for b in r.pose.bones};footM={side:r.pose.bones['CTRL_foot_'+side].matrix.copy() for side in ['l','r']};ballM={side:r.pose.bones['CTRL_ball_'+side].matrix.copy() for side in ['l','r']};kp={side:project(r.pose.bones['CTRL_calf_'+side].head) for side in ['l','r']};rootDelta=Vector(cv(parameters['root'],sf))*args.strength;r.animation_data.action=None
 for n,m in basis.items():r.pose.bones[n].matrix_basis=m
 bpy.context.view_layer.update();root=r.pose.bones['CTRL_root'];root.location+=rest[root.name].to_3x3().inverted()@rootDelta;bpy.context.view_layer.update();qa={}
 for side in ['r','l']:
  target=footM[side].translation.copy();wanted=footM[side].to_quaternion();kneeWanted=kp[side].copy()
  if side=='l':
   yaw=Quaternion((0,0,1),math.radians(float(cv(parameters['footYaw'],sf))*args.strength));anchor=ballM[side].translation.copy();target=anchor+yaw@(target-anchor);wanted=yaw@wanted;ballM[side]=Matrix.LocRotScale(anchor,yaw@ballM[side].to_quaternion(),Vector((1,1,1)));extra=float(cv(parameters['extraHeel'],sf))*args.strength;forward=ballM[side].to_3x3().col[1].normalized();axis=forward.cross(Vector((0,0,1))).normalized();pitch=Quaternion(axis,math.radians(-extra));target=ballM[side].translation+pitch@(target-ballM[side].translation);wanted=pitch@wanted;kneeWanted+=cv(parameters['kneePixelDelta'],sf)*args.strength
  else:
   kneeWanted=project(r.pose.bones['CTRL_calf_'+side].head)
  recovery=float(cv(parameters['returnKnee'],sf))*args.strength;kneeWanted+=np.array([9,21] if side=='r' else [-10,4])*recovery
  qa[side]=solve(side,target,wanted,kneeWanted);ball=r.pose.bones['CTRL_ball_'+side];ball.matrix=ballM[side];bpy.context.view_layer.update();r.pose.bones['IK_ankle_target_'+side].matrix.translation=target;r.pose.bones['IK_knee_pole_'+side].matrix.translation=r.pose.bones['CTRL_calf_'+side].head+Vector((1,0,0))*.5;qa[side]['kneePixelBefore']=kp[side].tolist();qa[side]['ballMatrixError']=float(np.abs(np.array(ball.matrix)-np.array(ballM[side])).max())
 r.animation_data.action=act
 for n in names:
  b=r.pose.bones[n]
  if b.rotation_mode=='QUATERNION':b.rotation_quaternion.make_compatible(original[f][n].to_quaternion())
  for prop in ['location','rotation_quaternion' if b.rotation_mode=='QUATERNION' else 'rotation_euler','scale']:b.keyframe_insert(data_path=prop,frame=f,group=n)
 rows.append({'frame':f,'sourceFrame':sf,'rootDelta':list(rootDelta),'legs':qa})
for f,bs in boundary.items():
 for n,m in bs.items():
  b=r.pose.bones[n];b.matrix_basis=m
  for prop in ['location','rotation_quaternion' if b.rotation_mode=='QUATERNION' else 'rotation_euler','scale']:b.keyframe_insert(data_path=prop,frame=f,group=n)
for layer in act.layers:
 for strip in layer.strips:
  for bag in strip.channelbags:
   for fc in bag.fcurves:
    if any(fc.data_path.startswith('pose.bones["'+n+'"]') for n in names):
     for k in fc.keyframe_points:
      if 508<=480+k.co.x*25/s.render.fps<=539:k.interpolation='LINEAR'
protected=0.;outside=0.
for f in range(s.frame_end+1):
 s.frame_set(f)
 for n,m in upper[f].items():protected=max(protected,float(np.max(np.abs(np.array(r.pose.bones[n].matrix_basis)-np.array(m)))))
 if not 508<480+f*25/s.render.fps<539:
  for n,m in original[f].items():outside=max(outside,float(np.max(np.abs(np.array(r.pose.bones[n].matrix_basis)-np.array(m)))))
s.frame_set(0);bpy.ops.wm.save_as_mainfile(filepath=str((out/'rebuild.blend').resolve()));(out/'construction.json').write_text(json.dumps({'input':args.input,'parameters':parameters,'strength':args.strength,'edited':names,'upperLocalMaxDifference':protected,'outsideRangeLocalMaxDifference':outside,'rows':rows,'scope':'Single-camera inferred; original support contract retained. Body surface acceptance pending.'},indent=2));print('SAVED',out,'PROTECTED',protected,'OUTSIDE',outside,'MAX_ERROR',max(v['targetErrorM'] for row in rows for v in row['legs'].values()),flush=True)
