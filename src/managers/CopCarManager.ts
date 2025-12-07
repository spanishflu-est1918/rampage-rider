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
  private readonly _tempSpawnDir = new THREE.Vector3();
  private readonly _tempPerpDir = new THREE.Vector3();

  // PERF: Pre-allocated kill position pool (avoids per-kill allocations)
  private readonly _killPositionPool: THREE.Vector3[] = [];
  private readonly MAX_KILL_POSITIONS = 5; // Max cop cars killed per attack
  private _killPositionPoolIndex = 0;
  private readonly _copDataResult: Array<{ position: THREE.Vector3; health: number; maxHealth: number }> = [];

  constructor(scene: THREE.Scene, world: RAPIER.World, aiManager: AIManager) {
    this.scene = scene;
    this.world = world;
    this.aiManager = aiManager;

    // PERF: Pre-allocate kill position pool
    for (let i = 0; i < this.MAX_KILL_POSITIONS; i++) {
      this._killPositionPool.push(new THREE.Vector3());
    }
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
    // PERF: Remove dead cars using splice loop instead of filter (avoids array allocation)
    let activeCars = 0;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      if (car.isDeadState() && !(car as THREE.Group).visible) {
        this.scene.remove(car);
        this.scene.remove(car.getBlobShadow());
        car.dispose();
        this.cars.splice(i, 1);
      } else if (!car.isDeadState()) {
        activeCars++;
      }
    }

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

    // Check if we need more cars (activeCars already counted above)
    if (activeCars >= maxCars) return;

    // Spawn behind player
    this.spawnCar(playerPosition, playerVelocity);
    this.spawnCooldown = COP_CAR_CONFIG.SPAWN_COOLDOWN;
  }

  private spawnCar(playerPosition: THREE.Vector3, playerVelocity: THREE.Vector3): void {
    // Spawn behind player based on velocity direction
    const velLen = playerVelocity.length();

    if (velLen > 0.1) {
      // Spawn behind the direction player is moving
      this._tempSpawnDir.copy(playerVelocity).normalize().multiplyScalar(-1);
    } else {
      // Random direction if player is stationary
      const angle = Math.random() * Math.PI * 2;
      this._tempSpawnDir.set(Math.cos(angle), 0, Math.sin(angle));
    }

    // Add some randomness to spawn position
    const lateralOffset = (Math.random() - 0.5) * 20;
    this._tempPerpDir.set(-this._tempSpawnDir.z, 0, this._tempSpawnDir.x);

    this._tempSpawnPos.set(
      playerPosition.x + this._tempSpawnDir.x * COP_CAR_CONFIG.SPAWN_BEHIND_DISTANCE + this._tempPerpDir.x * lateralOffset,
      0,
      playerPosition.z + this._tempSpawnDir.z * COP_CAR_CONFIG.SPAWN_BEHIND_DISTANCE + this._tempPerpDir.z * lateralOffset
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
   * Only tramples cop cars that are in front of the truck (within ~90° frontal cone)
   * Returns number of cars trampled and their positions
   */
  trampleInRadius(
    position: THREE.Vector3,
    radius: number,
    forwardDirection: THREE.Vector3
  ): { kills: number; positions: THREE.Vector3[]; points: number } {
    let killCount = 0;
    let totalPoints = 0;
    const killPositions: THREE.Vector3[] = [];
    const radiusSq = radius * radius;

    // PERF: Reset kill position pool index for this attack
    this._killPositionPoolIndex = 0;

    for (const car of this.cars) {
      if (car.isDeadState()) continue;

      car.getPositionInto(this._tempCarPos);
      const distanceSq = this._tempCarPos.distanceToSquared(position);

      if (distanceSq < radiusSq) {
        // Check if cop car is in front of the truck
        // Calculate direction from truck to cop car
        this._tempSpawnDir.subVectors(this._tempCarPos, position).normalize();
        
        // Dot product: 1 = directly in front, -1 = directly behind, 0 = perpendicular
        const dot = forwardDirection.dot(this._tempSpawnDir);
        
        // Only trample if cop car is in frontal cone (>0.3 ≈ ±72° from center)
        // This means truck only kills with its front ~144° arc
        if (dot > 0.3) {
          car.trample();
          killCount++;
          totalPoints += car.getPointValue();
          // PERF: Use pre-allocated pool instead of clone()
          if (this._killPositionPoolIndex < this.MAX_KILL_POSITIONS) {
            const pooledPos = this._killPositionPool[this._killPositionPoolIndex++];
            pooledPos.copy(this._tempCarPos);
            killPositions.push(pooledPos);
          }
        }
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

    this._killPositionPoolIndex = 0;

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
          if (this._killPositionPoolIndex < this.MAX_KILL_POSITIONS) {
            const pooledPos = this._killPositionPool[this._killPositionPoolIndex++];
            pooledPos.copy(this._tempCarPos);
            killPositions.push(pooledPos);
          }
        }
      }
    }

    return { kills: killCount, positions: killPositions, points: totalPoints, hits: hitCount };
  }

  getActiveCopCount(): number {
    // PERF: Loop instead of filter() to avoid array allocation
    let count = 0;
    for (const car of this.cars) {
      if (!car.isDeadState()) count++;
    }
    return count;
  }

  getCopData(): Array<{ position: THREE.Vector3; health: number; maxHealth: number }> {
    this._copDataResult.length = 0;

    for (const car of this.cars) {
      if (!car.isDeadState()) {
        this._copDataResult.push({
          position: car.getPosition(),
          health: car.getHealth(),
          maxHealth: car.getMaxHealth(),
        });
      }
    }

    return this._copDataResult;
  }

  /**
   * Get all cop car objects (for visibility toggling during rampage)
   */
  getCars(): CopCar[] {
    return this.cars;
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

  /**
   * Reset spawn cooldown to allow immediate spawning (called after rampage exits)
   */
  resetSpawnTimer(): void {
    this.spawnCooldown = 0;
  }
}
