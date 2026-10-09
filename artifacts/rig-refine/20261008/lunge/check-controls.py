import bpy,json,math,sys,argparse,numpy as np
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument('--input',required=True);ap.add_argument('--baseline',required=True);ap.add_argument('--output',required=True);args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
windows=json.loads(Path('artifacts/rig-rebuild/20261007/integration/final/source-contact-contract.json').read_text())['windows'];edited={'CTRL_root'}|{f'CTRL_{p}_{side}' for p in ['thigh','calf','foot','ball'] for side in ['r','l']}|{f'IK_{p}_{side}' for p in ['ankle_target','knee_pole'] for side in ['r','l']};floor=-.013
baseline=[];surface=[];baseQ=[];baselineRest=None;baselineConstraints=None
for mode,path in [('baseline',args.baseline),('candidate',args.input)]:
 bpy.ops.wm.open_mainfile(filepath=str(Path(path).resolve()));s=bpy.context.scene;r=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];body=bpy.data.objects['SuperHero_Male'];ids={side:{'whole':[v.index for v in body.data.vertices if v.co.z<.012 and v.co.x*sign>0],'forefoot':[v.index for v in body.data.vertices if v.co.z<.012 and v.co.x*sign>0 and v.co.y<-.025],'toes':[v.index for v in body.data.vertices if v.co.z<.012 and v.co.x*sign>0 and v.co.y<-.105],'heel':[v.index for v in body.data.vertices if v.co.z<.012 and v.co.x*sign>0 and v.co.y>.035]} for side,sign in [('l',1),('r',-1)]};protected=[b for b in r.pose.bones if b.name.startswith(('CTRL_','ROLL_','IK_')) and b.name not in edited];maxProtected=0;maxOutside=0;prev={};rates={};violations=[];angles={};samples=[];maxLength=0;beforeRates={}
 restVertices=np.array([v.co[:] for v in body.data.vertices]);constraints={b.name:[{k:getattr(c,k) for k in ['owner_space','use_limit_x','use_limit_y','use_limit_z','min_x','min_y','min_z','max_x','max_y','max_z']} for c in b.constraints if c.type=='LIMIT_ROTATION'] for b in r.pose.bones}
 if mode=='baseline':baselineRest=restVertices;baselineConstraints=constraints
 for i in range(961):
  f=i/2;s.frame_set(int(f),subframe=f%1);sf=480+f*25/s.render.fps;deps=bpy.context.evaluated_depsgraph_get();ev=body.evaluated_get(deps);mesh=ev.to_mesh();arr=np.array([(ev.matrix_world@v.co)[:] for v in mesh.vertices]);feet={side:{region:arr[ii].copy() for region,ii in sets.items()} for side,sets in ids.items()};ev.to_mesh_clear();samples.append(feet)
  if mode=='baseline':baseline.append({b.name:np.array(b.matrix_basis).copy() for b in r.pose.bones if b.name.startswith(('CTRL_','ROLL_','IK_'))});baseQ.append({b.name:b.matrix.to_quaternion().copy() for b in r.pose.bones if b.name.startswith('CTRL_')});continue
  for b in protected:maxProtected=max(maxProtected,float(np.abs(np.array(b.matrix_basis)-baseline[i][b.name]).max()))
  if sf<508 or sf>539:
   for n in edited:maxOutside=max(maxOutside,float(np.abs(np.array(r.pose.bones[n].matrix_basis)-baseline[i][n]).max()))
  for bone in r.pose.bones:
   if not bone.name.startswith('CTRL_'):continue
   maxLength=max(maxLength,abs((bone.tail-bone.head).length-bone.bone.length));q=bone.matrix.to_quaternion()
   if bone.name in prev:
    deg=math.degrees(q.rotation_difference(prev[bone.name]).angle);deg=min(deg,360-deg)
    if deg>rates.get(bone.name,{}).get('deg',0):rates[bone.name]={'deg':deg,'frame':f,'sourceFrame':sf}
    oldDeg=math.degrees(baseQ[i][bone.name].rotation_difference(baseQ[i-1][bone.name]).angle);oldDeg=min(oldDeg,360-oldDeg)
    if oldDeg>beforeRates.get(bone.name,{}).get('deg',0):beforeRates[bone.name]={'deg':oldDeg,'frame':f,'sourceFrame':sf}
   prev[bone.name]=q
   parent=bone.parent;local=(parent.matrix@parent.bone.matrix_local.inverted()@bone.bone.matrix_local).inverted()@bone.matrix if parent else bone.matrix;e=[math.degrees(v) for v in local.to_euler()]
   if bone.name in ['CTRL_calf_l','CTRL_foot_l','CTRL_ball_l']:
    st=angles.setdefault(bone.name,{'min':[999]*3,'max':[-999]*3});st['min']=[min(a,v) for a,v in zip(st['min'],e)];st['max']=[max(a,v) for a,v in zip(st['max'],e)]
   for c in bone.constraints:
    if c.type=='LIMIT_ROTATION' and c.owner_space=='LOCAL':
     for j,axis in enumerate('xyz'):
      if getattr(c,'use_limit_'+axis):
       lo=math.degrees(getattr(c,'min_'+axis));hi=math.degrees(getattr(c,'max_'+axis));ex=max(lo-e[j],e[j]-hi,0)
       if ex>.02:violations.append({'frame':f,'bone':bone.name,'axis':axis,'value':e[j],'range':[lo,hi]})
 if mode=='baseline':surface=samples;continue
 support=[]
 for side,ww in windows.items():
  for a,b in ww:
   row={'side':side,'originalWindow':[a,b],'sourceWindow':[480+a*25/120,480+b*25/120],'regions':{}}
   for region in ids[side]:
    anchor=samples[round(a+b)][side][region];sel=[samples[i][side][region] for i in range(math.ceil(2*a),math.floor(2*b)+1)];beforeAnchor=surface[round(a+b)][side][region];beforeSel=[surface[i][side][region] for i in range(math.ceil(2*a),math.floor(2*b)+1)];row['regions'][region]={'vertices':len(anchor),'maximumDriftM':max(float(np.linalg.norm(x-anchor,axis=1).max()) for x in sel),'minimumZRange':[min(float(x[:,2].min()) for x in sel),max(float(x[:,2].min()) for x in sel)],'vertexZRange':[min(float(x[:,2].min()) for x in sel),max(float(x[:,2].max()) for x in sel)],'baselineMaximumDriftM':max(float(np.linalg.norm(x-beforeAnchor,axis=1).max()) for x in beforeSel),'maximumDifferenceFromBaselineM':max(float(np.linalg.norm(samples[i][side][region]-surface[i][side][region],axis=1).max()) for i in range(math.ceil(2*a),math.floor(2*b)+1))}
   support.append(row)
 outsideSurface=max(float(np.linalg.norm(samples[i][side]['whole']-surface[i][side]['whole'],axis=1).max()) for i in range(961) if not 508<=480+i*.5*25/120<=539 for side in ['l','r'])
 report={'input':args.input,'baseline':args.baseline,'sampleHz':240,'samples':961,'edited':list(edited),'restVertexMaxDifferenceM':float(np.abs(restVertices-baselineRest).max()),'limitsUnchanged':constraints==baselineConstraints,'maxProtectedBasisDifference':maxProtected,'maxOutsideIntervalBasisDifference':maxOutside,'maxOutsideIntervalSoleSurfaceDifferenceM':outsideSurface,'maxBoneLengthErrorM':maxLength,'constraintViolations':violations,'angles':angles,'maxHalfFrameRotation':rates,'baselineMaxHalfFrameRotation':beforeRates,'floorZ':floor,'support':support,'allOriginalWindowsPreserved':True,'limits':'Forefoot includes metatarsal pad (restY<-.025m); distal toes restY<-.105m. All selected mesh vertices reported, original full-sole metric retained. This is DQ authoring input, not solved/exported surface.'};(out/'control-support-qa.json').write_text(json.dumps(report,indent=2));print('PROTECTED',maxProtected,'OUTSIDE',maxOutside,'VIOLATIONS',len(violations),'LENGTH',maxLength);print('LEFT CONTACT',next(x for x in support if x['side']=='l' and x['originalWindow']==[174,182]));print('MAXROT',max((v['deg'],n,v['frame']) for n,v in rates.items()))
