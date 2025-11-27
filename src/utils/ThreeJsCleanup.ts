import * as THREE from 'three';

/**
 * ThreeJsCleanup
 *
 * Utility functions for properly disposing Three.js resources
 * to prevent memory leaks (geometries, materials, textures)
 */

// Interface for materials with texture maps (covers MeshStandardMaterial, MeshPhongMaterial, etc.)
interface MaterialWithMaps {
  map?: THREE.Texture | null;
  lightMap?: THREE.Texture | null;
  bumpMap?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  specularMap?: THREE.Texture | null;
  envMap?: THREE.Texture | null;
  alphaMap?: THREE.Texture | null;
  aoMap?: THREE.Texture | null;
  displacementMap?: THREE.Texture | null;
  emissiveMap?: THREE.Texture | null;
  gradientMap?: THREE.Texture | null;
  metalnessMap?: THREE.Texture | null;
  roughnessMap?: THREE.Texture | null;
}

/**
 * Dispose a material and all its textures
 */
export function disposeMaterial(material: THREE.Material): void {
  // Type-safe access to texture maps
  const mat = material as THREE.Material & MaterialWithMaps;

  // Dispose textures if they exist
  mat.map?.dispose();
  mat.lightMap?.dispose();
  mat.bumpMap?.dispose();
  mat.normalMap?.dispose();
  mat.specularMap?.dispose();
  mat.envMap?.dispose();
  mat.alphaMap?.dispose();
  mat.aoMap?.dispose();
  mat.displacementMap?.dispose();
  mat.emissiveMap?.dispose();
  mat.gradientMap?.dispose();
  mat.metalnessMap?.dispose();
  mat.roughnessMap?.dispose();

  // Dispose the material itself
  material.dispose();
}

/**
 * Dispose all geometries and materials in a Three.js Object3D hierarchy
 */
export function disposeObject3D(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      // Dispose geometry
      if (child.geometry) {
        child.geometry.dispose();
      }

      // Dispose materials
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            disposeMaterial(mat);
          });
        } else {
          disposeMaterial(child.material);
        }
      }
    }
  });
}

/**
 * Cleanup an AnimationMixer
 */
export function disposeAnimationMixer(mixer: THREE.AnimationMixer): void {
  mixer.stopAllAction();
  mixer.uncacheRoot(mixer.getRoot());
}
