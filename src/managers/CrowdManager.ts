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
  private baseMaxPedestrians: number = 60;
  private surgeTimer: number = 0; // Timer for crowd surge effect
  private readonly SURGE_MAX: number = 100; // Temporary max during surge
  private readonly SURGE_DURATION: number = 15; // Seconds of crowd surge
  private spawnRadius: number = 25; // Max spawn distance
  private minSpawnDistance: number = 18; // Spawn off-screen (visible area is ~15 units radius)

  // Table system - German biergarten tables between horizontal buildings
  // Uses pooling like BuildingManager - 2 tables that reposition
  private tableInstances: Array<{
    mesh: THREE.Group;
    body: RAPIER.RigidBody;
    gridX: number;
    gridZ: number;
    pedestrians: Pedestrian[];
  }> = [];
  private tableGeometry: THREE.BoxGeometry | null = null;
  private tableMaterial: THREE.MeshStandardMaterial | null = null;
  private cellWidth: number;
  private cellDepth: number;
  private currentTableBaseX = Infinity;
  private currentTableBaseZ = Infinity;
  private tablesInitialized = false;

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

    // Create shared table geometry and material - long German beer table
    this.tableGeometry = new THREE.BoxGeometry(6, 0.08, 1.2); // Long horizontal beer table
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

    // 5% chance to be idle (standing around near building corners), 95% wander
    if (Math.random() < 0.05) {
      // Snap to nearest building corner
      // Buildings are rotated 90°, so DEPTH becomes X-width, WIDTH becomes Z-depth
      const cellW = this.cellWidth; // building + street
      const cellD = this.cellDepth;
      const halfBuildingW = CITY_CONFIG.BUILDING_DEPTH / 2; // Long side is X after rotation
      const halfBuildingD = CITY_CONFIG.BUILDING_WIDTH / 2; // Short side is Z after rotation

      // Find nearest building grid cell (buildings are at EVEN grid positions)
      const gridX = Math.round(position.x / cellW / 2) * 2;
      const gridZ = Math.round(position.z / cellD / 2) * 2;
      const buildingCenterX = gridX * cellW;
      const buildingCenterZ = gridZ * cellD;

      // Pick a random corner of this building (with small offset so they're just outside)
      const cornerOffsetX = (Math.random() < 0.5 ? -1 : 1) * (halfBuildingW + 0.5);
      const cornerOffsetZ = (Math.random() < 0.5 ? -1 : 1) * (halfBuildingD + 0.5);

      position.x = buildingCenterX + cornerOffsetX;
      position.z = buildingCenterZ + cornerOffsetZ;
      (pedestrian as THREE.Group).position.copy(position);

      // Random idle animation: 50% Victory, 50% Jump
      const idleAnim = Math.random() < 0.5 ? 'Victory' : 'Jump';
      pedestrian.setIdleBehavior(idleAnim);
      // Face away from building (into the street)
      const angleToBuilding = Math.atan2(buildingCenterZ - position.z, buildingCenterX - position.x);
      (pedestrian as THREE.Group).rotation.y = angleToBuilding + Math.PI;
    } else {
      pedestrian.setWanderBehavior();
    }
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
   * Apply knockback and damage to pedestrians in radius (360° blast)
   * Returns kill count and positions for effects
   */
  blastInRadius(
    position: THREE.Vector3,
    radius: number,
    force: number,
    damage: number,
    maxKills: number = Infinity
  ): {
    kills: number;
    knockedBack: number;
    positions: THREE.Vector3[];
  } {
    let killCount = 0;
    let knockedBackCount = 0;
    const killPositions: THREE.Vector3[] = [];
    const radiusSq = radius * radius;

    for (const pedestrian of this.pedestrians) {
      if (pedestrian.isDeadState()) continue;
      if (killCount >= maxKills) break;

      const pedPos = (pedestrian as THREE.Group).position;
      const distanceSq = pedPos.distanceToSquared(position);

      if (distanceSq < radiusSq) {
        const distance = Math.sqrt(distanceSq);
        // Force scales with distance (closer = stronger)
        const scaledForce = force * (1 - distance / radius);

        // Calculate direction away from blast center
        this._tempDirection.subVectors(pedPos, position).normalize();

        // Apply knockback
        pedestrian.applyKnockback(this._tempDirection, scaledForce);
        knockedBackCount++;

        // Apply damage
        pedestrian.takeDamage(damage);

        if (pedestrian.isDeadState()) {
          killCount++;
          killPositions.push(pedPos.clone());
        }
      }
    }

    return { kills: killCount, knockedBack: knockedBackCount, positions: killPositions };
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

    // Count non-table pedestrians to respawn (table peds are managed separately)
    let numToRespawn = 0;

    // Remove marked pedestrians
    for (const pedestrian of this.pedestriansToRemove) {
      // Only count non-table pedestrians for respawn
      if (!this.tablePedestrians.has(pedestrian)) {
        numToRespawn++;
      } else {
        // Remove from table tracking
        this.tablePedestrians.delete(pedestrian);
      }
      this.removePedestrian(pedestrian);
    }

    // Respawn only non-table pedestrians to maintain wandering population
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

    // Clear table instances
    for (const table of this.tableInstances) {
      this.scene.remove(table.mesh);
      this.world.removeRigidBody(table.body);
    }
    this.tableInstances = [];

    this.currentTableBaseX = Infinity;
    this.currentTableBaseZ = Infinity;
    this.tablesInitialized = false;

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

  /**
   * Trigger a crowd surge - temporarily increases pedestrian cap
   * Used when tier unlocks to give the new vehicle more targets
   */
  triggerCrowdSurge(): void {
    this.surgeTimer = this.SURGE_DURATION;
    this.maxPedestrians = this.SURGE_MAX;
  }

  /**
   * Update surge timer - call every frame
   */
  updateSurge(dt: number): void {
    if (this.surgeTimer > 0) {
      this.surgeTimer -= dt;
      if (this.surgeTimer <= 0) {
        // Surge ended, return to base
        this.maxPedestrians = this.baseMaxPedestrians;
      } else if (this.surgeTimer < 5) {
        // Gradually reduce in last 5 seconds
        const t = this.surgeTimer / 5;
        this.maxPedestrians = Math.floor(this.baseMaxPedestrians + (this.SURGE_MAX - this.baseMaxPedestrians) * t);
      }
    }
  }

  // ============================================
  // TABLE SYSTEM - Tables at intersection corners
  // ============================================

  /**
   * Create a single festive German beer table with decorations
   * @param rotated - if true, rotate 90 degrees so table runs along Z axis
   */
  private createTableMesh(x: number, z: number, rotated: boolean = false): THREE.Group {
    const table = new THREE.Group();

    // Wooden table top
    const top = new THREE.Mesh(this.tableGeometry!, this.tableMaterial!);
    top.position.y = 0.75;
    top.castShadow = false;
    top.receiveShadow = false;
    table.add(top);

    // Table legs
    const legGeom = new THREE.BoxGeometry(0.12, 0.75, 0.12);
    const legPositions = [
      { x: -2.7, z: -0.45 },
      { x: -2.7, z: 0.45 },
      { x: 2.7, z: -0.45 },
      { x: 2.7, z: 0.45 },
    ];
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeom, this.tableMaterial!);
      leg.position.set(pos.x, 0.375, pos.z);
      table.add(leg);
    }

    // === FESTIVE DECORATIONS ===

    // Center lantern (warm glowing candle)
    const lanternGroup = new THREE.Group();
    // Glass housing
    const glassGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.25, 8);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xffffee,
      transparent: true,
      opacity: 0.3,
      roughness: 0.1,
    });
    const glass = new THREE.Mesh(glassGeom, glassMat);
    glass.position.y = 0.125;
    lanternGroup.add(glass);
    // Candle flame (emissive)
    const flameGeom = new THREE.SphereGeometry(0.05, 6, 4);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xffaa33,
    });
    const flame = new THREE.Mesh(flameGeom, flameMat);
    flame.position.y = 0.15;
    lanternGroup.add(flame);
    lanternGroup.position.set(0, 0.77, 0);
    table.add(lanternGroup);

    // Beer mugs along the table (6 mugs)
    const mugGeom = new THREE.CylinderGeometry(0.08, 0.07, 0.18, 8);
    const mugMat = new THREE.MeshStandardMaterial({
      color: 0xddcc88, // Ceramic/beer color
      roughness: 0.6,
    });
    const mugPositions = [
      { x: -2.0, z: -0.35 }, { x: -2.0, z: 0.35 },
      { x: 0, z: -0.35 }, { x: 0, z: 0.35 },
      { x: 2.0, z: -0.35 }, { x: 2.0, z: 0.35 },
    ];
    for (const pos of mugPositions) {
      const mug = new THREE.Mesh(mugGeom, mugMat);
      mug.position.set(pos.x, 0.86, pos.z);
      table.add(mug);
      // Mug handle
      const handleGeom = new THREE.TorusGeometry(0.04, 0.015, 4, 8, Math.PI);
      const handle = new THREE.Mesh(handleGeom, mugMat);
      handle.rotation.y = pos.z > 0 ? 0 : Math.PI;
      handle.rotation.x = Math.PI / 2;
      handle.position.set(pos.x + (pos.z > 0 ? 0.1 : -0.1), 0.86, pos.z);
      table.add(handle);
    }

    // Pretzel plates (simple cylinders with brown pretzels)
    const plateGeom = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 });
    const pretzelGeom = new THREE.TorusGeometry(0.08, 0.025, 4, 12);
    const pretzelMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
    const platePositions = [{ x: -1.0, z: 0 }, { x: 1.0, z: 0 }];
    for (const pos of platePositions) {
      const plate = new THREE.Mesh(plateGeom, plateMat);
      plate.position.set(pos.x, 0.78, pos.z);
      table.add(plate);
      const pretzel = new THREE.Mesh(pretzelGeom, pretzelMat);
      pretzel.rotation.x = Math.PI / 2;
      pretzel.position.set(pos.x, 0.82, pos.z);
      table.add(pretzel);
    }

    // === STRING LIGHTS ABOVE TABLE ===
    const stringLightGroup = new THREE.Group();
    const wirePoints: THREE.Vector3[] = [];
    const bulbColors = [0xff4444, 0x44ff44, 0xffff44, 0x4444ff, 0xff44ff]; // Christmas colors
    const numBulbs = 10;
    const stringLength = 5.5;
    const stringHeight = 2.5; // Height above table
    const sag = 0.3;

    for (let i = 0; i <= numBulbs; i++) {
      const t = i / numBulbs;
      const xPos = (t - 0.5) * stringLength;
      // Catenary sag
      const yPos = stringHeight - sag * Math.sin(t * Math.PI);
      wirePoints.push(new THREE.Vector3(xPos, yPos, 0));

      // Add bulb at each point (except ends)
      if (i > 0 && i < numBulbs) {
        const bulbGeom = new THREE.SphereGeometry(0.06, 6, 4);
        const bulbMat = new THREE.MeshBasicMaterial({
          color: bulbColors[i % bulbColors.length],
        });
        const bulb = new THREE.Mesh(bulbGeom, bulbMat);
        bulb.position.set(xPos, yPos - 0.08, 0);
        stringLightGroup.add(bulb);
      }
    }

    // Wire
    const wireGeom = new THREE.BufferGeometry().setFromPoints(wirePoints);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x222222 });
    const wire = new THREE.Line(wireGeom, wireMat);
    stringLightGroup.add(wire);

    // Poles at each end
    const poleGeom = new THREE.CylinderGeometry(0.03, 0.03, stringHeight, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 });
    const pole1 = new THREE.Mesh(poleGeom, poleMat);
    pole1.position.set(-stringLength / 2, stringHeight / 2, 0);
    stringLightGroup.add(pole1);
    const pole2 = new THREE.Mesh(poleGeom, poleMat);
    pole2.position.set(stringLength / 2, stringHeight / 2, 0);
    stringLightGroup.add(pole2);

    table.add(stringLightGroup);

    table.position.set(x, 0, z);
    if (rotated) {
      table.rotation.y = Math.PI / 2;
    }

    return table;
  }

  /**
   * Create a table instance at a grid position
   * Grid positions: tables go at (evenX, oddZ) - between buildings' long sides
   */
  private createTableInstance(gridX: number, gridZ: number): typeof this.tableInstances[0] {
    const worldX = gridX * this.cellWidth;
    const worldZ = gridZ * this.cellDepth;

    // Create table mesh
    const mesh = this.createTableMesh(worldX, worldZ, false);
    this.scene.add(mesh);

    // Create physics body
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(worldX, 0.375, worldZ);
    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(3.0, 0.375, 0.6)
      .setCollisionGroups(0x00400040);
    this.world.createCollider(colliderDesc, body);

    // Spawn pedestrians for this table
    const pedestrians = this.spawnTablePedestriansForInstance(worldX, worldZ, false);

    return { mesh, body, gridX, gridZ, pedestrians };
  }

  /**
   * Reposition an existing table to a new grid position
   * Like BuildingManager - reuses mesh and physics body
   */
  private repositionTable(
    table: typeof this.tableInstances[0],
    newGridX: number,
    newGridZ: number
  ): void {
    const worldX = newGridX * this.cellWidth;
    const worldZ = newGridZ * this.cellDepth;

    // Move mesh
    table.mesh.position.set(worldX, 0, worldZ);

    // Move physics body (reuse instead of recreate)
    table.body.setTranslation({ x: worldX, y: 0.375, z: worldZ }, true);
    table.body.wakeUp();

    // Remove old pedestrians
    for (const ped of table.pedestrians) {
      this.tablePedestrians.delete(ped);
      this.removePedestrian(ped);
    }

    // Spawn new pedestrians at new position
    table.pedestrians = this.spawnTablePedestriansForInstance(worldX, worldZ, false);

    table.gridX = newGridX;
    table.gridZ = newGridZ;
  }

  /**
   * Spawn pedestrians for a table instance (returns array, doesn't push to tablePedestrians)
   */
  private spawnTablePedestriansForInstance(tableX: number, tableZ: number, rotated: boolean): Pedestrian[] {
    const pedestrians: Pedestrian[] = [];
    const numPerSide = 3 + Math.floor(Math.random() * 2);
    const tableHalfLength = 2.5;
    const sideOffset = 1.0;

    for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
      const side = sideIdx === 0 ? 1 : -1;

      for (let i = 0; i < numPerSide; i++) {
        const t = numPerSide === 1 ? 0 : (i / (numPerSide - 1)) * 2 - 1;
        const alongTable = t * tableHalfLength;

        let position: THREE.Vector3;
        let facingAngle: number;

        if (rotated) {
          const jitterX = (Math.random() - 0.5) * 0.15;
          const jitterZ = (Math.random() - 0.5) * 0.4;
          position = new THREE.Vector3(
            tableX + side * sideOffset + jitterX,
            0,
            tableZ + alongTable + jitterZ
          );
          facingAngle = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        } else {
          const jitterX = (Math.random() - 0.5) * 0.4;
          const jitterZ = (Math.random() - 0.5) * 0.15;
          position = new THREE.Vector3(
            tableX + alongTable + jitterX,
            0,
            tableZ + side * sideOffset + jitterZ
          );
          facingAngle = side > 0 ? Math.PI : 0;
        }

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
        pedestrians.push(pedestrian);

        (pedestrian as THREE.Group).rotation.y = facingAngle;
        pedestrian.setFestiveBehavior();
      }
    }

    return pedestrians;
  }

  /**
   * Initialize the table pool (2 tables)
   */
  private initializeTables(baseX: number, baseZ: number): void {
    if (this.tablesInitialized) return;

    // Tables at (baseX, baseZ+1) and (baseX+2, baseZ+1)
    const tableGridZ = baseZ + 1;

    const table1 = this.createTableInstance(baseX, tableGridZ);
    const table2 = this.createTableInstance(baseX + 2, tableGridZ);

    this.tableInstances.push(table1, table2);
    this.currentTableBaseX = baseX;
    this.currentTableBaseZ = baseZ;
    this.tablesInitialized = true;
  }

  /**
   * Reposition tables to a new base (like BuildingManager.repositionToBase)
   */
  private repositionTablesToBase(baseX: number, baseZ: number): void {
    const tableGridZ = baseZ + 1;

    // Target positions for 2 tables
    const targetPositions = [
      { gridX: baseX, gridZ: tableGridZ },
      { gridX: baseX + 2, gridZ: tableGridZ },
    ];

    // Find which tables are already at target positions
    const remainingTargets = [...targetPositions];
    const outOfBounds: typeof this.tableInstances = [];

    for (const table of this.tableInstances) {
      const idx = remainingTargets.findIndex(
        t => t.gridX === table.gridX && t.gridZ === table.gridZ
      );
      if (idx !== -1) {
        remainingTargets.splice(idx, 1); // Already at a good position
      } else {
        outOfBounds.push(table);
      }
    }

    // Only reposition tables that are out of bounds
    for (let i = 0; i < outOfBounds.length; i++) {
      const target = remainingTargets[i];
      if (target) {
        this.repositionTable(outOfBounds[i], target.gridX, target.gridZ);
      }
    }

    this.currentTableBaseX = baseX;
    this.currentTableBaseZ = baseZ;
  }

  /**
   * Update tables based on player position (streaming)
   * Uses same hysteresis logic as BuildingManager
   */
  updateTables(playerPosition: THREE.Vector3): void {
    const playerGridX = Math.floor(playerPosition.x / this.cellWidth);
    const playerGridZ = Math.floor(playerPosition.z / this.cellDepth);

    // First time initialization
    if (!this.tablesInitialized) {
      const baseX = Math.floor(playerGridX / 2) * 2;
      const baseZ = Math.floor(playerGridZ / 2) * 2;
      this.initializeTables(baseX, baseZ);
      return;
    }

    // Hysteresis: same as BuildingManager
    // Shift when player goes past edge of 2x2 area
    let shiftX = 0;
    if (playerGridX > this.currentTableBaseX + 2) shiftX = 2;
    else if (playerGridX < this.currentTableBaseX) shiftX = -2;

    let shiftZ = 0;
    if (playerGridZ > this.currentTableBaseZ + 2) shiftZ = 2;
    else if (playerGridZ < this.currentTableBaseZ) shiftZ = -2;

    if (shiftX !== 0 || shiftZ !== 0) {
      this.repositionTablesToBase(
        this.currentTableBaseX + shiftX,
        this.currentTableBaseZ + shiftZ
      );
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
