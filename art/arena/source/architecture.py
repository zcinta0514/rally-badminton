"""Single-court indoor arena. Distances are in metres, Z is up.

Main reference: BWF Statutes section 5.3.4, especially lighting and background.
The light energies are photographic scene settings, not a lux certification.
"""
import math
import random

import bpy
from mathutils import Vector


def build_architecture():
    root = bpy.data.collections.new("Architecture | RALLY OPEN")
    bpy.context.scene.collection.children.link(root)
    sections = {}
    for key in ("Bowl", "Seats", "Audience", "Roof", "Lighting", "Wayfinding"):
        sections[key] = bpy.data.collections.new("AR / " + key)
        root.children.link(sections[key])

    def material(name, rgb, roughness=0.7, metal=0, glow=0):
        mat = bpy.data.materials.new("AR / " + name)
        mat.diffuse_color = (*rgb, 1)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metal
        if glow:
            emission = bsdf.inputs.get("Emission Color") or bsdf.inputs["Emission"]
            emission.default_value = (*rgb, 1)
            bsdf.inputs["Emission Strength"].default_value = glow
        return mat

    apron = material("Midnight laid sports flooring", (.033, .067, .094), .79)
    concrete = material("Blue slate precast", (.058, .073, .083), .94)
    dark = material("Night acoustic baffle", (.018, .031, .040), .94)
    facade = material("Lacquered deep petrol", (.029, .089, .108), .59, .15)
    steel = material("Powder-coated truss", (.12, .147, .154), .49, .53)
    iron = material("Blackened steel", (.033, .047, .054), .56, .44)
    rail = material("Brushed guard rail", (.235, .279, .289), .44, .65)
    teal = material("Mint graphic", (.101, .54, .47), .58, 0, .18)
    warm = material("Aisle courtesy light", (.96, .46, .156), .35, 0, 1.2)
    lens = material("Diffused sports LED", (.79, .90, 1.0), .33, 0, 3.5)
    ivory = material("Painted lettering", (.56, .68, .69), .64, 0, .20)
    chair_mats = [material("Moulded seat %d" % i, c, .70)
                  for i, c in enumerate(((.009, .024, .042), (.011, .032, .055),
                                         (.009, .020, .036), (.013, .035, .052)))]
    skin_mats = [material("Audience skin %d" % i, c) for i, c in enumerate((
        (.41, .213, .136), (.23, .102, .061), (.51, .293, .203), (.14, .071, .048)))]
    shirt_mats = [material("Audience fabric %d" % i, c) for i, c in enumerate((
        (.026,.057,.109),(.22,.085,.051),(.031,.135,.110),(.066,.047,.107),
        (.225,.213,.170),(.022,.034,.049),(.183,.034,.047),(.118,.132,.060),
        (.105,.152,.203),(.164,.107,.145),(.16,.084,.025),(.040,.083,.091)))]
    hair_mats = [material("Hair " + str(i),c,.89) for i,c in enumerate(
        ((.014,.011,.012),(.039,.024,.018),(.070,.038,.022),(.094,.092,.087)))]
    pant_mats = [material("Denim " + str(i),c,.91) for i,c in enumerate(
        ((.022,.028,.041),(.029,.046,.068),(.047,.040,.034)))]
    footwear = [material("Trainer " + str(i),c,.78) for i,c in enumerate(
        ((.045,.049,.052),(.11,.117,.122),(.119,.103,.084)))]

    # Batch stationary parts by physical assembly to keep the web export compact.
    batches = {}

    def poly(section, name, mat, points, faces, smooth=False):
        key = (section, name)
        verts, polys, slots, indices, smoothing = batches.setdefault(key, ([], [], [], [], []))
        if mat not in slots:
            slots.append(mat)
        offset = len(verts)
        verts.extend(points)
        polys.extend(tuple(offset + i for i in face) for face in faces)
        indices.extend([slots.index(mat)] * len(faces))
        smoothing.extend([smooth] * len(faces))

    quadbox = ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5),
               (2, 3, 7, 6), (3, 0, 4, 7))

    def box(section, name, mat, center, size, transform=None):
        cx, cy, cz = center
        sx, sy, sz = (v * .5 for v in size)
        pts = [(cx + x*sx, cy + y*sy, cz + z*sz) for x, y, z in (
            (-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
            (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1))]
        poly(section, name, mat, [transform(*p) for p in pts] if transform else pts, quadbox)

    def rod(section, name, mat, a, b, radius, sides=6):
        start, end = Vector(a), Vector(b)
        axis = (end - start).normalized()
        u = axis.cross(Vector((0,0,1)) if abs(axis.z)<.9 else Vector((0,1,0))).normalized()
        v = axis.cross(u)
        circle = [radius*(u*math.cos(2*math.pi*i/sides)+v*math.sin(2*math.pi*i/sides))
                  for i in range(sides)]
        pts = [tuple(c+p) for c in (start,end) for p in circle]
        side_faces = [(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
        poly(section, name, mat, pts, [tuple(reversed(range(sides))), tuple(range(sides,2*sides)), *side_faces])

    def label(name, value, center, size, rot_z, mat):
        curve = bpy.data.curves.new(name, "FONT")
        curve.body = value
        curve.align_x = 'CENTER'
        curve.align_y = 'CENTER'
        curve.size = size
        curve.space_character = 1.14
        ob = bpy.data.objects.new("AR / " + name, curve)
        ob.location = center
        ob.rotation_euler = (math.pi / 2, 0, rot_z)
        ob.data.materials.append(mat)
        sections["Wayfinding"].objects.link(ob)
        # GLTF also needs signs as meshes.
        mesh = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        sign = bpy.data.objects.new(ob.name + " glyphs", mesh)
        sign.matrix_world = ob.matrix_world.copy()
        sections["Wayfinding"].objects.link(sign)
        bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.curves.remove(curve)

    box("Bowl", "Competition surround", apron, (0,0,-.121), (38.6,46.4,.206))
    for sign in (-1, 1):
        box("Bowl", "Enclosure and acoustic panels", dark, (sign*19.3,0,7.1), (.32,46.6,14.4))
        box("Bowl", "Enclosure and acoustic panels", dark, (0,sign*23.2,7.1), (39,.32,14.4))
        # Flush acoustic wall cassettes and spaced reveals.
        for y in range(-21,22,3):
            box("Bowl", "Side wall folded cassettes", facade, (sign*19.06,y,9.56), (.12,2.925,2.9))
            box("Bowl", "Side wall folded cassettes", steel, (sign*18.975,y,8.20), (.038,2.8,.024))
        for x in (-15,-10,10,15):
            for dx in range(8):
                box("Bowl","End wall vertical fins",facade,(x+(dx-3.5)*.32,sign*22.95,9.45),(.15,.19,3.55))
        box("Wayfinding","End-wall identity",facade,(0,sign*22.90,9.36),(13.5,.21,3.68))
        box("Wayfinding","End-wall identity",teal,(0,sign*22.77,7.96),(3.7,.026,.037))
        label("Arena logotype %d" % sign,"RALLY   /   OPEN",(0,sign*22.77,9.73),1.27,0 if sign==1 else math.pi,ivory)
        label("Hall designation %d" % sign,"C E N T R E   C O U R T",(0,sign*22.77,8.62),.31,0 if sign==1 else math.pi,teal)

    rng = random.Random(20314)

    def bubble(section, name, mat, c, r, tf, longitude=7, rings=4):
        # Tapered solid of revolution, equally useful for woven shoulders and heads.
        pts = [tf(c[0],c[1],c[2]-r[2])]
        for k in range(1,rings):
            ph = math.pi*k/rings - math.pi/2
            for j in range(longitude):
                th = 2*math.pi*j/longitude
                pts.append(tf(c[0]+r[0]*math.cos(ph)*math.cos(th),
                              c[1]+r[1]*math.cos(ph)*math.sin(th),c[2]+r[2]*math.sin(ph)))
        pts.append(tf(c[0],c[1],c[2]+r[2]))
        faces=[]
        for j in range(longitude):
            nxt=(j+1)%longitude
            faces.append((0,1+nxt,1+j))
            for k in range(rings-2):
                a=1+longitude*k
                faces.append((a+j,a+nxt,a+longitude+nxt,a+longitude+j))
            last=1+(rings-2)*longitude
            faces.append((last+j,last+nxt,len(pts)-1))
        poly(section,name,mat,pts,faces,True)

    # Local X runs along each row and +Y is backwards (away from the match).
    sides = (("East",9.05,11.8,lambda u,v,z:(v,-u,z)),
             ("West",9.05,11.8,lambda u,v,z:(-v,u,z)),
             ("North",13.05,8.68,lambda u,v,z:(u,v,z)),
             ("South",13.05,8.68,lambda u,v,z:(-u,-v,z)))
    for title, front, half_width, tf in sides:
        seating = title + " / formed seat shells"
        terrace = title + " / terraces"
        aisle_offsets = [-half_width*.48,half_width*.48]
        nrows = 8
        for row in range(nrows):
            depth=front+row*.94
            platform=.46+row*.59
            box("Bowl",terrace,concrete,(0,depth,platform*.5),(2*half_width,.94,platform),tf)
            box("Bowl",terrace,iron,(0,depth-.458,platform-.13),(2*half_width,.025,.13),tf)
            for aisle in aisle_offsets:
                box("Bowl",terrace,concrete,(aisle,depth-.26,platform+.148),(.99,.43,.296),tf)
                box("Bowl",terrace,warm,(aisle-.34,depth-.469,platform+.235),(.20,.019,.045),tf)
            for idx in range(-int((half_width-.35)/.62),int((half_width-.35)/.62)+1):
                u=idx*.62
                if any(abs(u-a)<.78 for a in aisle_offsets):
                    continue
                # Folded bucket: belly and sides are swept upward across the seat.
                profile=((-.28,.43),(-.22,.395),(-.08,.365),(.085,.36),(.169,.394),
                         (.204,.48),(.241,.65),(.272,.77),(.295,.782),(.321,.751),
                         (.287,.57),(.241,.403),(.17,.345),(-.20,.342),(-.28,.384))
                pts=[]
                for w in (-1,-.65,.65,1):
                    for v,z in profile:
                        wing=(abs(w)-.65)*.15 if abs(w)>.65 else 0
                        pts.append(tf(u+w*.245,depth+v,platform+z+wing))
                n=len(profile)
                faces=[tuple(reversed(range(n))),tuple(range(3*n,4*n))]
                for band in range(3):
                    for k in range(n):
                        nxt=(k+1)%n
                        faces.append((band*n+k,band*n+nxt,(band+1)*n+nxt,(band+1)*n+k))
                poly("Seats",seating,chair_mats[rng.choice((0,0,1,2,3))],pts,faces,True)
                if idx % 2 == 0:
                    box("Seats",seating,iron,(u,depth+.095,platform+.167),(.09,.095,.335),tf)
                # Small groups of spectators interspersed with empty banks of seats.
                occupancy = .56 + .19*math.sin((idx//3)*1.71+row*.57)
                if abs(u)<half_width*.46:
                    occupancy += .12
                if rng.random()>occupancy:
                    continue
                block = title + (" / audience left" if idx<0 else " / audience right")
                height=rng.uniform(.91,1.12)
                lean=rng.uniform(-.115,.018)
                turn=rng.uniform(-.15,.15)
                ct,st=math.cos(turn),math.sin(turn)
                def person(x,y,z):
                    return tf(u+ct*x-st*y,depth-.035+st*x+ct*y,platform+.406+z*height)
                top=shirt_mats[rng.randrange(len(shirt_mats))]
                skin=skin_mats[rng.randrange(len(skin_mats))]
                hair=hair_mats[rng.choices(range(4),weights=(5,3,1,1))[0]]
                trousers=pant_mats[rng.randrange(3)]
                shoe=footwear[rng.randrange(3)]
                pose=rng.randrange(4)
                # Shaped hem, waist and wider shoulder seam distinguish shirts from heads.
                width=rng.uniform(.91,1.13)
                sections_shirt=((.055,.141,.092,.00),(.16,.16,.12,.28),(.36,.183,.120,.73),
                                (.493,.207,.109,.92),(.535,.166,.090,1),(.575,.061,.056,1))
                points=[]
                for z,rx,ry,bend in sections_shirt:
                    for i in range(8):
                        t=math.tau*i/8
                        points.append(person(rx*width*math.cos(t),ry*math.sin(t)+lean*bend,z))
                faces=[tuple(reversed(range(8))),tuple(range(40,48))]
                for k in range(5):
                    for j in range(8):
                        a=k*8+j;b=k*8+(j+1)%8
                        faces.append((a,b,b+8,a+8))
                poly("Audience",block,top,points,faces,True)
                bubble("Audience",block,skin,(0,lean-.014,.686),(.088,.096,.119),person,8)
                bubble("Audience",block,hair,(0,lean+.004,.748),(.092,.101,.075),person,8,3)
                if rng.random()<.28:
                    bubble("Audience",block,hair,(0,lean+.071,.655),(.087,.060,.116),person,6,3)
                for hand in (-1,1):
                    shoulder=person(hand*.165*width,lean,.493)
                    elbow=person(hand*.211,-.10,.258 if pose==2 else .206)
                    palm=((hand*.078,-.226,.35+hand*.022) if pose==2 else
                          (hand*.13,-.310,.138) if pose==1 else
                          (hand*.052,-.22,.182) if pose==0 else
                          (hand*.195,-.08,.068))
                    wrist=person(*palm)
                    rod("Audience",block,top,shoulder,elbow,.070,7)
                    rod("Audience",block,top if pose==2 else skin,elbow,wrist,.045,6)
                    bubble("Audience",block,skin,palm,(.045,.059,.035),person,6,3)
                    # Thighs project clear of the seat lip; ankles rest underneath bent knees.
                    knee_x=hand*(.114 if pose==0 else .14)
                    knee_y=-.366+(hand*.021 if pose==1 else 0)
                    hip=person(hand*.092,0,.07)
                    knee=person(knee_x,knee_y,.065)
                    ankle_y=knee_y+.021-(hand*.04 if pose==3 else 0)
                    # The actual floor contact is independent of the person's torso height.
                    ankle_z=(.077-.406)/height
                    ankle=person(knee_x,ankle_y,ankle_z)
                    rod("Audience",block,trousers,hip,knee,.083,7)
                    rod("Audience",block,trousers,knee,ankle,.064,7)
                    bubble("Audience",block,shoe,(knee_x,ankle_y-.042,ankle_z-.014),
                           (.065,.12,.046),person,7,3)

        # A service aisle, stairs with continuous handrail, and a back concourse.
        rear_depth=front+.94*nrows
        rear_z=.46+(nrows-1)*.59
        box("Bowl",terrace,concrete,(0,rear_depth+.51,rear_z/2),(half_width*2,2.02,rear_z),tf)
        for aisle in aisle_offsets:
            for row in (1,3,5,7):
                d=front+row*.94
                z=.46+row*.59
                rod("Bowl",terrace,rail,tf(aisle+.42,d,z),tf(aisle+.42,d,z+.84),.025,8)
            rod("Bowl",terrace,rail,tf(aisle+.42,front+.94,.46+.59+.84),
                tf(aisle+.42,front+7*.94,rear_z+.84),.034,8)
        for i in range(int(2*half_width/2)+1):
            u=-half_width+2*i
            rod("Bowl",terrace,rail,tf(u,rear_depth+.03,rear_z),tf(u,rear_depth+.03,rear_z+.95),.032)
        for z in (.46,.94):
            rod("Bowl",terrace,rail,tf(-half_width,rear_depth+.03,rear_z+z),
                tf(half_width,rear_depth+.03,rear_z+z),.032)

    # The roof shell can be hidden independently for cutaway views.
    box("Roof","Roof shell",dark,(0,0,15.79),(39,46.7,.24))
    for y in (-20,-14,-8,-2,4,10,16,22):
        for offset in (-.27,.27):
            chord=[(x,y+offset,13.34+.044*(18-abs(x))) for x in range(-18,19,3)]
            for a,b in zip(chord,chord[1:]):
                rod("Roof","Primary lattice girders",steel,a,b,.077)
                rod("Roof","Primary lattice girders",steel,(a[0],a[1],a[2]+.93),
                    (b[0],b[1],b[2]+.93),.079)
            for i,(x,cy,z) in enumerate(chord):
                rod("Roof","Primary lattice girders",steel,(x,cy,z),(x,cy,z+.93),.040)
                if i+1<len(chord):
                    bx,by,bz=chord[i+1]
                    rod("Roof","Primary lattice girders",steel,(x,cy,z+.93*(i%2)),
                        (bx,by,bz+.93*((i+1)%2)),.039)
        for x in range(-18,19,3):
            z=13.34+.044*(18-abs(x))
            rod("Roof","Primary lattice girders",steel,(x,y-.27,z),(x,y+.27,z),.04)
        for s in (-1,1):
            box("Roof","Columns",steel,(s*18.48,y,6.95),(.31,.36,13.9))
    for x in range(-18,19,3):
        box("Roof","Secondary purlins",iron,(x,0,15.25),(.11,46,.21))

    def light(name, pos, target, watts, size, tint, shadow=True):
        lamp=bpy.data.lights.new(name, type='AREA')
        lamp.energy=watts
        lamp.shape='DISK'
        lamp.size=size
        if shadow:
            lamp.spread=math.radians(90)
        lamp.color=tint
        lamp.use_shadow=shadow
        ob=bpy.data.objects.new("AR / "+name,lamp)
        sections["Lighting"].objects.link(ob)
        ob.location=pos
        ob.rotation_euler=(Vector(target)-Vector(pos)).to_track_quat('-Z','Y').to_euler()

    for s in (-1,1):
        x=s*6.05
        for rail_x in (-.26,.26):
            rod("Roof","Sports lighting bridges",steel,(x+rail_x,-10,12.83),(x+rail_x,10,12.83),.048)
        for y in (-8,-4,0,4,8):
            rod("Roof","Sports lighting bridges",steel,(x-.26,y,12.83),(x+.26,y,12.83),.045)
            rod("Roof","Sports lighting bridges",iron,(x,y,12.71),(x,y,14.50),.030)
            # Real reflectors with twin arrays, bent toward the adjacent half court.
            tilt=s*.31
            def fixture(u,v,w):
                return (x+u*math.cos(tilt)+w*math.sin(tilt),y+v,12.55-u*math.sin(tilt)+w*math.cos(tilt))
            box("Lighting","LED luminaires",iron,(0,0,0),(.72,1.48,.23),fixture)
            for k in range(4):
                for j in (-1,1):
                    box("Lighting","LED luminaires",lens,(j*.17,(k-1.5)*.335,-.119),(.275,.27,.022),fixture)
            if y in (-8,0,8):
                light("Cross-court wash %d %d"%(s,y),(x,y,12.36),(-s*1.1,.65*y,.5),
                      1560,2.8,(1,.934,.853) if s<0 else (.848,.93,1))
        # Separate dimmer circuit for indirect audience lighting.
        light("Side bowl wash %d"%s,(s*9.5,0,10.2),(s*15,0,2.4),470,9.5,(.60,.79,1),False)
        light("End bowl wash %d"%s,(0,s*12,11.2),(0,s*21,6),465,8.5,(.73,.89,.95),False)

    for (section,name),(verts,faces,mats,indices,smoothing) in batches.items():
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata(verts,[],faces)
        for mat in mats:
            mesh.materials.append(mat)
        mesh.polygons.foreach_set('material_index',indices)
        mesh.polygons.foreach_set('use_smooth',smoothing)
        mesh.update()
        ob=bpy.data.objects.new("AR / "+name,mesh)
        sections[section].objects.link(ob)
        if section=="Audience":
            ob["role"]="spectator_block"
    return root
