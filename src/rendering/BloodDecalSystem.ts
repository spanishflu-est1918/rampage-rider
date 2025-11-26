import * as THREE from 'three';

/**
 * BloodDecalSystem - INSTANCED VERSION
 * Uses InstancedMesh for minimal draw calls (3 instead of 100)
 * One InstancedMesh per texture variant
 */
interface DecalData {
  textureIndex: number;
  instanceIndex: number;
  createdAt: number;
}

export class BloodDecalSystem {
  private scene: THREE.Scene;
  private decals: DecalData[] = [];
  private bloodTextures: THREE.Texture[] = [];
  private sharedMaterials: THREE.MeshBasicMaterial[] = [];
  private sharedGeometry: THREE.PlaneGeometry;
  private instancedMeshes: THREE.InstancedMesh[] = []; // One per texture
  private decalLifetime: number = 30;
  private maxDecals: number = 100;
  private maxDecalsPerTexture: number; // Will be calculated

  // Instance tracking per texture
  private instanceCounts: number[] = []; // Current count per texture
  private freeIndices: number[][] = []; // Pool of free indices per texture

  // Pre-allocated objects
  private readonly _tempOffset: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempDecalPos: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempMatrix: THREE.Matrix4 = new THREE.Matrix4();
  private readonly _tempPosition: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempQuaternion: THREE.Quaternion = new THREE.Quaternion();
  private readonly _tempScale: THREE.Vector3 = new THREE.Vector3();
  private readonly _zeroScale: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private readonly _flatRotation: THREE.Quaternion = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    -Math.PI / 2
  );

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Create ONE shared geometry for all decals
    this.sharedGeometry = new THREE.PlaneGeometry(1, 1);
    // Don't rotate geometry - we'll handle rotation per instance

    this.createBloodTextures();
    this.createSharedMaterials();
    this.createInstancedMeshes();
  }

  /**
   * Create procedural blood splatter textures (only 3 variations)
   */
  private createBloodTextures(): void {
    const textureCount = 3;

    for (let i = 0; i < textureCount; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d')!;

      ctx.clearRect(0, 0, 256, 256);

      const seed = i * 12345;
      this.drawBloodSplatter(ctx, 128, 128, 100 + Math.random() * 40, seed);

      const dropletCount = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < dropletCount; j++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 80 + Math.random() * 60;
        const x = 128 + Math.cos(angle) * distance;
        const y = 128 + Math.sin(angle) * distance;
        const size = 10 + Math.random() * 20;
        this.drawBloodSplatter(ctx, x, y, size, seed + j);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      this.bloodTextures.push(texture);
    }
  }

  /**
   * Create shared materials (one per texture variant)
   */
  private createSharedMaterials(): void {
    for (const texture of this.bloodTextures) {
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        opacity: 0.9,
        side: THREE.DoubleSide,
      });
      this.sharedMaterials.push(material);
    }
  }

  /**
   * Create InstancedMesh for each texture (3 meshes total = 3 draw calls)
   */
  private createInstancedMeshes(): void {
    const textureCount = this.bloodTextures.length;
    this.maxDecalsPerTexture = Math.ceil(this.maxDecals / textureCount) + 10; // Extra buffer

    for (let i = 0; i < textureCount; i++) {
      const instancedMesh = new THREE.InstancedMesh(
        this.sharedGeometry,
        this.sharedMaterials[i],
        this.maxDecalsPerTexture
      );
      instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instancedMesh.count = 0; // Start with 0 visible instances
      instancedMesh.frustumCulled = false; // Decals are flat on ground, culling can be weird
      instancedMesh.renderOrder = -1; // Render before other objects

      // Initialize all instances to zero scale (invisible)
      for (let j = 0; j < this.maxDecalsPerTexture; j++) {
        this._tempMatrix.compose(this._tempPosition.set(0, -100, 0), this._flatRotation, this._zeroScale);
        instancedMesh.setMatrixAt(j, this._tempMatrix);
      }
      instancedMesh.instanceMatrix.needsUpdate = true;

      this.scene.add(instancedMesh);
      this.instancedMeshes.push(instancedMesh);
      this.instanceCounts.push(0);
      this.freeIndices.push([]);
    }
  }

  /**
   * Draw a single blood splatter with organic shape
   */
  private drawBloodSplatter(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    seed: number
  ): void {
    const random = (n: number) => {
      const x = Math.sin(seed + n) * 10000;
      return x - Math.floor(x);
    };

    const colors = [
      'rgba(60, 0, 0, 0.95)',
      'rgba(70, 15, 15, 0.9)',
      'rgba(50, 0, 0, 1.0)',
    ];

    ctx.save();
    ctx.translate(x, y);

    const blobCount = 6 + Math.floor(random(1) * 4);
    for (let i = 0; i < blobCount; i++) {
      const angle = (i / blobCount) * Math.PI * 2;
      const radiusVariation = 0.6 + random(i * 10) * 0.7;
      const radius = size * radiusVariation;
      const offsetX = Math.cos(angle) * size * 0.3 * random(i * 20);
      const offsetY = Math.sin(angle) * size * 0.3 * random(i * 30);

      const gradient = ctx.createRadialGradient(offsetX, offsetY, 0, offsetX, offsetY, radius);
      const color = colors[Math.floor(random(i * 40) * colors.length)];
      gradient.addColorStop(0, color);
      gradient.addColorStop(0.7, color.replace(/[0-9.]+\)/, '0.4)'));
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(offsetX, offsetY, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Set the ground mesh (kept for API compatibility, but not used)
   */
  setGroundMesh(_mesh: THREE.Mesh): void {
    // Not needed with PlaneGeometry approach
  }

  /**
   * Add blood decal at world position
   * Uses instancing - just updates matrix in existing InstancedMesh
   */
  addBloodDecal(position: THREE.Vector3, size: number = 2.0): void {
    // Enforce max decals - remove oldest if at limit
    while (this.decals.length >= this.maxDecals) {
      this.removeOldestDecal();
    }

    // Random texture
    const textureIndex = Math.floor(Math.random() * this.sharedMaterials.length);

    // Get or allocate instance index for this texture's mesh
    let instanceIndex: number;
    if (this.freeIndices[textureIndex].length > 0) {
      instanceIndex = this.freeIndices[textureIndex].pop()!;
    } else {
      instanceIndex = this.instanceCounts[textureIndex];
      this.instanceCounts[textureIndex]++;
    }

    // Safety check
    if (instanceIndex >= this.maxDecalsPerTexture) {
      console.warn('[BloodDecalSystem] Max instances reached for texture', textureIndex);
      return;
    }

    // Random size variation
    const decalSize = size * (0.8 + Math.random() * 0.7);

    // Create rotation quaternion (flat on ground + random Y rotation)
    const yRotation = Math.random() * Math.PI * 2;
    this._tempQuaternion
      .setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), yRotation));

    // Set instance matrix
    this._tempPosition.set(position.x, 0.01, position.z);
    this._tempScale.set(decalSize, decalSize, 1);
    this._tempMatrix.compose(this._tempPosition, this._tempQuaternion, this._tempScale);

    const mesh = this.instancedMeshes[textureIndex];
    mesh.setMatrixAt(instanceIndex, this._tempMatrix);
    mesh.instanceMatrix.needsUpdate = true;

    // Update visible count if needed
    if (instanceIndex >= mesh.count) {
      mesh.count = instanceIndex + 1;
    }

    // Track decal
    this.decals.push({
      textureIndex,
      instanceIndex,
      createdAt: Date.now() / 1000,
    });
  }

  /**
   * Remove oldest decal (hide its instance)
   */
  private removeOldestDecal(): void {
    if (this.decals.length === 0) return;

    const oldest = this.decals.shift()!;

    // Hide this instance by setting scale to 0
    this._tempMatrix.compose(
      this._tempPosition.set(0, -100, 0),
      this._flatRotation,
      this._zeroScale
    );

    const mesh = this.instancedMeshes[oldest.textureIndex];
    mesh.setMatrixAt(oldest.instanceIndex, this._tempMatrix);
    mesh.instanceMatrix.needsUpdate = true;

    // Return index to free pool for reuse
    this.freeIndices[oldest.textureIndex].push(oldest.instanceIndex);
  }

  /**
   * Add blood spray (multiple small decals in a direction)
   */
  addBloodSpray(position: THREE.Vector3, direction: THREE.Vector3, count: number = 5): void {
    const actualCount = Math.min(count, 3);

    for (let i = 0; i < actualCount; i++) {
      const mult = Math.random() * 2;
      this._tempOffset.set(
        direction.x * mult + (Math.random() - 0.5) * 1.5,
        0,
        direction.z * mult + (Math.random() - 0.5) * 1.5
      );

      this._tempDecalPos.set(
        position.x + this._tempOffset.x,
        0.01,
        position.z + this._tempOffset.z
      );

      this.addBloodDecal(this._tempDecalPos, 0.5 + Math.random() * 0.8);
    }
  }

  /**
   * Update system - removes expired decals
   */
  update(): void {
    const currentTime = Date.now() / 1000;

    while (this.decals.length > 0 && currentTime - this.decals[0].createdAt > this.decalLifetime) {
      this.removeOldestDecal();
    }
  }

  /**
   * Clear all decals
   */
  clear(): void {
    // Reset all instance matrices to hidden
    for (let t = 0; t < this.instancedMeshes.length; t++) {
      const mesh = this.instancedMeshes[t];
      for (let i = 0; i < this.maxDecalsPerTexture; i++) {
        this._tempMatrix.compose(this._tempPosition.set(0, -100, 0), this._flatRotation, this._zeroScale);
        mesh.setMatrixAt(i, this._tempMatrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = 0;
      this.instanceCounts[t] = 0;
      this.freeIndices[t] = [];
    }
    this.decals = [];
  }

  /**
   * Dispose of all resources (only call on game shutdown)
   */
  dispose(): void {
    this.clear();

    // Remove instanced meshes from scene
    for (const mesh of this.instancedMeshes) {
      this.scene.remove(mesh);
      mesh.dispose();
    }
    this.instancedMeshes = [];

    this.sharedGeometry.dispose();

    for (const material of this.sharedMaterials) {
      material.dispose();
    }
    this.sharedMaterials = [];

    for (const texture of this.bloodTextures) {
      texture.dispose();
    }
    this.bloodTextures = [];
  }

  /**
   * Get decal count (for debugging)
   */
  getDecalCount(): number {
    return this.decals.length;
  }
}
