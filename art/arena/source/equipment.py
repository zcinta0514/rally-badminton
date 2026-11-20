"""Competition court and furniture for the standalone RALLY arena study (metres)."""

import math

import bpy
from signage import BRAND, apply_brand_font
from mathutils import Vector


def _material(name, color, rough=0.6, metal=0, glow=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = mat.diffuse_color
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if glow:
        p.inputs["Emission Color"].default_value = mat.diffuse_color
        p.inputs["Emission Strength"].default_value = glow
    return mat


class _Parts:
    """Collect disconnected rigid parts of a single assembly in one editable mesh."""

    def __init__(self):
        self.vertices = []
        self.faces = []
        self.materials = []
        self.indices = []
        self.smooth = []

    def shell(self, verts, faces, material, smooth=False):
        start = len(self.vertices)
        self.vertices.extend(verts)
        if material not in self.materials:
            self.materials.append(material)
        index = self.materials.index(material)
        for f in faces:
            self.faces.append(tuple(start+i for i in f))
            self.indices.append(index)
            self.smooth.append(smooth)

    def box(self, center, size, material, turn=0):
        x, y, z = center
        w, d, h = [n/2 for n in size]
        co, si = math.cos(turn), math.sin(turn)
        verts = [(x+a*co-b*si, y+a*si+b*co, z+c) for a,b,c in (
            (-w,-d,-h),(w,-d,-h),(w,d,-h),(-w,d,-h),
            (-w,-d,h),(w,-d,h),(w,d,h),(-w,d,h))]
        self.shell(verts, [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], material)

    def rod(self, a, b, radius, material, sides=10, second_radius=None):
        a, b = Vector(a), Vector(b)
        axis = (b-a).normalized()
        u = axis.orthogonal().normalized()
        v = axis.cross(u)
        rings = []
        for origin, r in [(a,radius),(b,radius if second_radius is None else second_radius)]:
            for i in range(sides):
                angle = 2*math.pi*i/sides
                rings.append(tuple(origin + r*(math.cos(angle)*u + math.sin(angle)*v)))
        faces = [(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
        faces.extend([tuple(reversed(range(sides))),tuple(range(sides,sides*2))])
        self.shell(rings,faces,material)

    def mesh(self, name, collection, bevel=0):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        for m in self.materials:
            mesh.materials.append(m)
        mesh.polygons.foreach_set("material_index", self.indices)
        mesh.polygons.foreach_set("use_smooth", self.smooth)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        if bevel:
            mod = obj.modifiers.new("Eased fabrication edges", "BEVEL")
            mod.width = bevel
            mod.segments = 2
            mod.harden_normals = True
            normals = obj.modifiers.new("Planar panel normals", "WEIGHTED_NORMAL")
            normals.keep_sharp = True
        return obj


def _text(name, content, pos, size, rotation, material, collection, anchor="CENTER"):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = content
    curve.size = size
    curve.align_x = anchor
    curve.align_y = "CENTER"
    curve.space_character = 1.1
    apply_brand_font(curve)
    curve.resolution_u = 4
    obj = bpy.data.objects.new(name,curve)
    collection.objects.link(obj)
    obj.location = pos
    obj.rotation_euler = rotation
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    mesh.materials.append(material)
    result = bpy.data.objects.new(name+" | inlay",mesh)
    collection.objects.link(result)
    result.location = pos
    result.rotation_euler = rotation
    bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.curves.remove(curve)
    return result


def _court(col,m):
    floor = _Parts()
    floor.box((0,0,-.0075),(10,17.8,.015),m["court"])
    obj = floor.mesh("Court | sprung competition mat", col)
    obj["doubles_court_m"] = [6.10,13.40]
    # Paint is one mesh with no coplanar overlaps. All four outside edges
    # are included within the regulation dimensions, including the paint.
    ink = _Parts()
    for x in [-3.03,3.03]:
        ink.box((x,0,.0006),(.04,13.4,.0012),m["ink"])
    for y in [-6.68,6.68, -5.92,5.92,-2,2]:
        ink.box((0,y,.0006),(6.02,.04,.0012),m["ink"])
    breaks = [(-6.66,-5.94),(-5.90,-2.02),(-1.98,1.98),(2.02,5.90),(5.94,6.66)]
    for a,b in breaks:
        for x in ([-2.57,2.57] if a<0<b else [-2.57,0,2.57]):
            ink.box((x,(a+b)/2,.0006),(.04,b-a,.0012),m["ink"])
    ink.mesh("Court | 40 mm line paint",col)
    for end, turn in [(-1,0),(1,math.pi)]:
        _text("Court | event stencil", BRAND, (0,end*8.05,.0018),.65,(0,0,turn),m["ink"],col)


def _net(col,m):
    # The actual net cells use narrow, double-sided ribbons. Quadratic sag
    # follows the tape and the lower binding continuously across the span.
    def height(x):
        return 1.524+.026*(x/3.05)**2
    weave = _Parts()
    n = 322
    for i in range(n+1):
        x = -3.05+i*6.1/n
        z = height(x)
        weave.shell([(x-.00082,0,z-.76),(x+.00082,0,z-.76),(x+.00082,0,z-.032),(x-.00082,0,z-.032)],[(0,1,2,3)],m["thread"])
    for row in range(39):
        depth = .76-row*.019
        for i in range(16):
            x1,x2 = -3.05+i*6.1/16,-3.05+(i+1)*6.1/16
            z1,z2 = height(x1)-depth,height(x2)-depth
            weave.shell([(x1,.0009,z1),(x2,.0009,z2),(x2,.0009,z2+.00165),(x1,.0009,z1+.00165)],[(0,1,2,3)],m["thread"])
    weave.mesh("CompetitionNet_18.9mm woven mesh",col)
    tape = _Parts()
    for i in range(40):
        a,b = -3.05+i*6.1/40,-3.05+(i+1)*6.1/40
        za,zb = height(a),height(b)
        for offset in [-.003,.003]:
            tape.shell([(a,offset,za-.0375),(b,offset,zb-.0375),(b,offset,zb),(a,offset,za)],[(0,1,2,3)],m["ink"])
        tape.shell([(a,-.003,za),(b,-.003,zb),(b,.003,zb),(a,.003,za)],[(0,1,2,3)],m["ink"])
        tape.rod((a,.001,za-.76),(b,.001,zb-.76),.0022,m["thread"],5)
    for side in [-1,1]:
        tape.box((side*3.043,0,1.17),(.014,.006,.75),m["thread"])
    tape.mesh("CompetitionNet_folded headband and binding",col)
    posts = _Parts()
    for s in [-1,1]:
        x = s*3.077
        posts.rod((x,0,.045),(x,0,1.55),.027,m["gold"],16)
        posts.rod((x,0,.04),(x,0,.22),.038,m["steel"],16)
        posts.box((x+s*.22,0,.105),(.48,.32,.17),m["navy"])
        posts.box((x+s*.25,0,.188),(.37,.26,.016),m["gold"])
        for y in [-.145,.145]:
            posts.rod((x+s*.39,y-.025,.066),(x+s*.39,y+.025,.066),.062,m["rubber"],14)
        for z in [.84,1.18,1.45]:
            posts.rod((x,0,z-.005),(x,0,z+.005),.031,m["cream"],12)
        posts.rod((x,0,1.31),(x+s*.074,0,1.31),.022,m["steel"],12)
        posts.rod((x+s*.074,0,1.31),(x+s*.074,.072,1.24),.009,m["steel"])
        posts.rod((x+s*.073,.072,1.24),(x+s*.115,.072,1.24),.013,m["rubber"])
    posts.mesh("Net posts | mobile ballast, locking casters and winches",col,.005)


def _umpire_chair(col,m):
    p = _Parts()
    for y in [-.30,.30]:
        for base, top in [(-4.84,-4.38),(-3.76,-3.95)]:
            p.rod((base,y,.04),(top,y,1.64),.026,m["steel"])
            p.box((base,y,.025),(.12,.105,.05),m["rubber"])
        p.rod((-4.65,y,.65),(-3.93,y,1.55),.017,m["steel"])
        p.rod((-3.82,y,.65),(-4.39,y,1.55),.017,m["steel"])
        p.rod((-4.38,y,1.56),(-4.38,y,2.06),.019,m["steel"])
        p.rod((-4.38,y,1.86),(-3.94,y,1.86),.025,m["rubber"])
        p.rod((-3.94,y,1.86),(-3.94,y,1.61),.016,m["steel"])
        p.rod((-3.94,y,1.60),(-3.69,y,1.21),.015,m["steel"])
    for z in [.27,.55,.83,1.11,1.39]:
        x=-4.84+(z/1.65)*.46
        p.box((x,0,z),(.13,.61,.036),m["steel"])
        for dx in [-.033,0,.033]:
            p.box((x+dx,0,z+.020),(.009,.55,.004),m["rubber"])
    p.box((-4.15,0,1.61),(.47,.54,.08),m["navy"])
    p.box((-4.405,0,1.95),(.072,.54,.28),m["navy"])
    p.box((-3.70,0,1.20),(.24,.57,.045),m["steel"])
    p.mesh("Umpire | braced high chair, ladder treads and footrest",col,.009)


def _seat(p, x, y, m):
    # Bent shell profile, facing -X toward the competition court.
    cross = [(-.23,.418),(-.23,.449),(-.11,.46),(.12,.455),(.18,.50),(.22,.74),(.27,.79),(.30,.78),(.255,.48),(.17,.416)]
    verts = [(x+dx,y+side*.24,z) for side in [-1,1] for dx,z in cross]
    n=len(cross)
    faces=[tuple(range(n)),tuple(reversed(range(n,n*2)))]
    faces += [(i,n+i,n+(i+1)%n,(i+1)%n) for i in range(n)]
    p.shell(verts,faces,m["navy"])
    for dy in [-.185,.185]:
        for foot,top in [(-.23,.06),(.24,-.07)]:
            p.rod((x+foot,y+dy,.025),(x+top,y+dy,.43),.016,m["steel"])
            p.rod((x+foot,y+dy,.008),(x+foot,y+dy,.043),.021,m["rubber"])
    p.rod((x+.19,y-.18,.07),(x+.19,y+.18,.07),.012,m["steel"])


def _bag(p,x,y, color,m):
    # Zipped racket holdall with tapered ends, contrast binding and handles.
    rings=[(-.48,.09,.058,.12),(-.38,.15,.10,.13),(-.28,.175,.13,.145),(.22,.185,.15,.16),(.37,.16,.13,.15),(.445,.105,.08,.145)]
    vertices=[]
    for yy,rx,rz,zc in rings:
        for i in range(16):
            a=2*math.pi*i/16
            vertices.append((x+rx*math.copysign(abs(math.cos(a))**.68,math.cos(a)),y+yy,zc+rz*math.copysign(abs(math.sin(a))**.68,math.sin(a))))
    faces=[(r*16+i,(r+1)*16+i,(r+1)*16+(i+1)%16,r*16+(i+1)%16) for r in range(len(rings)-1) for i in range(16)]
    faces.extend([tuple(range(16)),tuple(reversed(range(80,96)))])
    p.shell(vertices,faces,color,True)
    for a,b in zip(rings,rings[1:]):
        for side in [-1,1]:
            p.rod((x+side*.60*a[1],y+a[0],a[3]+.88*a[2]),(x+side*.60*b[1],y+b[0],b[3]+.88*b[2]),.005,m["cream"],6)
    for dx in [-.05,.05]:
        ends=[(x+dx,y-.14,.267),(x+dx,y-.095,.36),(x+dx,y+.07,.374),(x+dx,y+.13,.289)]
        for a,b in zip(ends,ends[1:]):
            p.rod(a,b,.012,m["rubber"],8)


def _bottle(p,x,y,m):
    for z1,z2,r1,r2,mat in [(0,.026,.034,.038,m["glass"]),(.026,.169,.038,.038,m["glass"]),(.169,.2,.038,.023,m["glass"]),(.2,.212,.023,.021,m["glass"]),(.212,.228,.025,.025,m["gold"])]:
        p.rod((x,y,z1),(x,y,z2),r1,mat,12,r2)
    p.rod((x,y,.072),(x,y,.121),.039,m["cream"],12)


def _stations(col,m):
    for side in [-1,1]:
        p = _Parts()
        y = side*3.72
        _seat(p,5.45,y,m)
        _bag(p,5.29,y+side*.86,m["coral"] if side>0 else m["sea"],m)
        # Open towel crate and neatly stacked terry towels.
        bx, by = 5.57,y-side*.77
        p.box((bx,by,.052),(.54,.65,.068),m["navy"])
        for xx in [-.255,.255]:
            p.box((bx+xx,by,.23),(.034,.65,.35),m["sea"])
            p.box((bx+xx,by,.406),(.052,.68,.033),m["steel"])
        for yy in [-.31,.31]:
            p.box((bx,by+yy,.23),(.48,.03,.35),m["sea"])
        for j in range(4):
            p.box((bx+.007*(j%2),by,.108+.045*j),(.42,.52,.044),m["cream"] if j!=2 else m["ink"],j*.018)
        for dy in [0,.10]:
            _bottle(p,5.09,by+dy,m)
        p.mesh("Player station "+str(side)+" | folding chair, towels, bottles and racket bag",col,.006)


def _service_station(col,m):
    p=_Parts()
    _seat(p,4.15,0,m)
    # A gauge is provided on each side of the judge's sightline so
    # either service court can be observed from the same seated position.
    for sign in [-1,1]:
        x,y=3.78,sign*.38
        p.rod((x,y,.012),(x,y,.044),.106,m["navy"],16)
        p.rod((x,y,.044),(x,y,1.046),.015,m["steel"],10)
        for dx in [-.053,.053]:
            p.box((x+dx,y,1.049),(.01,.246,.016),m["graphite"])
            for dy in [-.118,.118]:
                p.box((x+dx,y+dy,1.112),(.006,.006,.128),m["steel"])
            p.box((x+dx,y,1.15),(.004,.24,.003),m["gold"])
    # Shuttle supply caddy: footprint, tubular rails, capped supply tubes.
    x,y=4.65,.66
    p.box((x,y,.07),(.41,.30,.07),m["navy"])
    for dx in [-.19,.19]:
        for dy in [-.13,.13]:
            p.rod((x+dx,y+dy,.03),(x+dx,y+dy,.43),.012,m["steel"],8)
        p.rod((x+dx,y-.13,.41),(x+dx,y+.13,.41),.014,m["steel"],8)
    for dy in [-.13,.13]:
        p.rod((x-.19,y+dy,.41),(x+.19,y+dy,.41),.014,m["steel"],8)
    for dx in [-.107,0,.107]:
        for dy in [-.054,.054]:
            xx,yy=x+dx,y+dy
            p.rod((xx,yy,.104),(xx,yy,.487),.038,m["sea"],14)
            p.rod((xx,yy,.234),(xx,yy,.280),.039,m["cream"],14)
            p.rod((xx,yy,.483),(xx,yy,.493),.040,m["gold"],14)
    p.mesh("Service judge | chair, 1.15 m gauges and shuttle caddy",col,.001)


def _score_station(col,m):
    p=_Parts()
    x,y=-4.25,9.52
    for dx in [-.70,.70]:
        p.box((x+dx,y,.047),(.41,.56,.08),m["navy"])
        p.box((x+dx,y,.455),(.058,.07,.84),m["steel"])
    p.box((x,y,1.36),(2.50,.13,1.04),m["navy"])
    p.box((x,9.445,1.36),(2.4,.010,.94),m["screen"])
    p.box((x,9.446,.865),(2.45,.008,.025),m["sea"])
    p.mesh("Scoreboard | mobile frame and blank display",col,.008)
    # Technical desk along the far corner, folded tables with skirt.
    p=_Parts()
    x,y=4.55,9.53
    p.box((x,y,.746),(2.46,.68,.052),m["graphite"])
    p.box((x,y-.312,.39),(2.44,.044,.675),m["navy"])
    p.box((x,y-.339,.648),(2.43,.007,.014),m["sea"])
    for dx in [-.99,.99]:
        for dy in [-.23,.23]:
            p.rod((x+dx,y+dy,.02),(x+dx*.93,y+dy,.73),.022,m["steel"])
    for dx in [-.58,.50]:
        p.box((x+dx,y,.793),(.47,.32,.026),m["steel"])
        p.box((x+dx,y-.12,.944),(.47,.022,.30),m["graphite"])
        p.box((x+dx,y-.105,.943),(.425,.008,.257),m["screen"])
    p.mesh("Technical desk | skirt, trestles and scoring terminals",col,.005)
    _text("Desk | event typography","TECHNICAL  OFFICIALS",(x,y-.345,.39),.142,(math.pi/2,0,0),m["cream"],col)


def _board(col,m,x,y,turn,width,word,number):
    p=_Parts()
    co,si=math.cos(turn),math.sin(turn)
    def world(a,b,c):
        return x+a*co-b*si,y+a*si+b*co,c
    if number%3==1:
        face,color=m["sea"],m["cream"]
    elif number%3==2 and abs(y)<10:
        face,color=m["cream"],m["navy"]
    else:
        face,color=m["navy"],m["cream"]
    p.box(world(0,0,.326),(width,.09,.58),face,turn)
    p.box(world(0,-.048,.592),(width-.07,.005,.010),m["gold"],turn)
    for dx in [-width*.40,width*.40]:
        p.box(world(dx,.05,.031),(.13,.35,.052),m["rubber"],turn)
        p.rod(world(dx,.19,.039),world(dx,.062,.39),.012,m["steel"],8)
    # Official 40-unit brand-mark SVG used in index.html, in the board's local plane.
    def logo_point(u,v):
        return world(-width*.44 + .011*u,-.051,.55-.011*v)
    for path in [((8,29),(23,7),(29,7),(14,29)), ((19,29),(31,11),(36,11),(24,29))]:
        p.shell([logo_point(*point) for point in path],[(3,2,1,0)],color)
    circle=[logo_point(10+4*math.cos(i*math.tau/16),32+4*math.sin(i*math.tau/16)) for i in range(16)]
    p.shell(circle,[tuple(reversed(range(16)))],color)
    p.mesh("Perimeter board | "+str(number).zfill(2),col,.004)
    size=.425 if word==BRAND else min(.30,width*.091)
    _text("Fascia | "+word,word,world(.23,-.053,.33),size,(math.pi/2,0,turn),color,col)


def build_equipment():
    collection=bpy.data.collections.new("Court 01 | playing surface and courtside kit")
    bpy.context.scene.collection.children.link(collection)
    m={
        "court":_material("Court_Mat_Green",(.026,.26,.155),.83),
        "ink":_material("Court | warm white paint",(.82,.88,.82),.79),
        "thread":_material("Net | tarred basalt thread",(.013,.021,.026),.91),
        "gold":_material("Kit | anodized champagne",(.7,.43,.12),.32,.52),
        "steel":_material("Kit | brushed alloy",(.38,.47,.49),.32,.73),
        "rubber":_material("Kit | black EPDM",(.012,.018,.022),.86),
        "navy":_material("Kit | midnight enamel",(.017,.046,.074),.44,.18),
        "cream":_material("Kit | ivory",(.83,.86,.74),.68),
        "sea":_material("Kit | deep sea teal",(.025,.22,.20),.59),
        "coral":_material("Kit | burnt vermilion nylon",(.49,.10,.047),.56),
        "screen":_material("Kit | charcoal display glass",(.006,.014,.02),.32,.12),
        "graphite":_material("Kit | graphite composite",(.045,.057,.067),.56),
        "glass":_material("Kit | aqua hydration flask",(.12,.45,.48),.26,.23),
    }
    _court(collection,m)
    _net(collection,m)
    _umpire_chair(collection,m)
    _stations(collection,m)
    _service_station(collection,m)
    _score_station(collection,m)
    words=[BRAND,"COURT 01",BRAND]
    index=0
    for y,turn in [(10.40,0),(-10.40,math.pi)]:
        for x in [-5.10,-1.70,1.70,5.10]:
            _board(collection,m,x,y,turn,3.34,words[index%3],index)
            index+=1
    for x,turn in [(6.90,-math.pi/2),(-6.90,math.pi/2)]:
        for y in [-7.90,-4.48,4.48,7.90]:
            _board(collection,m,x,y,turn,3.32,words[index%3],index)
            index+=1
    return collection
