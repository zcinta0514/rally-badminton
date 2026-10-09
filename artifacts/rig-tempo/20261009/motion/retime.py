"""Source-reference start phase correction; frozen geometry and one common monotone clock.
Re-times only 485..491 source frames. No new joint pose, weight, or corrective geometry.
All active bone/surface tracks are sampled on their UNION of original knots, so
linear tracks use exactly the same source clock between every pair of new knots.
"""
import bpy,json,sys,argparse,hashlib,math
from pathlib import Path
import numpy as np
ap=argparse.ArgumentParser();ap.add_argument('--input',required=True);ap.add_argument('--output',required=True);ap.add_argument('--advance',type=float,default=1.6);args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);src=Path(args.input);out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(src.resolve()));s=bpy.context.scene
assert s.render.fps==120 and s.frame_end==480
assert 0<args.advance<2.4
lo,peak,hi=24.,33.6,52.8
# Smooth design clock in model-frame coordinates. Maximum phase advance 1.6/25 s.
def smooth(u):return u*u*(3-2*u)
def mapped(t):
 if t<=lo or t>=hi:return t
 if t<=peak:return t+args.advance*4.8*smooth((t-lo)/(peak-lo))
 return t+args.advance*4.8*(1-smooth((t-peak)/(hi-peak)))
def inverse(t):
 if t<=lo or t>=hi:return t
 a,b=lo,hi
 for _ in range(55):
  m=(a+b)/2
  if mapped(m)<t:a=m
  else:b=m
 return (a+b)/2
blocks=list(bpy.data.objects)+list(bpy.data.shape_keys)
actions={b.animation_data.action for b in blocks if b.animation_data and b.animation_data.action}
curves=[f for a in actions for l in a.layers for st in l.strips for bag in st.channelbags for f in bag.fcurves]
assert curves
# The half/quarter grid also bounds the speed change between linear segments.
grid=sorted(set([lo,hi,peak,mapped(peak)]+[i*.25 for i in range(math.ceil(lo*4),math.floor(hi*4)+1)]+[float(k.co.x) for f in curves for k in f.keyframe_points if lo<k.co.x<hi]))
# Every curve gets the same time partition. Frozen source curves are piecewise
# linear in this interval; no Bezier motion is silently linearized.
violations=[]
for f in curves:
 for k in f.keyframe_points:
  if lo<=k.co.x<=hi and k.interpolation!='LINEAR':violations.append((f.data_path,k.co.x,k.interpolation))
assert not violations,violations
before=[]
for f in curves:
 vals=[float(f.evaluate(x)) for x in grid];before.append((f,vals))
rows=[]
for f,vals in before:
 for i in range(len(f.keyframe_points)-1,-1,-1):
  k=f.keyframe_points[i]
  if lo<=k.co.x<=hi:f.keyframe_points.remove(k,fast=True)
 for t,v in zip(grid,vals):
  k=f.keyframe_points.insert(inverse(t),v,options={'FAST'});k.interpolation='LINEAR'
 f.update()
newTimes=np.array([inverse(t) for t in grid]);oldTimes=np.array(grid);speeds=np.diff(oldTimes)/np.diff(newTimes)
assert np.all(speeds>0) and float(speeds.min())>.35
for sf in range(480,541):
 t=(sf-480)*4.8;old=float(np.interp(t,newTimes,oldTimes)) if lo<t<hi else t
 rows.append({'sourceFrame':sf,'oldSourcePhase':480+old/4.8,'advanceSourceFrames':(old-t)/4.8})
# Metadata and geometrical shape positions remain byte-for-byte untouched in this process.
s.frame_set(0);bpy.ops.wm.save_as_mainfile(filepath=str((out/'rebuild.blend').resolve()),compress=True)
report={'input':str(src),'inputSHA256':hashlib.sha256(src.read_bytes()).hexdigest(),'outputSHA256':hashlib.sha256((out/'rebuild.blend').read_bytes()).hexdigest(),'scopeSourceFrames':[485,491],'maxAdvanceSourceFrames':args.advance,'clock':'Common monotone piecewise-linear approximation of smooth compact phase shift; all active bone and shape curves share the same union-knot partition.','actions':sorted(a.name for a in actions),'curves':len(curves),'knots':len(grid),'minimumLocalSpeed':float(speeds.min()),'maximumLocalSpeed':float(speeds.max()),'newModelTimes':newTimes.tolist(),'oldModelTimes':oldTimes.tolist(),'sourceRows':rows,'contactRangeUnchanged':True,'supportWindowsUnchanged':True,'surfaceTopologyWeightsAndKeyPositionsChanged':False,'limits':['Only timing is changed, not initial 480..484 load amplitude or 507..540 pose residuals.','Single-view phase inference, not motion capture or measured 3D.','No user naturalness/professional-fidelity approval inferred.']}
(out/'construction.json').write_text(json.dumps(report,indent=2));print('RESULT',json.dumps({k:report[k] for k in ['outputSHA256','curves','knots','minimumLocalSpeed','maximumLocalSpeed']}),flush=True)
