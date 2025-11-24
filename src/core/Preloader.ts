import RAPIER from '@dimforge/rapier3d-compat';
import { AssetLoader } from './AssetLoader';

/**
 * Preloader - Loads heavy assets before the game starts
 *
 * Call preload() as early as possible in the app lifecycle
 * to ensure Rapier WASM and models are ready when user clicks Start
 */
class Preloader {
  private static instance: Preloader;
  private rapierLoaded = false;
  private assetsLoaded = false;
  private rapierPromise: Promise<void> | null = null;
  private assetsPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): Preloader {
    if (!Preloader.instance) {
      Preloader.instance = new Preloader();
    }
    return Preloader.instance;
  }

  /**
   * Start preloading all heavy assets
   * Returns a promise that resolves when everything is ready
   */
  async preloadAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    // Start Rapier WASM loading
    if (!this.rapierLoaded && !this.rapierPromise) {
      this.rapierPromise = this.preloadRapier();
      promises.push(this.rapierPromise);
    } else if (this.rapierPromise) {
      promises.push(this.rapierPromise);
    }

    // Start asset loading
    if (!this.assetsLoaded && !this.assetsPromise) {
      this.assetsPromise = this.preloadAssets();
      promises.push(this.assetsPromise);
    } else if (this.assetsPromise) {
      promises.push(this.assetsPromise);
    }

    await Promise.all(promises);
  }

  /**
   * Preload Rapier WASM module
   */
  private async preloadRapier(): Promise<void> {
    if (this.rapierLoaded) return;

    console.log('[Preloader] Loading Rapier WASM...');
    const start = performance.now();

    await RAPIER.init();

    this.rapierLoaded = true;
    const elapsed = (performance.now() - start).toFixed(0);
    console.log(`[Preloader] Rapier WASM loaded in ${elapsed}ms`);
  }

  /**
   * Preload game assets (models, textures)
   */
  private async preloadAssets(): Promise<void> {
    if (this.assetsLoaded) return;

    const assetLoader = AssetLoader.getInstance();
    await assetLoader.preloadAll();

    this.assetsLoaded = true;
  }

  /**
   * Check if Rapier is loaded
   */
  isRapierReady(): boolean {
    return this.rapierLoaded;
  }

  /**
   * Check if all assets are loaded
   */
  isAssetsReady(): boolean {
    return this.assetsLoaded;
  }

  /**
   * Check if everything is ready
   */
  isReady(): boolean {
    return this.rapierLoaded && this.assetsLoaded;
  }
}

export const preloader = Preloader.getInstance();
