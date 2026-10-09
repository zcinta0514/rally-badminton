"""Local forearm-roll and wrist strike correction, coherent hand/racket attachment.
No limb target, grip transform, finger curve, or foot-support edits.
"""
import bpy,sys,argparse,math,json,numpy as np
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument('--input',required=True);ap.add_argument('--output',required=True);ap.add_argument('--impact-rate-scale',type=float,default=.30);args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);src=Path(args.input);out=Path(args.output);out.mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(src.resolve()));s=bpy.context.scene;r=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];act=r.animation_data.action
# Degrees of ADDITIVE roll/y, wrist/x, wrist/z correction. PCHIP makes a
# nonzero negative roll rate at the impact instead of putting it at a peak.
nodes=[[508,0,0,0],[510,22,-20,1],[512,58,-36,3],[513.3,36.2725773594,-28.4043252207,2.91742620986],[514.4,10,-16,1.7],[516.5,0,0,0],[518,0,0,0]]
def cv(t):
 x=np.array([v[0] for v in nodes]);y=np.array([v[1:] for v in nodes]);h=np.diff(x);d=np.diff(y,axis=0)/h[:,None];m=np.zeros_like(y)
 for i in range(1,len(x)-1):
  same=d[i-1]*d[i]>0;w1=2*h[i]+h[i-1];w2=h[i]+2*h[i-1];m[i]=np.where(same,(w1+w2)/(w1/np.where(same,d[i-1],1)+w2/np.where(same,d[i],1)),0)
 m[3]*=args.impact_rate_scale
 if t<=x[0]:return y[0]
 if t>=x[-1]:return y[-1]
 i=np.searchsorted(x,t)-1;u=(t-x[i])/h[i];return (2*u**3-3*u*u+1)*y[i]+(u**3-2*u*u+u)*h[i]*m[i]+(-2*u**3+3*u*u)*y[i+1]+(u**3-u*u)*h[i]*m[i+1]
# Sample originals before inserting anything, including exact endpoints.
frames=sorted(set([i*.5 for i in range(math.floor((508-480)*9.6),math.ceil((518-480)*9.6)+1)]+[(508-480)*4.8,(518-480)*4.8]));bases={};roll=r.pose.bones['ROLL_lowerarm_r'];hand=r.pose.bones['CTRL_hand_r']
for f in frames:
 s.frame_set(int(f),subframe=f%1);bases[f]=(roll.rotation_euler.copy(),hand.rotation_euler.copy())
rows=[]
for f in frames:
 sf=480+f/4.8;a,b=bases[f];v=np.deg2rad(cv(sf));roll.rotation_euler=a;hand.rotation_euler=b;roll.rotation_euler.y+=v[0];hand.rotation_euler.x+=v[1];hand.rotation_euler.z+=v[2];roll.keyframe_insert(data_path='rotation_euler',frame=f,group=roll.name);hand.keyframe_insert(data_path='rotation_euler',frame=f,group=hand.name);rows.append({'frame':f,'sourceFrame':sf,'additiveDeg':np.rad2deg(v).tolist(),'totalRollWristDeg':[math.degrees(roll.rotation_euler.y),math.degrees(hand.rotation_euler.x),math.degrees(hand.rotation_euler.z)]})
for l in act.layers:
 for st in l.strips:
  for bag in st.channelbags:
   for fc in bag.fcurves:
    if any(fc.data_path.startswith('pose.bones["'+n+'"]') for n in [roll.name,hand.name]):
     for k in fc.keyframe_points:
      if frames[0]<=k.co.x<=frames[-1]:k.interpolation='LINEAR'
s.frame_set(0);bpy.ops.wm.save_as_mainfile(filepath=str((out/'rebuild.blend').resolve()),compress=True);report={'source':str(src),'sourceRange':[508,518],'changedBones':[roll.name,hand.name],'additiveNodes':nodes,'impactRateScale':args.impact_rate_scale,'rows':rows,'racketAttachmentAndFingerCurvesUnchanged':True,'scope':'Authored 3D inference to align actual strike normal and normal velocity; not a measured professional impact. New geometry and flight QA required.'};(out/'contact-construction.json').write_text(json.dumps(report,indent=2));print('CONTACT CANDIDATE',out,flush=True)
