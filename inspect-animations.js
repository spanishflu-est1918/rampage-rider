const fs = require('fs');
const path = require('path');

// Use a simple GLB parser to extract animation names
const GLBPath = './public/assets/animations/';
const files = fs.readdirSync(GLBPath).filter(f => f.endsWith('.glb'));

console.log('Found GLB files:', files.length);

files.forEach(file => {
  const filePath = path.join(GLBPath, file);
  const buffer = fs.readFileSync(filePath);
  
  // GLB format: 12 byte header + JSON + binary
  // Read JSON chunk
  const jsonStart = 28; // After GLB header
  const jsonLength = buffer.readUInt32LE(16);
  const jsonStr = buffer.toString('utf8', jsonStart, jsonStart + jsonLength);
  
  try {
    const json = JSON.parse(jsonStr);
    console.log(`\n${file}:`);
    
    if (json.animations && json.animations.length > 0) {
      json.animations.forEach(anim => {
        console.log(`  - ${anim.name}`);
      });
    } else {
      console.log('  (no animations)');
    }
  } catch (e) {
    console.log(`  Error parsing ${file}: ${e.message}`);
  }
});
