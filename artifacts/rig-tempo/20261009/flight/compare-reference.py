"""Report approximate-camera pixel residuals; this NEVER certifies 3D recovery."""
import argparse,bisect,hashlib,json,math
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument('--flight',required=True,type=Path)
ap.add_argument('--output',required=True,type=Path);args=ap.parse_args()
d=json.loads(args.flight.read_text())
camera_path=Path('artifacts/rig-refine/20261008/reference-camera.json')
camera=json.loads(camera_path.read_text());matrix=camera['nativeToImageProjection']
observations=[{'sourceFrame':488,'imageBox':[414,453,430,490],'status':'ball/racket merged; only a broad region is visible'},
 {'sourceFrame':500,'pixel':[395,234],'uncertaintyPx':3},
 {'sourceFrame':506,'pixel':[393,223],'uncertaintyPx':3},
 {'sourceFrame':513,'pixel':[397,264],'uncertaintyPx':4},
 {'sourceFrame':514,'pixel':[397,257],'uncertaintyPx':6,'status':'long motion blur'},
 {'sourceFrame':522,'pixel':[398,203],'uncertaintyPx':3},
 {'sourceFrame':536,'pixel':[404,326],'uncertaintyPx':6}]
def position(time):
    rows=d['incoming'] if time<d['hitTime'] else d['outgoing'];times=[r['time'] for r in rows]
    idx=max(0,min(len(rows)-2,bisect.bisect_right(times,time)-1));a,b=rows[idx:idx+2]
    u=(time-a['time'])/(b['time']-a['time'])
    return [x+(y-x)*u for x,y in zip(a['p'],b['p'])]
def project(p):
    native=[p[0],-p[2],p[1],1];v=[sum(a*b for a,b in zip(row,native)) for row in matrix]
    return [v[0]/v[2],v[1]/v[2]]
rows=[]
for obs in observations:
    p=position((obs['sourceFrame']-480)/25);pixel=project(p)
    if 'pixel' in obs: delta=[a-b for a,b in zip(pixel,obs['pixel'])]
    else:
        x0,y0,x1,y1=obs['imageBox'];delta=[max(x0-pixel[0],pixel[0]-x1,0),max(y0-pixel[1],pixel[1]-y1,0)]
    rows.append({**obs,'worldM':p,'projectedPixel':pixel,'pixelResidual':delta,'errorPx':math.hypot(*delta)})
report={'schema':'rally-flight-reference-residual-v1','flight':str(args.flight),
 'flightSHA256':hashlib.sha256(args.flight.read_bytes()).hexdigest(),'sourceSHA256':d['sourceSHA256'],
 'glbSHA256':d.get('glbSHA256'),'cameraSHA256':hashlib.sha256(camera_path.read_bytes()).hexdigest(),
 'checkerSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
 'sourceVideoFrames':[487,537],'referenceFramesActuallyOpened':[487,488,489,500,506,513,514,522,536,537],
 'observationsBy':'Independent reference-review agent; direct full-frame visual readings, not automatic tracking',
 'camera':str(camera_path),'cameraStatus':camera['method'],
 'rows':rows,'impact':{'sourceFrame':d['hitSourceFrame'],'projectedPixel':project(d['contact']['corkCenter']),
   'observedIntervalSourceFrames':[513,514],'status':'Current real stringbed contact remains below the observed ball projection; do not move the shuttle off the strings to hide it.'},
 'professionalFlightFidelity':'improved_not_passed',
 'limits':['Single-view camera and manually read pixels cannot determine unique 3D positions or velocities.',
   'The488 source ball overlaps racket and motion blur. A selected point inside its region is an authoring assumption, not a measured centre.',
   'Source513—514, not a unique subframe, is the visible return interval.',
   'The model contact is physically attached to the actual string mesh, but its camera projection remains lower than the real match.',
   'Numerical contact, net and in-court landing checks do not imply exact professional-video restoration.']}
args.output.write_text(json.dumps(report,indent=2));print(json.dumps({'rows':[{k:r[k] for k in ['sourceFrame','projectedPixel','errorPx']} for r in rows],'professionalFlightFidelity':report['professionalFlightFidelity']},indent=2))
