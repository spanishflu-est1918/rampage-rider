import * as THREE from 'three';

// Shared resources for blob shadows (created once, reused by all instances)
let sharedGeometry: THREE.CircleGeometry | null = null;
let sharedMaterial: THREE.MeshBasicMaterial | null = null;

function initBlobShadowResources(): void {
  if (sharedGeometry) return;

  // Create circular geometry (shared by all instances)
  sharedGeometry = new THREE.CircleGeometry(1, 16);
  sharedGeometry.rotateX(-Math.PI / 2); // Lay flat on ground

  // Create gradient texture for soft edges
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  // Radial gradient: dark center, transparent edges
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  gradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.45)');
  gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.2)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const gradientTexture = new THREE.CanvasTexture(canvas);

  // Create shared material
  sharedMaterial = new THREE.MeshBasicMaterial({
    map: gradientTexture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * BlobShadow - just a type alias for THREE.Mesh
 */
export type BlobShadow = THREE.Mesh;

/**
 * Create a blob shadow mesh for characters
 */
export function createBlobShadow(radius: number = 0.5, yOffset: number = 0.01): THREE.Mesh {
  initBlobShadowResources();

  const mesh = new THREE.Mesh(sharedGeometry!, sharedMaterial!);

  // Scale to desired radius
  mesh.scale.setScalar(radius);

  // Position slightly above ground to prevent z-fighting
  mesh.position.y = yOffset;

  // Shadows don't cast or receive real shadows
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  // Render order to ensure shadows render before characters
  mesh.renderOrder = -1;

  return mesh;
}

// Shared material for building shadows
let buildingShadowMaterial: THREE.MeshBasicMaterial | null = null;

function initBuildingShadowMaterial(): THREE.MeshBasicMaterial {
  if (!buildingShadowMaterial) {
    buildingShadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
  return buildingShadowMaterial;
}

/**
 * BuildingShadow - just a type alias for THREE.Mesh
 */
export type BuildingShadow = THREE.Mesh;

/**
 * Create a building shadow mesh
 * Creates a shape that covers the building footprint plus an extended shadow
 * in the light direction (simulating sun casting shadow)
 */
export function createBuildingShadow(
  width: number,
  depth: number,
  lightDirection: THREE.Vector3 = new THREE.Vector3(1, 0, 1).normalize(),
  shadowLength: number = 3
): THREE.Mesh {
  const material = initBuildingShadowMaterial();

  const hw = width / 2;
  const hd = depth / 2;

  // Shadow offset in light direction
  const offsetX = lightDirection.x * shadowLength;
  const offsetZ = lightDirection.z * shadowLength;

  // Create shadow shape: building footprint + extended projection
  // Shape is drawn in X,Y plane, then rotated to lay flat (X,Z)
  // After rotation: shape X → world X, shape Y → world Z
  const shape = new THREE.Shape();

  // Start at back-left corner of building, go clockwise
  shape.moveTo(-hw, -hd);           // back-left
  shape.lineTo(-hw, hd);            // front-left
  shape.lineTo(hw, hd);             // front-right
  shape.lineTo(hw, -hd);            // back-right
  // Now extend to shadow projection (offset corners)
  shape.lineTo(hw + offsetX, -hd + offsetZ);   // back-right shadow
  shape.lineTo(-hw + offsetX, -hd + offsetZ);  // back-left shadow
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2); // Lay flat on ground

  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.y = 0.02;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -2;

  return mesh;
}
