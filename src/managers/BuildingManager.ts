import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { CITY_CONFIG } from '../constants';
import { AssetLoader } from '../core/AssetLoader';
import { BuildingShadow, createBuildingShadow } from '../rendering/BlobShadow';

interface BuildingInstance {
  mesh: THREE.Group;
  body: RAPIER.RigidBody;
  roofMeshes: THREE.Mesh[];
  gridX: number;
  gridZ: number;
  lights: THREE.PointLight[]; // Interior point lights (front + back)
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

  // Pooled Christmas light strands (created once, repositioned with buildings)
  // 8 strands total: 4 X-direction + 4 Z-direction connections between 2x2 buildings
  private lightStrands: THREE.Group[] = [];
  private readonly NUM_STRANDS = 8;
  private strandsInitialized = false;

  // Strand config
  private readonly STRAND_BULB_COUNT = 12;
  private readonly STRAND_BULB_SIZE = 0.1;
  private readonly STRAND_SAG = 0.5;

  // Shared geometry/materials for all bulbs
  private bulbGeometry: THREE.SphereGeometry | null = null;
  private bulbMaterials: THREE.MeshBasicMaterial[] = []; // One per color
  private wireMaterial: THREE.LineBasicMaterial | null = null;

  // Colors for multicolor preset
  private readonly BULB_COLORS = [
    0xff4444, // Red
    0x44ff44, // Green
    0x4444ff, // Blue
    0xffff44, // Yellow
    0xff44ff, // Pink
  ];

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

  // Shared geometry/material for light pool planes (emissive glow on ground)
  private lightPoolGeometry: THREE.PlaneGeometry | null = null;
  private lightPoolMaterial: THREE.MeshBasicMaterial | null = null;

  constructor(scene: THREE.Scene, world: RAPIER.World) {
    this.scene = scene;
    this.world = world;

    this.cellWidth = CITY_CONFIG.BUILDING_WIDTH + CITY_CONFIG.STREET_WIDTH;
    this.cellDepth = CITY_CONFIG.BUILDING_WIDTH + CITY_CONFIG.STREET_WIDTH;

    this.createSharedLightGeometry();
    this.createLightPoolGeometry();
    this.loadModel();
  }

  /**
   * Create shared geometry and materials for Christmas light strands
   */
  private createSharedLightGeometry(): void {
    this.bulbGeometry = new THREE.SphereGeometry(this.STRAND_BULB_SIZE, 6, 4);

    // Create materials for each color
    for (const color of this.BULB_COLORS) {
      this.bulbMaterials.push(new THREE.MeshBasicMaterial({ color }));
    }

    this.wireMaterial = new THREE.LineBasicMaterial({ color: 0x222222 });
  }

  /**
   * Create shared geometry/material for light pool planes
   * These are emissive planes on the ground that fake light spilling out
   */
  private createLightPoolGeometry(): void {
    // Elliptical pool of light in front of stall opening
    this.lightPoolGeometry = new THREE.PlaneGeometry(8, 5);
    this.lightPoolMaterial = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  /**
   * Create a single light strand (wire + bulbs) - reusable
   */
  private createLightStrand(): THREE.Group {
    const group = new THREE.Group();

    // Create wire (will update geometry when repositioning)
    const wireGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.STRAND_BULB_COUNT * 3);
    wireGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const wire = new THREE.Line(wireGeometry, this.wireMaterial!);
    wire.name = 'wire';
    group.add(wire);

    // Create bulbs
    for (let i = 0; i < this.STRAND_BULB_COUNT; i++) {
      const material = this.bulbMaterials[i % this.bulbMaterials.length];
      const bulb = new THREE.Mesh(this.bulbGeometry!, material);
      bulb.name = `bulb_${i}`;
      group.add(bulb);
    }

    // Add one point light in the middle of the strand
    const pointLight = new THREE.PointLight(0xffffff, 3, 12, 1.5);
    pointLight.name = 'light';
    group.add(pointLight);

    return group;
  }

  /**
   * Initialize pooled light strands
   */
  private initializeLightStrands(): void {
    if (this.strandsInitialized) return;

    for (let i = 0; i < this.NUM_STRANDS; i++) {
      const strand = this.createLightStrand();
      this.scene.add(strand);
      this.lightStrands.push(strand);
    }

    this.strandsInitialized = true;
  }

  /**
   * Reposition a light strand between two points
   */
  private repositionStrand(
    strand: THREE.Group,
    start: THREE.Vector3,
    end: THREE.Vector3
  ): void {
    const wire = strand.getObjectByName('wire') as THREE.Line;
    const light = strand.getObjectByName('light') as THREE.PointLight;

    // Calculate catenary points
    const positions = (wire.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;

    for (let i = 0; i < this.STRAND_BULB_COUNT; i++) {
      const t = i / (this.STRAND_BULB_COUNT - 1);

      // Linear interpolation
      const x = start.x + (end.x - start.x) * t;
      const z = start.z + (end.z - start.z) * t;

      // Catenary sag (parabola)
      const sagFactor = 4 * t * (1 - t);
      const length = start.distanceTo(end);
      const sag = this.STRAND_SAG * length * sagFactor;
      const y = start.y - sag;

      // Update wire positions
      positions.setXYZ(i, x, y, z);

      // Update bulb positions
      const bulb = strand.getObjectByName(`bulb_${i}`) as THREE.Mesh;
      if (bulb) {
        bulb.position.set(x, y, z);
      }
    }

    positions.needsUpdate = true;
    wire.geometry.computeBoundingSphere();

    // Position light at middle of strand
    const midX = (start.x + end.x) / 2;
    const midZ = (start.z + end.z) / 2;
    const midY = start.y - this.STRAND_SAG * start.distanceTo(end) * 0.25;
    light.position.set(midX, midY, midZ);

    // Set light color to average of strand colors (warm white-ish)
    light.color.setHex(0xffaa88);
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

    // No building lights - only lamp posts provide illumination
    const lights: THREE.PointLight[] = [];

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
      lights,
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

    // Move point lights with building
    const lightOffset = this.scaledDepth / 2;
    const lightHeight = this.scaledHeight * 0.5;
    if (building.lights[0]) {
      building.lights[0].position.set(worldX, lightHeight, worldZ - lightOffset);
    }
    if (building.lights[1]) {
      building.lights[1].position.set(worldX, lightHeight, worldZ + lightOffset);
    }

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
   * Update pooled light strands to connect buildings
   * Called when buildings reposition - just moves existing strands, no allocation
   */
  private updateLightStrands(): void {
    if (!this.strandsInitialized) {
      this.initializeLightStrands();
    }

    const roofHeight = this.scaledHeight * 0.9;
    const halfW = this.scaledWidth / 2;
    const halfD = this.scaledDepth / 2;

    let strandIndex = 0;

    // Connect buildings in X direction (2 strands per connection: front and back)
    // Building 0 to 1, and Building 2 to 3
    for (let row = 0; row < 2; row++) {
      const b0 = this.buildings[row * 2];
      const b1 = this.buildings[row * 2 + 1];
      if (!b0 || !b1) continue;

      const x0 = b0.gridX * this.cellWidth;
      const z0 = b0.gridZ * this.cellDepth;
      const x1 = b1.gridX * this.cellWidth;

      // Front strand (near side)
      this._tempStrandStart.set(x0 + halfW, roofHeight, z0 - halfD);
      this._tempStrandEnd.set(x1 - halfW, roofHeight, z0 - halfD);
      if (strandIndex < this.NUM_STRANDS) {
        this.repositionStrand(this.lightStrands[strandIndex++], this._tempStrandStart, this._tempStrandEnd);
      }

      // Back strand (far side)
      this._tempStrandStart.set(x0 + halfW, roofHeight, z0 + halfD);
      this._tempStrandEnd.set(x1 - halfW, roofHeight, z0 + halfD);
      if (strandIndex < this.NUM_STRANDS) {
        this.repositionStrand(this.lightStrands[strandIndex++], this._tempStrandStart, this._tempStrandEnd);
      }
    }

    // Connect buildings in Z direction (2 strands per connection: left and right)
    // Building 0 to 2, and Building 1 to 3
    for (let col = 0; col < 2; col++) {
      const b0 = this.buildings[col];
      const b1 = this.buildings[col + 2];
      if (!b0 || !b1) continue;

      const x0 = b0.gridX * this.cellWidth;
      const z0 = b0.gridZ * this.cellDepth;
      const z1 = b1.gridZ * this.cellDepth;

      // Left strand
      this._tempStrandStart.set(x0 - halfW, roofHeight, z0 + halfD);
      this._tempStrandEnd.set(x0 - halfW, roofHeight, z1 - halfD);
      if (strandIndex < this.NUM_STRANDS) {
        this.repositionStrand(this.lightStrands[strandIndex++], this._tempStrandStart, this._tempStrandEnd);
      }

      // Right strand
      this._tempStrandStart.set(x0 + halfW, roofHeight, z0 + halfD);
      this._tempStrandEnd.set(x0 + halfW, roofHeight, z1 - halfD);
      if (strandIndex < this.NUM_STRANDS) {
        this.repositionStrand(this.lightStrands[strandIndex++], this._tempStrandStart, this._tempStrandEnd);
      }
    }
  }

  // Light culling distance squared (only enable lights within this range)
  private readonly LIGHT_CULL_DISTANCE_SQ = 30 * 30;

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

      // Cull lights based on distance - huge perf win
      const lightsVisible = distanceSq < this.LIGHT_CULL_DISTANCE_SQ;
      for (const light of building.lights) {
        light.visible = lightsVisible;
      }

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

    // DISABLED: Christmas light strands between buildings
    // The warm glow effect comes more from building interior lights than overhead strands
    // this.updateLightStrands();
  }

  clear(): void {
    for (const building of this.buildings) {
      this.scene.remove(building.mesh);
      for (const light of building.lights) {
        this.scene.remove(light);
      }
      this.scene.remove(building.shadow);
      building.shadow.geometry.dispose();
      this.world.removeRigidBody(building.body);

      for (const roofMesh of building.roofMeshes) {
        (roofMesh.material as THREE.Material).dispose();
      }
    }
    this.buildings = [];

    // Remove pooled light strands
    for (const strand of this.lightStrands) {
      this.scene.remove(strand);
    }
    this.lightStrands = [];
    this.strandsInitialized = false;

    this.initialized = false;
    this.currentBaseX = Infinity;
    this.currentBaseZ = Infinity;
  }

  getBuildingCount(): number {
    return this.buildings.length;
  }

  /**
   * Set visibility of all buildings (for Rampage Dimension effect)
   */
  setAllVisible(visible: boolean): void {
    console.log('BuildingManager.setAllVisible', visible, 'buildings:', this.buildings.length);
    for (const building of this.buildings) {
      // Traverse all children to ensure complete visibility toggle
      let count = 0;
      building.mesh.traverse((child) => {
        child.visible = visible;
        count++;
      });
      console.log('  building mesh children:', count);
      building.shadow.visible = visible;
      for (const light of building.lights) {
        light.visible = visible;
      }
    }
    // Also hide/show light strands
    for (const strand of this.lightStrands) {
      strand.traverse((child) => {
        child.visible = visible;
      });
    }
  }

  /**
   * Check if a position is inside any building collider
   * Used by truck to detect building collisions
   */
  getBuildingAtPosition(position: THREE.Vector3, radius: number): BuildingInstance | null {
    for (const building of this.buildings) {
      if (!building.mesh.visible) continue; // Skip destroyed buildings

      const worldX = building.gridX * this.cellWidth;
      const worldZ = building.gridZ * this.cellDepth;

      // Simple AABB check with radius
      const halfW = this.scaledWidth / 2 + radius;
      const halfD = this.scaledDepth / 2 + radius;

      if (
        position.x >= worldX - halfW &&
        position.x <= worldX + halfW &&
        position.z >= worldZ - halfD &&
        position.z <= worldZ + halfD
      ) {
        return building;
      }
    }
    return null;
  }

  // Track buildings being destroyed (for animation)
  private destroyingBuildings: Map<BuildingInstance, {
    startTime: number;
    originalY: number;
    originalScale: number;
    originalX: number;
    originalZ: number;
    shakeOffsetX: number;
    shakeOffsetZ: number;
  }> = new Map();

  // Destruction animation constants
  private readonly DESTROY_DURATION = 1.2; // seconds (longer for more dramatic effect)
  private readonly SINK_DEPTH = 6; // How far building sinks
  private readonly SHAKE_DURATION = 0.3; // Initial shake before collapse
  private readonly SHAKE_INTENSITY = 0.3; // How much it shakes

  /**
   * Destroy a building with collapse animation
   * Returns true if building was destroyed, false if already destroyed
   */
  destroyBuilding(building: BuildingInstance): boolean {
    if (!building.mesh.visible) return false;
    if (this.destroyingBuildings.has(building)) return false;

    // Start destruction animation
    this.destroyingBuildings.set(building, {
      startTime: performance.now() / 1000,
      originalY: building.mesh.position.y,
      originalScale: building.mesh.scale.x,
      originalX: building.mesh.position.x,
      originalZ: building.mesh.position.z,
      shakeOffsetX: 0,
      shakeOffsetZ: 0,
    });

    // Hide shadow immediately
    building.shadow.visible = false;

    // Flash the building white on impact
    building.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat.emissive) {
          mat.emissive.setHex(0xffffff);
          mat.emissiveIntensity = 2;
        }
      }
    });

    return true;
  }

  /**
   * Update destruction animations
   */
  updateDestructionAnimations(): void {
    const now = performance.now() / 1000;

    for (const [building, state] of this.destroyingBuildings.entries()) {
      const elapsed = now - state.startTime;
      const progress = Math.min(1, elapsed / this.DESTROY_DURATION);

      // Phase 1: Shake (first SHAKE_DURATION seconds)
      const shakeProgress = Math.min(1, elapsed / this.SHAKE_DURATION);
      if (shakeProgress < 1) {
        // Intense shaking that decreases over time
        const shakeAmount = this.SHAKE_INTENSITY * (1 - shakeProgress * 0.5);
        state.shakeOffsetX = (Math.random() - 0.5) * 2 * shakeAmount;
        state.shakeOffsetZ = (Math.random() - 0.5) * 2 * shakeAmount;
        building.mesh.position.x = state.originalX + state.shakeOffsetX;
        building.mesh.position.z = state.originalZ + state.shakeOffsetZ;

        // Fade out the white flash during shake
        const flashFade = shakeProgress;
        building.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mat = child.material as THREE.MeshStandardMaterial;
            if (mat.emissive) {
              mat.emissiveIntensity = 2 * (1 - flashFade);
            }
          }
        });
      } else {
        // Reset X/Z position after shake
        building.mesh.position.x = state.originalX;
        building.mesh.position.z = state.originalZ;
      }

      // Phase 2: Collapse (after shake)
      const collapseStart = this.SHAKE_DURATION / this.DESTROY_DURATION;
      if (progress > collapseStart) {
        const collapseProgress = (progress - collapseStart) / (1 - collapseStart);

        // Easing function for dramatic collapse (ease-in cubic)
        const eased = collapseProgress * collapseProgress * collapseProgress;

        // Sink into ground
        building.mesh.position.y = state.originalY - (this.SINK_DEPTH * eased);

        // Scale down as it collapses
        const scale = state.originalScale * (1 - eased * 0.4);
        building.mesh.scale.setScalar(scale);

        // Rotate chaotically as it falls
        building.mesh.rotation.x = eased * 0.3 * (Math.sin(elapsed * 10) * 0.5 + 0.5);
        building.mesh.rotation.z = eased * 0.25 * (Math.cos(elapsed * 8) * 0.5 + 0.5);

        // Fade out in the last 30%
        if (collapseProgress > 0.7) {
          const fadeProgress = (collapseProgress - 0.7) / 0.3;
          building.mesh.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              const mat = child.material as THREE.MeshStandardMaterial;
              if (!mat.transparent) {
                mat.transparent = true;
              }
              mat.opacity = 1 - fadeProgress;
            }
          });
        }
      }

      // Animation complete
      if (progress >= 1) {
        building.mesh.visible = false;

        // Reset for respawn
        building.mesh.position.set(state.originalX, state.originalY, state.originalZ);
        building.mesh.scale.setScalar(state.originalScale);
        building.mesh.rotation.x = 0;
        building.mesh.rotation.z = 0;

        // Reset materials
        building.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mat = child.material as THREE.MeshStandardMaterial;
            mat.opacity = 1;
            mat.transparent = false;
            if (mat.emissive) {
              mat.emissive.setHex(0x000000);
              mat.emissiveIntensity = 0;
            }
          }
        });

        this.destroyingBuildings.delete(building);

        // Schedule rebuild after 5 seconds
        setTimeout(() => {
          building.mesh.visible = true;
          building.shadow.visible = true;
        }, 5000);
      }
    }
  }

  // Pre-allocated vector for building destruction position (avoid per-frame allocations)
  private _destroyedBuildingPos = new THREE.Vector3();

  /**
   * Check for truck collision and destroy building
   * Returns world position of destroyed building, or null if no destruction
   */
  checkTruckCollision(truckPosition: THREE.Vector3, truckRadius: number): THREE.Vector3 | null {
    const building = this.getBuildingAtPosition(truckPosition, truckRadius);
    if (building && this.destroyBuilding(building)) {
      // Return building center position (reuse pre-allocated vector)
      const worldX = building.gridX * this.cellWidth;
      const worldZ = building.gridZ * this.cellDepth;
      this._destroyedBuildingPos.set(worldX, this.scaledHeight / 2, worldZ);
      return this._destroyedBuildingPos;
    }
    return null;
  }
}
