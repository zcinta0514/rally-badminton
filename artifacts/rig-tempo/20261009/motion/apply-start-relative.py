"""Turn three inferred rear-leg silhouettes into continuous controls; fixed support/root."""
import bpy,sys,json,math,numpy as np
from pathlib import Path
from mathutils import Quaternion
base,fitfile,out=map(Path,sys.argv[sys.argv.index('--')+1:]);out.mkdir(parents=True,exist_ok=True);fit=json.loads(fitfile.read_text());bpy.ops.wm.open_mainfile(filepath=str(base.resolve()));s=bpy.context.scene;r=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];a=r.pose.bones['CTRL_thigh_l'];b=r.pose.bones['CTRL_calf_l'];roll=r.pose.bones['ROLL_thigh_l'];foot=r.pose.bones['CTRL_foot_l'];nodes=[]
for sf in [485,495]:
 f=(sf-480)*4.8;s.frame_set(int(f),subframe=f%1);nodes.append([sf,*a.rotation_quaternion,roll.rotation_euler.y,*b.rotation_quaternion,*foot.rotation_quaternion])
for v in fit['rows']:nodes.append([v['sourceFrame'],*v['thighQuaternion'],v['rollY'],*v['calfQuaternion'],*v['footQuaternion']])
nodes.sort();x=np.array([v[0] for v in nodes]);y=np.array([v[1:] for v in nodes]);
for i in range(1,len(y)):
 for sl in [slice(0,4),slice(5,9),slice(9,13)]:
  if y[i,sl]@y[i-1,sl]<0:y[i,sl]*=-1
h=np.diff(x);d=np.diff(y,axis=0)/h[:,None];m=np.zeros_like(y)
for i in range(1,len(x)-1):
 same=d[i-1]*d[i]>0;w1=2*h[i]+h[i-1];w2=h[i]+2*h[i-1];m[i]=np.where(same,(w1+w2)/(w1/np.where(same,d[i-1],1)+w2/np.where(same,d[i],1)),0)
def cv(t):
 if t<=x[0]:return y[0].copy()
 if t>=x[-1]:return y[-1].copy()
 i=np.searchsorted(x,t)-1;u=(t-x[i])/h[i];v=(2*u**3-3*u*u+1)*y[i]+(u**3-2*u*u+u)*h[i]*m[i]+(-2*u**3+3*u*u)*y[i+1]+(u**3-u*u)*h[i]*m[i+1]
 for sl in [slice(0,4),slice(5,9),slice(9,13)]:v[sl]/=np.linalg.norm(v[sl])
 return v
changed=[a.name,b.name,roll.name,foot.name];act=r.animation_data.action;frames=sorted(set([i*.25 for i in range(96,289)]+[72.]))
for l in act.layers:
 for st in l.strips:
  for bag in st.channelbags:
   for fc in bag.fcurves:
    if any(fc.data_path.startswith('pose.bones["'+n+'"]') for n in changed):
     for i in range(len(fc.keyframe_points)-1,-1,-1):
      k=fc.keyframe_points[i]
      if frames[0]<=k.co.x<=frames[-1]:fc.keyframe_points.remove(k,fast=True)
for f in frames:
 v=cv(480+f/4.8);a.rotation_quaternion=v[:4];b.rotation_quaternion=v[5:9];roll.rotation_euler.y=v[4];foot.rotation_quaternion=v[9:13]
 for bone,prop in [(a,'rotation_quaternion'),(b,'rotation_quaternion'),(roll,'rotation_euler'),(foot,'rotation_quaternion')]:bone.keyframe_insert(data_path=prop,frame=f,group=bone.name)
for l in act.layers:
 for st in l.strips:
  for bag in st.channelbags:
   for fc in bag.fcurves:
    if any(fc.data_path.startswith('pose.bones["'+n+'"]') for n in changed):
     for k in fc.keyframe_points:
      if frames[0]<=k.co.x<=frames[-1]:k.interpolation='LINEAR'
s.frame_set(0);bpy.ops.wm.save_as_mainfile(filepath=str((out/'rebuild.blend').resolve()),compress=True);report={'source':str(base),'silhouetteFit':str(fitfile),'changedBones':changed,'sourceRange':[485,495],'keyNodes':nodes,'denseControlHz':480,'scope':'Single-view inferred continuous rear thigh swing / distributed axial turn / one-way knee hinge, keeping root/right support and all bone lengths. Does not claim measured 3D.','geometryStatus':'pending'};(out/'start-fit-construction.json').write_text(json.dumps(report,indent=2));print('SAVED',out)
