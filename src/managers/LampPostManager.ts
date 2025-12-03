import * as THREE from 'three';
import { CITY_CONFIG } from '../constants';

interface LampPostInstance {
  mesh: THREE.Group;
  gridX: number;
  gridZ: number;
}

/**
 * LampPostManager
 *
 * Manages Christmas lamp posts placed at street intersections.
 * Uses a pool of reusable lamp posts that reposition as player moves.
 * Lamp posts appear at odd grid coordinates (where 4 stalls meet).
 *
 * Uses procedural geometry instead of GLB model for performance.
 */
export class LampPostManager {
  private scene: THREE.Scene;

  // Pool of reusable lamp posts (9 posts in a 3x3 pattern around player)
  private lampPosts: LampPostInstance[] = [];
  private initialized = false;

  // Grid cell size (same as BuildingManager)
  private cellWidth: number;
  private cellDepth: number;

  // Track current base position to detect when to update
  private currentBaseX = Infinity;
  private currentBaseZ = Infinity;

  // Shared geometry and materials (reused for all lamp posts)
  private poleGeometry: THREE.CylinderGeometry | null = null;
  private poleMaterial: THREE.MeshStandardMaterial | null = null;
  private lampGeometry: THREE.SphereGeometry | null = null;
  private lampMaterial: THREE.MeshStandardMaterial | null = null;
  private bracketGeometry: THREE.BoxGeometry | null = null;

  // Lamp post dimensions
  private readonly POST_HEIGHT = 6.0;
  private readonly POST_RADIUS = 0.12;
  private readonly LAMP_RADIUS = 0.35;

  // Light settings - 2x intensity (no building lights, only lamp posts)
  private readonly LIGHT_INTENSITY = 100;
  private readonly LIGHT_DISTANCE = 60;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Calculate grid cell size (same as BuildingManager)
    this.cellWidth = CITY_CONFIG.BUILDING_WIDTH + CITY_CONFIG.STREET_WIDTH;
    this.cellDepth = CITY_CONFIG.BUILDING_WIDTH + CITY_CONFIG.STREET_WIDTH;

    this.createSharedGeometry();
  }

  /**
   * Create shared geometry and materials (reused by all lamp posts)
   */
  private createSharedGeometry(): void {
    // Pole - dark iron/metal
    this.poleGeometry = new THREE.CylinderGeometry(
      this.POST_RADIUS,
      this.POST_RADIUS * 1.3, // Slightly wider at base
      this.POST_HEIGHT,
      8 // Low poly
    );
    this.poleMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.7,
      metalness: 0.3,
    });

    // Lamp globe - warm glowing
    this.lampGeometry = new THREE.SphereGeometry(this.LAMP_RADIUS, 8, 6);
    this.lampMaterial = new THREE.MeshStandardMaterial({
      color: 0xffdd88,
      emissive: 0xffaa44,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.0,
    });

    // Bracket connecting lamp to pole
    this.bracketGeometry = new THREE.BoxGeometry(0.4, 0.08, 0.08);
  }

  /**
   * Create a single lamp post mesh (procedural)
   */
  private createLampPostMesh(): THREE.Group {
    const group = new THREE.Group();

    // Main pole
    const pole = new THREE.Mesh(this.poleGeometry!, this.poleMaterial!);
    pole.position.y = this.POST_HEIGHT / 2;
    pole.castShadow = false;
    pole.receiveShadow = false;
    group.add(pole);

    // Decorative base ring
    const baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(this.POST_RADIUS * 1.5, 0.05, 6, 12),
      this.poleMaterial!
    );
    baseRing.position.y = 0.1;
    baseRing.rotation.x = Math.PI / 2;
    group.add(baseRing);

    // Top cap
    const topCap = new THREE.Mesh(
      new THREE.ConeGeometry(this.POST_RADIUS * 1.2, 0.2, 8),
      this.poleMaterial!
    );
    topCap.position.y = this.POST_HEIGHT + 0.1;
    group.add(topCap);

    // Bracket arm
    const bracket = new THREE.Mesh(this.bracketGeometry!, this.poleMaterial!);
    bracket.position.set(0.25, this.POST_HEIGHT - 0.3, 0);
    group.add(bracket);

    // Lamp globe
    const lamp = new THREE.Mesh(this.lampGeometry!, this.lampMaterial!);
    lamp.position.set(0.5, this.POST_HEIGHT - 0.5, 0);
    group.add(lamp);

    // Add a second lamp on opposite side for symmetry
    const bracket2 = new THREE.Mesh(this.bracketGeometry!, this.poleMaterial!);
    bracket2.position.set(-0.25, this.POST_HEIGHT - 0.3, 0);
    group.add(bracket2);

    const lamp2 = new THREE.Mesh(this.lampGeometry!, this.lampMaterial!);
    lamp2.position.set(-0.5, this.POST_HEIGHT - 0.5, 0);
    group.add(lamp2);

    // Point light attached to the lamp post - moves with it when repositioned
    const pointLight = new THREE.PointLight(0xffaa44, this.LIGHT_INTENSITY, this.LIGHT_DISTANCE, 1.2);
    pointLight.position.set(0, this.POST_HEIGHT - 0.3, 0);
    pointLight.castShadow = false; // Shadows are expensive - disabled
    group.add(pointLight);

    // Christmas decoration - simple garland rings
    const garlandMaterial = new THREE.MeshStandardMaterial({
      color: 0x228b22, // Forest green
      roughness: 0.8,
    });

    // Garland wreath at top
    const wreath = new THREE.Mesh(
      new THREE.TorusGeometry(0.25, 0.06, 6, 12),
      garlandMaterial
    );
    wreath.position.y = this.POST_HEIGHT - 0.1;
    wreath.rotation.x = Math.PI / 2;
    group.add(wreath);

    // Red bow on wreath
    const bowMaterial = new THREE.MeshStandardMaterial({
      color: 0xcc2222,
      roughness: 0.6,
    });
    const bow = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.1, 0.08),
      bowMaterial
    );
    bow.position.set(0, this.POST_HEIGHT - 0.1, 0.25);
    group.add(bow);

    return group;
  }

  /**
   * Initialize the pool of 9 lamp posts (3x3 grid pattern)
   */
  private initializeLampPosts(): void {
    if (this.initialized) return;

    // Create 9 lamp posts - each has its own light attached
    for (let i = 0; i < 9; i++) {
      const mesh = this.createLampPostMesh();
      mesh.position.set(0, 0, 0); // Will be repositioned on first update
      this.scene.add(mesh);

      this.lampPosts.push({
        mesh,
        gridX: 1,
        gridZ: 1,
      });
    }

    this.initialized = true;
  }

  /**
   * Reposition a lamp post to a new grid position
   */
  private repositionLampPost(lampPost: LampPostInstance, newGridX: number, newGridZ: number): void {
    const worldX = newGridX * this.cellWidth;
    const worldZ = newGridZ * this.cellDepth;

    lampPost.mesh.position.set(worldX, 0, worldZ);
    lampPost.gridX = newGridX;
    lampPost.gridZ = newGridZ;
  }

  // Light culling distance squared
  private readonly LIGHT_CULL_DISTANCE_SQ = 35 * 35;

  /**
   * Update lamp posts based on player position
   * Uses pooling - only repositions when player crosses grid boundaries
   * Lights are attached to meshes, so they move together (no popping)
   */
  update(playerPosition: THREE.Vector3): void {
    if (!this.initialized) {
      this.initializeLampPosts();
    }

    // Cull lamp post lights based on distance
    for (const lampPost of this.lampPosts) {
      const pos = lampPost.mesh.position;
      const dx = playerPosition.x - pos.x;
      const dz = playerPosition.z - pos.z;
      const distanceSq = dx * dx + dz * dz;

      // Find the point light child and toggle visibility
      const light = lampPost.mesh.children.find(c => c.type === 'PointLight');
      if (light) {
        light.visible = distanceSq < this.LIGHT_CULL_DISTANCE_SQ;
      }
    }

    // Calculate player's grid cell
    const playerGridX = Math.floor(playerPosition.x / this.cellWidth);
    const playerGridZ = Math.floor(playerPosition.z / this.cellDepth);

    // Find nearest odd grid coordinates (lamp post positions)
    const nearestOddX = playerGridX % 2 === 0 ? playerGridX + 1 : playerGridX;
    const nearestOddZ = playerGridZ % 2 === 0 ? playerGridZ + 1 : playerGridZ;

    // Calculate base position for 3x3 grid of lamp posts centered on player
    const baseX = nearestOddX - 2;
    const baseZ = nearestOddZ - 2;

    // Only reposition lamp post meshes if base has changed
    if (baseX === this.currentBaseX && baseZ === this.currentBaseZ) {
      return;
    }

    // Calculate target positions for 9 lamp posts (3x3 grid at odd coordinates)
    const targetPositions: { gridX: number; gridZ: number }[] = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        targetPositions.push({
          gridX: baseX + i * 2,
          gridZ: baseZ + j * 2,
        });
      }
    }

    // Keep lamp posts that are already on a target
    const remainingTargets = [...targetPositions];
    const needsRepositioning: LampPostInstance[] = [];

    for (const lampPost of this.lampPosts) {
      const idx = remainingTargets.findIndex(
        t => t.gridX === lampPost.gridX && t.gridZ === lampPost.gridZ
      );
      if (idx !== -1) {
        remainingTargets.splice(idx, 1);
      } else {
        needsRepositioning.push(lampPost);
      }
    }

    // Reposition only the lamp posts that need it
    for (let i = 0; i < needsRepositioning.length; i++) {
      const target = remainingTargets[i];
      if (target) {
        this.repositionLampPost(needsRepositioning[i], target.gridX, target.gridZ);
      }
    }

    this.currentBaseX = baseX;
    this.currentBaseZ = baseZ;
  }

  /**
   * Clear all lamp posts
   */
  clear(): void {
    for (const lampPost of this.lampPosts) {
      this.scene.remove(lampPost.mesh);
    }
    this.lampPosts = [];

    this.initialized = false;
    this.currentBaseX = Infinity;
    this.currentBaseZ = Infinity;
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.clear();
    this.poleGeometry?.dispose();
    this.poleMaterial?.dispose();
    this.lampGeometry?.dispose();
    this.lampMaterial?.dispose();
    this.bracketGeometry?.dispose();
  }

  /**
   * Get lamp post count (for debugging)
   */
  getLampPostCount(): number {
    return this.lampPosts.length;
  }

  /**
   * Set visibility of all lamp posts (for Rampage Dimension effect)
   */
  setAllVisible(visible: boolean): void {
    for (const lampPost of this.lampPosts) {
      lampPost.mesh.visible = visible;
    }
  }
}
