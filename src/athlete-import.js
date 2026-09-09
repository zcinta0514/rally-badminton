import * as THREE from 'three';
import { loadModel } from './model-assets.js';
import { applyAthletePose, sampleAthletePose } from './athlete.js';

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const MODEL_URL = new URL('./models/athlete.glb', import.meta.url);
const REQUIRED = ['pelvis', 'spineLow', 'spine', 'chest', 'neck', 'head',
  ...['left', 'right'].flatMap(side => ['Shoulder', 'Elbow', 'Wrist', 'Hip', 'Knee', 'Ankle'].map(joint => side + joint))];

function disposeScene(scene) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.skeleton) skeletons.add(object.skeleton);
    for (const material of object.material ? [].concat(object.material) : []) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
}

/** Install the prepared semantic GLB without changing gameplay or its clocks.
 * Takes ownership of the instance returned by loadModel, never its cached template.
 */
export function installAthleteModel(visual, { scene }) {
  scene.updateMatrixWorld(true);
  const meshes = [];
  scene.traverse(object => { if (object.isSkinnedMesh) meshes.push(object); });
  const sourceBones = meshes[0]?.skeleton.bones;
  if (!sourceBones || REQUIRED.some(name => !sourceBones.some(bone => bone.name === name)) ||
      meshes.some(mesh => mesh.skeleton.bones.length !== sourceBones.length ||
        mesh.skeleton.bones.some((bone, index) => bone !== sourceBones[index]))) {
    throw new Error('The athlete asset does not use the RALLY semantic rig');
  }
  const model = new THREE.Group();
  model.name = 'rally-imported-athlete';
  const bones = {}, flatBones = sourceBones.map(source => {
    const bone = new THREE.Bone();
    bone.name = source.name;
    source.getWorldPosition(bone.position);
    model.add(bone); bones[bone.name] = bone;
    return bone;
  });
  const palette = { 'rally-skin': visual.index === 0 ? 0xd8a27b : 0x966947,
    'rally-shirt': visual.index === 0 ? 0xf07759 : 0x86cdbd,
    'rally-accent': visual.index === 0 ? 0xffd69b : 0x36a38e };
  const importedSkeletons = new Set(meshes.map(mesh => mesh.skeleton));
  // Bake the export's Z-up transform before rebinding all primitives to one
  // flat skeleton. Bones now operate in the same player-local frame as the IK.
  for (const mesh of meshes) {
    mesh.geometry.applyMatrix4(mesh.matrixWorld);
    mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1);
    if (palette[mesh.material.name] !== undefined) mesh.material.color.setHex(palette[mesh.material.name]);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    model.add(mesh);
  }
  model.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(flatBones);
  for (const mesh of meshes) mesh.bind(skeleton, new THREE.Matrix4());
  for (const previous of importedSkeletons) previous.dispose();
  const direction = new THREE.Vector3(), trunk = new THREE.Quaternion(), yaw = new THREE.Quaternion();
  const point = (name, value) => bones[name].position.set(value.x, value.y, value.z);
  const skin = meshes[0];
  skin.userData.updatePose = (joints, pose) => {
    direction.set(joints.chest.x-joints.pelvis.x, joints.chest.y-joints.pelvis.y, joints.chest.z-joints.pelvis.z).normalize();
    trunk.setFromUnitVectors(UP, direction);
    const low = new THREE.Vector3().copy(joints.pelvis).lerp(joints.spine, .12/.23);
    for (const [name, tilt, twist] of [
      ['pelvis', 0, pose.pelvisYaw], ['spineLow', .26, (pose.pelvisYaw*3+pose.chestYaw)/4],
      ['spine', .5, (pose.pelvisYaw+pose.chestYaw)/2], ['chest', 1, pose.chestYaw], ['neck', 1, pose.chestYaw]
    ]) {
      point(name, name === 'spineLow' ? low : joints[name]);
      bones[name].quaternion.identity().slerp(trunk, tilt).multiply(yaw.setFromAxisAngle(UP, twist-pose.heading));
    }
    point('head', joints.head);
    bones.head.quaternion.setFromEuler(new THREE.Euler(pose.headPitch || 0, pose.headYaw-pose.heading, 0));
    for (const [side, sign] of [['left', -1], ['right', 1]]) {
      for (const [start, end, arm] of [['Shoulder','Elbow',true], ['Elbow','Wrist',true], ['Hip','Knee',false], ['Knee','Ankle',false]]) {
        const a = joints[side+start], b = joints[side+end], bone = bones[side+start];
        point(side+start, a);
        direction.set(b.x-a.x, b.y-a.y, b.z-a.z).normalize();
        bone.quaternion.setFromUnitVectors(arm ? new THREE.Vector3(sign,0,0) : DOWN, direction);
      }
      point(side+'Wrist', joints[side+'Wrist']);
      bones[side+'Wrist'].quaternion.copy(bones[side+'Elbow'].quaternion);
      point(side+'Ankle', joints[side+'Ankle']);
      bones[side+'Ankle'].quaternion.copy(bones[side+'Knee'].quaternion);
    }
  };
  const pose = visual.root.userData.pose;
  const side = Math.cos(visual.root.rotation.y-(pose?.heading || 0)) < 0 ? 1 : 0;
  const ankleYaws = Object.fromEntries(['left','right'].map(name => [name, visual.bones[name+'Ankle'].rotation.y+(pose?.heading || 0)]));
  try {
    // Pose the candidate before releasing the fallback. A failed installation
    // must also release primitives already detached from the loaded scene.
    applyAthletePose({...visual, skin}, pose || sampleAthletePose({x:visual.root.position.x,z:visual.root.position.z,vx:0,vz:0}, side, null, 0),
      {x:visual.root.position.x, z:visual.root.position.z, side, selected:visual.selected.visible, ankleYaws});
  } catch (error) {
    disposeScene(model);
    throw error;
  }
  // Keep clothing, neck, shoes and grip adapters. Their original material is
  // shared, so only release the replaced surfaces and unused skin skeleton.
  const previous = visual.skin;
  for (const object of [previous, visual.head]) {
    object.removeFromParent(); object.geometry.dispose();
  }
  for (const bone of previous.skeleton.bones) bone.removeFromParent();
  previous.skeleton.dispose();
  visual.root.add(model);
  visual.skin = skin; visual.skeleton = skeleton; visual.importedModel = model;
  visual.root.userData.modelStatus = 'ready';
  return true;
}

export async function upgradeAthlete(visual, { loader = loadModel } = {}) {
  if (visual.disposed) return false;
  if (visual.importedModel) return true;
  if (visual.modelUpgrade) return visual.modelUpgrade;
  visual.root.userData.modelStatus = 'loading';
  const task = (async () => {
    let model;
    try {
      model = await loader(MODEL_URL);
      if (visual.disposed) { disposeScene(model.scene); return false; }
      return installAthleteModel(visual, model);
    } catch (error) {
      if (model) disposeScene(model.scene);
      visual.root.userData.modelStatus = 'fallback';
      visual.root.userData.modelError = String(error?.message || error);
      return false;
    } finally {
      visual.modelUpgrade = null;
    }
  })();
  visual.modelUpgrade = task;
  return task;
}
