import * as THREE from 'three';

/**
 * BloodDecalSystem - OPTIMIZED
 * Uses simple PlaneGeometry instead of expensive DecalGeometry
 * Shares textures and uses instancing for better performance
 */
interface DecalEntry {
  mesh: THREE.Mesh;
  createdAt: number;
}

export class BloodDecalSystem {
  private scene: THREE.Scene;
  private decals: DecalEntry[] = [];
  private bloodTextures: THREE.Texture[] = [];
  private sharedGeometry: THREE.PlaneGeometry;
  private decalLifetime: number = 30; // Reduced from 60 seconds
  private maxDecals: number = 100; // Cap total decals

  // Pre-allocated vectors (avoid GC pressure)
  private readonly _tempOffset: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempDecalPos: THREE.Vector3 = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Create ONE shared geometry for all decals
    this.sharedGeometry = new THREE.PlaneGeometry(1, 1);
    this.sharedGeometry.rotateX(-Math.PI / 2); // Flat on ground

    this.createBloodTextures();
  }

  /**
   * Create procedural blood splatter textures (only 3 variations)
   */
  private createBloodTextures(): void {
    const textureCount = 3; // Reduced from 5

    for (let i = 0; i < textureCount; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 256; // Reduced from 512
      canvas.height = 256;
      const ctx = canvas.getContext('2d')!;

      ctx.clearRect(0, 0, 256, 256);

      const seed = i * 12345;
      this.drawBloodSplatter(ctx, 128, 128, 100 + Math.random() * 40, seed);

      // Fewer droplets
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
   */
  addBloodDecal(position: THREE.Vector3, size: number = 2.0): void {
    // Enforce max decals - remove oldest if at limit
    if (this.decals.length >= this.maxDecals) {
      const oldest = this.decals.shift()!;
      this.scene.remove(oldest.mesh);
      (oldest.mesh.material as THREE.Material).dispose();
    }

    // Random texture
    const texture = this.bloodTextures[Math.floor(Math.random() * this.bloodTextures.length)];

    // Create material (shares texture reference)
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    });

    // Random size variation
    const decalSize = size * (0.8 + Math.random() * 0.7);

    // Create mesh using shared geometry
    const decalMesh = new THREE.Mesh(this.sharedGeometry, material);
    decalMesh.scale.set(decalSize, decalSize, decalSize);
    decalMesh.position.set(position.x, 0.01, position.z);
    decalMesh.rotation.y = Math.random() * Math.PI * 2;

    this.scene.add(decalMesh);
    this.decals.push({
      mesh: decalMesh,
      createdAt: Date.now() / 1000,
    });
  }

  /**
   * Add blood spray (multiple small decals in a direction)
   */
  addBloodSpray(position: THREE.Vector3, direction: THREE.Vector3, count: number = 5): void {
    // Reduced count for performance
    const actualCount = Math.min(count, 3);

    for (let i = 0; i < actualCount; i++) {
      const mult = Math.random() * 2;
      // Reuse pre-allocated vectors instead of clone()
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

    // Remove expired decals
    while (this.decals.length > 0 && currentTime - this.decals[0].createdAt > this.decalLifetime) {
      const entry = this.decals.shift()!;
      this.scene.remove(entry.mesh);
      (entry.mesh.material as THREE.Material).dispose();
    }
  }

  /**
   * Clear all decals
   */
  clear(): void {
    for (const entry of this.decals) {
      this.scene.remove(entry.mesh);
      (entry.mesh.material as THREE.Material).dispose();
    }
    this.decals = [];
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clear();
    this.sharedGeometry.dispose();
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
