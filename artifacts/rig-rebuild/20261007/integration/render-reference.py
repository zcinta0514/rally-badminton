"""Fixed approximate broadcast camera for honest same-frame visual review."""
import bpy,json,sys,math
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
from bpy_extras.object_utils import world_to_camera_view
args=sys.argv[sys.argv.index('--')+1:];src=Path(args[0]);out=Path(args[1]);out.mkdir(exist_ok=True);frames=[int(v) for v in args[2].split(',')] if len(args)>2 else list(range(480,541))
bpy.ops.wm.open_mainfile(filepath=str(src.resolve()));s=bpy.context.scene;r=next(o for o in s.objects if o.type=='ARMATURE');body=bpy.data.objects['SuperHero_Male']
c=json.loads(Path('artifacts/rig-rebuild/20261007/integration/reference-camera.json').read_text());P=np.array(c['nativeToImageProjection']);K=np.array([[c['focalPixels'],0,c['principalPoint'][0]],[0,c['focalPixels'],c['principalPoint'][1]],[0,0,1]]);ext=np.linalg.inv(K)@P;u,sv,vh=np.linalg.svd(ext[:,:3]);R=u@vh;t=ext[:,3];C=-R.T@t;flip=np.diag([1,-1,-1]);worldRot=(flip@R).T
cam=bpy.data.objects.new('ApproximateBroadcastCamera',bpy.data.cameras.new('ApproximateBroadcastCamera'));s.collection.objects.link(cam);cam.location=Vector(C);cam.rotation_euler=Matrix(worldRot).to_euler();cam.data.type='PERSP';cam.data.sensor_fit='HORIZONTAL';cam.data.sensor_width=36;cam.data.lens=c['focalPixels']*36/1280;cam.data.shift_x=(640-c['principalPoint'][0])/1280;cam.data.shift_y=(c['principalPoint'][1]-360)/1280;s.camera=cam
s.render.engine='BLENDER_WORKBENCH';s.render.resolution_x=1280;s.render.resolution_y=720;s.render.resolution_percentage=100;s.display.shading.light='STUDIO';s.display.shading.color_type='SINGLE';s.display.shading.single_color=(.55,.72,.73);s.display.shading.show_cavity=True;s.world=bpy.data.worlds.new('CompareWorld');s.world.color=(.12,.14,.16);s.display.shading.background_type='WORLD';r.hide_render=True
bpy.context.view_layer.update()
qa=[]
for point in [[-1.7,-3.05,0],[-1.7,3.05,0],[11.7,3.05,0],[11.7,-3.05,0]]:
 q=P@np.array(point+[1]);wanted=q[:2]/q[2];xyz=world_to_camera_view(s,cam,Vector(point));actual=np.array([xyz.x*1280,(1-xyz.y)*720]);qa.append({'point':point,'calibrationPixel':wanted.tolist(),'cameraPixel':actual.tolist(),'errorPixels':float(np.linalg.norm(actual-wanted))})
(out/'camera-qa.json').write_text(json.dumps({'source':'manual court homography','rows':qa,'cameraWorldMatrixNative':[list(row) for row in cam.matrix_world],'limits':'Approximate broadcast view; projection differences do not measure professional pose fidelity.'},indent=2))
landmarks=[]
for sf in frames:
 f=(sf-480)*s.render.fps/25;s.frame_set(int(f),subframe=f%1);row={'sourceFrame':sf,'modelFrame':f,'landmarks':{}}
 for n in ['pelvis','spine_03','Head','upperarm_r','lowerarm_r','hand_r','upperarm_l','lowerarm_l','hand_l','thigh_r','calf_r','foot_r','thigh_l','calf_l','foot_l']:
  b=r.pose.bones.get('CTRL_'+n)
  if b:
   point=r.matrix_world@b.head;uv=world_to_camera_view(s,cam,point);row['landmarks'][n]={'native':list(point),'cropPixel':[uv.x*1280-240,(1-uv.y)*720-130]}
 landmarks.append(row);s.render.filepath=str((out/f'{sf:04}.png').resolve());bpy.ops.render.render(write_still=True)
(out/'projected-landmarks.json').write_text(json.dumps(landmarks,indent=2));print('CAMERA MAX ERROR',max(x['errorPixels'] for x in qa))
