import * as THREE from 'three';
import { CITY_CONFIG } from '../constants';
import { AssetLoader } from '../core/AssetLoader';

/**
 * LampPostManager
 *
 * Manages Christmas lamp posts placed at street intersections.
 * Lamp posts appear at odd grid coordinates (where 4 stalls meet).
 */
export class LampPostManager {
  private scene: THREE.Scene;

  // Track visible lamp posts by grid coordinates "x,z"
  private lampPosts: Map<string, THREE.Group> = new Map();

  // Grid cell size (same as BuildingManager)
  private cellWidth: number;
  private cellDepth: number;

  // Model template
  private modelTemplate: THREE.Group | null = null;
  private modelReady: boolean = false;

  // Model dimensions (from Blender inspection)
  // Original: 0.267 wide x 3.0 tall
  // Target height: 9 units (3x original size)
  private readonly TARGET_HEIGHT = 9.0;
  private readonly MODEL_HEIGHT = 3.0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Calculate grid cell size (same as BuildingManager)
    this.cellWidth = CITY_CONFIG.BUILDING_WIDTH + CITY_CONFIG.STREET_WIDTH;
    this.cellDepth = CITY_CONFIG.BUILDING_WIDTH + CITY_CONFIG.STREET_WIDTH;

    this.loadModel();
  }

  /**
   * Load the Christmas lamp post GLB model
   */
  private loadModel(): void {
    const assetLoader = AssetLoader.getInstance();
    const gltf = assetLoader.getModel('/models/christmas_lamp_post.glb');

    if (gltf) {
      this.modelTemplate = gltf.scene.clone();

      // Disable shadows on template (shadow mapping disabled for performance)
      this.modelTemplate.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });

      this.modelReady = true;
    } else {
      // Retry after a delay
      setTimeout(() => this.loadModel(), 500);
    }
  }

  /**
   * Update visible lamp posts based on player position
   */
  update(playerPosition: THREE.Vector3): void {
    if (!this.modelReady) return;

    // Calculate player's grid cell
    const playerGridX = Math.floor(playerPosition.x / this.cellWidth);
    const playerGridZ = Math.floor(playerPosition.z / this.cellDepth);

    // Track which lamp posts should be visible
    const visibleKeys = new Set<string>();

    // Check all grid cells within render distance
    for (let x = playerGridX - CITY_CONFIG.RENDER_DISTANCE; x <= playerGridX + CITY_CONFIG.RENDER_DISTANCE; x++) {
      for (let z = playerGridZ - CITY_CONFIG.RENDER_DISTANCE; z <= playerGridZ + CITY_CONFIG.RENDER_DISTANCE; z++) {
        // Lamp posts at odd grid coordinates (street intersections)
        if (this.shouldHaveLampPost(x, z)) {
          const key = `${x},${z}`;
          visibleKeys.add(key);

          // Create lamp post if it doesn't exist yet
          if (!this.lampPosts.has(key)) {
            this.createLampPost(x, z);
          }
        }
      }
    }

    // Remove lamp posts that are no longer visible
    for (const [key, lampPost] of this.lampPosts) {
      if (!visibleKeys.has(key)) {
        this.removeLampPost(key, lampPost);
      }
    }
  }

  /**
   * Determine if a lamp post should exist at this grid coordinate
   * Lamp posts at odd coordinates (street intersections where 4 stalls meet)
   */
  private shouldHaveLampPost(gridX: number, gridZ: number): boolean {
    // Odd coordinates = street intersections
    return (gridX % 2 !== 0) && (gridZ % 2 !== 0);
  }

  /**
   * Create a lamp post at the given grid coordinate
   */
  private createLampPost(gridX: number, gridZ: number): void {
    if (!this.modelTemplate) return;

    const key = `${gridX},${gridZ}`;

    // Calculate world position from grid coordinate
    const worldX = gridX * this.cellWidth;
    const worldZ = gridZ * this.cellDepth;

    // Clone the model template
    const mesh = this.modelTemplate.clone();

    // Scale to target height
    const scale = this.TARGET_HEIGHT / this.MODEL_HEIGHT;
    mesh.scale.setScalar(scale);

    // Position the lamp post at the intersection
    mesh.position.set(worldX, 0, worldZ);

    this.scene.add(mesh);

    // Store lamp post
    this.lampPosts.set(key, mesh);
  }

  /**
   * Remove a lamp post
   */
  private removeLampPost(key: string, lampPost: THREE.Group): void {
    // Remove from scene
    this.scene.remove(lampPost);

    // Dispose mesh resources
    lampPost.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });

    // Remove from tracking
    this.lampPosts.delete(key);
  }

  /**
   * Clear all lamp posts
   */
  clear(): void {
    for (const [key, lampPost] of this.lampPosts) {
      this.removeLampPost(key, lampPost);
    }
  }

  /**
   * Get lamp post count (for debugging)
   */
  getLampPostCount(): number {
    return this.lampPosts.size;
  }
}
