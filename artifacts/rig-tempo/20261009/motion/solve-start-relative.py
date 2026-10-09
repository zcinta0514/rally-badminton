"""Rear leg joint/sole silhouettes relative to the planted foot. Monocular inference."""
import bpy,sys,json,math,numpy as np
from pathlib import Path
from mathutils import Quaternion,Vector,Euler
src,observations,out=map(Path,sys.argv[sys.argv.index('--')+1:]);obs=json.loads(observations.read_text());bpy.ops.wm.open_mainfile(filepath=str(src.resolve()));s=bpy.context.scene;r=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];body=bpy.data.objects['SuperHero_Male'];act=r.animation_data.action;P=np.array(json.loads(Path('artifacts/rig-rebuild/20261007/integration/reference-camera.json').read_text())['nativeToImageProjection']);soles={side:[v.index for v in body.data.vertices if v.co.z<.012 and v.co.x*sign>0] for side,sign in [('l',1),('r',-1)]};rows=[]
def project(p):
 c=P@np.array(list(p)+[1]);return c[:2]/c[2]-[240,130]
for sample in obs['rows']:
 sf=sample['sourceFrame'];r.animation_data.action=act;f=(sf-480)*4.8;s.frame_set(int(f),subframe=f%1);a=r.pose.bones['CTRL_thigh_l'];b=r.pose.bones['CTRL_calf_l'];roll=r.pose.bones['ROLL_thigh_l'];foot=r.pose.bones['CTRL_foot_l'];q=a.rotation_quaternion.copy();roll0=roll.rotation_euler.y;calf0=b.rotation_quaternion.to_euler().x;foot0=foot.rotation_quaternion.to_euler();ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();soleCenters={side:Vector(np.array([(ev.matrix_world@mesh.vertices[i].co)[:] for i in ix]).mean(axis=0)) for side,ix in soles.items()};ev.to_mesh_clear();supportPixel=project(soleCenters['r']);soleLocal=foot.matrix.inverted()@soleCenters['l'];target=np.array(sample['rearKnee']+sample['rearShoe'])+np.tile(supportPixel-np.array(obs['frontShoe']),2);r.animation_data.action=None
 def evaluate(v):
  a.rotation_quaternion=q@Quaternion((1,0,0),v[0])@Quaternion((0,0,1),v[1]);roll.rotation_euler.y=roll0+v[2];b.rotation_quaternion=Quaternion((1,0,0),v[3]);foot.rotation_quaternion=Euler((v[4],foot0.y,foot0.z),'XYZ').to_quaternion();bpy.context.view_layer.update();return np.r_[project(b.head),project(foot.matrix@soleLocal)]
 v=np.array([-.5 if sf>=489 else 0.,0.,.25,math.radians(-90),math.radians(5)]);reference=np.array([0.,0.,0.,calf0,math.radians(5)]);best=None
 for i in range(140):
  p=evaluate(v);cost=float(np.linalg.norm(target-p));
  if best is None or cost<best[0]:best=(cost,v.copy())
  J=np.zeros((4,5));h=1e-3
  for k in range(5):
   trial=v.copy();trial[k]+=h;J[:,k]=(evaluate(trial)-p)/h
  penalty=np.diag([.04,.04,.06,.01,1.0]);step=np.linalg.solve(J.T@J+penalty+.8*np.eye(5),J.T@(target-p)-penalty@(v-reference));mag=np.linalg.norm(step)
  if mag>.16:step*=.16/mag
  v+=step*.5;v[:2]=np.clip(v[:2],-1.8,1.8);v[2]=np.clip(v[2],-.8,.8);v[3]=np.clip(v[3],math.radians(-145),math.radians(-35));v[4]=np.clip(v[4],math.radians(-30),math.radians(50))
  if np.linalg.norm(step)<1e-5:break
 v=best[1];p=evaluate(v);ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();actualSole=Vector(np.array([(ev.matrix_world@mesh.vertices[i].co)[:] for i in soles['l']]).mean(axis=0));ev.to_mesh_clear();actualSolePixel=project(actualSole);rows.append({'sourceFrame':sf,'frontShoeModel':supportPixel.tolist(),'targetCropPixels':target.tolist(),'fitCropPixels':p.tolist(),'actualRearSoleCropPixel':actualSolePixel.tolist(),'relativeModelShoeHeightPixels':float(supportPixel[1]-actualSolePixel[1]),'maxPixelError':float(np.abs(p-target).max()),'swingXDeg':math.degrees(v[0]),'swingZDeg':math.degrees(v[1]),'rollAddDeg':math.degrees(v[2]),'kneeLocalXDeg':math.degrees(v[3]),'footLocalXDeg':math.degrees(v[4]),'thighQuaternion':list(a.rotation_quaternion),'rollY':roll.rotation_euler.y,'calfQuaternion':list(b.rotation_quaternion),'footQuaternion':list(foot.rotation_quaternion),'footHeadNative':list(foot.head),'iterations':i+1})
report={'source':str(src),'observations':str(observations),'referenceUncertaintyPixels':[5,7],'comparison':'Rear knee and full sole center relative to front planted shoe, retaining observed relative foot lift.','fixed':'Root, right support, left hip position, limb lengths, knee bend sign, torso, arms.','rows':rows};out.write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
