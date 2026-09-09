import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

// Parsed templates live for this page's lifetime and never enter a rendered scene.
// Only successful loads stay cached; callers can recover after a network failure.
const templates = new Map();

/** Instantiate a GLTF scene with independently disposable GPU resources.
 * Texture images stay read-only: they share decoded pixel sources, not texture
 * objects. Callers may dispose textures, but must not close their source images.
 */
export function cloneModel(model) {
  const scene = cloneSkeleton(model.scene);
  const geometries = new Map(), materials = new Map(), textures = new Map();
  const materialFor = source => {
    if (!materials.has(source)) {
      const material = source.clone();
      for (const [key, value] of Object.entries(source)) {
        if (!value?.isTexture) continue;
        if (!textures.has(value)) textures.set(value, value.clone());
        material[key] = textures.get(value);
      }
      materials.set(source, material);
    }
    return materials.get(source);
  };
  scene.traverse(object => {
    if (object.geometry) {
      if (!geometries.has(object.geometry)) geometries.set(object.geometry, object.geometry.clone());
      object.geometry = geometries.get(object.geometry);
    }
    if (object.material) object.material = Array.isArray(object.material)
      ? object.material.map(materialFor) : materialFor(object.material);
    // Retargeting is allowed to adjust bind inverses without mutating the template.
    if (object.isSkinnedMesh) object.skeleton.boneInverses = object.skeleton.boneInverses.map(matrix => matrix.clone());
  });
  return { scene, animations: (model.animations || []).map(clip => clip.clone()) };
}

/** Pass a URL made relative to the importing module, e.g.
 * new URL('./models/athlete.glb', import.meta.url). Each call owns its returned
 * scene; rejection is deliberate so the view can choose its existing fallback.
 */
export async function loadModel(url) {
  const key = String(url);
  let pending = templates.get(key);
  if (!pending) {
    pending = new GLTFLoader().loadAsync(key).catch(error => {
      templates.delete(key);
      throw error;
    });
    templates.set(key, pending);
  }
  return cloneModel(await pending);
}
