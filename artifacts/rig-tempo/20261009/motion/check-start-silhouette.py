"""Final evaluated sole-center relative projection, not monocular 3D truth."""
import bpy,json,sys,hashlib,numpy as np
from pathlib import Path
src,observations,out=map(Path,sys.argv[sys.argv.index('--')+1:]);obs=json.loads(observations.read_text());bpy.ops.wm.open_mainfile(filepath=str(src.resolve()));s=bpy.context.scene;r=bpy.data.objects['RALLY_AnatomicalRig_Rebuilt'];b=bpy.data.objects['SuperHero_Male'];P=np.array(json.loads(Path('artifacts/rig-rebuild/20261007/integration/reference-camera.json').read_text())['nativeToImageProjection']);sole={side:[v.index for v in b.data.vertices if v.co.z<.012 and v.co.x*sign>0] for side,sign in [('l',1),('r',-1)]}
def uv(p):
 x=P@np.r_[p,1];return x[:2]/x[2]-[240,130]
rows=[]
for sf in sorted(set([480,484,485,486,487,488,489,489.5,490,490.5,491,492,493,494,495,496])):
 f=(sf-480)*4.8;s.frame_set(int(f),subframe=f%1);ev=b.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();centers={side:np.array([(ev.matrix_world@me.vertices[i].co)[:] for i in ix]).mean(axis=0) for side,ix in sole.items()};ev.to_mesh_clear();p={side:uv(v) for side,v in centers.items()};row={'sourceFrame':sf,'modelFrame':f,'leftSoleCenter':centers['l'].tolist(),'rightSoleCenter':centers['r'].tolist(),'leftSolePixel':p['l'].tolist(),'rightSolePixel':p['r'].tolist(),'relativeLeftShoeHeightPixels':float(p['r'][1]-p['l'][1]),'relativeLeftShoeHorizontalPixels':float(p['l'][0]-p['r'][0]),'leftKneePixel':uv(np.array(r.pose.bones['CTRL_calf_l'].head)).tolist()};ref=next((x for x in obs['rows'] if x['sourceFrame']==sf),None)
 if ref:row['referenceRelativeRearShoePixels']=(np.array(ref['rearShoe'])-np.array(obs['frontShoe'])).tolist()
 rows.append(row)
report={'source':str(src),'sourceSHA256':hashlib.sha256(src.read_bytes()).hexdigest(),'rows':rows,'scope':'Final evaluated sole centers and fixed approximate camera, with original blurred outline estimates for comparison. Not a scientific fit/acceptance threshold, and not actual normal-speed playback.'};out.write_text(json.dumps(report,indent=2));print('FINAL SOLE HEIGHTS',[(x['sourceFrame'],x['relativeLeftShoeHeightPixels']) for x in rows if 487<=x['sourceFrame']<=491])
