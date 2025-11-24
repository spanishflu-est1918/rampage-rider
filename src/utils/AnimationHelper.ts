import * as THREE from 'three';

/**
 * AnimationHelper
 *
 * Shared animation utilities to DRY up animation code across entities.
 * All entities (Player, Pedestrian, Cop) use identical animation patterns.
 */
export class AnimationHelper {
  /**
   * Play an animation by name with fade-in transition
   *
   * @param mixer - The AnimationMixer for this entity
   * @param animations - Array of available AnimationClips
   * @param clipName - Name of the animation to play
   * @param fadeIn - Fade-in duration in seconds
   * @param options - Additional options for the animation
   * @returns The AnimationAction if successful, null otherwise
   */
  static playAnimation(
    mixer: THREE.AnimationMixer | null,
    animations: THREE.AnimationClip[],
    clipName: string,
    fadeIn: number,
    options?: {
      loop?: THREE.AnimationActionLoopStyles;
      clampWhenFinished?: boolean;
      timeScale?: number;
    }
  ): THREE.AnimationAction | null {
    if (!mixer || animations.length === 0) return null;

    const clip = THREE.AnimationClip.findByName(animations, clipName);
    if (!clip) {
      console.warn(`[AnimationHelper] Animation '${clipName}' not found`);
      return null;
    }

    mixer.stopAllAction();
    const action = mixer.clipAction(clip);

    // Apply options
    if (options?.loop !== undefined) {
      action.setLoop(options.loop, 1);
    }
    if (options?.clampWhenFinished !== undefined) {
      action.clampWhenFinished = options.clampWhenFinished;
    }
    if (options?.timeScale !== undefined) {
      action.timeScale = options.timeScale;
    }

    action.fadeIn(fadeIn);
    action.play();

    return action;
  }

  /**
   * Play a one-shot animation (plays once and optionally holds final pose)
   *
   * @param mixer - The AnimationMixer for this entity
   * @param animations - Array of available AnimationClips
   * @param clipName - Name of the animation to play
   * @param fadeIn - Fade-in duration in seconds
   * @param holdFinalPose - Whether to hold the final pose (clampWhenFinished)
   * @returns The AnimationAction if successful, null otherwise
   */
  static playOneShotAnimation(
    mixer: THREE.AnimationMixer | null,
    animations: THREE.AnimationClip[],
    clipName: string,
    fadeIn: number,
    holdFinalPose: boolean = false
  ): THREE.AnimationAction | null {
    return AnimationHelper.playAnimation(mixer, animations, clipName, fadeIn, {
      loop: THREE.LoopOnce,
      clampWhenFinished: holdFinalPose,
    });
  }

  /**
   * Find an animation by checking multiple possible names
   * Useful for hit reactions where animation names vary by model
   *
   * @param animations - Array of available AnimationClips
   * @param possibleNames - Array of possible animation names to check
   * @returns The first matching clip, or null if none found
   */
  static findAnimationByNames(
    animations: THREE.AnimationClip[],
    possibleNames: string[]
  ): THREE.AnimationClip | null {
    for (const name of possibleNames) {
      const clip = THREE.AnimationClip.findByName(animations, name);
      if (clip) return clip;
    }
    return null;
  }

  /**
   * Setup shadows on all meshes in a scene
   *
   * @param root - The root object to traverse
   * @param cast - Whether meshes should cast shadows
   * @param receive - Whether meshes should receive shadows
   */
  static setupShadows(root: THREE.Object3D, cast: boolean = true, receive: boolean = true): void {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = cast;
        child.receiveShadow = receive;
      }
    });
  }

  /**
   * Apply a skin tone to all materials with names starting with 'Skin'
   *
   * @param root - The root object to traverse
   * @param skinTone - The hex color for the skin tone
   */
  static applySkinTone(root: THREE.Object3D, skinTone: number): void {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat.name?.startsWith('Skin')) {
          mat.color.setHex(skinTone);
        }
      }
    });
  }

  /**
   * Apply a color to materials matching specific name prefixes
   *
   * @param root - The root object to traverse
   * @param prefixes - Array of material name prefixes to match
   * @param color - The hex color to apply
   */
  static applyMaterialColor(root: THREE.Object3D, prefixes: string[], color: number): void {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (prefixes.some((prefix) => mat.name?.startsWith(prefix))) {
          mat.color.setHex(color);
        }
      }
    });
  }

  /**
   * Flash an entity white (hit reaction visual effect)
   *
   * @param root - The root object to flash
   * @param duration - Duration of flash in milliseconds
   */
  static flashWhite(root: THREE.Object3D, duration: number = 100): void {
    const originalValues: { mat: THREE.MeshStandardMaterial; emissive: number; intensity: number }[] = [];

    root.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial;
        originalValues.push({
          mat,
          emissive: mat.emissive.getHex(),
          intensity: mat.emissiveIntensity,
        });
        mat.emissive.setHex(0xffffff);
        mat.emissiveIntensity = 1.0;
      }
    });

    setTimeout(() => {
      for (const { mat, emissive, intensity } of originalValues) {
        mat.emissive.setHex(emissive);
        mat.emissiveIntensity = intensity;
      }
    }, duration);
  }

  /**
   * Get a random element from an array
   */
  static randomElement<T>(array: readonly T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }
}
