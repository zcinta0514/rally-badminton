"""Build the mobile GLB version in memory after saving the full-resolution .blend."""
import bpy
import numpy as np


def prepare_export():
    """Preserve every animated transform and editable source file.

    Batch plain opaque colours into per-vertex RGB. Keep emissive materials and
    the runtime-addressable flooring. Reduce distant geometry at each original
    object, leaving the entire node hierarchy and clip channels untouched.
    """
    shared = {}
    attribute_name = "Arena finish"
    def palette(metal):
        if metal not in shared:
            mat = bpy.data.materials.new("Web / " + ("Brushed metal" if metal else "Paint and fabric"))
            mat.use_nodes = True
            shader = mat.node_tree.nodes.get("Principled BSDF")
            shader.inputs["Metallic"].default_value = .58 if metal else 0
            shader.inputs["Roughness"].default_value = .39 if metal else .70
            attr = mat.node_tree.nodes.new("ShaderNodeVertexColor")
            attr.layer_name = attribute_name
            mat.node_tree.links.new(attr.outputs["Color"], shader.inputs["Base Color"])
            shared[metal] = mat
        return shared[metal]

    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or not len(obj.data.materials):
            continue
        if not all(m and m.name.startswith(("AR / ", "Officials / ", "Kit | ", "Court | ", "Net | "))
                   for m in obj.data.materials):
            continue
        if obj.data.users > 1:
            obj.data = obj.data.copy()
        name = obj.name
        ratio = 1.0
        if "formed seat shells" in name:
            ratio = .15
        elif " / audience front" in name:
            # Knees, cuffs and shoes frame the near officials in courtside shots.
            ratio = .62
        elif " / audience " in name:
            ratio = .19
        elif name.startswith(("LJ_", "Umpire_Main", "Service_Judge")):
            ratio = .50

        # Curved furniture retains its profile with a one-segment edge radius.
        for mod in obj.modifiers:
            if mod.type == 'BEVEL':
                mod.segments = 1
        if ratio < 1:
            decimate = obj.modifiers.new("Mobile silhouette", "DECIMATE")
            decimate.ratio = ratio
            decimate.use_collapse_triangulate = True
        if obj.modifiers:
            deps = bpy.context.evaluated_depsgraph_get()
            original = obj.data
            reduced = bpy.data.meshes.new_from_object(obj.evaluated_get(deps), depsgraph=deps)
            obj.modifiers.clear()
            obj.data = reduced
            if not original.users:
                bpy.data.meshes.remove(original)
        mesh = obj.data
        # The collapse modifier can leave repeated indices on thin garment trim.
        mesh.validate(clean_customdata=False)
        if "Primary lattice girders" in name or " / audience " in name:
            # Smooth cylindrical tubes and distant limbs share vertex normals
            # across facets, reducing the duplicated vertices in glTF.
            mesh.polygons.foreach_set("use_smooth",np.ones(len(mesh.polygons),dtype=bool))
        if len(mesh.materials) < 2:
            continue
        old_mats = list(mesh.materials)
        dst_mats = []
        slot_map, colors = [], []
        for mat in old_mats:
            shader = mat.node_tree.nodes.get("Principled BSDF")
            # Material emission retains separate intensity and spectrum on the web.
            glow = shader.inputs["Emission Strength"].default_value > 0 and any(
                c > 0 for c in shader.inputs["Emission Color"].default_value[:3])
            if glow:
                material = mat
                rgb = (1.0, 1.0, 1.0)
            else:
                metallic = shader.inputs["Metallic"].default_value > .5
                material = palette(metallic and not mat.name.startswith("Officials / "))
                rgb = tuple(shader.inputs["Base Color"].default_value[:3])
            if material not in dst_mats:
                dst_mats.append(material)
            colors.append((*rgb,1.0))
            slot_map.append(dst_mats.index(material))

        face_slots = np.empty(len(mesh.polygons), dtype=np.int32)
        counts = np.empty_like(face_slots)
        mesh.polygons.foreach_get("material_index", face_slots)
        mesh.polygons.foreach_get("loop_total",counts)
        linear = np.asarray(colors,dtype=np.float32)
        attr = mesh.color_attributes.new(name=attribute_name,type='BYTE_COLOR',domain='CORNER')
        attr.data.foreach_set("color",np.repeat(linear[face_slots],counts,axis=0).ravel())
        mesh.color_attributes.active_color = attr
        mesh.materials.clear()
        for mat in dst_mats:
            mesh.materials.append(mat)
        mesh.polygons.foreach_set("material_index",np.asarray(slot_map,dtype=np.int32)[face_slots])
        mesh.update()
    bpy.context.view_layer.update()
