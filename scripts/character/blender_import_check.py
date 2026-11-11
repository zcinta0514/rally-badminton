"""Import the existing GLB into a separate editable inspection scene, never overwrite it."""
import json
import sys
from pathlib import Path
import bpy

values = sys.argv[sys.argv.index('--') + 1:]
source, destination = (Path(v).resolve() for v in values)
if source == destination or destination.suffix != '.blend':
    raise ValueError('Output must be a separate .blend file')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
report = {
    'blender': bpy.app.version_string,
    'input': str(source), 'output': str(destination),
    'objects': [{'name': o.name, 'type': o.type,
                 'vertices': len(o.data.vertices) if o.type == 'MESH' else None,
                 'bones': len(o.data.bones) if o.type == 'ARMATURE' else None}
                for o in bpy.context.scene.objects],
    'note': 'Imported runtime GLB for inspection, not recovered original authoring source.'
}
destination.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(destination))
destination.with_suffix('.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
