import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

/**
 * AssetLoader
 *
 * Preloads and caches all game assets (models, textures) before game starts
 * Also pre-clones pedestrian models during preload to avoid runtime stutter
 */
export class AssetLoader {
  private static instance: AssetLoader;
  private loader: GLTFLoader;
  private dracoLoader: DRACOLoader;
  private cache: Map<string, GLTF> = new Map();
  private isLoaded: boolean = false;

  // Pre-cloned pedestrian model pool (avoids SkeletonUtils.clone at runtime)
  // Map: characterType -> array of pre-cloned THREE.Group ready to use
  private pedestrianModelPool: Map<string, THREE.Group[]> = new Map();
  private readonly CLONES_PER_MODEL = 10; // Pre-clone 10 of each pedestrian type

  // Pre-cloned cop rider pool (BlueSoldier models for Cop, BikeCop, MotorbikeCop)
  // These need SkeletonUtils.clone for animations
  private copRiderPool: Map<string, THREE.Group[]> = new Map();
  private readonly COP_CLONES_PER_MODEL = 8; // Max 8 motorbike cops + 3 foot cops + 2 bike cops = 13 total

  // Pre-cloned vehicle pool (car, motorbike, bicycle for cops)
  // These use simple .clone() - no skeletons
  private vehiclePool: Map<string, THREE.Group[]> = new Map();
  private readonly VEHICLE_CLONES = 8; // Max cop vehicles needed

  private constructor() {
    this.loader = new GLTFLoader();

    // Setup Draco decoder for compressed models
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    this.loader.setDRACOLoader(this.dracoLoader);
  }

  static getInstance(): AssetLoader {
    if (!AssetLoader.instance) {
      AssetLoader.instance = new AssetLoader();
    }
    return AssetLoader.instance;
  }

  /**
   * Preload all game assets
   */
  async preloadAll(onProgress?: (progress: number) => void): Promise<void> {
    if (this.isLoaded) return;

    const assetPaths = [
      // Player model
      '/assets/boxman.glb',

      // Pedestrian models
      '/assets/pedestrians/BlueSoldier_Female.gltf',
      '/assets/pedestrians/BlueSoldier_Male.gltf',
      '/assets/pedestrians/Casual2_Female.gltf',
      '/assets/pedestrians/Casual2_Male.gltf',
      '/assets/pedestrians/Casual3_Female.gltf',
      '/assets/pedestrians/Casual3_Male.gltf',
      '/assets/pedestrians/Casual_Bald.gltf',
      '/assets/pedestrians/Casual_Female.gltf',
      '/assets/pedestrians/Casual_Male.gltf',
      '/assets/pedestrians/Chef_Female.gltf',
      '/assets/pedestrians/Chef_Male.gltf',
      '/assets/pedestrians/Doctor_Female_Young.gltf',
      '/assets/pedestrians/Doctor_Male_Young.gltf',
      '/assets/pedestrians/Ninja_Female.gltf',
      '/assets/pedestrians/Ninja_Male.gltf',
      '/assets/pedestrians/Ninja_Sand.gltf',
      '/assets/pedestrians/Ninja_Sand_Female.gltf',
      '/assets/pedestrians/Soldier_Female.gltf',
      '/assets/pedestrians/Soldier_Male.gltf',
      '/assets/pedestrians/Suit_Female.gltf',
      '/assets/pedestrians/Suit_Male.gltf',
      '/assets/pedestrians/Worker_Female.gltf',
      '/assets/pedestrians/Worker_Male.gltf',

      // Vehicle models
      '/assets/vehicles/bicycle.glb',
      '/assets/vehicles/motorbike.glb',
      '/assets/vehicles/car.glb',
      '/assets/vehicles/truck.glb', // 18-wheeler

      // Props
      '/assets/props/christmas-market.glb',
      '/models/christmas_lamp_post.glb',
    ];

    let loaded = 0;
    const total = assetPaths.length;

    const loadPromises = assetPaths.map(async (path) => {
      try {
        const gltf = await this.loader.loadAsync(path);
        this.cache.set(path, gltf);
        loaded++;

        if (onProgress) {
          onProgress(loaded / total);
        }

      } catch {
        // Silently continue - missing assets are handled gracefully
      }
    });

    await Promise.all(loadPromises);

    // Pre-clone models during preload (avoids runtime stutter)
    await this.preClonePedestrianModels();
    await this.preCloneCopModels();
    await this.preCloneVehicleModels();

    this.isLoaded = true;
  }

  /**
   * Pre-clone pedestrian models during preload phase
   * This moves the expensive SkeletonUtils.clone() calls to the loading screen
   */
  private async preClonePedestrianModels(): Promise<void> {
    const pedestrianTypes = [
      'BlueSoldier_Female', 'BlueSoldier_Male',
      'Casual2_Female', 'Casual2_Male',
      'Casual3_Female', 'Casual3_Male',
      'Casual_Bald', 'Casual_Female', 'Casual_Male',
      'Chef_Female', 'Chef_Male',
      'Doctor_Female_Young', 'Doctor_Male_Young',
      'Ninja_Female', 'Ninja_Male', 'Ninja_Sand', 'Ninja_Sand_Female',
      'Soldier_Female', 'Soldier_Male',
      'Suit_Female', 'Suit_Male',
      'Worker_Female', 'Worker_Male',
    ];

    for (const charType of pedestrianTypes) {
      const path = `/assets/pedestrians/${charType}.gltf`;
      const gltf = this.cache.get(path);
      if (!gltf) continue;

      const clones: THREE.Group[] = [];
      for (let i = 0; i < this.CLONES_PER_MODEL; i++) {
        // Pre-clone during loading screen (expensive operation happens here, not at runtime)
        const clonedScene = SkeletonUtils.clone(gltf.scene) as THREE.Group;
        clones.push(clonedScene);
      }
      this.pedestrianModelPool.set(charType, clones);
    }
  }

  /**
   * Pre-clone cop rider models (BlueSoldier variants) during preload
   * Used by Cop, BikeCop, and MotorbikeCop entities
   */
  private async preCloneCopModels(): Promise<void> {
    const copTypes = ['BlueSoldier_Male', 'BlueSoldier_Female', 'Soldier_Male', 'Soldier_Female'];

    for (const copType of copTypes) {
      const path = `/assets/pedestrians/${copType}.gltf`;
      const gltf = this.cache.get(path);
      if (!gltf) continue;

      const clones: THREE.Group[] = [];
      for (let i = 0; i < this.COP_CLONES_PER_MODEL; i++) {
        const clonedScene = SkeletonUtils.clone(gltf.scene) as THREE.Group;
        clones.push(clonedScene);
      }
      this.copRiderPool.set(copType, clones);
    }
  }

  /**
   * Pre-clone vehicle models (car, motorbike, bicycle) during preload
   * Used by CopCar, MotorbikeCop, and BikeCop entities
   */
  private async preCloneVehicleModels(): Promise<void> {
    const vehiclePaths = [
      '/assets/vehicles/car.glb',
      '/assets/vehicles/motorbike.glb',
      '/assets/vehicles/bicycle.glb',
    ];

    for (const path of vehiclePaths) {
      const gltf = this.cache.get(path);
      if (!gltf) continue;

      const clones: THREE.Group[] = [];
      for (let i = 0; i < this.VEHICLE_CLONES; i++) {
        // Vehicles don't have skeletons, use simple clone
        const clonedScene = gltf.scene.clone() as THREE.Group;
        clones.push(clonedScene);
      }
      this.vehiclePool.set(path, clones);
    }
  }

  /**
   * Get a pre-cloned cop rider model from the pool
   * Falls back to runtime clone if pool is empty
   */
  getPreClonedCopRider(copType: string): { scene: THREE.Group; animations: THREE.AnimationClip[] } | null {
    const path = `/assets/pedestrians/${copType}.gltf`;
    const gltf = this.cache.get(path);
    if (!gltf) return null;

    const pool = this.copRiderPool.get(copType);
    if (pool && pool.length > 0) {
      const scene = pool.pop()!;
      return { scene, animations: gltf.animations };
    }

    // Fallback: clone at runtime
    console.warn(`[AssetLoader] Cop rider pool empty for ${copType}, cloning at runtime`);
    const clonedScene = SkeletonUtils.clone(gltf.scene) as THREE.Group;
    return { scene: clonedScene, animations: gltf.animations };
  }

  /**
   * Get a pre-cloned vehicle model from the pool
   * Falls back to runtime clone if pool is empty
   */
  getPreClonedVehicle(path: string): { scene: THREE.Group; animations: THREE.AnimationClip[] } | null {
    const gltf = this.cache.get(path);
    if (!gltf) return null;

    const pool = this.vehiclePool.get(path);
    if (pool && pool.length > 0) {
      const scene = pool.pop()!;
      return { scene, animations: gltf.animations };
    }

    // Fallback: clone at runtime
    console.warn(`[AssetLoader] Vehicle pool empty for ${path}, cloning at runtime`);
    const clonedScene = gltf.scene.clone() as THREE.Group;
    return { scene: clonedScene, animations: gltf.animations };
  }

  /**
   * Get a pre-cloned pedestrian model from the pool
   * Falls back to runtime clone if pool is empty
   */
  getPreClonedPedestrian(characterType: string): { scene: THREE.Group; animations: THREE.AnimationClip[] } | null {
    const path = `/assets/pedestrians/${characterType}.gltf`;
    const gltf = this.cache.get(path);
    if (!gltf) return null;

    const pool = this.pedestrianModelPool.get(characterType);
    if (pool && pool.length > 0) {
      // Fast path: return pre-cloned model from pool
      const scene = pool.pop()!;
      return { scene, animations: gltf.animations };
    }

    // Fallback: clone at runtime (only happens if we spawn more than CLONES_PER_MODEL)
    console.warn(`[AssetLoader] Pre-clone pool empty for ${characterType}, cloning at runtime`);
    const clonedScene = SkeletonUtils.clone(gltf.scene) as THREE.Group;
    return { scene: clonedScene, animations: gltf.animations };
  }

  /**
   * Return a pedestrian model to the pool for reuse
   */
  returnPedestrianToPool(characterType: string, scene: THREE.Group): void {
    let pool = this.pedestrianModelPool.get(characterType);
    if (!pool) {
      pool = [];
      this.pedestrianModelPool.set(characterType, pool);
    }
    pool.push(scene);
  }

  /**
   * Get a cached GLTF model
   */
  getModel(path: string): GLTF | undefined {
    return this.cache.get(path);
  }

  /**
   * Check if assets are loaded
   */
  isAssetsLoaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.pedestrianModelPool.clear();
    this.copRiderPool.clear();
    this.vehiclePool.clear();
    this.isLoaded = false;
  }
}
