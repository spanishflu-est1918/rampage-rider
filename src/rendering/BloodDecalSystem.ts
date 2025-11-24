import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

/**
 * BloodDecalSystem
 *
 * Creates persistent blood splatter decals on the ground using Three.js DecalGeometry.
 * Blood splatters project onto surfaces and stay there permanently.
 */
export class BloodDecalSystem {
  private scene: THREE.Scene;
  private decals: THREE.Mesh[] = [];
  private bloodTextures: THREE.Texture[] = [];
  private groundMesh: THREE.Mesh | null = null;
  private maxDecals: number = 100; // Limit for performance

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.createBloodTextures();
    console.log('[BloodDecalSystem] Created with', this.bloodTextures.length, 'blood textures');
  }

  /**
   * Create procedural blood splatter textures
   */
  private createBloodTextures(): void {
    const textureCount = 5; // Multiple variations

    for (let i = 0; i < textureCount; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d')!;

      // Clear canvas
      ctx.clearRect(0, 0, 512, 512);

      // Random seed for this texture
      const seed = i * 12345;

      // Create main splatter shape
      this.drawBloodSplatter(ctx, 256, 256, 180 + Math.random() * 80, seed);

      // Add smaller droplets around main splatter
      const dropletCount = 5 + Math.floor(Math.random() * 10);
      for (let j = 0; j < dropletCount; j++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 150 + Math.random() * 150;
        const x = 256 + Math.cos(angle) * distance;
        const y = 256 + Math.sin(angle) * distance;
        const size = 10 + Math.random() * 40;
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
    // Use seed for deterministic randomness
    const random = (n: number) => {
      const x = Math.sin(seed + n) * 10000;
      return x - Math.floor(x);
    };

    const colors = [
      'rgba(60, 0, 0, 0.95)',
      'rgba(70, 15, 15, 0.9)',
      'rgba(80, 10, 10, 0.85)',
      'rgba(50, 0, 0, 1.0)',
    ];

    ctx.save();
    ctx.translate(x, y);
    const blobCount = 8 + Math.floor(random(1) * 6);
    for (let i = 0; i < blobCount; i++) {
      const angle = (i / blobCount) * Math.PI * 2;
      const radiusVariation = 0.6 + random(i * 10) * 0.7;
      const radius = size * radiusVariation;
      const offsetX = Math.cos(angle) * size * 0.3 * random(i * 20);
      const offsetY = Math.sin(angle) * size * 0.3 * random(i * 30);

      const gradient = ctx.createRadialGradient(
        offsetX,
        offsetY,
        0,
        offsetX,
        offsetY,
        radius
      );

      const color = colors[Math.floor(random(i * 40) * colors.length)];
      gradient.addColorStop(0, color);
      gradient.addColorStop(0.7, color.replace(/[0-9.]+\)/, '0.4)'));
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(offsetX, offsetY, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    const streakCount = 3 + Math.floor(random(100) * 5);
    for (let i = 0; i < streakCount; i++) {
      const angle = random(i * 50) * Math.PI * 2;
      const length = size * (0.3 + random(i * 60) * 0.5);
      const startX = Math.cos(angle) * size * 0.5;
      const startY = Math.sin(angle) * size * 0.5;
      const endX = Math.cos(angle) * (size * 0.5 + length);
      const endY = Math.sin(angle) * (size * 0.5 + length);

      const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
      gradient.addColorStop(0, 'rgba(50, 0, 0, 0.8)');
      gradient.addColorStop(1, 'rgba(50, 0, 0, 0)');

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2 + random(i * 70) * 4;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Set the ground mesh for decal projection
   */
  setGroundMesh(mesh: THREE.Mesh): void {
    this.groundMesh = mesh;
    console.log('[BloodDecalSystem] Ground mesh set');
  }

  /**
   * Add blood decal at world position
   */
  addBloodDecal(position: THREE.Vector3, size: number = 2.0): void {
    if (!this.groundMesh) {
      console.warn('[BloodDecalSystem] No ground mesh set, cannot create decal');
      return;
    }

    // Random texture
    const texture = this.bloodTextures[Math.floor(Math.random() * this.bloodTextures.length)];

    // Create decal material
    const material = new THREE.MeshPhongMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4, // Prevent z-fighting
      normalScale: new THREE.Vector2(1, 1),
    });

    // Orientation (flat on ground, with random rotation)
    const orientation = new THREE.Euler();
    orientation.set(Math.PI / 2, 0, Math.random() * Math.PI * 2); // Rotate around Z for variation

    // Random size variation (0.8 to 1.5 of base size)
    const decalSize = new THREE.Vector3(
      size * (0.8 + Math.random() * 0.7),
      size * (0.8 + Math.random() * 0.7),
      size * (0.8 + Math.random() * 0.7)
    );

    // Create decal geometry projected onto ground
    const decalGeometry = new DecalGeometry(
      this.groundMesh,
      position,
      orientation,
      decalSize
    );

    const decalMesh = new THREE.Mesh(decalGeometry, material);
    decalMesh.renderOrder = this.decals.length; // Ensure proper layering

    // Add to scene
    this.scene.add(decalMesh);
    this.decals.push(decalMesh);

    // Remove oldest decal if we exceed max
    if (this.decals.length > this.maxDecals) {
      const oldDecal = this.decals.shift()!;
      this.scene.remove(oldDecal);
      oldDecal.geometry.dispose();
      (oldDecal.material as THREE.Material).dispose();
    }
  }

  /**
   * Add blood spray (multiple small decals in a direction)
   */
  addBloodSpray(position: THREE.Vector3, direction: THREE.Vector3, count: number = 5): void {
    for (let i = 0; i < count; i++) {
      // Spread along direction with random variation
      const offset = direction.clone()
        .multiplyScalar(Math.random() * 2)
        .add(new THREE.Vector3(
          (Math.random() - 0.5) * 1.5,
          0,
          (Math.random() - 0.5) * 1.5
        ));

      const decalPos = position.clone().add(offset);
      decalPos.y = 0.01; // Slightly above ground to ensure projection

      this.addBloodDecal(decalPos, 0.5 + Math.random() * 1.0);
    }
  }

  /**
   * Clear all decals
   */
  clear(): void {
    for (const decal of this.decals) {
      this.scene.remove(decal);
      decal.geometry.dispose();
      (decal.material as THREE.Material).dispose();
    }
    this.decals = [];
    console.log('[BloodDecalSystem] Cleared all decals');
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clear();
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
