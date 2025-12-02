import * as THREE from 'three';

/**
 * InstancedBlobShadows
 *
 * Manages all blob shadows using a single InstancedMesh for optimal performance.
 * Instead of 40+ draw calls (one per shadow), this batches them into 1 draw call.
 *
 * Usage:
 * 1. Create manager with max shadow count
 * 2. Reserve a shadow index for each entity
 * 3. Update shadow position each frame
 * 4. Release shadow index when entity is destroyed
 */
export class InstancedBlobShadows {
  private instancedMesh: THREE.InstancedMesh;
  private geometry: THREE.CircleGeometry;
  private material: THREE.MeshBasicMaterial;

  // Index pool management
  private freeIndices: number[] = [];
  private maxInstances: number;

  // Temporary matrix for updates
  private tempMatrix = new THREE.Matrix4();
  private tempPosition = new THREE.Vector3();
  private tempScale = new THREE.Vector3();
  // PERF: Pre-allocated identity quaternion (avoids allocation per shadow update)
  private readonly _identityQuaternion = new THREE.Quaternion();

  constructor(scene: THREE.Scene, maxInstances: number = 100) {
    this.maxInstances = maxInstances;

    // Create shared geometry
    this.geometry = new THREE.CircleGeometry(1, 16);
    this.geometry.rotateX(-Math.PI / 2); // Lay flat on ground

    // Create gradient texture for soft edges
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
    gradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.45)');
    gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    const gradientTexture = new THREE.CanvasTexture(canvas);

    // Create shared material
    this.material = new THREE.MeshBasicMaterial({
      map: gradientTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Create instanced mesh
    this.instancedMesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      maxInstances
    );
    this.instancedMesh.castShadow = false;
    this.instancedMesh.receiveShadow = false;
    this.instancedMesh.renderOrder = -1;

    // Initialize all indices as free
    for (let i = 0; i < maxInstances; i++) {
      this.freeIndices.push(i);
      // Hide unused instances by scaling to 0
      this.tempMatrix.makeScale(0, 0, 0);
      this.instancedMesh.setMatrixAt(i, this.tempMatrix);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;

    scene.add(this.instancedMesh);
  }

  /**
   * Reserve a shadow index for an entity
   * Returns -1 if no free indices available
   */
  reserveIndex(): number {
    if (this.freeIndices.length === 0) {
      console.warn('[InstancedBlobShadows] No free shadow indices available');
      return -1;
    }
    return this.freeIndices.pop()!;
  }

  /**
   * Release a shadow index back to the pool
   */
  releaseIndex(index: number): void {
    if (index < 0 || index >= this.maxInstances) return;

    // Hide the shadow by scaling to 0
    this.tempMatrix.makeScale(0, 0, 0);
    this.instancedMesh.setMatrixAt(index, this.tempMatrix);
    this.instancedMesh.instanceMatrix.needsUpdate = true;

    this.freeIndices.push(index);
  }

  /**
   * Update shadow position and scale
   */
  updateShadow(index: number, x: number, z: number, radius: number, yOffset: number = 0.01): void {
    if (index < 0 || index >= this.maxInstances) return;

    this.tempPosition.set(x, yOffset, z);
    this.tempScale.set(radius, radius, radius);

    // PERF: Reuse pre-allocated identity quaternion
    this.tempMatrix.compose(
      this.tempPosition,
      this._identityQuaternion,
      this.tempScale
    );

    this.instancedMesh.setMatrixAt(index, this.tempMatrix);
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Get the instanced mesh (for debugging/inspection)
   */
  getMesh(): THREE.InstancedMesh {
    return this.instancedMesh;
  }

  /**
   * Get count of active shadows
   */
  getActiveCount(): number {
    return this.maxInstances - this.freeIndices.length;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.instancedMesh.parent?.remove(this.instancedMesh);
  }
}
