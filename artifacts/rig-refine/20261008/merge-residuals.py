"""Merge disjoint additive surface residuals; retain source animation curves.

Blender --background --python merge-residuals.py -- BASE.blend OUTDIR
  LOWER.blend LOWER_PREFIX HIP.blend HIP_PREFIX
"""
import bpy, sys, json, hashlib
import numpy as np
from pathlib import Path

argv=sys.argv[sys.argv.index('--')+1:]
src,out=map(Path,argv[:2]);pairs=list(zip(argv[2::2],argv[3::2]))
assert len(pairs)==2
out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(src.resolve()))
body=bpy.data.objects['SuperHero_Male'];basis=np.array([v.co[:] for v in body.data.vertices])
oldKeys={k.name for k in body.data.shape_keys.key_blocks}
allChanged=set();report=[]
def curves(action):
    return [fc for layer in action.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]
for file,prefix in pairs:
    file=Path(file)
    with bpy.data.libraries.load(str(file.resolve()),link=False) as (available,target):
        assert 'SuperHero_Male' in available.objects
        target.objects=['SuperHero_Male']
    imported=target.objects[0]
    sourceKeys=imported.data.shape_keys
    assert len(imported.data.vertices)==len(basis)
    assert np.max(np.abs(np.array([v.co[:] for v in imported.data.vertices])-basis))<1e-7
    selected=[k for k in sourceKeys.key_blocks if k.name.startswith(prefix)]
    assert selected,('No residual keys',file,prefix)
    changed=set();added=[]
    for key in selected:
        assert key.name not in oldKeys and key.name not in body.data.shape_keys.key_blocks
        assert key.relative_key==sourceKeys.key_blocks[0]
        assert not key.vertex_group
        co=np.array([v.co[:] for v in key.data]);changed.update(np.flatnonzero(np.linalg.norm(co-basis,axis=1)>1e-7).tolist())
        copy=body.shape_key_add(name=key.name,from_mix=False)
        copy.data.foreach_set('co',co.astype(np.float32).ravel())
        copy.slider_min=key.slider_min;copy.slider_max=key.slider_max
        matching=[fc for fc in curves(sourceKeys.animation_data.action) if fc.data_path==key.path_from_id('value')]
        assert len(matching)==1
        fc=matching[0]
        assert not fc.modifiers and all(k.interpolation=='LINEAR' for k in fc.keyframe_points)
        assert all(abs(point.co.x*2-round(point.co.x*2))<1e-5 for point in fc.keyframe_points), 'Residual keys must lie on the exported half-frame grid'
        for point in fc.keyframe_points:
            copy.value=float(point.co.y);copy.keyframe_insert(data_path='value',frame=float(point.co.x))
        for dest in curves(body.data.shape_keys.animation_data.action):
            if dest.data_path==copy.path_from_id('value'):
                for point in dest.keyframe_points:point.interpolation='LINEAR'
        added.append(copy.name)
    assert not (allChanged & changed),('Residual vertex domains overlap',len(allChanged&changed))
    allChanged|=changed
    report.append({'source':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'prefix':prefix,'addedKeys':added,'changedVertices':len(changed)})
    bpy.data.objects.remove(imported,do_unlink=True)
assert oldKeys.issubset({k.name for k in body.data.shape_keys.key_blocks})
bpy.context.scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=str((out/'rebuild.blend').resolve()))
(out/'merge-qa.json').write_text(json.dumps({'source':str(src),'sourceSHA256':hashlib.sha256(src.read_bytes()).hexdigest(),'residuals':report,'disjointVertexDomains':True,'oldKeysRetained':len(oldKeys),'scope':'Merge identity only. Full geometry/support/racket/continuity QA must run again.'},indent=2))
print('MERGED',[(r['prefix'],len(r['addedKeys']),r['changedVertices']) for r in report])
