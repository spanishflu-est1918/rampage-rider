import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * AssetLoader
 *
 * Preloads and caches all game assets (models, textures) before game starts
 */
export class AssetLoader {
  private static instance: AssetLoader;
  private loader: GLTFLoader;
  private cache: Map<string, GLTF> = new Map();
  private isLoaded: boolean = false;

  private constructor() {
    this.loader = new GLTFLoader();
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
    if (this.isLoaded) {
      console.log('[AssetLoader] Assets already loaded');
      return;
    }

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
    ];

    console.log(`[AssetLoader] Preloading ${assetPaths.length} assets...`);

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

        console.log(`[AssetLoader] Loaded ${path} (${loaded}/${total})`);
      } catch (error) {
        console.error(`[AssetLoader] Failed to load ${path}:`, error);
      }
    });

    await Promise.all(loadPromises);

    this.isLoaded = true;
    console.log('[AssetLoader] All assets loaded!');
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
    this.isLoaded = false;
  }
}
