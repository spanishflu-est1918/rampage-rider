import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read('public/assets/boxman.glb');
const root = document.getRoot();

const animations = root.listAnimations();

// Compare Idle_A and Seated_Bike
const idleA = animations.find(a => a.getName() === 'Idle_A');
const seatedBike = animations.find(a => a.getName() === 'Seated_Bike');

function inspectAnimation(anim, name) {
  console.log(`\n=== ${name} ===`);
  const channels = anim.listChannels();
  const samplers = anim.listSamplers();
  console.log(`Channels: ${channels.length}, Samplers: ${samplers.length}`);

  // Look at first few channels
  for (let i = 0; i < Math.min(3, channels.length); i++) {
    const ch = channels[i];
    const sampler = ch.getSampler();
    const node = ch.getTargetNode();
    const path = ch.getTargetPath();

    console.log(`\nChannel ${i}: ${node?.getName()} -> ${path}`);

    if (sampler) {
      const input = sampler.getInput();
      const output = sampler.getOutput();
      console.log(`  Interpolation: ${sampler.getInterpolation()}`);
      console.log(`  Input: type=${input?.getType()}, count=${input?.getCount()}, array=${input?.getArray()?.slice(0, 5)}`);
      console.log(`  Output: type=${output?.getType()}, count=${output?.getCount()}, elementSize=${output?.getElementSize()}`);
      console.log(`  Output values (first 8): ${Array.from(output?.getArray()?.slice(0, 8) || [])}`);
    }
  }
}

if (idleA) inspectAnimation(idleA, 'Idle_A');
if (seatedBike) inspectAnimation(seatedBike, 'Seated_Bike');
else console.log('\nSeated_Bike not found!');
