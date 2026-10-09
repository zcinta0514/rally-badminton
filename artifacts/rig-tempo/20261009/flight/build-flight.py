"""Recompute a ballistic shuttle from a real extracted moving stringbed.

No outgoing velocity override exists: gravity, quadratic drag and a moving-plane
restitution impulse determine it. All numerical physics constants are authored.
"""
import argparse, hashlib, json, math
from pathlib import Path

def dot(a,b): return sum(x*y for x,y in zip(a,b))
def norm(a): return math.sqrt(dot(a,a))
def deriv(state, drag):
    v=state[3:];speed=norm(v)
    return v+[-drag*speed*v[0],-9.81-drag*speed*v[1],-drag*speed*v[2]]
def step(state,dt,drag):
    a=deriv(state,drag)
    b=deriv([x+dt*y/2 for x,y in zip(state,a)],drag)
    c=deriv([x+dt*y/2 for x,y in zip(state,b)],drag)
    d=deriv([x+dt*y for x,y in zip(state,c)],drag)
    return [x+dt*(aa+2*bb+2*cc+dd)/6 for x,aa,bb,cc,dd in zip(state,a,b,c,d)]
def crossing(rows,x,direction):
    for a,b in zip(rows,rows[1:]):
        if (a['p'][0]-x)*direction<=0 and (b['p'][0]-x)*direction>=0:
            u=(x-a['p'][0])/(b['p'][0]-a['p'][0])
            return {'time':a['time']+u*(b['time']-a['time']),
              'p':[aa+u*(bb-aa) for aa,bb in zip(a['p'],b['p'])],
              'v':[aa+u*(bb-aa) for aa,bb in zip(a['v'],b['v'])]}
    return None
def interp(rows,t):
    for a,b in zip(rows,rows[1:]):
        if a['time']<=t<=b['time']:
            u=(t-a['time'])/(b['time']-a['time'])
            return {'time':t,'p':[x+(y-x)*u for x,y in zip(a['p'],b['p'])],
              'v':[x+(y-x)*u for x,y in zip(a['v'],b['v'])]}
    return None

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--racket',required=True,type=Path)
    ap.add_argument('--output',required=True,type=Path)
    ap.add_argument('--glb',type=Path,help='Final exported GLB; bind its SHA before any QA reports are generated')
    ap.add_argument('--parameters',type=Path,help='Explicit frozen per-sequence authoring parameters, not global physics defaults')
    ap.add_argument('--incoming',type=float,nargs=3)
    ap.add_argument('--restitution',type=float)
    ap.add_argument('--drag',type=float)
    ap.add_argument('--feed-time',type=float)
    args=ap.parse_args()
    parameters={}
    if args.parameters:
        assert all(x is None for x in [args.incoming,args.restitution,args.drag,args.feed_time]),'Do not mix frozen parameters and individual physics overrides'
        parameters=json.loads(args.parameters.read_text())
    args.incoming=parameters.get('incomingMps',args.incoming if args.incoming is not None else [-4,-4,0])
    args.restitution=parameters.get('restitution',args.restitution if args.restitution is not None else .8)
    args.drag=parameters.get('quadraticDrag',args.drag if args.drag is not None else .18)
    args.feed_time=parameters.get('feedTime',args.feed_time if args.feed_time is not None else .32)
    r=json.loads(args.racket.read_text());c=r['contact'];hit=r['hitTime'];hz=480
    if parameters:assert abs(r['hitSourceFrame']-parameters['hitSourceFrame'])<1e-7,'Frozen impact time differs from actual extraction'
    p=c['corkCenter'];n=c['normal'];vr=c['racketVelocity'];vi=args.incoming;e=args.restitution;k=args.drag
    assert 0<e<=1 and 0<k<1 and 0<=args.feed_time<hit
    approach=dot([x-y for x,y in zip(vi,vr)],n)
    impulse=-(1+e)*approach
    vo=[x+impulse*nn for x,nn in zip(vi,n)]
    radius=c['corkRadius'];ground=-.013;net_y=ground+1.55
    incoming=[{'time':hit,'p':p,'v':vi}];state=p+vi;t=hit
    while t>args.feed_time+1e-12:
        dt=min(1/hz,t-args.feed_time);state=step(state,-dt,k);t-=dt
        assert all(math.isfinite(x) for x in state) and norm(state[3:])<200, 'Inferred feed diverged; choose a defensible earlier feed event rather than an infinite reverse arc'
        incoming.append({'time':t,'p':state[:3],'v':state[3:]})
    incoming.reverse()
    outgoing=[{'time':hit,'p':p,'v':vo}];state=p+vo;t=hit
    while t<hit+8:
        old=state;state=step(state,1/hz,k);t+=1/hz
        if state[1]<=ground+radius:
            u=(old[1]-ground-radius)/(old[1]-state[1]);state=[a+(b-a)*u for a,b in zip(old,state)]
            outgoing.append({'time':t-(1-u)/hz,'p':state[:3],'v':state[3:]});break
        outgoing.append({'time':t,'p':state[:3],'v':state[3:]})
    net_in=crossing(incoming,5,-1);net_out=crossing(outgoing,5,1)
    landing=outgoing[-1];apex=max(outgoing,key=lambda a:a['p'][1]);next_hit=interp(outgoing,2.26)
    in_start=incoming[0]
    gates={'finite':all(math.isfinite(x) for a in incoming+outgoing for x in a['p']+a['v']),
      'contactPositionContinuous':norm([a-b for a,b in zip(incoming[-1]['p'],outgoing[0]['p'])])<1e-10,
      'approachingBedBeforeHit':approach<0,
      'separatingAfterHit':dot([x-y for x,y in zip(vo,vr)],n)>0,
      'incomingOverNet':bool(net_in and net_in['p'][1]-radius>net_y),
      'outgoingOverNet':bool(net_out and net_out['p'][1]-radius>net_y),
      'incomingWithinSingleWidth':all(abs(a['p'][2])+radius<2.59 for a in incoming),
      'hypotheticalLandingInsideSingles':5<landing['p'][0]<11.7-radius and abs(landing['p'][2])+radius<2.59,
      'opponentOverheadWindow':bool(next_hit and 7<next_hit['p'][0]<11.7 and 2.2<next_hit['p'][1]<3.6),
      'feedWithinCourt':-1.7<in_start['p'][0]<11.7 and ground+radius<in_start['p'][1]<6,
      'noBelowFloorBeforeImpact':all(a['p'][1]>ground+radius for a in incoming)}
    d={'schema':'rally-calibrated-flight-v1','source':r['source'],'sourceSHA256':r['sourceSHA256'],
      'racketExtraction':str(args.racket.resolve()),'racketExtractionSHA256':hashlib.sha256(args.racket.read_bytes()).hexdigest(),
      'builderSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
      'coordinateSystem':r['coordinateSystem'],'hitTime':hit,'hitSourceFrame':r['hitSourceFrame'],
      'contactSourceFrames':[513,514],'bodyDuration':2.4,'authoredDuration':4,
      'duration':max(2.4,landing['time'])+.35,'sampleHz':hz,
      'previousOpponentContactTime':args.feed_time,'previousOpponentContactSourceFrames':[487,489],
      'nextOpponentContactTime':2.26,'nextOpponentContactSourceFrames':[536,537],
      'contact':{**c,'shuttleIncoming':vi,'shuttleOutgoing':vo,'restitution':e,'impulseMps':impulse,
        'relativeApproach':approach,'relativeSeparation':dot([x-y for x,y in zip(vo,vr)],n)},
      'physics':{'gravity':9.81,'quadraticDrag':k,'integrator':'RK4 480Hz',
        'constantsStatus':'Authored inference, not manufacturer or match measurements'},
      'court':{'netX':5,'groundY':ground,'netHeight':1.55,'netHeightMeaning':'height above ground; absolute Y=groundY+netHeight',
        'nearBaseline':-1.7,'farBaseline':11.7,'halfWidth':3.05,'singlesHalfWidth':2.59},
      'incoming':incoming,'outgoing':outgoing,
      'metrics':{'apexHeight':apex['p'][1],'apexTime':apex['time'],'landing':landing['p'],
        'landingTime':landing['time'],'incomingNetSample':net_in,'netSample':net_out,
        'nextOpponentContactSample':next_hit,'incomingStart':in_start},
      'gates':gates,'passed':all(gates.values()),
      'limits':r['limits']+['World-space feed speed, drag and restitution are authored single-camera inferences.',
        'The observed opponent intercepts around source536—537. The later landing is an unintercepted hypothetical extension, not the match landing.',
        'The outgoing velocity is derived from actual racket velocity and face normal. No target-vector override.',
        'This file checks ballistic/contact-state constraints. Swept cork/mesh uniqueness and GLB parity require separate reports.']}
    if args.glb:
        fixture=json.loads(args.glb.with_name('fixture.json').read_text())
        glb_sha=hashlib.sha256(args.glb.read_bytes()).hexdigest()
        assert fixture['sourceSHA256']==r['sourceSHA256'] and fixture['glbSHA256']==glb_sha,'Final GLB belongs to a different source'
        d['glbSHA256']=glb_sha
    if args.parameters:
        d['authoringParameters']=str(args.parameters.resolve())
        d['authoringParametersSHA256']=hashlib.sha256(args.parameters.read_bytes()).hexdigest()
        d['limits'].extend(parameters['limits'])
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(d,separators=(',',':')))
    print(json.dumps({'passed':d['passed'],'gates':gates,'contact':d['contact'],'metrics':d['metrics']},indent=2))
    if not d['passed']: raise SystemExit('球路检查失败，详见保存的 flight.json；不可作为通过候选。')
if __name__=='__main__':main()
