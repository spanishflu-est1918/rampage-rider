import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { CITY_CONFIG } from '../constants';
import { AssetLoader } from '../core/AssetLoader';
import { ChristmasLights } from '../rendering/ChristmasLights';
import { BuildingShadow, createBuildingShadow } from '../rendering/BlobShadow';

interface BuildingInstance {
  mesh: THREE.Group;
  body: RAPIER.RigidBody;
  roofMeshes: THREE.Mesh[];
  gridX: number;
  gridZ: number;
  light: THREE.PointLight; // Interior light
  shadow: BuildingShadow; // Baked shadow plane
}

/**
 * BuildingManager
 *
 * Uses a pool of 4 buildings that reposition as the player moves.
 * Since all stalls are identical, we just move them to create the illusion
 * of an infinite repeating market.
 */
export class BuildingManager {
  private scene: THREE.Scene;
  private world: RAPIER.World;

  // Pool of 4 reusable buildings
  private buildings: BuildingInstance[] = [];
  private initialized = false;

  // Christmas lights system
  private christmasLights: ChristmasLights;
  private streetLights: Map<string, ReturnType<ChristmasLights['createStrand']>[]> = new Map();

  // Grid cell size (building + street)
  private cellWidth: number;
  private cellDepth: number;

  // Model template
  private modelTemplate: THREE.Group | null = null;
  private modelReady = false;

  // Scaled dimensions (calculated once)
  private scaledHeight = 0;
  private scaledWidth = 0;
  private scaledDepth = 0;
  private scale = 0;

  // Model dimensions (from GLB inspection)
  private readonly MODEL_WIDTH = 6.1;
  private readonly MODEL_HEIGHT = 3.8;
  private readonly MODEL_DEPTH = 8.0;

  // Track current base position to detect when to update
  private currentBaseX = Infinity;
  private currentBaseZ = Infinity;

  // Pre-allocated vectors (avoid per-frame/per-reposition allocations)
  private readonly _lightDir: THREE.Vector3 = new THREE.Vector3(1, 0, 1).normalize();
  private readonly _tempStrandStart: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempStrandEnd: THREE.Vector3 = new THREE.Vector3();

  constructor(scene: THREE.Scene, world: RAPIER.World) {
    this.scene = scene;
    this.world = world;

    this.cellWidth = CITY_CONFIG.BUILDING_WIDTH + CITY_CONFIG.STREET_WIDTH;
    this.cellDepth = CITY_CONFIG.BUILDING_WIDTH + CITY_CONFIG.STREET_WIDTH;

    this.christmasLights = new ChristmasLights(scene);

    this.loadModel();
  }

  private loadModel(): void {
    const assetLoader = AssetLoader.getInstance();
    const gltf = assetLoader.getModel('/assets/props/christmas-market.glb');

    if (gltf) {
      this.modelTemplate = gltf.scene.clone();
      this.modelTemplate.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Disable real shadows (we use baked shadow planes instead)
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });

      // Pre-calculate scaled dimensions
      this.scale = CITY_CONFIG.BUILDING_DEPTH / this.MODEL_DEPTH;
      this.scaledHeight = this.MODEL_HEIGHT * this.scale;
      this.scaledWidth = this.MODEL_DEPTH * this.scale;  // Swapped due to 90° rotation
      this.scaledDepth = this.MODEL_WIDTH * this.scale;

      this.modelReady = true;
    } else {
      setTimeout(() => this.loadModel(), 500);
    }
  }

  /**
   * Initialize the 4 building pool
   */
  private initializeBuildings(): void {
    if (!this.modelTemplate || this.initialized) return;

    // Create 4 buildings at temporary positions
    const positions = [
      { gridX: 0, gridZ: 0 },
      { gridX: 2, gridZ: 0 },
      { gridX: 0, gridZ: 2 },
      { gridX: 2, gridZ: 2 },
    ];

    for (const pos of positions) {
      const buildingIndex = this.buildings.length;
      const building = this.createBuildingInstance(pos.gridX, pos.gridZ, buildingIndex);
      this.buildings.push(building);
    }

    this.initialized = true;
  }

  /**
   * Create a single building instance
   */
  private createBuildingInstance(gridX: number, gridZ: number, _id: number): BuildingInstance {
    const worldX = gridX * this.cellWidth;
    const worldZ = gridZ * this.cellDepth;

    // Clone mesh
    const mesh = this.modelTemplate!.clone();
    mesh.scale.setScalar(this.scale);
    mesh.position.set(worldX, 0, worldZ);
    mesh.rotation.y = Math.PI / 2;
    this.scene.add(mesh);

    // Find roof meshes
    const roofMeshes: THREE.Mesh[] = [];
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name.includes('lambert1')) {
        // Clone roof material so transparency changes don't affect other instances
        child.material = (child.material as THREE.Material).clone();
        roofMeshes.push(child);
      }
    });

    // Create physics body
    const colliderHeight = this.scaledHeight;
    const colliderHalfWidth = this.scaledWidth / 2;
    const colliderHalfDepth = this.scaledDepth / 2;

    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(worldX, colliderHeight / 2, worldZ);
    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      colliderHalfWidth,
      colliderHeight / 2,
      colliderHalfDepth
    ).setCollisionGroups(0x009E0040);

    this.world.createCollider(colliderDesc, body);

    // DISABLED: Interior point lights are expensive
    // const light = new THREE.PointLight(0xffaa44, 1.5, 12);
    // light.position.set(worldX, this.scaledHeight * 0.5, worldZ);
    // this.scene.add(light);
    const light = null as unknown as THREE.PointLight; // Placeholder

    // Create baked shadow plane (light comes from (-30, 50, -30) direction)
    const shadow = createBuildingShadow(this.scaledWidth, this.scaledDepth, this._lightDir, 4);
    shadow.position.set(worldX, 0.02, worldZ);
    this.scene.add(shadow);

    return {
      mesh,
      body,
      roofMeshes,
      gridX,
      gridZ,
      light,
      shadow
    };
  }

  /**
   * Reposition a building to a new grid position
   */
  private repositionBuilding(building: BuildingInstance, newGridX: number, newGridZ: number): void {
    const worldX = newGridX * this.cellWidth;
    const worldZ = newGridZ * this.cellDepth;

    // Move mesh
    building.mesh.position.set(worldX, 0, worldZ);

    // Move physics body (reuse instead of recreate to avoid spikes)
    building.body.setTranslation(
      { x: worldX, y: this.scaledHeight / 2, z: worldZ },
      true
    );
    building.body.wakeUp();

    // Move light (disabled)
    // building.light.position.set(worldX, this.scaledHeight * 0.5, worldZ);

    // Dispose old shadow geometry and create new one at new position
    // (Shadow geometry is position-dependent due to directional projection)
    this.scene.remove(building.shadow);
    building.shadow.geometry.dispose();

    building.shadow = createBuildingShadow(this.scaledWidth, this.scaledDepth, this._lightDir, 4);
    building.shadow.position.set(worldX, 0.02, worldZ);
    this.scene.add(building.shadow);

    building.gridX = newGridX;
    building.gridZ = newGridZ;
  }

  /**
   * Update street lights between buildings
   */
  private updateStreetLights(): void {
    // Clear old street lights
    for (const strands of this.streetLights.values()) {
      for (const strand of strands) {
        this.christmasLights.removeStrand(strand);
      }
    }
    this.streetLights.clear();

    const roofHeight = this.scaledHeight * 0.9;
    const halfW = this.scaledWidth / 2;
    const halfD = this.scaledDepth / 2;

    const streetConfig = {
      bulbCount: 10,
      colorPreset: 'warm-white' as const,
      bulbSize: 0.05,
      sag: 0.35,
      pointLightInterval: 0,
    };

    // Create street lights between each pair of adjacent buildings
    for (const building of this.buildings) {
      const worldX = building.gridX * this.cellWidth;
      const worldZ = building.gridZ * this.cellDepth;

      // Connect to +X neighbor
      const neighborX = this.buildings.find(
        b => b.gridX === building.gridX + 2 && b.gridZ === building.gridZ
      );
      if (neighborX) {
        const neighborWorldX = neighborX.gridX * this.cellWidth;
        const key = `x_${building.gridX}_${building.gridZ}`;
        const strands: ReturnType<ChristmasLights['createStrand']>[] = [];

        // NE to neighbor NW - reuse pre-allocated vectors
        this._tempStrandStart.set(worldX + halfW, roofHeight, worldZ - halfD);
        this._tempStrandEnd.set(neighborWorldX - halfW, roofHeight, worldZ - halfD);
        strands.push(this.christmasLights.createStrand(
          this._tempStrandStart,
          this._tempStrandEnd,
          streetConfig
        ));
        // SE to neighbor SW
        this._tempStrandStart.set(worldX + halfW, roofHeight, worldZ + halfD);
        this._tempStrandEnd.set(neighborWorldX - halfW, roofHeight, worldZ + halfD);
        strands.push(this.christmasLights.createStrand(
          this._tempStrandStart,
          this._tempStrandEnd,
          streetConfig
        ));
        this.streetLights.set(key, strands);
      }

      // Connect to +Z neighbor
      const neighborZ = this.buildings.find(
        b => b.gridX === building.gridX && b.gridZ === building.gridZ + 2
      );
      if (neighborZ) {
        const neighborWorldZ = neighborZ.gridZ * this.cellDepth;
        const key = `z_${building.gridX}_${building.gridZ}`;
        const strands: ReturnType<ChristmasLights['createStrand']>[] = [];

        // SW to neighbor NW - reuse pre-allocated vectors
        this._tempStrandStart.set(worldX - halfW, roofHeight, worldZ + halfD);
        this._tempStrandEnd.set(worldX - halfW, roofHeight, neighborWorldZ - halfD);
        strands.push(this.christmasLights.createStrand(
          this._tempStrandStart,
          this._tempStrandEnd,
          streetConfig
        ));
        // SE to neighbor NE
        this._tempStrandStart.set(worldX + halfW, roofHeight, worldZ + halfD);
        this._tempStrandEnd.set(worldX + halfW, roofHeight, neighborWorldZ - halfD);
        strands.push(this.christmasLights.createStrand(
          this._tempStrandStart,
          this._tempStrandEnd,
          streetConfig
        ));
        this.streetLights.set(key, strands);
      }
    }
  }

  /**
   * Update buildings based on player position
   */
  update(playerPosition: THREE.Vector3): void {
    if (!this.modelReady) return;

    if (!this.initialized) {
      this.initializeBuildings();
    }

    // Calculate player's grid cell
    const playerGridX = Math.floor(playerPosition.x / this.cellWidth);
    const playerGridZ = Math.floor(playerPosition.z / this.cellDepth);

    // Initialize base if first run
    if (!Number.isFinite(this.currentBaseX) || !Number.isFinite(this.currentBaseZ)) {
      const initBaseX = Math.floor(playerGridX / 2) * 2;
      const initBaseZ = Math.floor(playerGridZ / 2) * 2;
      this.repositionToBase(initBaseX, initBaseZ);
    }

    // Hysteresis: only shift the 2x2 window after the player goes one cell past the edge
    let shiftX = 0;
    if (playerGridX > this.currentBaseX + 2) shiftX = 2;
    else if (playerGridX < this.currentBaseX) shiftX = -2;

    let shiftZ = 0;
    if (playerGridZ > this.currentBaseZ + 2) shiftZ = 2;
    else if (playerGridZ < this.currentBaseZ) shiftZ = -2;

    if (shiftX !== 0 || shiftZ !== 0) {
      this.repositionToBase(this.currentBaseX + shiftX, this.currentBaseZ + shiftZ);
    }

    // Update roof transparency based on distance to player
    const fadeStartDistance = 12;
    const fadeEndDistance = 5;
    const fadeStartDistanceSq = fadeStartDistance * fadeStartDistance;

    for (const building of this.buildings) {
      const buildingPos = building.mesh.position;
      const dx = playerPosition.x - buildingPos.x;
      const dz = playerPosition.z - buildingPos.z;
      const distanceSq = dx * dx + dz * dz;

      let opacity = 1;
      // Only compute sqrt when within fade range (common case is outside range)
      if (distanceSq < fadeStartDistanceSq) {
        const distance = Math.sqrt(distanceSq);
        opacity = Math.max(0, (distance - fadeEndDistance) / (fadeStartDistance - fadeEndDistance));
      }

      for (const roofMesh of building.roofMeshes) {
        const material = roofMesh.material as THREE.MeshStandardMaterial;
        material.opacity = opacity;
        material.transparent = opacity < 1;
      }
    }
  }

  private repositionToBase(baseX: number, baseZ: number): void {
    // Target positions for the 4 buildings
    const targetPositions = [
      { gridX: baseX, gridZ: baseZ },
      { gridX: baseX + 2, gridZ: baseZ },
      { gridX: baseX, gridZ: baseZ + 2 },
      { gridX: baseX + 2, gridZ: baseZ + 2 },
    ];

    // Keep buildings that are already on a target; move only the ones that left the 2x2
    const remainingTargets = [...targetPositions];
    const outOfBounds: BuildingInstance[] = [];

    for (const building of this.buildings) {
      const idx = remainingTargets.findIndex(t => t.gridX === building.gridX && t.gridZ === building.gridZ);
      if (idx !== -1) {
        remainingTargets.splice(idx, 1); // This building already occupies a target spot
      } else {
        outOfBounds.push(building);
      }
    }

    // Reposition only the out-of-bounds buildings into the remaining target slots
    for (let i = 0; i < outOfBounds.length; i++) {
      const target = remainingTargets[i];
      if (target) {
        this.repositionBuilding(outOfBounds[i], target.gridX, target.gridZ);
      }
    }

    this.currentBaseX = baseX;
    this.currentBaseZ = baseZ;
    // DISABLED: Christmas lights for performance testing
    // this.updateStreetLights();
  }

  clear(): void {
    for (const building of this.buildings) {
      this.scene.remove(building.mesh);
      if (building.light) this.scene.remove(building.light);
      this.scene.remove(building.shadow);
      building.shadow.geometry.dispose();
      this.world.removeRigidBody(building.body);

      for (const roofMesh of building.roofMeshes) {
        (roofMesh.material as THREE.Material).dispose();
      }
    }
    this.buildings = [];

    for (const strands of this.streetLights.values()) {
      for (const strand of strands) {
        this.christmasLights.removeStrand(strand);
      }
    }
    this.streetLights.clear();

    this.initialized = false;
    this.currentBaseX = Infinity;
    this.currentBaseZ = Infinity;
  }

  getBuildingCount(): number {
    return this.buildings.length;
  }
}
