"""Read-only GLB inventory for the character preparation milestone."""
import argparse
import hashlib
import json
import struct
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('asset', type=Path)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
data = args.asset.read_bytes()
magic, version, length = struct.unpack_from('<III', data)
if magic != 0x46546C67 or version != 2 or length != len(data):
    raise ValueError('Invalid GLB header or file size')
chunk_length, chunk_type = struct.unpack_from('<II', data, 12)
if chunk_type != 0x4E4F534A:
    raise ValueError('Missing JSON chunk')
doc = json.loads(data[20:20 + chunk_length])
accessors = doc.get('accessors', [])
primitives = [p for m in doc.get('meshes', []) for p in m['primitives']]
positions = {p['attributes']['POSITION'] for p in primitives}
triangles = 0
for p in primitives:
    if p.get('mode', 4) != 4:
        raise ValueError('Non-triangle primitive: explicit counting required')
    count = accessors[p['indices']]['count'] if 'indices' in p else accessors[p['attributes']['POSITION']]['count']
    if count % 3:
        raise ValueError('Invalid triangle index count')
    triangles += count // 3
report = {
    'asset': str(args.asset), 'bytes': len(data),
    'sha256': hashlib.sha256(data).hexdigest(),
    'meshes': len(doc.get('meshes', [])), 'primitives': len(primitives),
    'triangles': triangles, 'uniquePositionVertices': sum(accessors[i]['count'] for i in positions),
    'materials': [m.get('name', '') for m in doc.get('materials', [])],
    'textures': len(doc.get('textures', [])), 'images': len(doc.get('images', [])),
    'animations': [a.get('name', '') for a in doc.get('animations', [])],
    'skins': [{'jointCount': len(s['joints']), 'joints': [doc['nodes'][i].get('name', '') for i in s['joints']]} for s in doc.get('skins', [])],
    'limitations': 'Static asset inventory only; not full-scene draw calls, visual quality or phone performance.'
}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
