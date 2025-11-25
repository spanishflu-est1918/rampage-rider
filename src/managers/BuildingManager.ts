import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { CITY_CONFIG } from '../constants';
import { AssetLoader } from '../core/AssetLoader';
import { ChristmasLights } from '../rendering/ChristmasLights';

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
    roofMeshes: THREE.Mesh[];
    lightsKey: string; // Key into lightsPerBuilding map
  }> = new Map();

  // Christmas lights system
  private christmasLights: ChristmasLights;
  private lightsPerBuilding: Map<string, ReturnType<ChristmasLights['createStrand']>[]> = new Map();

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

    // Calculate grid cell size (use same spacing for both axes)
    this.cellWidth = CITY_CONFIG.BUILDING_WIDTH + CITY_CONFIG.STREET_WIDTH;
    this.cellDepth = CITY_CONFIG.BUILDING_WIDTH + CITY_CONFIG.STREET_WIDTH; // Same as width for uniform grid

    // Initialize Christmas lights system
    this.christmasLights = new ChristmasLights(scene);

    this.loadModel();
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
    } else {
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

    // Update roof transparency based on distance to player
    const fadeStartDistance = 12; // Start fading at this distance
    const fadeEndDistance = 5;    // Fully transparent at this distance

    for (const [, building] of this.buildings) {
      const buildingPos = building.mesh.position;
      const distance = playerPosition.distanceTo(buildingPos);

      // Calculate opacity: 1 at fadeStart, 0 at fadeEnd
      let opacity = 1;
      if (distance < fadeStartDistance) {
        opacity = Math.max(0, (distance - fadeEndDistance) / (fadeStartDistance - fadeEndDistance));
      }

      // Apply opacity to roof meshes
      for (const roofMesh of building.roofMeshes) {
        const material = roofMesh.material as THREE.MeshStandardMaterial;
        material.opacity = opacity;
        material.transparent = opacity < 1;
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

    // Find roof mesh (the snow on top) by name
    const roofMeshes: THREE.Mesh[] = [];
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // lambert1 is the snow/roof mesh
        if (child.name.includes('lambert1')) {
          child.material = (child.material as THREE.Material).clone();
          roofMeshes.push(child);
        }
      }
    });

    // Create physics collider (static) with collision groups
    // Note: model is rotated 90°, so width and depth are swapped for collider
    const colliderHeight = this.MODEL_HEIGHT * scale;
    const colliderHalfWidth = (this.MODEL_DEPTH * scale) / 2;  // Swapped due to 90° rotation
    const colliderHalfDepth = (this.MODEL_WIDTH * scale) / 2;  // Swapped due to 90° rotation

    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(worldX, colliderHeight / 2, worldZ);
    const body = this.world.createRigidBody(bodyDesc);

    // Building collision groups:
    // Membership: 0x0040 (BUILDING group)
    // Filter: 0x009E (PLAYER=0x0002, PEDESTRIAN=0x0004, COP=0x0008, DEBRIS=0x0010, VEHICLE=0x0080)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      colliderHalfWidth,
      colliderHeight / 2,
      colliderHalfDepth
    )
      .setCollisionGroups(0x009E0040);

    this.world.createCollider(colliderDesc, body);

    // Create Christmas lights around the stall roof
    const scaledHeight = this.MODEL_HEIGHT * scale;
    const scaledWidth = this.MODEL_DEPTH * scale;  // Swapped due to rotation
    const scaledDepth = this.MODEL_WIDTH * scale;  // Swapped due to rotation

    const lightsStrands = this.christmasLights.createPerimeterLights(
      new THREE.Vector3(worldX, 0, worldZ),
      scaledWidth,
      scaledDepth,
      scaledHeight * 0.85, // Slightly below roof peak
      {
        bulbCount: 8,
        colorPreset: 'warm-white',
        bulbSize: 0.06,
        sag: 0.15,
        pointLightInterval: 0, // No point lights - WebGL limit is ~12
      }
    );

    // Create string lights across streets - connect each corner to its counterpart
    // on the neighboring building in both X and Z directions
    const roofHeight = scaledHeight * 0.9;
    const halfW = scaledWidth / 2;
    const halfD = scaledDepth / 2;

    // Four corners of this building's roof
    const corners = [
      { x: worldX - halfW, z: worldZ - halfD, name: 'nw' }, // Northwest
      { x: worldX + halfW, z: worldZ - halfD, name: 'ne' }, // Northeast
      { x: worldX + halfW, z: worldZ + halfD, name: 'se' }, // Southeast
      { x: worldX - halfW, z: worldZ + halfD, name: 'sw' }, // Southwest
    ];

    const streetConfig = {
      bulbCount: 10,
      colorPreset: 'warm-white' as const,
      bulbSize: 0.05,
      sag: 0.35,
      pointLightInterval: 0,
    };

    // Connect to neighbor in +X direction (corners ne->nw, se->sw)
    const neighborXWorldX = (gridX + 2) * this.cellWidth;
    const streetKeyX = `street_x_${key}`;
    if (!this.lightsPerBuilding.has(streetKeyX)) {
      const strands: ReturnType<ChristmasLights['createStrand']>[] = [];
      // NE corner -> neighbor's NW corner
      strands.push(this.christmasLights.createStrand(
        new THREE.Vector3(corners[1].x, roofHeight, corners[1].z),
        new THREE.Vector3(neighborXWorldX - halfW, roofHeight, worldZ - halfD),
        streetConfig
      ));
      // SE corner -> neighbor's SW corner
      strands.push(this.christmasLights.createStrand(
        new THREE.Vector3(corners[2].x, roofHeight, corners[2].z),
        new THREE.Vector3(neighborXWorldX - halfW, roofHeight, worldZ + halfD),
        streetConfig
      ));
      this.lightsPerBuilding.set(streetKeyX, strands);
    }

    // Connect to neighbor in +Z direction (corners sw->nw, se->ne)
    const neighborZWorldZ = (gridZ + 2) * this.cellDepth;
    const streetKeyZ = `street_z_${key}`;
    if (!this.lightsPerBuilding.has(streetKeyZ)) {
      const strands: ReturnType<ChristmasLights['createStrand']>[] = [];
      // SW corner -> neighbor's NW corner
      strands.push(this.christmasLights.createStrand(
        new THREE.Vector3(corners[3].x, roofHeight, corners[3].z),
        new THREE.Vector3(worldX - halfW, roofHeight, neighborZWorldZ - halfD),
        streetConfig
      ));
      // SE corner -> neighbor's NE corner
      strands.push(this.christmasLights.createStrand(
        new THREE.Vector3(corners[2].x, roofHeight, corners[2].z),
        new THREE.Vector3(worldX + halfW, roofHeight, neighborZWorldZ - halfD),
        streetConfig
      ));
      this.lightsPerBuilding.set(streetKeyZ, strands);
    }

    this.lightsPerBuilding.set(key, lightsStrands);

    // Store building with roof meshes
    this.buildings.set(key, { mesh, body, roofMeshes, lightsKey: key });
  }

  /**
   * Remove a building
   */
  private removeBuilding(key: string, building: { mesh: THREE.Group; body: RAPIER.RigidBody; roofMeshes: THREE.Mesh[]; lightsKey: string }): void {
    // Remove Christmas lights for this building
    const strands = this.lightsPerBuilding.get(key);
    if (strands) {
      for (const strand of strands) {
        this.christmasLights.removeStrand(strand);
      }
      this.lightsPerBuilding.delete(key);
    }

    // Remove from scene
    this.scene.remove(building.mesh);

    // Dispose roof materials (these were cloned)
    for (const roofMesh of building.roofMeshes) {
      (roofMesh.material as THREE.Material).dispose();
    }

    // Dispose mesh resources
    building.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
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
  }

  /**
   * Get building count (for debugging)
   */
  getBuildingCount(): number {
    return this.buildings.size;
  }
}
