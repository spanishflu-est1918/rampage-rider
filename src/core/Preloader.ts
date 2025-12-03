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
  private progressListeners = new Set<(progress: number, detail: string) => void>();

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

    this.notifyProgress('complete');
  }

  /**
   * Preload Rapier WASM module
   */
  private async preloadRapier(): Promise<void> {
    if (this.rapierLoaded) return;

    await RAPIER.init();
    this.rapierLoaded = true;
    this.notifyProgress('rapier-ready');
  }

  /**
   * Preload game assets (models, textures)
   */
  private async preloadAssets(): Promise<void> {
    if (this.assetsLoaded) return;

    const assetLoader = AssetLoader.getInstance();
    await assetLoader.preloadAll();

    this.assetsLoaded = true;
    this.notifyProgress('assets-ready');
  }

  addProgressListener(listener: (progress: number, detail: string) => void): () => void {
    this.progressListeners.add(listener);
    listener(this.getProgress(), this.isReady() ? 'complete' : 'pending');
    return () => {
      this.progressListeners.delete(listener);
    };
  }

  getProgress(): number {
    const stages = 2;
    const completed = Number(this.rapierLoaded) + Number(this.assetsLoaded);
    return completed / stages;
  }

  private notifyProgress(detail: string): void {
    const progress = this.getProgress();
    this.progressListeners.forEach(listener => {
      listener(progress, detail);
    });
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
