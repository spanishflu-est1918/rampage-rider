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
  private scene: THREE.Scene;
  private world: RAPIER.World;
  private entityManager: YUKA.EntityManager;

  // Spawn config
  private maxPedestrians: number = 20;
  private spawnRadius: number = 20; // Spawn within 20 units of player
  private minSpawnDistance: number = 5; // Don't spawn too close to player

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

    // Calculate total weight for weighted random selection
    this.totalWeight = this.characterPool.reduce((sum, char) => sum + char.weight, 0);

    console.log('[CrowdManager] Created with', this.characterPool.length, 'character types');
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

    // Setup flocking behaviors after all pedestrians exist
    this.setupFlocking();

    console.log(`[CrowdManager] Spawned ${this.maxPedestrians} pedestrians`);
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

    // Create pedestrian
    const pedestrian = new Pedestrian(position, this.world, characterType, this.entityManager);

    // Add to scene and list
    this.scene.add(pedestrian);
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

    console.log('[CrowdManager] Flocking behaviors added');
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
   * Returns kill count and positions of killed pedestrians
   */
  damageInRadius(position: THREE.Vector3, radius: number, damage: number): {
    kills: number;
    positions: THREE.Vector3[]
  } {
    let killCount = 0;
    const killPositions: THREE.Vector3[] = [];

    for (const pedestrian of this.pedestrians) {
      if (pedestrian.isDeadState()) continue;

      const distance = (pedestrian as THREE.Group).position.distanceTo(position);

      if (distance < radius) {
        pedestrian.takeDamage(damage);

        if (pedestrian.isDeadState()) {
          killCount++;
          killPositions.push((pedestrian as THREE.Group).position.clone());
        }
      }
    }

    return { kills: killCount, positions: killPositions };
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

    // Update each pedestrian
    for (let i = this.pedestrians.length - 1; i >= 0; i--) {
      const pedestrian = this.pedestrians[i];
      pedestrian.update(deltaTime);

      // Remove dead pedestrians after death animation (5 seconds)
      if (pedestrian.isDeadState()) {
        // TODO: Add timer to remove after animation completes
        // For now, keep them on screen
      }

      // Respawn pedestrians that wandered too far
      const distance = (pedestrian as THREE.Group).position.distanceTo(playerPosition);
      if (distance > 40 && !pedestrian.isDeadState()) {
        // Remove and respawn closer
        this.removePedestrian(i);
        this.spawnPedestrian(playerPosition);
      }
    }
  }

  /**
   * Remove pedestrian from world
   */
  private removePedestrian(index: number): void {
    const pedestrian = this.pedestrians[index];
    pedestrian.destroy(this.world);
    this.pedestrians.splice(index, 1);
  }

  /**
   * Clear all pedestrians
   */
  clear(): void {
    for (const pedestrian of this.pedestrians) {
      pedestrian.destroy(this.world);
    }
    this.pedestrians = [];
    this.entityManager.clear();

    console.log('[CrowdManager] Cleared all pedestrians');
  }

  /**
   * Get all pedestrians
   */
  getPedestrians(): Pedestrian[] {
    return this.pedestrians;
  }
}
