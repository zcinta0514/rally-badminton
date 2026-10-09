"""Small deterministic bounded fit of authored feed/restitution to coarse pixels.

The real string contact, its time, normal and racket velocity are frozen. This
does not estimate a unique physical flight from monocular video.
"""
import argparse,json,math
from pathlib import Path
import numpy as np
np.seterr(over='ignore',invalid='ignore',divide='ignore') # divergent reverse-flight trials are rejected explicitly

ap=argparse.ArgumentParser();ap.add_argument('--racket',type=Path,required=True)
ap.add_argument('--output',type=Path,required=True);args=ap.parse_args()
r=json.loads(args.racket.read_text());c=r['contact'];hit=r['hitTime']
p=np.array(c['corkCenter']);normal=np.array(c['normal']);vr=np.array(c['racketVelocity'])
P=np.array(json.loads(Path('artifacts/rig-refine/20261008/reference-camera.json').read_text())['nativeToImageProjection'])
low=np.array([-5.,-5.4,-.4,.65]);high=np.array([-2.,-3.1,.7,.98])
observations=[(500,[395,234],3),(506,[393,223],3),(522,[398,203],3),(536,[404,326],6)]
seed=20261009;rng=np.random.default_rng(seed)

def project(points):
    native=np.column_stack((points[:,0],-points[:,2],points[:,1],np.ones(len(points))))
    h=native@P.T
    return h[:,:2]/h[:,2,None]
def deriv(states):
    speed=np.linalg.norm(states[:,3:],axis=1)[:,None]
    a=-.18*speed*states[:,3:];a[:,1]-=9.81
    return np.column_stack((states[:,3:],a))
def step(s,dt):
    a=deriv(s);b=deriv(s+dt*a/2);cc=deriv(s+dt*b/2);d=deriv(s+dt*cc)
    return s+dt*(a+2*b+2*cc+d)/6
def evaluate(par,dt=1/120):
    count=len(par);vi=par[:,:3];e=par[:,3];approach=(vi-vr)@normal
    vo=vi-((1+e)*approach)[:,None]*normal
    s=np.column_stack((np.tile(p,(count,1)),vi));t=hit;samples={};incoming_net=np.full(count,np.nan)
    valid=np.ones(count,dtype=bool)
    for stop in [1.04,.8,.32]:
        while t-stop>1e-10:
            delta=min(dt,t-stop);old=s;s=step(s,-delta);t-=delta
            cross=(old[:,0]<5)&(s[:,0]>=5)&np.isnan(incoming_net)
            u=(5-old[:,0])/(s[:,0]-old[:,0])
            incoming_net[cross]=old[cross,1]+u[cross]*(s[cross,1]-old[cross,1])
            valid&=(s[:,1]>0)&(np.abs(s[:,2])+.013<2.59)&np.isfinite(s).all(axis=1)
        samples[stop]=s[:,:3].copy()
    feed=s[:,:3].copy()
    valid&=(feed[:,0]>5)&(feed[:,0]<11.7)&(feed[:,1]>.05)&(feed[:,1]<1)&(incoming_net>1.55)
    s=np.column_stack((np.tile(p,(count,1)),vo));t=hit;land=np.full((count,3),np.nan);out_net=np.full(count,np.nan)
    for stop in [1.68,2.24,2.26,hit+4]:
        while stop-t>1e-10:
            delta=min(dt,stop-t);old=s;s=step(s,delta);t+=delta
            cross=(old[:,0]<5)&(s[:,0]>=5)&np.isnan(out_net)
            u=(5-old[:,0])/(s[:,0]-old[:,0])
            out_net[cross]=old[cross,1]+u[cross]*(s[cross,1]-old[cross,1])
            landed=(s[:,1]<=0)&np.isnan(land[:,0]);u=old[:,1]/(old[:,1]-s[:,1])
            land[landed]=old[landed,:3]+u[landed,None]*(s[landed,:3]-old[landed,:3])
        samples[stop]=s[:,:3].copy()
    next_hit=samples[2.26]
    valid&=(approach<0)&(out_net>1.55)&(land[:,0]>5)&(land[:,0]<11.687)&(np.abs(land[:,2])<2.577)
    valid&=(next_hit[:,0]>7)&(next_hit[:,0]<11.7)&(next_hit[:,1]>2.2)&(next_hit[:,1]<3.6)
    score=np.zeros(count);pixels={}
    for sf,wanted,sigma in observations:
        pix=project(samples[(sf-480)/25]);pixels[str(sf)]=pix
        # Equal statistical weight by the manually estimated reading uncertainty.
        score+=np.sum(((pix-np.array(wanted))/sigma)**2,axis=1)
    feed_pixel=project(feed);outside=np.column_stack((np.maximum.reduce((414-feed_pixel[:,0],feed_pixel[:,0]-430,np.zeros(count))),np.maximum.reduce((453-feed_pixel[:,1],feed_pixel[:,1]-490,np.zeros(count)))))
    score+=np.sum((outside/8)**2,axis=1)
    score[~valid]=np.inf
    return score,{'valid':valid,'feed':feed,'feedPixel':feed_pixel,'pixels':pixels,'outgoing':vo,'landing':land,'next':next_hit,'netInY':incoming_net,'netOutY':out_net}

history=[];elite=None;best=None;best_score=np.inf
for round_index in range(8):
    if round_index==0:
        population=rng.uniform(low,high,size=(5000,4))
        population=np.vstack((population,[-4,-4,0,.8],[-3.15477714,-4.03456317,.29916652,.9]))
    else:
        centres=elite[rng.integers(0,len(elite),size=1800)]
        population=np.clip(centres+rng.normal(size=centres.shape)*(high-low)*(.12*.52**(round_index-1)),low,high)
        population=np.vstack((elite,population))
    scores,detail=evaluate(population)
    order=np.argsort(scores);elite=population[order[:24]].copy()
    if scores[order[0]]<best_score:best_score=float(scores[order[0]]);best=population[order[0]].copy()
    row={'round':round_index,'candidates':len(population),'physicalPasses':int(detail['valid'].sum()),'bestWeightedSquaredError':float(scores[order[0]]),'bestParameters':population[order[0]].tolist()};history.append(row);print(json.dumps(row),flush=True)
assert best is not None and math.isfinite(best_score)
# Re-evaluate chosen and both previous candidates at the production480Hz step.
comparisons=[]
for name,par in [('bounded-fit',best),('initial',np.array([-4,-4,0,.8])),('single-feed-point',np.array([-3.15477714,-4.03456317,.29916652,.9]))]:
    score,result=evaluate(par[None,:],1/480)
    comparisons.append({'name':name,'parameters':par.tolist(),'weightedSquaredError':float(score[0]),'physicalGatesPassed':bool(result['valid'][0]),
      'feedPoint':result['feed'][0].tolist(),'feedPixel':result['feedPixel'][0].tolist(),
      'projectedPixels':{sf:value[0].tolist() for sf,value in result['pixels'].items()},
      'outgoingMps':result['outgoing'][0].tolist(),'landing':result['landing'][0].tolist(),'nextOpponentContact':result['next'][0].tolist(),
      'incomingNetY':float(result['netInY'][0]),'outgoingNetY':float(result['netOutY'][0])})
result={'schema':'rally-bounded-flight-fit-v1','sourceSHA256':r['sourceSHA256'],'racket':str(args.racket),
 'randomSeed':seed,'parameters':['incomingVx','incomingVy','incomingVz','restitution'],'bounds':{'min':low.tolist(),'max':high.tolist()},
 'fixed':{'contactTime':hit,'contactPoint':p.tolist(),'faceNormal':normal.tolist(),'racketVelocity':vr.tolist(),'quadraticDrag':.18,'gravity':9.81,'feedTime':.32},
 'observations':[{'sourceFrame':sf,'pixel':pix,'sigmaPx':sigma} for sf,pix,sigma in observations],
 'feedConstraint':{'sourceFrame':488,'pixelBox':[414,453,430,490],'outsidePenaltySigmaPx':8,'heightAssumptionM':[.05,1]},
 'objective':'Sum of squared2D residual/sigma at500,506,522,536. Source488 contributes only distance outside its broad box. Source513—514 contact residual is explicitly excluded because contact geometry is frozen.',
 'optimizer':'Deterministic bounded population refinement:5002 initial plus7x1824, RK4 120Hz for search, chosen and comparison candidates independently re-evaluated at480Hz.',
 'history':history,'selectedIncomingMps':best[:3].tolist(),'selectedRestitution':float(best[3]),
 'comparisons':comparisons,'limits':['All3D feed velocities, restitution and drag are authored inferences; no calibrated motion capture or measured collision data.',
 'A broad low-feed height assumption is used. The488 centre is not known; no centre pixel is forced.',
 'All contact geometry and source/GLB tolerances remain fixed. Changing physics parameters does not relax geometric checks.',
 'The best result in this bounded search is not a proof of a unique or globally optimal physical reconstruction.',
 'The real model contact remains below the observed match ball. That residual is retained rather than moving the shuttle off the strings.']}
args.output.write_text(json.dumps(result,indent=2));print(json.dumps(comparisons,indent=2))
