import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import * as YUKA from 'yuka';
import { Pedestrian } from '../entities/Pedestrian';
import { InstancedBlobShadows } from '../rendering/InstancedBlobShadows';
import { AIManager } from '../core/AIManager';
import { CITY_CONFIG } from '../constants';

/**
 * CrowdManager
 *
 * Manages spawning and lifecycle of pedestrian NPCs
 * - Spawns pedestrians around player
 * - Implements Yuka flocking behavior
 * - Handles death and respawning
 */
export class CrowdManager {
  private pedestrians: Pedestrian[] = [];
  private pedestrianPool: Pedestrian[] = [];
  private scene: THREE.Scene;
  private world: RAPIER.World;
  private aiManager: AIManager;
  private shadowManager: InstancedBlobShadows;

  // Deferred cleanup queue (clean AFTER physics step)
  private pedestriansToRemove: Pedestrian[] = [];

  // Death timers - track when pedestrians died for delayed cleanup
  private deathTimers: Map<Pedestrian, number> = new Map();
  private readonly DEATH_CLEANUP_DELAY = 3.0; // Seconds before dead pedestrians are removed

  // Spawn config
  private maxPedestrians: number = 60;
  private spawnRadius: number = 25; // Max spawn distance
  private minSpawnDistance: number = 18; // Spawn off-screen (visible area is ~15 units radius)

  // Table system - simple vertical tables at intersection corners
  private tables: THREE.Group[] = [];
  private tableGeometry: THREE.BoxGeometry | null = null;
  private tableMaterial: THREE.MeshStandardMaterial | null = null;
  private cellWidth: number;
  private cellDepth: number;
  private currentTableBaseX = Infinity;
  private currentTableBaseZ = Infinity;

  // Track which pedestrians are "at tables" (standing idle)
  private tablePedestrians: Set<Pedestrian> = new Set();

  // Character types with weights (higher = more common)
  private characterPool: Array<{ type: string; weight: number }> = [
    // Very common: Casual characters (weight 5)
    { type: 'Casual2_Female', weight: 5 },
    { type: 'Casual2_Male', weight: 5 },
    { type: 'Casual3_Female', weight: 5 },
    { type: 'Casual3_Male', weight: 5 },
    { type: 'Casual_Bald', weight: 5 },
    { type: 'Casual_Female', weight: 5 },
    { type: 'Casual_Male', weight: 5 },

    // Common: Business/Worker (weight 3)
    { type: 'Suit_Female', weight: 3 },
    { type: 'Suit_Male', weight: 3 },
    { type: 'Worker_Female', weight: 3 },
    { type: 'Worker_Male', weight: 3 },

    // Uncommon: Specialized (weight 1)
    { type: 'Chef_Female', weight: 1 },
    { type: 'Chef_Male', weight: 1 },
    { type: 'Doctor_Female_Young', weight: 1 },
    { type: 'Doctor_Male_Young', weight: 1 },

    // Rare: Ninja characters (weight 0.5)
    // NOTE: BlueSoldier and Soldier models are reserved for cops
    { type: 'Ninja_Female', weight: 0.5 },
    { type: 'Ninja_Male', weight: 0.5 },
    { type: 'Ninja_Sand', weight: 0.5 },
    { type: 'Ninja_Sand_Female', weight: 0.5 },
  ];

  private totalWeight: number;

  // Track recently spawned types to avoid duplicates appearing together
  private recentlySpawnedTypes: string[] = [];
  private readonly MAX_RECENT_TYPES = 5; // Don't repeat last 5 types

  // Pre-allocated vectors for per-frame operations (avoid GC pressure)
  private readonly _tempDirection: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempKillPos: THREE.Vector3 = new THREE.Vector3();

  constructor(scene: THREE.Scene, world: RAPIER.World, aiManager: AIManager) {
    this.scene = scene;
    this.world = world;
    this.aiManager = aiManager;

    // Create instanced shadow manager (max 80 shadows for pedestrians)
    this.shadowManager = new InstancedBlobShadows(scene, 80);

    this.totalWeight = this.characterPool.reduce((sum, char) => sum + char.weight, 0);

    // Table grid setup
    this.cellWidth = CITY_CONFIG.BUILDING_WIDTH + CITY_CONFIG.STREET_WIDTH;
    this.cellDepth = CITY_CONFIG.BUILDING_WIDTH + CITY_CONFIG.STREET_WIDTH;

    // Create shared table geometry and material
    this.tableGeometry = new THREE.BoxGeometry(1.5, 0.8, 0.6); // Vertical table
    this.tableMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B4513, // Saddle brown wood
      roughness: 0.8,
    });
  }

  /**
   * Get weighted random character type, avoiding recently spawned types
   */
  private getRandomCharacterType(): string {
    // Filter out recently spawned types
    const availableChars = this.characterPool.filter(
      char => !this.recentlySpawnedTypes.includes(char.type)
    );

    // If all types are recent (shouldn't happen with 15+ types and 5 recent), use full pool
    const pool = availableChars.length > 0 ? availableChars : this.characterPool;
    const poolWeight = pool.reduce((sum, char) => sum + char.weight, 0);

    let random = Math.random() * poolWeight;

    for (const char of pool) {
      random -= char.weight;
      if (random <= 0) {
        // Track this type as recently spawned
        this.recentlySpawnedTypes.push(char.type);
        if (this.recentlySpawnedTypes.length > this.MAX_RECENT_TYPES) {
          this.recentlySpawnedTypes.shift(); // Remove oldest
        }
        return char.type;
      }
    }

    // Fallback to first character
    return pool[0].type;
  }

  /**
   * Initialize crowd with pedestrians
   */
  spawnInitialCrowd(playerPosition: THREE.Vector3): void {
    for (let i = 0; i < this.maxPedestrians; i++) {
      this.spawnPedestrian(playerPosition);
    }
    // Note: Flocking behaviors (separation, alignment, cohesion) are set up
    // in Pedestrian constructor, no need for separate setupFlocking()
  }

  /**
   * Spawn a single pedestrian at random position around player
   */
  private spawnPedestrian(playerPosition: THREE.Vector3): void {
    // Random position around player
    const angle = Math.random() * Math.PI * 2;
    const distance = this.minSpawnDistance + Math.random() * (this.spawnRadius - this.minSpawnDistance);

    const position = new THREE.Vector3(
      playerPosition.x + Math.cos(angle) * distance,
      0, // Ground level
      playerPosition.z + Math.sin(angle) * distance
    );

    // Weighted random character type
    const characterType = this.getRandomCharacterType();

    // Get pedestrian from pool or create new one
    let pedestrian: Pedestrian;
    if (this.pedestrianPool.length > 0) {
      pedestrian = this.pedestrianPool.pop()!;
      pedestrian.reset(position, characterType);
    } else {
      pedestrian = new Pedestrian(position, this.world, characterType, this.aiManager.getEntityManager(), this.shadowManager);
    }

    // Add to scene and list
    this.scene.add(pedestrian);
    this.pedestrians.push(pedestrian);

    // Set wander behavior
    pedestrian.setWanderBehavior();
  }

  /**
   * Make all pedestrians panic and flee from danger position
   */
  panicCrowd(dangerPosition: THREE.Vector3, radius: number = 15): void {
    const radiusSq = radius * radius;

    for (const pedestrian of this.pedestrians) {
      const distanceSq = (pedestrian as THREE.Group).position.distanceToSquared(dangerPosition);

      if (distanceSq < radiusSq && !pedestrian.isDeadState()) {
        pedestrian.panic(dangerPosition);
      }
    }
  }

  /**
   * Damage pedestrians in radius (e.g., player attack)
   * Returns kill count, positions, and panic kill count
   */
  damageInRadius(
    position: THREE.Vector3,
    radius: number,
    damage: number,
    maxKills: number = Infinity,
    direction?: THREE.Vector3,
    coneAngle: number = Math.PI / 3
  ): {
    kills: number;
    panicKills: number;
    positions: THREE.Vector3[]
  } {
    let killCount = 0;
    let panicKillCount = 0;
    const killPositions: THREE.Vector3[] = [];

    // Pre-calculate squared radius to avoid sqrt in hot loop
    const radiusSq = radius * radius;

    for (const pedestrian of this.pedestrians) {
      if (pedestrian.isDeadState()) continue;
      if (killCount >= maxKills) break;

      const pedPos = (pedestrian as THREE.Group).position;
      const distanceSq = pedPos.distanceToSquared(position);

      if (distanceSq < radiusSq) {
        let inCone = true;

        if (direction) {
          // Reuse pre-allocated vector for cone check
          this._tempDirection.subVectors(pedPos, position).normalize();
          const dotProduct = direction.dot(this._tempDirection);
          const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
          inCone = angle <= coneAngle / 2;
        }

        if (inCone) {
          // Check if panicking BEFORE damage (they might die)
          const wasPanicking = pedestrian.isPanickingState();

          pedestrian.takeDamage(damage);

          if (pedestrian.isDeadState()) {
            killCount++;
            killPositions.push(pedPos.clone());
            if (wasPanicking) {
              panicKillCount++;
            }
          }
        }
      }
    }

    return { kills: killCount, panicKills: panicKillCount, positions: killPositions };
  }

  /**
   * Damage pedestrians in oriented box with swept collision (for truck)
   * Checks multiple rotation samples between previousRotation and currentRotation
   * to catch pedestrians that the box sweeps through during rapid rotation.
   *
   * @param position - Center of the vehicle
   * @param halfWidth - Half the vehicle width
   * @param halfLength - Half the vehicle length
   * @param rotation - Current vehicle rotation in radians (Y axis)
   * @param damage - Damage to apply
   * @param previousRotation - Previous frame's rotation (for swept collision)
   */
  damageInBox(
    position: THREE.Vector3,
    halfWidth: number,
    halfLength: number,
    rotation: number,
    damage: number,
    previousRotation?: number
  ): {
    kills: number;
    panicKills: number;
    positions: THREE.Vector3[]
  } {
    let killCount = 0;
    let panicKillCount = 0;
    const killPositions: THREE.Vector3[] = [];

    // Kill zone extends beyond physics collision box at front/back only
    // Sides don't need extra margin since rotation sweep handles that
    const killMarginLength = 2.5; // Front/back margin
    const killMarginWidth = 0.5;  // Minimal side margin
    const killWidth = halfWidth + killMarginWidth;
    const killLength = halfLength + killMarginLength;

    // Calculate rotation delta for swept collision
    const prevRot = previousRotation ?? rotation;
    let rotationDelta = rotation - prevRot;
    // Normalize to [-PI, PI]
    while (rotationDelta > Math.PI) rotationDelta -= Math.PI * 2;
    while (rotationDelta < -Math.PI) rotationDelta += Math.PI * 2;

    // Number of samples based on rotation speed (more samples = more accurate but slower)
    // At least 1 sample, up to 8 for very fast rotation
    const numSamples = Math.max(1, Math.min(8, Math.ceil(Math.abs(rotationDelta) / 0.1)));

    for (const pedestrian of this.pedestrians) {
      if (pedestrian.isDeadState()) continue;

      const pedPos = (pedestrian as THREE.Group).position;

      // Transform pedestrian position relative to vehicle center
      const dx = pedPos.x - position.x;
      const dz = pedPos.z - position.z;

      // Quick distance check - skip if too far (optimization)
      const distSq = dx * dx + dz * dz;
      const maxDist = Math.max(killWidth, killLength) + 2; // Extra margin
      if (distSq > maxDist * maxDist) continue;

      // Check multiple rotation samples for swept collision
      let isHit = false;
      for (let i = 0; i < numSamples && !isHit; i++) {
        const t = numSamples === 1 ? 1 : i / (numSamples - 1);
        const sampleRotation = prevRot + rotationDelta * t;

        const cos = Math.cos(-sampleRotation);
        const sin = Math.sin(-sampleRotation);

        // Rotate to align with vehicle's local axes at this rotation sample
        const localX = dx * cos - dz * sin;
        const localZ = dx * sin + dz * cos;

        // Check if within kill zone
        if (Math.abs(localX) <= killWidth && Math.abs(localZ) <= killLength) {
          isHit = true;
        }
      }

      if (isHit) {
        const wasPanicking = pedestrian.isPanickingState();
        pedestrian.takeDamage(damage);

        if (pedestrian.isDeadState()) {
          killCount++;
          killPositions.push(pedPos.clone());
          if (wasPanicking) {
            panicKillCount++;
          }
        }
      }
    }

    return { kills: killCount, panicKills: panicKillCount, positions: killPositions };
  }

  /**
   * Apply knockback in oriented box (for truck)
   */
  applyBoxKnockback(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    halfWidth: number,
    halfLength: number,
    rotation: number
  ): void {
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);

    for (const pedestrian of this.pedestrians) {
      if (!pedestrian.isDeadState()) continue;

      const pedPos = (pedestrian as THREE.Group).position;

      const dx = pedPos.x - position.x;
      const dz = pedPos.z - position.z;

      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;

      if (Math.abs(localX) <= halfWidth && Math.abs(localZ) <= halfLength) {
        pedestrian.applyVehicleKnockback(position, velocity);
      }
    }
  }

  /**
   * Apply violent knockback to pedestrians hit by vehicle
   * Only knocks back DEAD pedestrians - alive ones get killed by damageInRadius first
   */
  applyVehicleKnockback(carPosition: THREE.Vector3, carVelocity: THREE.Vector3, radius: number): void {
    const radiusSq = radius * radius;

    for (const pedestrian of this.pedestrians) {
      // Only knock back dead pedestrians (ragdoll effect)
      // Alive pedestrians should be killed by damageInRadius, not pushed away
      if (!pedestrian.isDeadState()) continue;

      const pedPos = (pedestrian as THREE.Group).position;
      const distanceSq = pedPos.distanceToSquared(carPosition);

      if (distanceSq < radiusSq) {
        pedestrian.applyVehicleKnockback(carPosition, carVelocity);
      }
    }
  }

  /**
   * Handle player running into pedestrians (makes them stumble)
   */
  handlePlayerCollisions(playerPosition: THREE.Vector3): void {
    const collisionRadius = 1.2;
    const collisionRadiusSq = collisionRadius * collisionRadius;
    const knockbackForce = 10.0;

    for (const pedestrian of this.pedestrians) {
      if (pedestrian.isDeadState()) continue;

      const pedPos = (pedestrian as THREE.Group).position;
      const distanceSq = pedPos.distanceToSquared(playerPosition);

      if (distanceSq < collisionRadiusSq) {
        // Reuse pre-allocated vector for knockback direction
        this._tempDirection
          .subVectors(pedPos, playerPosition)
          .setY(0);

        pedestrian.applyKnockback(this._tempDirection, knockbackForce);
      }
    }
  }

  // Pre-calculated squared distance for removal threshold (40^2 = 1600)
  private static readonly REMOVAL_DISTANCE_SQ = 1600;

  /**
   * Update all pedestrians (Yuka AI updated by Engine's AIManager)
   */
  update(deltaTime: number, playerPosition: THREE.Vector3): void {
    // Mark pedestrians for removal (don't remove during iteration)
    for (const pedestrian of this.pedestrians) {
      // Calculate squared distance once for both removal check and animation LOD
      // Avoids sqrt() for 40+ pedestrians per frame
      const distanceSq = (pedestrian as THREE.Group).position.distanceToSquared(playerPosition);
      pedestrian.update(deltaTime, distanceSq);

      // Track and remove dead pedestrians after death animation
      if (pedestrian.isDeadState()) {
        // Start death timer if not already tracking
        if (!this.deathTimers.has(pedestrian)) {
          this.deathTimers.set(pedestrian, 0);
        }

        // Increment death timer
        const deathTime = this.deathTimers.get(pedestrian)! + deltaTime;
        this.deathTimers.set(pedestrian, deathTime);

        // Remove after delay
        if (deathTime >= this.DEATH_CLEANUP_DELAY) {
          this.pedestriansToRemove.push(pedestrian);
          this.deathTimers.delete(pedestrian);
        }
      }

      // Mark pedestrians that wandered too far for removal
      if (distanceSq > CrowdManager.REMOVAL_DISTANCE_SQ && !pedestrian.isDeadState()) {
        this.pedestriansToRemove.push(pedestrian);
      }
    }
  }

  /**
   * Cleanup pedestrians (call AFTER physics step)
   */
  cleanup(playerPosition: THREE.Vector3): void {
    if (this.pedestriansToRemove.length === 0) return;

    // Remove marked pedestrians
    for (const pedestrian of this.pedestriansToRemove) {
      this.removePedestrian(pedestrian);
    }

    // Respawn to maintain population
    const numToRespawn = this.pedestriansToRemove.length;
    for (let i = 0; i < numToRespawn; i++) {
      this.spawnPedestrian(playerPosition);
    }

    // Clear the queue
    this.pedestriansToRemove = [];
  }

  /**
   * Remove pedestrian from world and add to pool
   */
  private removePedestrian(pedestrian: Pedestrian): void {
    // Remove from active list
    const index = this.pedestrians.indexOf(pedestrian);
    if (index > -1) {
      this.pedestrians.splice(index, 1);
    }

    // Remove from scene
    this.scene.remove(pedestrian);

    // Remove from Yuka entity manager via AIManager
    this.aiManager.removeEntity(pedestrian.getYukaVehicle());

    // Add to pool for reuse
    this.pedestrianPool.push(pedestrian);
  }

  /**
   * Clear all pedestrians
   */
  clear(): void {
    for (const pedestrian of this.pedestrians) {
      pedestrian.destroy(this.world);
    }

    for (const pedestrian of this.pedestrianPool) {
      pedestrian.destroy(this.world);
    }

    this.pedestrians = [];
    this.pedestrianPool = [];
    this.deathTimers.clear();
    this.pedestriansToRemove = [];
    this.tablePedestrians.clear();
    // Note: AIManager is shared, don't clear it here

    // Clear tables
    for (const table of this.tables) {
      this.scene.remove(table);
    }
    this.tables = [];
    this.currentTableBaseX = Infinity;
    this.currentTableBaseZ = Infinity;

    // Dispose shadow manager
    this.shadowManager.dispose();
  }

  /**
   * Get all pedestrians
   */
  getPedestrians(): Pedestrian[] {
    return this.pedestrians;
  }

  /**
   * Get pedestrian count (for performance monitoring)
   */
  getPedestrianCount(): number {
    return this.pedestrians.length;
  }

  // ============================================
  // TABLE SYSTEM - Tables at intersection corners
  // ============================================

  /**
   * Create a single table mesh (vertical standing table)
   */
  private createTableMesh(x: number, z: number): THREE.Group {
    const table = new THREE.Group();

    // Table top (vertical orientation)
    const top = new THREE.Mesh(this.tableGeometry!, this.tableMaterial!);
    top.position.y = 0.4; // Table height
    top.castShadow = false;
    top.receiveShadow = false;
    table.add(top);

    table.position.set(x, 0, z);
    table.rotation.y = Math.random() * Math.PI * 2; // Random rotation

    return table;
  }

  /**
   * Spawn pedestrians around a table (2-4 per table)
   */
  private spawnTablePedestrians(tableX: number, tableZ: number): void {
    const numPatrons = 2 + Math.floor(Math.random() * 3); // 2-4 pedestrians

    for (let i = 0; i < numPatrons; i++) {
      // Position around table in a circle
      const angle = (i / numPatrons) * Math.PI * 2 + Math.random() * 0.3;
      const distance = 1.0 + Math.random() * 0.5;

      const position = new THREE.Vector3(
        tableX + Math.cos(angle) * distance,
        0,
        tableZ + Math.sin(angle) * distance
      );

      const characterType = this.getRandomCharacterType();

      let pedestrian: Pedestrian;
      if (this.pedestrianPool.length > 0) {
        pedestrian = this.pedestrianPool.pop()!;
        pedestrian.reset(position, characterType);
      } else {
        pedestrian = new Pedestrian(position, this.world, characterType, this.aiManager.getEntityManager(), this.shadowManager);
      }

      this.scene.add(pedestrian);
      this.pedestrians.push(pedestrian);
      this.tablePedestrians.add(pedestrian);

      // Face towards table center
      const angleToTable = Math.atan2(tableZ - position.z, tableX - position.x);
      (pedestrian as THREE.Group).rotation.y = angleToTable + Math.PI;

      // Set idle behavior (not wandering)
      pedestrian.setIdleBehavior();
    }
  }

  /**
   * Create tables at 4 corners of an intersection
   */
  private createIntersectionTables(gridX: number, gridZ: number): void {
    // Intersection center
    const centerX = (gridX + 0.5) * this.cellWidth;
    const centerZ = (gridZ + 0.5) * this.cellDepth;

    // 4 corners around intersection (offset from center)
    const cornerOffset = 2.5;
    const corners = [
      { x: centerX - cornerOffset, z: centerZ - cornerOffset },
      { x: centerX + cornerOffset, z: centerZ - cornerOffset },
      { x: centerX - cornerOffset, z: centerZ + cornerOffset },
      { x: centerX + cornerOffset, z: centerZ + cornerOffset },
    ];

    for (const corner of corners) {
      // Create table
      const table = this.createTableMesh(corner.x, corner.z);
      this.scene.add(table);
      this.tables.push(table);

      // Spawn pedestrians at this table
      this.spawnTablePedestrians(corner.x, corner.z);
    }
  }

  /**
   * Update tables based on player position (streaming)
   */
  updateTables(playerPosition: THREE.Vector3): void {
    const playerGridX = Math.floor(playerPosition.x / this.cellWidth);
    const playerGridZ = Math.floor(playerPosition.z / this.cellDepth);

    // Initialize on first call
    if (!Number.isFinite(this.currentTableBaseX)) {
      this.currentTableBaseX = playerGridX;
      this.currentTableBaseZ = playerGridZ;
      this.createIntersectionTables(playerGridX, playerGridZ);
      return;
    }

    // Check if player moved to new grid cell
    if (playerGridX !== this.currentTableBaseX || playerGridZ !== this.currentTableBaseZ) {
      // Remove old tables
      for (const table of this.tables) {
        this.scene.remove(table);
      }
      this.tables = [];

      // Remove table pedestrians from tracking (they stay in crowd but become normal)
      this.tablePedestrians.clear();

      // Create new tables at new intersection
      this.createIntersectionTables(playerGridX, playerGridZ);

      this.currentTableBaseX = playerGridX;
      this.currentTableBaseZ = playerGridZ;
    }
  }

  /**
   * When a table pedestrian dies, panic nearby table pedestrians
   */
  panicTablePedestrians(deadPosition: THREE.Vector3): void {
    const panicRadius = 8;
    const panicRadiusSq = panicRadius * panicRadius;

    for (const pedestrian of this.tablePedestrians) {
      if (pedestrian.isDeadState()) continue;

      const distSq = (pedestrian as THREE.Group).position.distanceToSquared(deadPosition);
      if (distSq < panicRadiusSq) {
        pedestrian.panic(deadPosition);
        // Remove from table tracking - they're running now
        this.tablePedestrians.delete(pedestrian);
      }
    }
  }

  /**
   * Check if a pedestrian is at a table
   */
  isTablePedestrian(pedestrian: Pedestrian): boolean {
    return this.tablePedestrians.has(pedestrian);
  }
}
