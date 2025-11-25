import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { CITY_CONFIG } from '../constants';
import { AssetLoader } from '../core/AssetLoader';

/**
 * BuildingManager
 *
 * Manages infinite procedural city generation using modulo-based grid system.
 * Uses Christmas market stall GLB models arranged in a grid pattern.
 * - Infinite generation based on player position
 */
export class BuildingManager {
  private scene: THREE.Scene;
  private world: RAPIER.World;

  // Track visible buildings by grid coordinates "x,z"
  private buildings: Map<string, {
    mesh: THREE.Group;
    body: RAPIER.RigidBody;
  }> = new Map();

  // Grid cell size (building + street)
  private cellWidth: number;
  private cellDepth: number;

  // Model template
  private modelTemplate: THREE.Group | null = null;
  private modelReady: boolean = false;

  // Model dimensions (from GLB inspection)
  private readonly MODEL_WIDTH = 6.1;  // X: -3.04 to 3.04
  private readonly MODEL_HEIGHT = 3.8; // Y: 0 to 3.8
  private readonly MODEL_DEPTH = 8.0;  // Z: -3.96 to 4.03

  constructor(scene: THREE.Scene, world: RAPIER.World) {
    this.scene = scene;
    this.world = world;

    // Calculate grid cell size (building dimension + street gap)
    this.cellWidth = CITY_CONFIG.BUILDING_WIDTH + CITY_CONFIG.STREET_WIDTH;
    this.cellDepth = CITY_CONFIG.BUILDING_DEPTH + CITY_CONFIG.STREET_WIDTH;

    // Load the Christmas market model
    this.loadModel();

    console.log('[BuildingManager] Created with grid cells:', this.cellWidth, 'x', this.cellDepth);
  }

  /**
   * Load the Christmas market GLB model
   */
  private loadModel(): void {
    const assetLoader = AssetLoader.getInstance();
    const gltf = assetLoader.getModel('/assets/props/christmas-market.glb');

    if (gltf) {
      this.modelTemplate = gltf.scene.clone();

      // Setup shadows on template
      this.modelTemplate.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.modelReady = true;
      console.log('[BuildingManager] Christmas market model loaded');
    } else {
      console.warn('[BuildingManager] Christmas market model not in cache, will retry');
      // Retry after a delay
      setTimeout(() => this.loadModel(), 500);
    }
  }

  /**
   * Update visible buildings based on player position
   */
  update(playerPosition: THREE.Vector3): void {
    // Wait for model to load
    if (!this.modelReady) return;

    // Calculate player's grid cell
    const playerGridX = Math.floor(playerPosition.x / this.cellWidth);
    const playerGridZ = Math.floor(playerPosition.z / this.cellDepth);

    // Track which buildings should be visible
    const visibleKeys = new Set<string>();

    // Check all grid cells within render distance
    for (let x = playerGridX - CITY_CONFIG.RENDER_DISTANCE; x <= playerGridX + CITY_CONFIG.RENDER_DISTANCE; x++) {
      for (let z = playerGridZ - CITY_CONFIG.RENDER_DISTANCE; z <= playerGridZ + CITY_CONFIG.RENDER_DISTANCE; z++) {
        // Only place buildings at even grid coordinates (creates checkerboard with streets)
        if (this.shouldHaveBuilding(x, z)) {
          const key = `${x},${z}`;
          visibleKeys.add(key);

          // Create building if it doesn't exist yet
          if (!this.buildings.has(key)) {
            this.createBuilding(x, z);
          }
        }
      }
    }

    // Remove buildings that are no longer visible
    for (const [key, building] of this.buildings) {
      if (!visibleKeys.has(key)) {
        this.removeBuilding(key, building);
      }
    }
  }

  /**
   * Determine if a building should exist at this grid coordinate
   * Buildings at even coordinates, streets at odd
   */
  private shouldHaveBuilding(gridX: number, gridZ: number): boolean {
    // Checkerboard pattern: both coordinates must be even
    return (gridX % 2 === 0) && (gridZ % 2 === 0);
  }

  /**
   * Create a building at the given grid coordinate
   */
  private createBuilding(gridX: number, gridZ: number): void {
    if (!this.modelTemplate) return;

    const key = `${gridX},${gridZ}`;

    // Calculate world position from grid coordinate
    const worldX = gridX * this.cellWidth;
    const worldZ = gridZ * this.cellDepth;

    // Clone the model template
    const mesh = this.modelTemplate.clone();

    // Scale to match building depth exactly (length of the stall)
    const scale = CITY_CONFIG.BUILDING_DEPTH / this.MODEL_DEPTH;
    mesh.scale.setScalar(scale);

    // Position the model
    mesh.position.set(worldX, 0, worldZ);

    // Rotate 90 degrees to face the street
    mesh.rotation.y = Math.PI / 2;

    this.scene.add(mesh);

    // Create physics collider (static) with collision groups
    const colliderHeight = this.MODEL_HEIGHT * scale;
    const colliderWidth = (this.MODEL_WIDTH * scale) / 2;
    const colliderDepth = (this.MODEL_DEPTH * scale) / 2;

    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(worldX, colliderHeight / 2, worldZ);
    const body = this.world.createRigidBody(bodyDesc);

    // Building collision groups:
    // Membership: 0x0040 (BUILDING group)
    // Filter: 0x009E (PLAYER=0x0002, PEDESTRIAN=0x0004, COP=0x0008, DEBRIS=0x0010, VEHICLE=0x0080)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      colliderWidth,
      colliderHeight / 2,
      colliderDepth
    )
      .setCollisionGroups(0x009E0040);

    this.world.createCollider(colliderDesc, body);

    // Store building
    this.buildings.set(key, { mesh, body });
  }

  /**
   * Remove a building
   */
  private removeBuilding(key: string, building: { mesh: THREE.Group; body: RAPIER.RigidBody }): void {
    // Remove from scene
    this.scene.remove(building.mesh);

    // Dispose mesh resources
    building.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        // Don't dispose materials as they're shared from the template
      }
    });

    // Remove physics body
    this.world.removeRigidBody(building.body);

    // Remove from tracking
    this.buildings.delete(key);
  }

  /**
   * Clear all buildings
   */
  clear(): void {
    for (const [key, building] of this.buildings) {
      this.removeBuilding(key, building);
    }
    console.log('[BuildingManager] Cleared all buildings');
  }

  /**
   * Get building count (for debugging)
   */
  getBuildingCount(): number {
    return this.buildings.size;
  }
}
