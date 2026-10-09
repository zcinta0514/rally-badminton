"""Delay rear-thigh gather while retaining early calf flexion and the support/root."""
import bpy,sys,json,math,numpy as np
from pathlib import Path
from mathutils import Quaternion
original,base,out=map(Path,sys.argv[sys.argv.index('--')+1:]);out.mkdir(parents=True,exist_ok=True)
frames=sorted(set([i*.25 for i in range(96,212)]+[52.8]))
def weight(sf):
 if sf<=485 or sf>=491:return 0.
 if sf<487:u=(sf-485)/2;return u*u*(3-2*u)
 if sf<=488:return 1.
 u=(sf-488)/3;return 1-u*u*(3-2*u)
bpy.ops.wm.open_mainfile(filepath=str(original.resolve()));s=bpy.context.scene;r=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];orig={}
for f in frames:
 s.frame_set(int(f),subframe=f%1);orig[f]=r.pose.bones['CTRL_thigh_l'].rotation_quaternion.copy()
bpy.ops.wm.open_mainfile(filepath=str(base.resolve()));s=bpy.context.scene;r=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];b=r.pose.bones['CTRL_thigh_l'];snap={}
for f in frames:
 s.frame_set(int(f),subframe=f%1);snap[f]=b.rotation_quaternion.copy()
for l in r.animation_data.action.layers:
 for st in l.strips:
  for bag in st.channelbags:
   for fc in bag.fcurves:
    if fc.data_path=='pose.bones[\"CTRL_thigh_l\"].rotation_quaternion':
     for i in range(len(fc.keyframe_points)-1,-1,-1):
      k=fc.keyframe_points[i]
      if frames[0]<=k.co.x<=frames[-1]:fc.keyframe_points.remove(k,fast=True)
rows=[]
for f in frames:
 sf=480+f/4.8;w=weight(sf);q=snap[f].slerp(orig[f],w);q.make_compatible(snap[f]);b.rotation_quaternion=q;b.keyframe_insert(data_path='rotation_quaternion',frame=f,group=b.name);rows.append({'frame':f,'sourceFrame':sf,'originalThighWeight':w,'changeDeg':math.degrees(snap[f].rotation_difference(q).angle)})
# Exact boundary poses at source491 remain the original baseline; existing FK
# parent root, calf flexion, and foot local rotations are all untouched.
for l in r.animation_data.action.layers:
 for st in l.strips:
  for bag in st.channelbags:
   for fc in bag.fcurves:
    if fc.data_path=='pose.bones["CTRL_thigh_l"].rotation_quaternion':
     for k in fc.keyframe_points:
      if frames[0]<=k.co.x<=frames[-1]:k.interpolation='LINEAR'
s.frame_set(0);bpy.ops.wm.save_as_mainfile(filepath=str((out/'rebuild.blend').resolve()),compress=True);report={'source':str(base),'thighPhaseReference':str(original),'changedBone':'CTRL_thigh_l','unchanged':['root trajectory','right support leg','left calf local hinge','left foot local orientation','upper body','surface geometry and all other keys'],'rows':rows,'scope':'Single-camera phase split: rear thigh retains backward reach while calf folds. Geometry/visual acceptance pending.'};(out/'start-construction.json').write_text(json.dumps(report,indent=2));print('SAVED',out)
