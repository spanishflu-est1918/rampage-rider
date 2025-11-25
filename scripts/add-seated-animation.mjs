import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Quaternion, Euler, MathUtils } from 'three';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// Load the GLB
const document = await io.read('public/assets/boxman.glb');
const root = document.getRoot();

// Find Idle_A animation to use as base
const animations = root.listAnimations();
console.log(`Found ${animations.length} animations`);

const idleA = animations.find(a => a.getName() === 'Idle_A');
if (!idleA) {
  console.error('Idle_A animation not found!');
  process.exit(1);
}

console.log(`Found Idle_A with ${idleA.listChannels().length} channels`);

// Check if Seated_Bike already exists
const existingSeated = animations.find(a => a.getName() === 'Seated_Bike');
if (existingSeated) {
  console.log('Seated_Bike already exists, removing it first...');
  existingSeated.dispose();
}

// Clone Idle_A to create Seated_Bike
const seatedBike = document.createAnimation('Seated_Bike');

// Helper to create delta quaternion from euler angles (degrees)
function eulerToQuat(rx, ry, rz) {
  const euler = new Euler(
    MathUtils.degToRad(rx),
    MathUtils.degToRad(ry),
    MathUtils.degToRad(rz),
    'XYZ'
  );
  return new Quaternion().setFromEuler(euler);
}

// Helper to apply delta rotation to base quaternion
function applyRotationDelta(baseArray, deltaQuat) {
  const base = new Quaternion(baseArray[0], baseArray[1], baseArray[2], baseArray[3]);
  base.multiply(deltaQuat);
  return [base.x, base.y, base.z, base.w];
}

// Bone modifications for seated pose - rotation deltas in degrees
// Only left arm for grabbing handlebars, plus legs for sitting
const boneModifications = {
  'upperleg.l': { delta: eulerToQuat(75, 0, 0) },
  'upperleg.r': { delta: eulerToQuat(75, 0, 0) },
  'lowerleg.l': { delta: eulerToQuat(-70, 0, 0) },
  'lowerleg.r': { delta: eulerToQuat(-70, 0, 0) },
  'foot.l': { delta: eulerToQuat(-15, 0, 0) },
  'foot.r': { delta: eulerToQuat(-15, 0, 0) },
  // Only LEFT arm forward for handlebars
  'upperarm.l': { delta: eulerToQuat(45, 0, 0) },
  'lowerarm.l': { delta: eulerToQuat(-25, 0, 0) },
};

// Copy channels from Idle_A, modifying bone rotations as needed
for (const channel of idleA.listChannels()) {
  const targetNode = channel.getTargetNode();
  const targetPath = channel.getTargetPath();
  const sampler = channel.getSampler();

  if (!targetNode || !sampler) continue;

  const nodeName = targetNode.getName();

  // Clone the sampler
  const inputAcc = sampler.getInput();
  const outputAcc = sampler.getOutput();

  if (!inputAcc || !outputAcc) continue;

  // Create new accessors with 2 keyframes (same pose, gives duration)
  const newInput = document.createAccessor()
    .setType('SCALAR')
    .setArray(new Float32Array([0, 0.0333])); // 2 keyframes ~1 frame at 30fps

  // Get first keyframe value from original
  const outputArray = outputAcc.getArray();
  const elementSize = outputAcc.getElementSize();
  let firstKeyframe = Array.from(outputArray.slice(0, elementSize));

  // Apply delta modifications for specific bones
  if (targetPath === 'rotation' && boneModifications[nodeName]) {
    firstKeyframe = applyRotationDelta(firstKeyframe, boneModifications[nodeName].delta);
    console.log(`  Applied rotation delta for ${nodeName}`);
  }

  // Duplicate the keyframe for both time points
  const outputValues = [...firstKeyframe, ...firstKeyframe];

  const newOutput = document.createAccessor()
    .setType(outputAcc.getType())
    .setArray(new Float32Array(outputValues));

  // Create new sampler
  const newSampler = document.createAnimationSampler()
    .setInput(newInput)
    .setOutput(newOutput)
    .setInterpolation(sampler.getInterpolation());

  // Create new channel
  const newChannel = document.createAnimationChannel()
    .setTargetNode(targetNode)
    .setTargetPath(targetPath)
    .setSampler(newSampler);

  seatedBike.addChannel(newChannel);
  seatedBike.addSampler(newSampler);
}

console.log(`Created Seated_Bike with ${seatedBike.listChannels().length} channels`);

// Save the modified GLB
await io.write('public/assets/boxman.glb', document);
console.log('Saved boxman.glb with Seated_Bike animation');

// Verify
const verifyDoc = await io.read('public/assets/boxman.glb');
const verifyAnims = verifyDoc.getRoot().listAnimations();
console.log(`\nVerification: ${verifyAnims.length} animations`);
console.log('Animations:', verifyAnims.map(a => a.getName()).join(', '));
