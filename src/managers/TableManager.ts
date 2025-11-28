import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CITY_CONFIG, SKIN_TONES } from '../constants';
import { AssetLoader } from '../core/AssetLoader';
import { AnimationHelper } from '../utils/AnimationHelper';

/**
 * Static pedestrian at a table (idle/talking)
 * Much simpler than regular Pedestrian - no physics, no AI, just animation
 * But can be killed by player vehicle!
 */
interface TablePatron {
  mesh: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  animations: THREE.AnimationClip[];
  position: THREE.Vector3;
  isDead: boolean;
  health: number;
}

/**
 * Table instance with patrons
 */
interface TableInstance {
  tableMesh: THREE.Group;
  patrons: TablePatron[];
  gridX: number;
  gridZ: number;
}

/**
 * TableManager
 *
 * Creates low poly wooden tables at corners between 4 buildings
 * with static pedestrians having a drink (idle animations).
 *
 * Performance-focused:
 * - Simple box geometry for tables
 * - Reuses existing pedestrian models (preloaded)
 * - LOD: stops animations for distant patrons
 * - Object pooling with repositioning
 */
export class TableManager {
  private scene: THREE.Scene;
  private tables: TableInstance[] = [];
  private initialized = false;

  // Grid cell size (matches BuildingManager)
  private cellWidth: number;
  private cellDepth: number;

  // Track current base position (matches BuildingManager pattern)
  private currentBaseX = Infinity;
  private currentBaseZ = Infinity;

  // Shared geometry/materials for tables (created once)
  private tableTopGeometry: THREE.BoxGeometry | null = null;
  private tableLegGeometry: THREE.BoxGeometry | null = null;
  private tableMaterial: THREE.MeshStandardMaterial | null = null;

  // Character types for variety (casual only for bar scene)
  private readonly PATRON_TYPES = [
    'Casual2_Female', 'Casual2_Male', 'Casual3_Female', 'Casual3_Male',
    'Casual_Bald', 'Casual_Female', 'Casual_Male',
  ];

  // Patrons per table (keep low for performance)
  private readonly PATRONS_PER_TABLE = 3;

  // Pre-allocated vectors
  private readonly _tempPos = new THREE.Vector3();

  // Animation LOD distance squared (skip animation updates beyond this)
  private static readonly ANIMATION_LOD_DISTANCE_SQ = 400; // 20^2

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.cellWidth = CITY_CONFIG.BUILDING_WIDTH + CITY_CONFIG.STREET_WIDTH;
    this.cellDepth = CITY_CONFIG.BUILDING_WIDTH + CITY_CONFIG.STREET_WIDTH;

    this.createSharedGeometry();
  }

  /**
   * Create shared geometry and materials for all tables
   */
  private createSharedGeometry(): void {
    // Table top: 2m x 0.1m x 1.2m (wide enough for 3-4 people)
    this.tableTopGeometry = new THREE.BoxGeometry(2, 0.1, 1.2);

    // Table legs: 0.1m x 0.7m x 0.1m
    this.tableLegGeometry = new THREE.BoxGeometry(0.1, 0.7, 0.1);

    // Warm wood material
    this.tableMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B4513, // Saddle brown
      roughness: 0.8,
      metalness: 0.0,
    });
  }

  /**
   * Create a low-poly wooden table mesh
   */
  private createTableMesh(): THREE.Group {
    const table = new THREE.Group();

    // Table top
    const top = new THREE.Mesh(this.tableTopGeometry!, this.tableMaterial!);
    top.position.y = 0.75; // Table height
    top.castShadow = false;
    top.receiveShadow = false;
    table.add(top);

    // Four legs at corners
    const legPositions = [
      { x: -0.85, z: -0.5 },
      { x: 0.85, z: -0.5 },
      { x: -0.85, z: 0.5 },
      { x: 0.85, z: 0.5 },
    ];

    for (const pos of legPositions) {
      const leg = new THREE.Mesh(this.tableLegGeometry!, this.tableMaterial!);
      leg.position.set(pos.x, 0.35, pos.z);
      leg.castShadow = false;
      leg.receiveShadow = false;
      table.add(leg);
    }

    return table;
  }

  /**
   * Create a static patron at a table (synchronous - models are preloaded)
   */
  private createPatron(position: THREE.Vector3, facingAngle: number): TablePatron | null {
    const assetLoader = AssetLoader.getInstance();
    const characterType = this.PATRON_TYPES[Math.floor(Math.random() * this.PATRON_TYPES.length)];
    const cachedGltf = assetLoader.getModel(`/assets/pedestrians/${characterType}.gltf`);

    if (!cachedGltf) {
      // Model not loaded yet - skip this patron
      return null;
    }

    // Clone the model (synchronous operation)
    const clonedScene = SkeletonUtils.clone(cachedGltf.scene);
    const mesh = new THREE.Group();
    mesh.add(clonedScene);

    // Disable shadows (we use blob shadows)
    AnimationHelper.setupShadows(clonedScene, false, false);

    // Apply random skin tone
    const randomSkinTone = AnimationHelper.randomElement(SKIN_TONES);
    AnimationHelper.applySkinTone(clonedScene, randomSkinTone);

    // Position and rotate
    mesh.position.copy(position);
    mesh.rotation.y = facingAngle;

    // Setup animation mixer
    const mixer = new THREE.AnimationMixer(clonedScene);
    const animations = cachedGltf.animations;

    // Play idle animation
    const idleClip = THREE.AnimationClip.findByName(animations, 'Idle');
    if (idleClip) {
      const action = mixer.clipAction(idleClip);
      // Randomize start time so patrons aren't in sync
      action.time = Math.random() * idleClip.duration;
      action.play();
    }

    this.scene.add(mesh);

    return {
      mesh,
      mixer,
      animations,
      position: position.clone(),
      isDead: false,
      health: 100,
    };
  }

  /**
   * Create a table with patrons at a corner position
   */
  private createTableInstance(gridX: number, gridZ: number): TableInstance {
    // Position at center of 4-building intersection (offset by 1 cell from building centers)
    // Buildings are at even grid positions (0,2,4...), tables go at odd positions (1,3,5...)
    const worldX = (gridX + 1) * this.cellWidth;
    const worldZ = (gridZ + 1) * this.cellDepth;

    // Create table
    const tableMesh = this.createTableMesh();
    tableMesh.position.set(worldX, 0, worldZ);
    // Random rotation for variety
    tableMesh.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(tableMesh);

    // Create patrons around the table
    const patrons: TablePatron[] = [];
    const tableRotation = tableMesh.rotation.y;

    // Position patrons around the table (standing, facing table)
    const patronOffsets = [
      { x: 0, z: -1.0, angle: 0 },           // Front
      { x: -1.2, z: 0.3, angle: Math.PI / 2 },  // Left
      { x: 1.2, z: 0.3, angle: -Math.PI / 2 },  // Right
    ];

    for (let i = 0; i < this.PATRONS_PER_TABLE; i++) {
      const offset = patronOffsets[i];

      // Apply table rotation to offset
      const rotatedX = offset.x * Math.cos(tableRotation) - offset.z * Math.sin(tableRotation);
      const rotatedZ = offset.x * Math.sin(tableRotation) + offset.z * Math.cos(tableRotation);

      this._tempPos.set(
        worldX + rotatedX,
        0,
        worldZ + rotatedZ
      );

      const patron = this.createPatron(this._tempPos, tableRotation + offset.angle + Math.PI);
      if (patron) {
        patrons.push(patron);
      }
    }

    return {
      tableMesh,
      patrons,
      gridX,
      gridZ,
    };
  }

  /**
   * Initialize 4 tables (one for each corner)
   */
  private initializeTables(): void {
    if (this.initialized) return;

    // Create 4 tables at the corners of the 2x2 building grid
    // These will be repositioned as player moves
    const positions = [
      { gridX: 0, gridZ: 0 },   // SW corner
      { gridX: 2, gridZ: 0 },   // SE corner
      { gridX: 0, gridZ: 2 },   // NW corner
      { gridX: 2, gridZ: 2 },   // NE corner
    ];

    for (const pos of positions) {
      const table = this.createTableInstance(pos.gridX, pos.gridZ);
      this.tables.push(table);
    }

    this.initialized = true;
  }

  /**
   * Dispose a single patron and clean up resources
   */
  private disposePatron(patron: TablePatron): void {
    this.scene.remove(patron.mesh);
    // Dispose cloned materials (don't dispose geometry - shared)
    patron.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => mat.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }

  /**
   * Reposition a table to a new grid position
   */
  private repositionTable(table: TableInstance, newGridX: number, newGridZ: number): void {
    const worldX = (newGridX + 1) * this.cellWidth;
    const worldZ = (newGridZ + 1) * this.cellDepth;

    // Move table mesh
    table.tableMesh.position.set(worldX, 0, worldZ);
    // New random rotation
    const newRotation = Math.random() * Math.PI * 2;
    table.tableMesh.rotation.y = newRotation;

    // Remove old patrons
    for (const patron of table.patrons) {
      this.disposePatron(patron);
    }

    // Create new patrons at new positions
    table.patrons = [];
    const patronOffsets = [
      { x: 0, z: -1.0, angle: 0 },
      { x: -1.2, z: 0.3, angle: Math.PI / 2 },
      { x: 1.2, z: 0.3, angle: -Math.PI / 2 },
    ];

    for (let i = 0; i < this.PATRONS_PER_TABLE; i++) {
      const offset = patronOffsets[i];
      const rotatedX = offset.x * Math.cos(newRotation) - offset.z * Math.sin(newRotation);
      const rotatedZ = offset.x * Math.sin(newRotation) + offset.z * Math.cos(newRotation);

      this._tempPos.set(worldX + rotatedX, 0, worldZ + rotatedZ);

      const patron = this.createPatron(this._tempPos, newRotation + offset.angle + Math.PI);
      if (patron) {
        table.patrons.push(patron);
      }
    }

    table.gridX = newGridX;
    table.gridZ = newGridZ;
  }

  /**
   * Reposition all tables to new base position
   */
  private repositionToBase(baseX: number, baseZ: number): void {
    const targetPositions = [
      { gridX: baseX, gridZ: baseZ },
      { gridX: baseX + 2, gridZ: baseZ },
      { gridX: baseX, gridZ: baseZ + 2 },
      { gridX: baseX + 2, gridZ: baseZ + 2 },
    ];

    // Find tables that need to move
    const remainingTargets = [...targetPositions];
    const outOfBounds: TableInstance[] = [];

    for (const table of this.tables) {
      const idx = remainingTargets.findIndex(t => t.gridX === table.gridX && t.gridZ === table.gridZ);
      if (idx !== -1) {
        remainingTargets.splice(idx, 1);
      } else {
        outOfBounds.push(table);
      }
    }

    // Reposition out-of-bounds tables
    for (let i = 0; i < outOfBounds.length; i++) {
      const target = remainingTargets[i];
      if (target) {
        this.repositionTable(outOfBounds[i], target.gridX, target.gridZ);
      }
    }

    this.currentBaseX = baseX;
    this.currentBaseZ = baseZ;
  }

  /**
   * Update tables and patron animations (synchronous - safe for game loop)
   */
  update(playerPosition: THREE.Vector3, deltaTime: number): void {
    // Initialize on first update
    if (!this.initialized) {
      this.initializeTables();
    }

    // Calculate player's grid cell (same logic as BuildingManager)
    const playerGridX = Math.floor(playerPosition.x / this.cellWidth);
    const playerGridZ = Math.floor(playerPosition.z / this.cellDepth);

    // Initialize base if first run
    if (!Number.isFinite(this.currentBaseX) || !Number.isFinite(this.currentBaseZ)) {
      const initBaseX = Math.floor(playerGridX / 2) * 2;
      const initBaseZ = Math.floor(playerGridZ / 2) * 2;
      this.repositionToBase(initBaseX, initBaseZ);
    }

    // Hysteresis: only shift after player goes one cell past edge
    let shiftX = 0;
    if (playerGridX > this.currentBaseX + 2) shiftX = 2;
    else if (playerGridX < this.currentBaseX) shiftX = -2;

    let shiftZ = 0;
    if (playerGridZ > this.currentBaseZ + 2) shiftZ = 2;
    else if (playerGridZ < this.currentBaseZ) shiftZ = -2;

    if (shiftX !== 0 || shiftZ !== 0) {
      this.repositionToBase(this.currentBaseX + shiftX, this.currentBaseZ + shiftZ);
    }

    // Update patron animations (with LOD - skip distant ones)
    for (const table of this.tables) {
      for (const patron of table.patrons) {
        if (!patron.mixer) continue;

        // Calculate squared distance for LOD
        const dx = patron.position.x - playerPosition.x;
        const dz = patron.position.z - playerPosition.z;
        const distSq = dx * dx + dz * dz;

        // Only update animations for nearby patrons (LOD optimization)
        if (distSq < TableManager.ANIMATION_LOD_DISTANCE_SQ) {
          patron.mixer.update(deltaTime);
        }
      }
    }
  }

  /**
   * Clear all tables and patrons
   */
  clear(): void {
    for (const table of this.tables) {
      this.scene.remove(table.tableMesh);

      for (const patron of table.patrons) {
        this.disposePatron(patron);
      }
    }

    this.tables = [];
    this.initialized = false;
    this.currentBaseX = Infinity;
    this.currentBaseZ = Infinity;

    // Dispose shared resources
    this.tableTopGeometry?.dispose();
    this.tableLegGeometry?.dispose();
    this.tableMaterial?.dispose();
  }

  /**
   * Damage patrons in radius (for vehicle kills)
   * Returns kill count and positions for blood effects
   */
  damageInRadius(
    position: THREE.Vector3,
    radius: number,
    damage: number
  ): { kills: number; positions: THREE.Vector3[] } {
    const radiusSq = radius * radius;
    let kills = 0;
    const positions: THREE.Vector3[] = [];

    for (const table of this.tables) {
      for (const patron of table.patrons) {
        if (patron.isDead) continue;

        const dx = patron.position.x - position.x;
        const dz = patron.position.z - position.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < radiusSq) {
          patron.health -= damage;
          if (patron.health <= 0) {
            patron.isDead = true;
            kills++;
            positions.push(patron.position.clone());

            // Play death animation
            if (patron.mixer && patron.animations.length > 0) {
              const deathClip = THREE.AnimationClip.findByName(patron.animations, 'Death_A') ||
                                THREE.AnimationClip.findByName(patron.animations, 'Death_B');
              if (deathClip) {
                patron.mixer.stopAllAction();
                const action = patron.mixer.clipAction(deathClip);
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
                action.play();
              }
            }
          }
        }
      }
    }

    return { kills, positions };
  }

  /**
   * Get table count (for debugging)
   */
  getTableCount(): number {
    return this.tables.length;
  }

  /**
   * Get total patron count (for debugging)
   */
  getPatronCount(): number {
    return this.tables.reduce((sum, table) => sum + table.patrons.length, 0);
  }

  /**
   * Get alive patron count
   */
  getAlivePatronCount(): number {
    return this.tables.reduce((sum, table) =>
      sum + table.patrons.filter(p => !p.isDead).length, 0);
  }
}
