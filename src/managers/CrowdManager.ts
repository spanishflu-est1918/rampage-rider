import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import * as YUKA from 'yuka';
import { Pedestrian } from '../entities/Pedestrian';

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
  private entityManager: YUKA.EntityManager;

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

    // Rare: Military/Tactical (weight 0.5)
    { type: 'BlueSoldier_Female', weight: 0.5 },
    { type: 'BlueSoldier_Male', weight: 0.5 },
    { type: 'Soldier_Female', weight: 0.5 },
    { type: 'Soldier_Male', weight: 0.5 },
    { type: 'Ninja_Female', weight: 0.5 },
    { type: 'Ninja_Male', weight: 0.5 },
    { type: 'Ninja_Sand', weight: 0.5 },
    { type: 'Ninja_Sand_Female', weight: 0.5 },
  ];

  private totalWeight: number;

  constructor(scene: THREE.Scene, world: RAPIER.World) {
    this.scene = scene;
    this.world = world;
    this.entityManager = new YUKA.EntityManager();

    this.totalWeight = this.characterPool.reduce((sum, char) => sum + char.weight, 0);
  }

  /**
   * Get weighted random character type
   */
  private getRandomCharacterType(): string {
    let random = Math.random() * this.totalWeight;

    for (const char of this.characterPool) {
      random -= char.weight;
      if (random <= 0) {
        return char.type;
      }
    }

    // Fallback to first character
    return this.characterPool[0].type;
  }

  /**
   * Initialize crowd with pedestrians
   */
  spawnInitialCrowd(playerPosition: THREE.Vector3): void {
    for (let i = 0; i < this.maxPedestrians; i++) {
      this.spawnPedestrian(playerPosition);
    }

    this.setupFlocking();
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
      pedestrian = new Pedestrian(position, this.world, characterType, this.entityManager);
    }

    // Add to scene and list
    this.scene.add(pedestrian);
    this.scene.add(pedestrian.getBlobShadow()); // Add blob shadow to scene
    this.pedestrians.push(pedestrian);

    // Set wander behavior
    pedestrian.setWanderBehavior();
  }

  /**
   * Setup Yuka flocking behavior for all pedestrians
   */
  private setupFlocking(): void {
    // Create alignment, cohesion, and separation behaviors
    for (const pedestrian of this.pedestrians) {
      const vehicle = pedestrian.getYukaVehicle();

      // Alignment: steer towards average heading of neighbors
      const alignmentBehavior = new YUKA.AlignmentBehavior();
      alignmentBehavior.weight = 0.1;
      vehicle.steering.add(alignmentBehavior);

      // Cohesion: steer towards average position of neighbors
      const cohesionBehavior = new YUKA.CohesionBehavior();
      cohesionBehavior.weight = 0.1;
      vehicle.steering.add(cohesionBehavior);

      // Separation: avoid crowding neighbors (most important)
      const separationBehavior = new YUKA.SeparationBehavior();
      separationBehavior.weight = 1.5;
      vehicle.steering.add(separationBehavior);
    }

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

    for (const pedestrian of this.pedestrians) {
      if (pedestrian.isDeadState()) continue;
      if (killCount >= maxKills) break;

      const pedPos = (pedestrian as THREE.Group).position;
      const distance = pedPos.distanceTo(position);

      if (distance < radius) {
        let inCone = true;

        if (direction) {
          const toPedestrian = new THREE.Vector3().subVectors(pedPos, position).normalize();
          const dotProduct = direction.dot(toPedestrian);
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
    for (const pedestrian of this.pedestrians) {
      // Only knock back dead pedestrians (ragdoll effect)
      // Alive pedestrians should be killed by damageInRadius, not pushed away
      if (!pedestrian.isDeadState()) continue;

      const pedPos = (pedestrian as THREE.Group).position;
      const distance = pedPos.distanceTo(carPosition);

      if (distance < radius) {
        pedestrian.applyVehicleKnockback(carPosition, carVelocity);
      }
    }
  }

  /**
   * Handle player running into pedestrians (makes them stumble)
   */
  handlePlayerCollisions(playerPosition: THREE.Vector3): void {
    const collisionRadius = 1.2;
    const knockbackForce = 10.0;

    for (const pedestrian of this.pedestrians) {
      if (pedestrian.isDeadState()) continue;

      const pedPos = (pedestrian as THREE.Group).position;
      const distance = pedPos.distanceTo(playerPosition);

      if (distance < collisionRadius) {
        const knockbackDir = new THREE.Vector3()
          .subVectors(pedPos, playerPosition)
          .setY(0);

        pedestrian.applyKnockback(knockbackDir, knockbackForce);
      }
    }
  }

  /**
   * Update all pedestrians and Yuka entity manager
   */
  update(deltaTime: number, playerPosition: THREE.Vector3): void {
    // Update Yuka entity manager (handles steering calculations)
    this.entityManager.update(deltaTime);

    // Mark pedestrians for removal (don't remove during iteration)
    for (const pedestrian of this.pedestrians) {
      pedestrian.update(deltaTime);

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
      const distance = (pedestrian as THREE.Group).position.distanceTo(playerPosition);
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

    // Remove from scene (both pedestrian and blob shadow)
    this.scene.remove(pedestrian);
    this.scene.remove(pedestrian.getBlobShadow());

    // Remove from Yuka entity manager
    this.entityManager.remove(pedestrian.getYukaVehicle());

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
    this.entityManager.clear();
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
