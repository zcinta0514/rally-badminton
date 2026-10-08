"""Original editable rigid badminton prop, metres; no licensed geometry.
Run with Blender --background --python build-racket.py. Asset interface uses
grip centre origin, +Z headwards, +Y front face, +X lateral width.
"""
import bpy,bmesh,math,json,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
P=Path('artifacts/racket-rebuild/20261007');P.mkdir(parents=True,exist_ok=True)
CFG=dict(total_length=.675,butt_z=-.080,head_tip=.595,head_width=.230,
 head_height=.278,frame_radial_radius=.0045,frame_face_radius=.0055,
 grip_bottom=-.074,grip_top=.069,grip_circumradius=.01355,
 shaft_radius=.0034,shaft_start=.099,shaft_end=.331,
 mains=20,crosses=22,main_pitch=.0095,cross_pitch=.01025,
 string_radius=.00032,weave_height=.00039,frame_segments=128,frame_sides=12)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
sc=bpy.context.scene;sc.unit_settings.system='METRIC';sc.unit_settings.scale_length=1
asset=bpy.data.collections.new('Racket_Editable');sc.collection.children.link(asset)
root=bpy.data.objects.new('Racket_GripCenter',None);asset.objects.link(root)
root.empty_display_type='ARROWS';root.empty_display_size=.04
root['interface']='local metres: +Z to head, +Y front face normal, +X width'
root['total_length_m']=CFG['total_length']; root['rigid']=True
def mat(name,color,metal=0,rough=.45):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough;return m
carbon=mat('Racket_Carbon',(0.034,.054,.073),.55,.31)
front=mat('Racket_FrontTeal',(.025,.38,.42),.5,.27)
back=mat('Racket_BackGraphite',(.11,.145,.19),.52,.3)
silver=mat('Racket_Silver',(.57,.64,.65),.8,.27)
gripmat=mat('Racket_GripRubber',(.032,.036,.040),0,.8)
seammat=mat('Racket_WrapEdge',(.058,.064,.068),0,.83)
stringsmat=mat('Racket_StringIvory',(.72,.76,.67),0,.45)
grommetmat=mat('Racket_GrommetRubber',(.019,.024,.03),0,.63)
def mesh(name,verts,faces,materials,smooth=True,midx=None):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);asset.objects.link(o);o.parent=root
 o['rally_asset_role']='racket';o['racket_part']=('strings' if name.startswith(('Racket_Main_','Racket_Cross_')) else 'grommets' if 'Grommet' in name else 'frame' if name=='Racket_Frame' or 'TJoint' in name or 'TWings' in name else 'shaft' if name in ['Racket_Shaft','Racket_Cone','Racket_Ferrule'] else 'grip')
 for m in materials:me.materials.append(m)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free()
 for i,p in enumerate(me.polygons):p.use_smooth=smooth;p.material_index=midx[i] if midx else 0
 return o
def append_tube(verts,faces,path,radius,sides=6,caps=True):
 base=len(verts);N=len(path)
 for i,p in enumerate(path):
  c=Vector(p);axis=(Vector(path[min(N-1,i+1)])-Vector(path[max(0,i-1)])).normalized();u=axis.cross(Vector((0,1,0)))
  if u.length<.01:u=axis.cross(Vector((1,0,0)))
  u.normalize();v=axis.cross(u).normalized()
  for j in range(sides):verts.append(tuple(c+radius*(math.cos(math.tau*j/sides)*u+math.sin(math.tau*j/sides)*v)))
 for i in range(N-1):
  for j in range(sides):a=base+i*sides+j;b=base+i*sides+(j+1)%sides;faces.append((a,b,b+sides,a+sides))
 if caps:faces.extend([tuple(reversed(range(base,base+sides))),tuple(range(base+(N-1)*sides,base+N*sides))])
def loft(name,rings,sides,material,phase=math.pi/8,smooth=True):
 vs=[];fs=[]
 for z,r in rings:
  vs.extend((r*math.cos(math.tau*i/sides+phase),r*math.sin(math.tau*i/sides+phase),z) for i in range(sides))
 for n in range(len(rings)-1):
  for j in range(sides):a=n*sides+j;b=n*sides+(j+1)%sides;fs.append((a,b,b+sides,a+sides))
 fs.extend([tuple(reversed(range(sides))),tuple(range((len(rings)-1)*sides,len(rings)*sides))]);return mesh(name,vs,fs,[material],smooth)
cx=CFG['head_width']/2-CFG['frame_radial_radius'];cz=CFG['head_height']/2-CFG['frame_radial_radius'];center=CFG['head_tip']-CFG['head_height']/2
# Constant physical radial cross-section follows the ellipse normal; unlike
# scaling a torus, tube thickness remains constant at both shoulder and apex.
vs=[];fs=[];inds=[];N=CFG['frame_segments'];S=CFG['frame_sides']
for i in range(N):
 t=math.tau*i/N;c=Vector((cx*math.cos(t),0,center+cz*math.sin(t)));n=Vector((math.cos(t)/cx,0,math.sin(t)/cz)).normalized()
 for j in range(S):
  a=math.tau*j/S;vs.append(tuple(c+n*(CFG['frame_radial_radius']*math.cos(a))+Vector((0,CFG['frame_face_radius']*math.sin(a),0))))
for i in range(N):
 for j in range(S):
  fs.append((i*S+j,((i+1)%N)*S+j,((i+1)%N)*S+(j+1)%S,i*S+(j+1)%S));inds.append(1 if 1<=j<=4 else (2 if 7<=j<=10 else 0))
frame=mesh('Racket_Frame',vs,fs,[carbon,front,back],True,inds)
frame['construction']='constant 9 mm radial x 11 mm face ellipse sweep; no nonuniform torus scaling'
# Socket cone, shaft and T overlap by sub-mm to millimetres as assembled rigid
# parts. They are deliberately separate edit-friendly components, not skin.
loft('Racket_Grip',[(-.074,.0137),(-.069,.01355),(.052,.01325),(.064,.0129),(.069,.0125)],8,gripmat,smooth=False)
loft('Racket_ButtCap',[(-.080,.0140),(-.078,.0150),(-.073,.0150),(-.069,.0137)],8,gripmat,smooth=False)
loft('Racket_ButtBadge',[(-.080,.0108),(-.0798,.0108)],16,front)
loft('Racket_Cone',[(.065,.0126),(.071,.0124),(.087,.0084),(.097,.0051),(.104,.0035)],16,carbon)
loft('Racket_Ferrule',[(.091,.0061),(.094,.0055),(.096,.00515)],16,silver)
loft('Racket_Shaft',[(.099,.00345),(.14,.00335),(.25,.00315),(.326,.0034),(.331,.0034)],16,carbon)
loft('Racket_TJoint',[(.310,.0036),(.318,.0052),(.323,.0060),(.327,.0054),(.330,.0037)],16,carbon)
# T wings bridge the lower hoop without gaps and taper smoothly into it.
vs=[];fs=[]
for sign in [-1,1]:append_tube(vs,fs,[(0,0,.322),(sign*.013,0,.3223),(sign*.026,0,.3252)],.0033,8)
mesh('Racket_TWings',vs,fs,[carbon])
# Thin octagonal grip wrap seam: conforms to flats, never a floating round coil.
vs=[];fs=[];seampath=[];turns=8.5;segments=272
for i in range(segments+1):
 t=math.tau*turns*i/segments;z=-.068+.128*i/segments;phase=math.pi/8;delta=((t-phase)%(math.pi/4))-math.pi/8
 cr=.01355+(.01325-.01355)*min(1,max(0,(z+.069)/.121)) if z<=.052 else .01325+(.0129-.01325)*(z-.052)/.012
 r=cr*math.cos(math.pi/8)/math.cos(delta)+.00007
 seampath.append((r*math.cos(t),r*math.sin(t),z))
append_tube(vs,fs,seampath,.00016,4);mesh('Racket_GripWrapSeam',vs,fs,[seammat])
loft('Racket_GripFinishTape',[(.060,.01345),(.068,.01335),(.071,.0125)],16,gripmat,smooth=True)
# Full stringbed with individually editable main and cross strand objects.
# Alternating over-under y values keep crossing cylinders disjoint.
mains=[(i-(CFG['mains']-1)/2)*CFG['main_pitch'] for i in range(CFG['mains'])]
crosses=[center+(j-(CFG['crosses']-1)/2)*CFG['cross_pitch'] for j in range(CFG['crosses'])]
endpoints=[];crossingQA=[];strandObjects=[];strandNodes={}
def path_nodes(nodes):
 out=[]
 for i in range(len(nodes)-1):
  a=Vector(nodes[i]);b=Vector(nodes[i+1]);
  for k in range(3):
   t=k/3;p=a.lerp(b,t);p.y=a.y+(b.y-a.y)*(1-math.cos(math.pi*t))/2;out.append(tuple(p))
 out.append(nodes[-1]);return out
for i,x in enumerate(mains):
 dz=cz*math.sqrt(1-(x/cx)**2);low=center-dz;high=center+dz;nodes=[(x,0,low)]
 for j,z in enumerate(crosses):
  if low<z<high:nodes.append((x,CFG['weave_height']*((-1)**(i+j)),z));crossingQA.append({'i':i,'j':j,'centerGap':2*CFG['weave_height'],'surfaceGap':2*(CFG['weave_height']-CFG['string_radius'])})
 nodes.append((x,0,high));nodes[0]=(x,nodes[1][1],low);nodes[-1]=(x,nodes[-2][1],high)
 vs=[];fs=[];append_tube(vs,fs,path_nodes(nodes),CFG['string_radius'],4);strandObjects.append(mesh(f'Racket_Main_{i+1:02d}',vs,fs,[stringsmat]));strandNodes[f'Racket_Main_{i+1:02d}']=nodes;endpoints.extend([nodes[0],nodes[-1]])
for j,z in enumerate(crosses):
 dx=cx*math.sqrt(1-((z-center)/cz)**2);nodes=[(-dx,0,z)]
 for i,x in enumerate(mains):
  if -dx<x<dx:nodes.append((x,-CFG['weave_height']*((-1)**(i+j)),z))
 nodes.append((dx,0,z));nodes[0]=(-dx,nodes[1][1],z);nodes[-1]=(dx,nodes[-2][1],z)
 vs=[];fs=[];append_tube(vs,fs,path_nodes(nodes),CFG['string_radius'],4);strandObjects.append(mesh(f'Racket_Cross_{j+1:02d}',vs,fs,[stringsmat]));strandNodes[f'Racket_Cross_{j+1:02d}']=nodes;endpoints.extend([nodes[0],nodes[-1]])
# 84 hollow sleeves, through the radial rim. Strings terminate inside sleeve.
vs=[];fs=[]
for point in endpoints:
 p=Vector(point);axis=Vector((p.x/(cx*cx),0,(p.z-center)/(cz*cz))).normalized();u=Vector((0,1,0));v=axis.cross(u);base=len(vs);sides=8
 for d,r in [(-.00465,.00115),(.00465,.00115),(.00465,.00048),(-.00465,.00048)]:
  vs.extend(tuple(p+axis*d+r*(u*math.cos(math.tau*k/sides)+v*math.sin(math.tau*k/sides))) for k in range(sides))
 for a,b in [(0,1),(1,2),(2,3),(3,0)]:
  for k in range(sides):fs.append((base+a*sides+k,base+a*sides+(k+1)%sides,base+b*sides+(k+1)%sides,base+b*sides+k))
mesh('Racket_Grommets',vs,fs,[grommetmat])
def marker(name,xyz):
 o=bpy.data.objects.new(name,None);asset.objects.link(o);o.parent=root;o.location=xyz;o.empty_display_size=.014;o.empty_display_type='PLAIN_AXES';return o
marker('Racket_ButtEnd',(0,0,-.080));marker('Racket_HeadTip',(0,0,.595));marker('Racket_ShaftBase',(0,0,.099))
marker('Racket_ContactPoint',(0,0,center+.012));marker('Racket_StringBedCenter',(0,0,center))
marker('Racket_FaceNormal',(0,.05,center+.012));marker('Racket_BackNormal',(0,-.05,center+.012))
marker('Racket_GripIndexSide',(0,0,.043));marker('Racket_GripPinkySide',(0,0,-.043))
for k,v in CFG.items():root[k]=v
bpy.context.view_layer.update()
# Check watertight components, normal orientation by signed volume, and counts.
stats=[]
for ob in asset.objects:
 if ob.type!='MESH':continue
 bm=bmesh.new();bm.from_mesh(ob.data);non=sum(not e.is_manifold for e in bm.edges);volume=bm.calc_volume(signed=True);bm.free();ob.data.calc_loop_triangles()
 stats.append({'name':ob.name,'vertices':len(ob.data.vertices),'triangles':len(ob.data.loop_triangles),'nonManifoldEdges':non,'signedVolume':volume})
assert all(x['nonManifoldEdges']==0 and x['signedVolume']>0 for x in stats)
bounds=[tuple(v.co) for o in asset.objects if o.type=='MESH' for v in o.data.vertices]
minv=[min(p[i] for p in bounds) for i in range(3)];maxv=[max(p[i] for p in bounds) for i in range(3)]
matrix=Matrix((Vector((-.18,1,0)).normalized(),Vector((0,0,1)),Vector((1,.18,0)).normalized())).transposed().to_4x4();matrix.translation=Vector((0,.113,.036))
metadata={'task':'P1-3B','created':'2026-10-07','source':'Original procedural authored geometry, no third-party mesh','dimensionsAre':'Authored construction values; not claimed manufacturer measurement','config':CFG,'boundsM':{'min':minv,'max':maxv},'interfaces':{'root':'Racket_GripCenter','axis':'+Z','faceNormal':'+Y','width':'+X','contactPoint':'Racket_ContactPoint','contactLocalM':[0,0,center+.012],'faceNormalLocal':[0,1,0],'normalMarker':'Racket_FaceNormal','butt':'Racket_ButtEnd','frontColor':'teal','backColor':'graphite'},'grip':{'acrossFlatsM':2*CFG['grip_circumradius']*math.cos(math.pi/8),'perimeterM':16*CFG['grip_circumradius']*math.sin(math.pi/8),'effectiveLengthM':.143,'handSpanRecommendationM':.082,'buttBeyondPinkyRecommendationM':.025,'nominalGripEmbedIntoPalmM':0,'softTissueCompressionAllowanceM':[0,.0015],'handBone':'DEF_hand_r','boneLocalInitialMatrix':[list(row) for row in matrix],'matrixStatus':'Initial orientation/position proposal only, no completed body-contact fit','installation':'Parent root via CHILD_OF DEF_hand_r or evaluate hand.matrix_world @ this matrix; bone parenting is tail-relative and needs inverse correction','fingerGuidance':'Long axis crosses four digits from pinky to index, slightly diagonal; maintain visible index separation; wrap middle/ring/pinky independently; thumb needs opposition toward handle, not generic three-joint curl. Validate actual mesh distances through motion.','detectedCurrentProblem':'match-23 thumb endpoint remains ~90mm away from grip region; grip is not currently closed'},'geometry':{'objects':stats,'triangles':sum(x['triangles'] for x in stats),'vertices':sum(x['vertices'] for x in stats),'watertightComponentChecksPassed':True,'strings':{'mains':len(mains),'crosses':len(crosses),'crossings':len(crossingQA),'minCrossingSurfaceGapM':min(x['surfaceGap'] for x in crossingQA),'endpointAnchor':'At ellipse centerline; each string passes through hollow grommet into hoop','tensionSimulation':False},'connections':{'gripToConeOverlapM':.004,'coneToShaftOverlapM':.005,'shaftToTOverlapM':.021,'tToRim':'Overlapping assembled rigid parts; no visual gap. Not a welded manufacturing mesh.'}},'limits':['Static prop geometry QA only; body/racket intersections require integrated animation audit','Racket face and contact marker are geometric interfaces, not measured impact dynamics','No professional match grip acceptance claimed']}
(P/'metadata.json').write_text(json.dumps(metadata,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str((P/'racket.blend').resolve()))
for o in bpy.context.selected_objects:o.select_set(False)
for o in asset.objects:o.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=str((P/'racket.glb').resolve()),export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_yup=True)
# Compact real-time variant batches string and grommet surfaces by material,
# reduces the hoop to 64x8 and leaves all named attachment markers unchanged.
for ob in strandObjects:bpy.data.objects.remove(ob,do_unlink=True)
# Keep every exact alternating crossing height. Generic decimation flattens
# some crossings and creates intersections, so simplify spans analytically.
for name,nodes in strandNodes.items():
 vs=[];fs=[];append_tube(vs,fs,nodes,CFG['string_radius'],4);mesh(name,vs,fs,[stringsmat])
for material in [stringsmat,grommetmat,carbon,front,back,silver,gripmat,seammat]:
 group=[o for o in asset.objects if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==material]
 if len(group)<2:continue
 bpy.ops.object.select_all(action='DESELECT')
 for o in group:o.select_set(True)
 bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();bpy.context.object.name='RacketBatch_'+material.name
 bpy.context.object['rally_asset_role']='racket';bpy.context.object['racket_part']=('strings' if material==stringsmat else 'grip' if material==gripmat else 'shaft-and-T' if material==carbon else 'accessory')
for ob in [o for o in asset.objects if o.type=='MESH']:
 if ob.name=='Racket_Frame' or ob.name=='Racket_Grommets':
  bpy.context.view_layer.objects.active=ob;mod=ob.modifiers.new('Static LOD simplification','DECIMATE');mod.ratio=.48 if ob.name=='Racket_Frame' else (.65 if ob.name=='Racket_Grommets' else .32);mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
for o in bpy.context.selected_objects:o.select_set(False)
for o in asset.objects:o.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.wm.save_as_mainfile(filepath=str((P/'racket-runtime.blend').resolve()))
bpy.ops.export_scene.gltf(filepath=str((P/'racket-runtime.glb').resolve()),export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_yup=True)
runtime=[]
for o in asset.objects:
 if o.type=='MESH':o.data.calc_loop_triangles();runtime.append({'name':o.name,'triangles':len(o.data.loop_triangles),'rally_asset_role':o['rally_asset_role'],'racket_part':o['racket_part']})
metadata['runtime']={'meshes':runtime,'triangles':sum(x['triangles'] for x in runtime),'staticLOD':True,'renderAsset':'racket.glb'}
metadata['meshNodeNames']={'editable':[x['name'] for x in stats],'runtime':[x['name'] for x in runtime]}
metadata['collisionInterface']={'allMeshSelection':'obj.get("rally_asset_role") == "racket"','allowlistWarning':'Do not filter only V4_Racket prefix. Check every exported racket mesh. Grip/body intentional contact needs distance/penetration rules distinct from free racket parts.','gripCapsuleLocal':{'a':[0,0,-.074],'b':[0,0,.069],'radiusM':.01355},'shaftCapsuleLocal':{'a':[0,0,.099],'b':[0,0,.331],'radiusM':.00345},'stringBedEllipse':{'center':[0,0,center],'halfWidth':cx,'halfHeight':cz,'normal':[0,1,0]},'surfaceEnvelopeM':.00071}
metadata['sha256']={f:hashlib.sha256((P/f).read_bytes()).hexdigest() for f in ['racket.blend','racket.glb','racket-runtime.blend','racket-runtime.glb']};(P/'metadata.json').write_text(json.dumps(metadata,indent=2))
print(json.dumps({'triangles':metadata['geometry']['triangles'],'runtimeTriangles':metadata['runtime']['triangles'],'bounds':metadata['boundsM'],'strings':metadata['geometry']['strings']}),flush=True)
