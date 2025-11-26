import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import * as YUKA from 'yuka';
import { Pedestrian } from '../entities/Pedestrian';
import { InstancedBlobShadows } from '../rendering/InstancedBlobShadows';
import { AIManager } from '../core/AIManager';

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
  private maxPedestrians: number = 40;
  private spawnRadius: number = 25; // Max spawn distance
  private minSpawnDistance: number = 18; // Spawn off-screen (visible area is ~15 units radius)

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

    // Create instanced shadow manager (max 60 shadows for pedestrians)
    this.shadowManager = new InstancedBlobShadows(scene, 60);

    this.totalWeight = this.characterPool.reduce((sum, char) => sum + char.weight, 0);
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
    for (const pedestrian of this.pedestrians) {
      const distance = (pedestrian as THREE.Group).position.distanceTo(dangerPosition);

      if (distance < radius && !pedestrian.isDeadState()) {
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

  /**
   * Update all pedestrians (Yuka AI updated by Engine's AIManager)
   */
  update(deltaTime: number, playerPosition: THREE.Vector3): void {
    // Mark pedestrians for removal (don't remove during iteration)
    for (const pedestrian of this.pedestrians) {
      // Calculate distance once for both removal check and animation LOD
      const distance = (pedestrian as THREE.Group).position.distanceTo(playerPosition);
      pedestrian.update(deltaTime, distance);

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

      // Mark pedestrians that wandered too far for removal (distance already calculated above)
      if (distance > 40 && !pedestrian.isDeadState()) {
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
    // Note: AIManager is shared, don't clear it here

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
}
