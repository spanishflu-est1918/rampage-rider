import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { CopCar } from '../entities/CopCar';
import { AIManager } from '../core/AIManager';
import { COP_CAR_CONFIG } from '../constants';

/**
 * CopCarManager
 *
 * Manages cop car spawning when player is in sedan or truck:
 * - Spawns cop cars that chase and ram player vehicle
 * - Max 3 cop cars at once
 * - Spawns based on heat level (50%+ heat)
 * - Truck can trample cop cars
 */
export class CopCarManager {
  private cars: CopCar[] = [];
  private scene: THREE.Scene;
  private world: RAPIER.World;
  private aiManager: AIManager;

  private spawnCooldown: number = 0;
  private damageCallback: ((damage: number, attackerPosition: THREE.Vector3) => void) | null = null;

  // Pre-allocated vectors
  private readonly _tempSpawnPos = new THREE.Vector3();
  private readonly _tempCarPos = new THREE.Vector3();

  constructor(scene: THREE.Scene, world: RAPIER.World, aiManager: AIManager) {
    this.scene = scene;
    this.world = world;
    this.aiManager = aiManager;
  }

  setDamageCallback(callback: (damage: number, attackerPosition: THREE.Vector3) => void): void {
    this.damageCallback = callback;
    for (const car of this.cars) {
      car.setDamageCallback(callback);
    }
  }

  updateSpawns(
    heat: number,
    playerPosition: THREE.Vector3,
    playerVelocity: THREE.Vector3,
    deltaTime: number
  ): void {
    // Remove dead cars
    this.cars = this.cars.filter((car) => {
      if (car.isDeadState() && !(car as THREE.Group).visible) {
        this.scene.remove(car);
        this.scene.remove(car.getBlobShadow());
        car.dispose();
        return false;
      }
      return true;
    });

    // Update spawn cooldown
    this.spawnCooldown -= deltaTime;
    if (this.spawnCooldown > 0) return;

    // Only spawn if heat >= threshold
    if (heat < COP_CAR_CONFIG.SPAWN_HEAT_THRESHOLD) return;

    // Staggered max cars based on heat (avoid 50% cliff)
    const maxCars =
      heat >= COP_CAR_CONFIG.SPAWN_HEAT_THRESHOLD_FULL
        ? COP_CAR_CONFIG.MAX_CARS
        : COP_CAR_CONFIG.MAX_CARS_INITIAL;

    // Check if we need more cars
    const activeCars = this.cars.filter((car) => !car.isDeadState()).length;
    if (activeCars >= maxCars) return;

    // Spawn behind player
    this.spawnCar(playerPosition, playerVelocity);
    this.spawnCooldown = COP_CAR_CONFIG.SPAWN_COOLDOWN;
  }

  private spawnCar(playerPosition: THREE.Vector3, playerVelocity: THREE.Vector3): void {
    // Spawn behind player based on velocity direction
    const velLen = playerVelocity.length();
    let spawnDir: THREE.Vector3;

    if (velLen > 0.1) {
      // Spawn behind the direction player is moving
      spawnDir = playerVelocity.clone().normalize().multiplyScalar(-1);
    } else {
      // Random direction if player is stationary
      const angle = Math.random() * Math.PI * 2;
      spawnDir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    }

    // Add some randomness to spawn position
    const lateralOffset = (Math.random() - 0.5) * 20;
    const perpDir = new THREE.Vector3(-spawnDir.z, 0, spawnDir.x);

    this._tempSpawnPos.set(
      playerPosition.x + spawnDir.x * COP_CAR_CONFIG.SPAWN_BEHIND_DISTANCE + perpDir.x * lateralOffset,
      0,
      playerPosition.z + spawnDir.z * COP_CAR_CONFIG.SPAWN_BEHIND_DISTANCE + perpDir.z * lateralOffset
    );

    const car = new CopCar(this._tempSpawnPos, this.world, this.aiManager.getEntityManager());
    if (this.damageCallback) {
      car.setDamageCallback(this.damageCallback);
    }

    this.cars.push(car);
    this.scene.add(car);
    this.scene.add(car.getBlobShadow());
  }

  update(deltaTime: number, playerPosition: THREE.Vector3): void {
    for (const car of this.cars) {
      if (!car.isDeadState()) {
        car.setChaseTarget(playerPosition);
      }
      car.update(deltaTime);
    }
  }

  /**
   * Trample cop cars in radius (for truck)
   * Returns number of cars trampled and their positions
   */
  trampleInRadius(
    position: THREE.Vector3,
    radius: number
  ): { kills: number; positions: THREE.Vector3[]; points: number } {
    let killCount = 0;
    let totalPoints = 0;
    const killPositions: THREE.Vector3[] = [];
    const radiusSq = radius * radius;

    for (const car of this.cars) {
      if (car.isDeadState()) continue;

      car.getPositionInto(this._tempCarPos);
      const distanceSq = this._tempCarPos.distanceToSquared(position);

      if (distanceSq < radiusSq) {
        car.trample();
        killCount++;
        totalPoints += car.getPointValue();
        killPositions.push(this._tempCarPos.clone());
      }
    }

    return { kills: killCount, positions: killPositions, points: totalPoints };
  }

  damageInRadius(
    position: THREE.Vector3,
    radius: number,
    damage: number
  ): { kills: number; positions: THREE.Vector3[]; points: number; hits: number } {
    let killCount = 0;
    let hitCount = 0;
    let totalPoints = 0;
    const killPositions: THREE.Vector3[] = [];
    const radiusSq = radius * radius;

    for (const car of this.cars) {
      if (car.isDeadState()) continue;

      car.getPositionInto(this._tempCarPos);
      const distanceSq = this._tempCarPos.distanceToSquared(position);

      if (distanceSq < radiusSq) {
        hitCount++;
        car.takeDamage(damage);
        car.applyKnockback(position, 15);

        if (car.isDeadState()) {
          killCount++;
          totalPoints += car.getPointValue();
          killPositions.push(this._tempCarPos.clone());
        }
      }
    }

    return { kills: killCount, positions: killPositions, points: totalPoints, hits: hitCount };
  }

  getActiveCopCount(): number {
    return this.cars.filter((car) => !car.isDeadState()).length;
  }

  getCopData(): Array<{ position: THREE.Vector3; health: number; maxHealth: number }> {
    const result: Array<{ position: THREE.Vector3; health: number; maxHealth: number }> = [];

    for (const car of this.cars) {
      if (!car.isDeadState()) {
        result.push({
          position: car.getPosition(),
          health: car.getHealth(),
          maxHealth: car.getMaxHealth(),
        });
      }
    }

    return result;
  }

  clear(): void {
    for (const car of this.cars) {
      this.scene.remove(car);
      this.scene.remove(car.getBlobShadow());
      car.dispose();
    }
    this.cars = [];
    this.spawnCooldown = 0;
  }
}
