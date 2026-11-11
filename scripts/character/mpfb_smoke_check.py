"""Create an isolated rigged test body. This is not the proposed game character."""
import json
import sys
from pathlib import Path

import bpy
from bl_ext.rally_local.mpfb.services.humanservice import HumanService

destination = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
if destination.suffix != '.blend' or destination.exists():
    raise ValueError('Use a new .blend output path; this check never overwrites a scene')

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
body = HumanService.create_human()
rig = HumanService.add_builtin_rig(body, 'game_engine', import_weights=True)
if not rig or not len(rig.data.bones) or not body.vertex_groups:
    raise RuntimeError('Body or rig creation failed')
if not any(m.type == 'ARMATURE' and m.object == rig for m in body.modifiers):
    raise RuntimeError('Body has no modifier linked to the generated rig')
destination.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(destination))
report = {
    'blender': bpy.app.version_string,
    'extension': 'bl_ext.rally_local.mpfb',
    'bodyVerticesIncludingMaskedHelpers': len(body.data.vertices),
    'bones': len(rig.data.bones),
    'deformBones': sum(b.use_deform for b in rig.data.bones),
    'vertexGroups': len(body.vertex_groups),
    'output': str(destination),
    'scope': 'Create and save a weighted rigged base body only. No anatomy, animation quality, export, clothing or mobile performance acceptance.',
}
destination.with_suffix('.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
