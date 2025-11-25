import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * AssetLoader
 *
 * Preloads and caches all game assets (models, textures) before game starts
 */
export class AssetLoader {
  private static instance: AssetLoader;
  private loader: GLTFLoader;
  private dracoLoader: DRACOLoader;
  private cache: Map<string, GLTF> = new Map();
  private isLoaded: boolean = false;

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

      } catch (error) {
      }
    });

    await Promise.all(loadPromises);

    this.isLoaded = true;
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
