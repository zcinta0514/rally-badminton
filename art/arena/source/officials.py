"""Editable officials for the RALLY arena. Units are metres, local forward is -Y.

Each official owns one root. IN occupies frames 1..70 and OUT occupies
71..140, including the return to neutral. Limbs are rigid FK hierarchies.
The game can isolate the channels belonging to the line under consideration.
"""

import math
import bpy
from mathutils import Quaternion, Vector


TAU = math.tau
IDENTITY = Quaternion((1, 0, 0, 0))
PALETTE = {
    "graphite": ((0.029, 0.046, 0.060), .76, 0),
    "navy": ((0.027, 0.066, 0.108), .78, 0),
    "ocean": ((0.041, 0.126, 0.172), .79, 0),
    "trim": ((0.155, 0.443, 0.484), .59, 0),
    "piping": ((0.704, 0.783, 0.775), .62, 0),
    "ink": ((0.018, 0.025, 0.031), .86, 0),
    "leather": ((0.028, 0.032, 0.036), .41, 0),
    "rubber": ((0.087, 0.094, 0.10), .83, 0),
    "steel": ((.196, .232, .253), .32, .72),
    "brushed": ((.506, .532, .546), .34, .67),
    "amber": ((.912, .55, .165), .46, 0),
    "screen": ((.015, .074, .108), .22, .15),
    "mint": ((.376, .821, .733), .38, 0),
    "skin1": ((.57, .308, .184), .61, 0),
    "skin2": ((.365, .169, .092), .62, 0),
    "skin3": ((.68, .392, .268), .61, 0),
    "hair1": ((.026, .021, .018), .72, 0),
    "hair2": ((.091, .063, .047), .71, 0),
    "hair3": ((.14, .14, .129), .67, 0),
    "sclera": ((.62, .606, .548), .48, 0),
    "lip": ((.278, .115, .097), .59, 0),
}


def material(key):
    name = "Officials / " + key
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    color, rough, metal = PALETTE[key]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = rough
    shader.inputs["Metallic"].default_value = metal
    return mat


def node(name, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = .04
    return obj


class Surface:
    """Collect garment sections and accessories into a single editable mesh."""
    def __init__(self):
        self.v, self.f, self.face_material, self.smoothing = [], [], [], []
        self.materials = []

    def patch(self, vertices, faces, mat, smooth=True):
        offset = len(self.v)
        self.v.extend(vertices)
        if mat not in self.materials:
            self.materials.append(mat)
        slot = self.materials.index(mat)
        for face in faces:
            self.f.append(tuple(offset + idx for idx in face))
            self.face_material.append(slot)
            self.smoothing.append(smooth)

    def rings(self, sections, mat, seg=16, at=(0, 0, 0), quat=IDENTITY, bands=None):
        # Elliptic cross sections: Z, radius X, radius Y, centre X, centre Y.
        at = Vector(at)
        verts = []
        for z, rx, ry, x, y in sections:
            for k in range(seg):
                a = k * TAU / seg
                verts.append(at + quat @ Vector((x + rx * math.cos(a), y + ry * math.sin(a), z)))
        faces = [tuple(reversed(range(seg)))]
        for r in range(len(sections) - 1):
            for k in range(seg):
                a, b = r * seg + k, r * seg + (k + 1) % seg
                faces.append((a, b, b + seg, a + seg))
        last = (len(sections) - 1) * seg
        faces.append(tuple(last + k for k in range(seg)))
        first = len(self.f)
        self.patch(verts, faces, mat)
        for row, color in (bands or {}).items():
            if color not in self.materials:
                self.materials.append(color)
            start = first + 1 + row * seg
            self.face_material[start:start+seg] = [self.materials.index(color)] * seg

    def ellipsoid(self, at, scale, mat, seg=12, levels=8, quat=IDENTITY):
        rx, ry, rz = scale
        sections = []
        for r in range(levels + 1):
            a = math.pi * r / levels - math.pi / 2
            radius = max(.012, math.cos(a))
            sections.append((rz * math.sin(a), radius * rx, radius * ry, 0, 0))
        self.rings(sections, mat, seg, at, quat)

    def tube(self, a, b, r0, r1, mat, seg=10):
        vec = Vector(b) - Vector(a)
        self.rings([(0, r0, r0, 0, 0), (vec.length, r1, r1, 0, 0)],
                   mat, seg, a, vec.to_track_quat("Z", "Y"))

    def box(self, center, dims, mat, rot=IDENTITY):
        x, y, z = (s / 2 for s in dims)
        local = [(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),
                 (-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]
        points = [Vector(center) + rot @ Vector(p) for p in local]
        self.patch(points, [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),
                            (2,3,7,6),(3,0,4,7)], mat, False)

    def object(self, name, parent):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.v, [], self.f)
        for key in self.materials:
            mesh.materials.append(material(key))
        for i, p in enumerate(mesh.polygons):
            p.material_index = self.face_material[i]
            p.use_smooth = self.smoothing[i]
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        return obj


def profile_at(profile,z):
    for lo,hi in zip(profile,profile[1:]):
        if z <= hi[0]:
            t = max(0, (z-lo[0]) / (hi[0]-lo[0]))
            return [lo[j] + t*(hi[j]-lo[j]) for j in range(1,len(lo))]
    return profile[-1][1:]


def front_patch(s, outline, front, color, offset=.0009):
    """Project a small fabric or facial detail onto the underlying contour."""
    area=sum(x0*z1-x1*z0 for (x0,z0),(x1,z1) in zip(outline,outline[1:]+outline[:1]))
    if area<0:
        outline=list(reversed(outline))
    mx=sum(x for x,z in outline)/len(outline)
    mz=sum(z for x,z in outline)/len(outline)
    # Subdivide longer strokes. A flat chord between two shirt points can pass
    # through the chest directly below the collar, even if both ends are flush.
    rim=[]
    for a,b in zip(outline,outline[1:]+outline[:1]):
        steps=max(1,math.ceil(math.dist(a,b)/.006))
        for j in range(steps):
            rim.append((a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps))
    depth=max(1,math.ceil(max(math.dist((mx,mz),p) for p in rim)/.006))
    points=[(mx,front(mx,mz)-offset,mz)]
    faces=[]
    n=len(rim)
    for k in range(1,depth+1):
        start=len(points)
        for x,z in rim:
            px=mx+(x-mx)*k/depth
            pz=mz+(z-mz)*k/depth
            points.append((px,front(px,pz)-offset,pz))
        for i in range(n):
            j=(i+1)%n
            faces.append((0,start+i,start+j) if k==1 else (start+i-n,start+i,start+j,start+j-n))
    s.patch(points,faces,color)


def trouser_leg(s,side):
    # One continuous surface sweeps from the hip over the kneecap to the hem.
    # theta is the tangent's bend from horizontal at the thigh to vertical.
    rows=[(.093,.070,.071,.073,.072,0),(.106,-.008,.074,.091,.081,0),
          (.114,-.112,.081,.089,.071,2),(.121,-.206,.078,.078,.068,10),
          (.127,-.257,.068,.071,.068,27),(.132,-.280,.043,.072,.066,54),
          (.133,-.287,.010,.072,.060,79),(.134,-.282,-.028,.070,.056,91),
          (.135,-.271,-.08,.064,.056,96),(.137,-.261,-.143,.060,.060,96),
          (.138,-.253,-.206,.055,.053,94),(.139,-.247,-.260,.050,.050,92),
          (.140,-.245,-.294,.052,.049,90),(.140,-.245,-.312,.052,.051,90),
          (.140,-.246,-.328,.054,.053,90),(.140,-.245,-.340,.053,.051,90)]
    pts=[]
    n=24
    for r,(cx,cy,cz,rx,ry,bend) in enumerate(rows):
        theta=math.radians(bend)
        for k in range(n):
            a=TAU*k/n
            # Subtle folds follow the direction of the shin and soften at the knee.
            fold=(1 + (.016 if r>=6 else .006)*math.sin(5*a+r*.14))
            cross=ry*math.sin(a)*fold
            pts.append((side*cx+rx*math.cos(a)*fold,cy-math.sin(theta)*cross,
                        cz+math.cos(theta)*cross))
    faces=[tuple(reversed(range(n)))]
    faces.extend((r*n+k,r*n+(k+1)%n,(r+1)*n+(k+1)%n,(r+1)*n+k)
                 for r in range(len(rows)-1) for k in range(n))
    faces.append(tuple((len(rows)-1)*n+k for k in range(n)))
    s.patch(pts,faces,"graphite")


def body_mesh(s, shirt, skin, chief):
    s.rings([(.037,.135,.112,0,.018),(.075,.177,.12,0,.02),(.137,.167,.103,0,.002),
             (.177,.143,.101,0,0)], "graphite")
    torso=[(.138,.154,.101,0,.001),(.171,.161,.114,0,-.002),
             (.235,.145,.108,0,-.007),(.305,.15,.102,0,-.009),
             (.406,.171,.12,0,-.009),(.485,.191,.114,0,.001),
             (.518,.19,.093,0,.009),(.555,.112,.078,0,.014),
             (.566,.066,.057,0,.012)]
    s.rings(torso,shirt,40,bands={6:"ocean",7:"ocean"})
    def fabric(x,z):
        rx,ry,cx,cy=profile_at(torso,z)
        return cy-ry*math.sqrt(max(0,1-((x-cx)/rx)**2))
    # The shoulder yoke shares its vertices with the shirt. The collar and
    # woven badge follow its surface even when seen from the side.
    for side in (-1, 1):
        collar=[(side*x,z) for x,z in ((.008,.536),(.051,.557),(.080,.547),
                                        (.069,.531),(.049,.508),(.026,.526))]
        front_patch(s,collar,fabric,"graphite",.0015)
    front_patch(s,[(-.008,.445),(.008,.445),(.009,.523),(-.009,.523)],fabric,"ocean")
    for z in (.460,.483,.502):
        s.ellipsoid((0,fabric(0,z)-.0013,z),(.0024,.001,.0024),"piping",8,4)
    # Chest ID: light textile patch, gold division and two embroidered strokes.
    front_patch(s,[(.060,.434),(.109,.434),(.109,.463),(.060,.463)],fabric,"piping",.0014)
    front_patch(s,[(.064,.438),(.071,.438),(.071,.459),(.064,.459)],fabric,"amber",.0020)
    for z, w in ((.456,.029),(.445,.021)):
        front_patch(s,[(.075,z),(.075+w,z),(.075+w,z+.0025),(.075,z+.0025)],fabric,"navy",.0024)
    s.rings([(.544,.052,.046,0,.008),(.602,.048,.043,0,.005),
             (.638,.056,.048,0,-.004)],skin)
    for side in (-1,1):
        trouser_leg(s,side)
        s.tube((side*.14,-.244,-.33),(side*.14,-.244,-.36),.040,.039,"ink")
        s.ellipsoid((side*.14,-.284,-.382),(.065,.122,.048),"leather",16)
        s.ellipsoid((side*.14,-.287,-.414),(.067,.123,.021),"rubber",16)
        for offset in (0,.022,.044):
            s.tube((side*.14-.025,-.279-offset,-.342-offset*.28),
                   (side*.14+.025,-.291-offset,-.342-offset*.28),.0025,.0025,"rubber")
    if chief:
        # A scoring tablet tilts toward the official on a small armrest cradle.
        tilt = Quaternion((1,0,0), math.radians(-22))
        ctr = Vector((-.01,-.305,.214))
        s.tube((.192,-.161,.115),(.17,-.292,.165),.013,.012,"steel")
        s.tube((.17,-.292,.165),(.008,-.302,.193),.011,.013,"steel")
        def layer(offset, size, color):
            s.box(ctr+tilt@Vector(offset),size,color,tilt)
        layer((0,0,0),(.242,.151,.013),"rubber")
        layer((0,0,.008),(.223,.127,.004),"screen")
        for x in (-.055,.055):
            layer((x,-.008,.011),(.078,.053,.002),"ocean")
            layer((x,.028,.012),(.058,.005,.002),"mint")
        layer((-.02,-.048,.012),(.148,.004,.002),"piping")


def head_mesh(s, skin, hair, style):
    profile=[(0,.033,.042,-.034),(.018,.056,.067,-.022),
             (.045,.069,.075,-.016),(.075,.078,.081,-.009),
             (.107,.081,.084,-.002),(.153,.081,.080,.001),
             (.183,.071,.076,.004),(.208,.05,.052,.007),
             (.221,.014,.015,.007)]
    def relief(x,z):
        def mound(cx,cz,width,height):
            return math.exp(-((x-cx)/width)**2-((z-cz)/height)**2)
        bridge=.009*mound(0,.100,.011,.025)
        tip=.014*mound(0,.078,.012,.010)
        nostril=.004*mound(.013,.075,.007,.005)+.004*mound(-.013,.075,.007,.005)
        cheek=.003*mound(.045,.085,.022,.022)+.003*mound(-.045,.085,.022,.022)
        sockets=.003*mound(.031,.113,.018,.009)+.003*mound(-.031,.113,.018,.009)
        return bridge+tip+nostril+cheek-sockets
    def facefront(x,z):
        rx,ry,cy=profile_at(profile,z)
        return cy-ry*math.sqrt(max(0,1-(x/rx)**2))-relief(x,z)
    # The bridge, tip, cheeks and orbital sockets share the head's continuous
    # topology. Close-set horizontal rings give the nasal tip its own profile.
    heights=[0,.011,.018,.030,.043,.050,.058,.065,.070,.073,.076,.079,.082,
             .086,.093,.100,.107,.112,.116,.121,.128,.137,.153,.168,.183,.198,.208,.221]
    n=64
    pts=[]
    for z in heights:
        rx,ry,cy=profile_at(profile,z)
        for k in range(n):
            a=TAU*k/n
            x=rx*math.cos(a)
            y=cy+ry*math.sin(a)
            if math.sin(a)<0:
                y-=relief(x,z)
            pts.append((x,y,z))
    faces=[tuple(reversed(range(n)))]
    faces.extend((r*n+k,r*n+(k+1)%n,(r+1)*n+(k+1)%n,(r+1)*n+k)
                 for r in range(len(heights)-1) for k in range(n))
    faces.append(tuple((len(heights)-1)*n+k for k in range(n)))
    s.patch(pts,faces,skin)
    for sign in (-1,1):
        s.ellipsoid((sign*.078,.002,.094),(.011,.015,.023),skin)
        cx=sign*.031
        def eye(points):
            return [(cx+sign*x,.113+z) for x,z in points]
        # One almond-shaped opening on the face; its iris is clipped by both lids.
        front_patch(s,eye([(-.013,0),(-.008,.0032),(0,.0042),(.007,.0037),
                          (.013,.001),(.008,-.0018),(0,-.0027),(-.007,-.002)]),
                    facefront,"sclera",.00085)
        front_patch(s,eye([(-.004,.0036),(0,.0042),(.004,.0035),(.0044,.001),
                          (.0032,-.0023),(0,-.0028),(-.0032,-.0022),(-.0044,.001)]),
                    facefront,"hair1",.00125)
        front_patch(s,eye([(-.013,0),(-.008,.0034),(0,.0044),(.007,.0039),(.013,.001),
                          (.008,.005),(0,.0057),(-.008,.0046)]),facefront,hair,.0014)
        front_patch(s,eye([(-.013,.013),(-.006,.016),(.004,.018),(.014,.0155),(.020,.0115),
                          (.014,.0132),(.004,.0143),(-.006,.0127),(-.013,.0115)]),
                    facefront,hair,.00095)
        front_patch(s,[(sign*.006,.0733),(sign*.009,.0741),(sign*.0128,.0732),
                       (sign*.010,.0726),(sign*.007,.0724)],facefront,"lip",.0007)
    front_patch(s,[(-.017,.046),(-.008,.0470),(-.003,.0478),(0,.0470),
                   (.003,.0478),(.008,.0470),(.017,.046),(.009,.0451),
                   (0,.0441),(-.009,.0451)],facefront,"lip",.0008)
    # Hairline follows the forehead, receding above the ears and under the bun.
    pts=[]
    n=24
    for t in (0,.16,.36,.55,.73,.87,1):
        for i in range(n):
            a=i*TAU/n
            front=max(0,-math.sin(a))
            base=.083+.078*front + .004*math.sin(3*a + style)
            z=base+( .227-base)*t
            # Match the cranial profile under the cap, including the temples.
            profile=[(.080,.084,.085,-.009),(.107,.086,.089,-.002),
                     (.153,.087,.086,.001),(.184,.077,.082,.004),
                     (.209,.056,.058,.007),(.224,.022,.024,.007),
                     (.228,.003,.003,.007)]
            lo,hi=next((lo,hi) for lo,hi in zip(profile,profile[1:]) if z<=hi[0])
            blend=max(0,(z-lo[0])/(hi[0]-lo[0]))
            rx,ry,cy=[lo[j]+blend*(hi[j]-lo[j]) for j in (1,2,3)]
            pts.append((rx*math.cos(a),cy+ry*math.sin(a),z))
    faces=[(r*n+i,r*n+(i+1)%n,(r+1)*n+(i+1)%n,(r+1)*n+i)
           for r in range(6) for i in range(n)]
    s.patch(pts,faces,hair)
    if style in (1,3):
        s.ellipsoid((0,.082,.122),(.05,.050,.049),hair)
        s.ellipsoid((0,.115,.137),(.041,.032,.041),hair)
    if style==0:
        # Boom mic, cable and acoustic earpiece.
        s.ellipsoid((-.091,.004,.096),(.01,.014,.021),"ink")
        s.tube((-.094,.0,.089),(-.083,-.062,.051),.0024,.0025,"steel")
        s.tube((-.083,-.062,.051),(-.048,-.084,.052),.0025,.0031,"steel")
        s.ellipsoid((-.045,-.085,.052),(.008,.005,.0045),"ink")


def chair_mesh(s):
    s.ellipsoid((0,.005,-.035),(.23,.205,.036),"navy",20)
    s.box((0,.181,.143),(.416,.04,.198),"navy")
    for x in (-.194,.194):
        s.tube((x,.172,-.04),(x,.19,.224),.013,.013,"steel")
        for y in (-.14,.14):
            foot=(x*1.12,y*1.25,-.448)
            s.tube((x,y,-.04),foot,.011,.014,"steel")
            s.tube(foot,(foot[0],foot[1],-.454),.016,.014,"ink")
        s.tube((x,-.144,-.12),(x,.144,-.12),.011,.011,"steel")
    s.tube((-.194,.146,-.13),(.194,.146,-.13),.009,.009,"steel")


UPPER=.276
FORE=.232
def make_arm(root, tag, side, skin, shirt):
    name=tag+("_R" if side<0 else "_L")
    upper=node(name+"_Shoulder",root)
    upper.location=(side*.183,-.002,.49)
    form=Surface()
    form.rings([(-.052,.013,.015,0,0),(-.042,.042,.046,0,0),
                (-.020,.061,.062,0,0),(.010,.067,.073,0,0),
                (.048,.066,.074,0,0),(.109,.061,.067,0,0),
                (.148,.053,.058,0,0),(.158,.053,.057,0,0),
                (.164,.052,.056,0,0)],shirt,24,bands={7:"navy"})
    form.rings([(.14,.046,.048,0,0),(.186,.049,.048,0,0),(.25,.039,.043,0,0),
                (.281,.037,.037,0,0)],skin)
    form.object(name+"_Sleeve",upper)
    lower=node(name+"_Elbow",upper)
    lower.location=(0,0,UPPER)
    form=Surface()
    form.ellipsoid((0,0,0),(.037,.038,.04),skin)
    form.rings([(0,.036,.038,0,0),(.063,.043,.042,0,0),(.12,.037,.034,0,0),
                (.184,.029,.026,0,0),(.234,.025,.021,0,0)],skin)
    if side>0:
        form.rings([(.195,.029,.027,0,0),(.213,.028,.026,0,0)],"ink")
    form.object(name+"_Forearm",lower)
    hand=node(name+"_Wrist",lower)
    hand.location=(0,0,FORE)
    form=Surface()
    form.rings([(-.008,.022,.019,0,0),(.021,.036,.02,0,0),
                (.057,.036,.018,0,0),(.069,.031,.012,0,0)],skin)
    for i,length in enumerate((.052,.058,.053,.043)):
        x=side*(i-1.5)*.016
        form.tube((x,0,.055),(x,-.003,.067+length),.009,.0065,skin)
        form.ellipsoid((x,-.003,.067+length),(.0065,.006,.0065),skin,8,5)
    form.tube((-side*.025,0,.025),(-side*.049,-.008,.064),.013,.008,skin)
    form.object(name+"_Hand",hand)
    return upper,lower,hand


def aim(vec):
    return Vector(vec).normalized().to_track_quat("Z","Y")


def animate_arm(parts, side, chief, stationary=False):
    # Absolute directions for upper arm, forearm, hand expressed in body space.
    s=side
    rest=((s*.07,-.14,-.95),(-s*.49,-.82,-.26),(-s*.72,-.60,-.28))
    if chief:
        rest=((s*.24,-.20,-.95),(-s*.35,-.94,.09),(-s*.34,-.93,-.18))
        gesture=((- .23,-.28,-.91),(.60,-.72,.19),(.37,-.82,-.41)) if side<0 else rest
        touch=((- .20,-.32,-.93),(.57,-.76,.22),(.31,-.75,-.34)) if side<0 else rest
        poses=[(1,rest),(24,rest),(35,gesture),(40,touch),(45,gesture),
               (49,touch),(53,gesture),(64,rest),(70,rest)]
        poses += [(f+70,p) for f,p in poses]
    else:
        inward=((-.067,-.77,-.63),(.035,-.75,-.67),(.06,-.74,-.67)) if side<0 else rest
        outward=((s,-.02,.035),(s,-.015,-.035),(s,-.025,-.08))
        poses=[(1,rest),(15,rest),(25,inward),(54,inward),(65,rest),(70,rest),
               (71,rest),(75,rest),(85,outward),(118,outward),(133,rest),(140,rest)]
    if stationary:
        poses=[(1,rest)]
    prev=[None]*3
    for frame, pose in poses:
        a,b,c=[aim(v) for v in pose]
        for i,(joint,q) in enumerate(zip(parts,(a,a.inverted()@b,b.inverted()@c))):
            if prev[i] is not None:
                q.make_compatible(prev[i])
            joint.rotation_mode="QUATERNION"
            joint.rotation_quaternion=q
            if not stationary:
                joint.keyframe_insert(data_path="rotation_quaternion",frame=frame)
            prev[i]=q.copy()


def build_official(tag,xyz,angle,style,skin,hair,chief=False,service=False):
    root=node(tag)
    root.location=xyz
    root.rotation_euler.z=math.radians(angle)
    shirt="navy" if chief else "ocean"
    body=Surface()
    body_mesh(body,shirt,skin,chief)
    if not chief and not service:
        chair_mesh(body)
    body.object(tag+"_Uniform",root)
    head=node(tag+"_Neck",root)
    head.location=(0,.002,.598)
    face=Surface()
    head_mesh(face,skin,hair,style)
    face.object(tag+"_Face",head)
    # Look at the umpire while signalling, then track the court again.
    local=Quaternion((0,0,1),-math.radians(angle)) @ (Vector((-4.15,0,0))-Vector(xyz))
    glance=math.atan2(local.x,-local.y)
    glance=max(-.69,min(.69,glance))
    if chief:
        timeline=[(1,0,0),(18,0,0),(25,-.04,-.13),(35,.31,-.09),
                  (50,.34,-.06),(60,.01,0),(70,0,0)]
        timeline+=[(f+70,p,-y) for f,p,y in timeline]
    else:
        timeline=[(1,.03,0),(15,.03,0),(26,-.055,glance),(54,-.055,glance),
                  (65,.03,0),(70,.03,0),(75,.03,0),(86,-.055,glance),
                  (118,-.055,glance),(134,.03,0),(140,.03,0)]
    for frame,pitch,yaw in timeline[:1] if service else timeline:
        head.rotation_euler=(pitch,0,yaw)
        if not service:
            head.keyframe_insert(data_path="rotation_euler",frame=frame)
    for side in (-1,1):
        arm=make_arm(root,tag,side,skin,shirt)
        animate_arm(arm,side,chief,stationary=service)
    return root


def build_officials():
    """Build the six officials and return the five animated actor roots."""
    specs=[
        ("Umpire_Main",(-4.15,0,1.65),90,0,"skin1","hair3",True),
        ("LJ_Base_Near",(5.65,-6.70,.455),-90,1,"skin3","hair1",False),
        ("LJ_Base_Far",(5.65,6.70,.455),-90,2,"skin2","hair2",False),
        ("LJ_Side_Left",(-3.05,8.85,.455),0,3,"skin1","hair2",False),
        ("LJ_Side_Right",(3.05,-8.85,.455),180,4,"skin2","hair1",False),
    ]
    roots=[build_official(*spec) for spec in specs]
    build_official("Service_Judge",(4.15,0,.45),-90,2,"skin3","hair2",service=True)
    bpy.context.scene.frame_set(bpy.context.scene.frame_current)
    return roots
