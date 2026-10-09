"""Blender read-only swept cork checks; no inherited pass from an older source."""
import argparse, bisect, bpy, hashlib, json, math, sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ap=argparse.ArgumentParser();ap.add_argument('--source',required=True,type=Path)
ap.add_argument('--flight',required=True,type=Path);ap.add_argument('--output',required=True,type=Path)
args=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
d=json.loads(args.flight.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(args.source)==d['sourceSHA256'],'Source changed after contact extraction'
bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
s=bpy.context.scene;fps=s.render.fps/s.render.fps_base
body=bpy.data.objects['SuperHero_Male'];root=bpy.data.objects['Racket_GripCenter']
marker=bpy.data.objects['Racket_ContactPoint'];normal_marker=bpy.data.objects['Racket_FaceNormal']
rackets=[o for o in s.objects if o.type=='MESH' and o.get('rally_asset_role')=='racket']
assert len(rackets)==8,'Must check every rebuilt racket mesh'
trees={}
for o in rackets:
    o.data.calc_loop_triangles()
    local_matrix=root.matrix_world.inverted()@o.matrix_world
    trees[o.name]=BVHTree.FromPolygons([local_matrix@v.co for v in o.data.vertices],
        [tuple(t.vertices) for t in o.data.loop_triangles],all_triangles=True)
body.data.calc_loop_triangles();body_faces=[tuple(t.vertices) for t in body.data.loop_triangles]
radius=d['contact']['corkRadius'];hit=d['hitTime']
def native(p):return Vector((p[0],-p[2],p[1]))
def interpolate(t):
    rows=d['incoming'] if t<hit else d['outgoing'];times=[r['time'] for r in rows]
    i=max(0,min(len(rows)-2,bisect.bisect_right(times,t)-1));a,b=rows[i:i+2]
    dt=b['time']-a['time'];u=max(0,min(1,(t-a['time'])/dt))
    return native([(2*u**3-3*u*u+1)*x+(u**3-2*u*u+u)*dt*va+(-2*u**3+3*u*u)*y+(u**3-u*u)*dt*vb for x,y,va,vb in zip(a['p'],b['p'],a['v'],b['v'])])
def inside(tree,p):
    direction=Vector((.371,.529,.763)).normalized();point=p.copy();hits=0
    for _ in range(40):
        loc,_,_,_=tree.ray_cast(point,direction)
        if loc is None:return bool(hits%2)
        hits+=1;point=loc+direction*1e-6
    raise RuntimeError('Parity ray unexpectedly exceeded40 hits')
start=d['incoming'][0]['time'];end=d['metrics']['landingTime']
times={start,end,hit};times.update(i/480 for i in range(math.ceil(start*480),math.floor(end*480)+1))
times.update(hit+i/4800 for i in range(-240,241) if start<=hit+i/4800<=end)
rows=[];min_body=1e9;min_other=1e9;min_strings=1e9;hit_row=None;inside_body=[]
for idx,t in enumerate(sorted(times)):
    frame=min(s.frame_end,max(0,t*fps));s.frame_set(int(frame),subframe=frame%1)
    p=interpolate(t);c=marker.matrix_world.translation;n=(normal_marker.matrix_world.translation-c).normalized()
    signed=(p-c).dot(n);local=root.matrix_world.inverted()@p
    cfg=d['contact']['racketDimensions'];cz=cfg['head_tip']-cfg['head_height']/2
    ellipse=(local.x/(cfg['head_width']/2-cfg['frame_radial_radius']))**2+((local.z-cz)/(cfg['head_height']/2-cfg['frame_radial_radius']))**2
    distances={}
    for o in rackets:
        scale=root.matrix_world.to_scale()
        assert max(scale)-min(scale)<1e-5,'Uniform root scale required'
        local_p=root.matrix_world.inverted()@p
        nearest=trees[o.name].find_nearest(local_p)
        gap=nearest[3]*scale.x-radius
        if inside(trees[o.name],local_p):gap=-nearest[3]*scale.x-radius
        distances[o.name]=gap
    strings_gap=distances[d['contact']['stringMesh']];other_gap=min(v for k,v in distances.items() if k!=d['contact']['stringMesh'])
    ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh()
    tree=BVHTree.FromPolygons([ev.matrix_world@v.co for v in mesh.vertices],body_faces,all_triangles=True)
    body_gap=tree.find_nearest(p)[3]-radius
    if inside(tree,p):body_gap=-body_gap-2*radius;inside_body.append(t)
    ev.to_mesh_clear()
    min_body=min(min_body,body_gap);min_other=min(min_other,other_gap);min_strings=min(min_strings,strings_gap)
    row={'time':t,'signedBedPlaneDistanceM':signed,'ellipse':ellipse,'corkToStringsGapM':strings_gap,
      'corkToOtherRacketGapM':other_gap,'corkToBodyGapM':body_gap}
    rows.append(row)
    if abs(t-hit)<1e-10:hit_row=row
    if idx%240==0:print('SWEPT',idx,'/',len(times),flush=True)
near=[r for r in rows if abs(r['time']-hit)<=.05]
extra_contacts=[r for r in rows if abs(r['time']-hit)>1/4800 and r['corkToStringsGapM']<0.00001]
plane_behind=[r for r in rows if r['ellipse']<=1 and r['signedBedPlaneDistanceM']<0]
gates={'correctSource':True,'contactActualStrings':abs(hit_row['corkToStringsGapM'])<1e-5,
 'noCorkBodyIntersection':min_body>0,'noCorkFrameOrShaftIntersection':min_other>0,
 'noStringPenetration':min_strings>=-1e-5,'noSecondStringContact':not extra_contacts,
 'noPassThroughStringBed':not plane_behind,
 'restitutionAndFlight':d['passed']}
report={'schema':'rally-swept-source-contact-v1','source':str(args.source),'sourceSHA256':sha(args.source),
 'flight':str(args.flight),'flightSHA256':sha(args.flight),'checkerSHA256':sha(Path(__file__)),
 'sampleHz':480,'contactDenseHz':4800,'contactDenseWindowSeconds':.1,'sampleCount':len(rows),
 'racketMeshes':[o.name for o in rackets],'contact':hit_row,'minCorkBodyGapM':min_body,
 'minCorkOtherRacketGapM':min_other,'minCorkStringsGapM':min_strings,
 'extraStringContacts':extra_contacts,'behindStringBed':plane_behind,'contactDenseRows':near,
 'rows':rows,'gates':gates,'passed':all(gates.values()),
 'limits':['Cork sphere vs complete meshes at sampled times; not a proof between arbitrarily close samples.',
   'Stringbed is a rigid authored prop; its elastic deformation and cork compression are not simulated.',
   'Feather-skirt collision and aerodynamics are not represented by the cork-sphere check.',
   'Any trajectory after the opponent interception is explicitly hypothetical.']}
args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2))
print(json.dumps({'passed':report['passed'],'gates':gates,'contact':hit_row,
  'minCorkBodyGapM':min_body,'minCorkOtherRacketGapM':min_other,'minCorkStringsGapM':min_strings},indent=2))
if not report['passed']:raise RuntimeError('球头连续触球检查失败；不得沿用旧候选通过结论')
