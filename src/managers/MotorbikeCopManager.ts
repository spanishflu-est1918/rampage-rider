import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import * as YUKA from 'yuka';
import { MotorbikeCop, MotorbikeCopVariant, MotorbikeCopState } from '../entities/MotorbikeCop';
import { MOTORBIKE_COP_CONFIG } from '../constants';

/**
 * MotorbikeCopManager
 *
 * Manages motorbike cop spawning based on heat level:
 * - 25% heat → Scout (1-2 bikes behind player)
 * - 50% heat → Swarm (4-6 bikes flanking)
 * - 75% heat → Boss + full swarm (8 total)
 *
 * Heat decays over time and drops significantly on cop kills.
 * Wave clears give temporary respite.
 */
export class MotorbikeCopManager {
  private cops: MotorbikeCop[] = [];
  private scene: THREE.Scene;
  private world: RAPIER.World;
  private entityManager: YUKA.EntityManager;

  // Spawn tracking
  private scoutCount: number = 0;
  private swarmCount: number = 0;
  private bossCount: number = 0;
  private lastSpawnTime: number = 0;
  private spawnCooldown: number = 2.0; // Seconds between spawns

  // Wave state
  private currentWaveCleared: boolean = false;
  private waveRespiteTimer: number = 0;
  private readonly WAVE_RESPITE_DURATION: number = 20; // Seconds of respite after clearing

  // Heat tracking
  private previousHeat: number = 0;

  // Damage callback (set once, not every frame)
  private damageCallback: ((damage: number, isRam: boolean) => void) | null = null;

  // Pre-allocated vectors (avoid GC pressure)
  private readonly _tempCopPos: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempDirection: THREE.Vector3 = new THREE.Vector3();

  constructor(scene: THREE.Scene, world: RAPIER.World) {
    this.scene = scene;
    this.world = world;
    this.entityManager = new YUKA.EntityManager();
  }

  /**
   * Set damage callback once (called when cop deals damage)
   */
  setDamageCallback(callback: (damage: number, isRam: boolean) => void): void {
    this.damageCallback = callback;
    // Update existing cops
    for (const cop of this.cops) {
      cop.setDamageCallback(callback);
    }
  }

  /**
   * Update spawns based on heat level
   */
  updateSpawns(
    heat: number,
    playerPosition: THREE.Vector3,
    playerVelocity: THREE.Vector3,
    deltaTime: number
  ): void {
    // Update wave respite timer
    if (this.waveRespiteTimer > 0) {
      this.waveRespiteTimer -= deltaTime;
      if (this.waveRespiteTimer <= 0) {
        this.currentWaveCleared = false;
      }
    }

    // Remove dead cops
    this.cops = this.cops.filter((cop) => {
      if (cop.isDeadState() && !(cop as THREE.Group).visible) {
        this.scene.remove(cop);
        this.scene.remove(cop.getBlobShadow());
        cop.dispose();

        // Decrement variant count
        switch (cop.getVariant()) {
          case MotorbikeCopVariant.SCOUT:
            this.scoutCount--;
            break;
          case MotorbikeCopVariant.SWARM:
            this.swarmCount--;
            break;
          case MotorbikeCopVariant.BOSS:
            this.bossCount--;
            break;
        }

        return false;
      }
      return true;
    });

    // Check for wave clear
    const activeCops = this.getActiveCopCount();
    if (activeCops === 0 && this.previousHeat >= 25 && !this.currentWaveCleared) {
      this.currentWaveCleared = true;
      this.waveRespiteTimer = this.WAVE_RESPITE_DURATION;
    }

    // Don't spawn during wave respite
    if (this.currentWaveCleared) {
      this.previousHeat = heat;
      return;
    }

    // Update spawn cooldown
    this.lastSpawnTime += deltaTime;
    if (this.lastSpawnTime < this.spawnCooldown) {
      this.previousHeat = heat;
      return;
    }

    // Get thresholds
    const thresholds = MOTORBIKE_COP_CONFIG.HEAT_THRESHOLDS;
    const limits = MOTORBIKE_COP_CONFIG;

    // Calculate desired cop counts based on heat
    let desiredScouts = 0;
    let desiredSwarm = 0;
    let desiredBosses = 0;

    if (heat >= thresholds.BOSS) {
      // Full assault at 75%+ heat
      desiredScouts = limits.MAX_SCOUTS;
      desiredSwarm = limits.MAX_SWARM;
      desiredBosses = limits.MAX_BOSSES;
    } else if (heat >= thresholds.SWARM) {
      // Swarm at 50%+ heat
      desiredScouts = limits.MAX_SCOUTS;
      desiredSwarm = Math.min(4, limits.MAX_SWARM);
      desiredBosses = 0;
    } else if (heat >= thresholds.SCOUT) {
      // Scouts at 25%+ heat
      desiredScouts = Math.min(1, limits.MAX_SCOUTS);
      desiredSwarm = 0;
      desiredBosses = 0;
    }

    // Check total cap
    const totalDesired = desiredScouts + desiredSwarm + desiredBosses;
    const currentTotal = this.scoutCount + this.swarmCount + this.bossCount;
    if (currentTotal >= limits.MAX_TOTAL) {
      this.previousHeat = heat;
      return;
    }

    // Spawn priority: Boss > Swarm > Scout
    if (desiredBosses > this.bossCount) {
      this.spawnCop(MotorbikeCopVariant.BOSS, playerPosition, playerVelocity);
      this.lastSpawnTime = 0;
    } else if (desiredSwarm > this.swarmCount) {
      this.spawnCop(MotorbikeCopVariant.SWARM, playerPosition, playerVelocity);
      this.lastSpawnTime = 0;
    } else if (desiredScouts > this.scoutCount) {
      this.spawnCop(MotorbikeCopVariant.SCOUT, playerPosition, playerVelocity);
      this.lastSpawnTime = 0;
    }

    this.previousHeat = heat;
  }

  /**
   * Spawn a cop at appropriate position based on variant
   */
  private spawnCop(
    variant: MotorbikeCopVariant,
    playerPosition: THREE.Vector3,
    playerVelocity: THREE.Vector3
  ): void {
    const config = MOTORBIKE_COP_CONFIG;
    let spawnPos: THREE.Vector3;

    // Calculate spawn position based on variant
    switch (variant) {
      case MotorbikeCopVariant.BOSS:
        // Boss spawns ahead of player
        const aheadDir = playerVelocity.clone();
        if (aheadDir.lengthSq() < 0.01) {
          aheadDir.set(0, 0, -1); // Default forward if stationary
        } else {
          aheadDir.normalize();
        }
        spawnPos = playerPosition.clone().add(
          aheadDir.multiplyScalar(config.SPAWN_AHEAD_DISTANCE)
        );
        break;

      case MotorbikeCopVariant.SWARM:
        // Swarm spawns at flanking positions
        const flankAngle = Math.random() * Math.PI * 2;
        const flankDistance = config.SPAWN_BEHIND_DISTANCE * (0.7 + Math.random() * 0.6);
        spawnPos = new THREE.Vector3(
          playerPosition.x + Math.cos(flankAngle) * flankDistance,
          0,
          playerPosition.z + Math.sin(flankAngle) * flankDistance
        );
        break;

      case MotorbikeCopVariant.SCOUT:
      default:
        // Scout spawns behind player
        const behindDir = playerVelocity.clone().negate();
        if (behindDir.lengthSq() < 0.01) {
          behindDir.set(0, 0, 1); // Default behind if stationary
        } else {
          behindDir.normalize();
        }
        const lateralOffset = (Math.random() - 0.5) * config.SPAWN_FLANK_OFFSET;
        spawnPos = playerPosition.clone()
          .add(behindDir.multiplyScalar(config.SPAWN_BEHIND_DISTANCE))
          .add(new THREE.Vector3(lateralOffset, 0, 0));
        break;
    }

    // Ensure spawn position is on ground
    spawnPos.y = 0;

    // Create the cop
    const cop = new MotorbikeCop(spawnPos, this.world, this.entityManager, variant);
    cop.setParentScene(this.scene);
    if (this.damageCallback) {
      cop.setDamageCallback(this.damageCallback);
    }

    this.cops.push(cop);
    this.scene.add(cop);
    this.scene.add(cop.getBlobShadow()); // Add blob shadow to scene

    // Update variant counts
    switch (variant) {
      case MotorbikeCopVariant.SCOUT:
        this.scoutCount++;
        break;
      case MotorbikeCopVariant.SWARM:
        this.swarmCount++;
        break;
      case MotorbikeCopVariant.BOSS:
        this.bossCount++;
        break;
    }
  }

  /**
   * Update all cops
   * NOTE: Damage callback is set once via setDamageCallback(), not every frame
   */
  update(
    deltaTime: number,
    playerPosition: THREE.Vector3,
    playerVelocity: THREE.Vector3,
    wantedStars: number,
    playerCanBeTased: boolean
  ): void {
    // Update Yuka entity manager
    this.entityManager.update(deltaTime);

    // Update each cop
    for (const cop of this.cops) {
      if (!cop.isDeadState()) {
        // Set chase target
        cop.setChaseTarget(playerPosition);

        // Handle ranged attacks based on wanted stars and distance
        // Use zero-alloc getPositionInto to avoid GC pressure
        cop.getPositionInto(this._tempCopPos);
        const distance = this._tempCopPos.distanceTo(playerPosition);
        const state = cop.getState();

        if (state === MotorbikeCopState.CHASE) {
          if (wantedStars >= 2 && distance <= MOTORBIKE_COP_CONFIG.SHOOT_RANGE) {
            // 2+ stars: shoot
            cop.fireBullet(playerPosition);
          } else if (wantedStars === 1 && playerCanBeTased && distance <= MOTORBIKE_COP_CONFIG.TASER_RANGE) {
            // 1 star: taser
            cop.fireTaser(playerPosition);
          }
        }
      }

      cop.update(deltaTime, playerVelocity);
    }
  }

  /**
   * Damage cops in radius (for player attacks)
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
    positions: THREE.Vector3[];
    points: number;
  } {
    let killCount = 0;
    let totalPoints = 0;
    const killPositions: THREE.Vector3[] = [];

    for (const cop of this.cops) {
      if (cop.isDeadState()) continue;
      if (killCount >= maxKills) break;

      const copPos = cop.getPosition();
      const distance = copPos.distanceTo(position);

      if (distance < radius) {
        let inCone = true;

        if (direction) {
          // Reuse pre-allocated vector for cone check
          this._tempDirection.subVectors(copPos, position).normalize();
          const dotProduct = direction.dot(this._tempDirection);
          const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
          inCone = angle <= coneAngle / 2;
        }

        if (inCone) {
          cop.takeDamage(damage);

          // Apply knockback
          cop.applyKnockback(position, 15);

          if (cop.isDeadState()) {
            killCount++;
            killPositions.push(copPos.clone());

            // Add points based on variant
            const variantConfig = MOTORBIKE_COP_CONFIG.VARIANTS[cop.getVariant()];
            totalPoints += variantConfig.pointValue;
          }
        }
      }
    }

    return { kills: killCount, positions: killPositions, points: totalPoints };
  }

  /**
   * Apply knockback to all cops in radius
   */
  applyKnockbackInRadius(fromPosition: THREE.Vector3, radius: number, force: number): number {
    let affectedCount = 0;

    for (const cop of this.cops) {
      if (cop.isDeadState()) continue;

      const copPos = cop.getPosition();
      const distance = copPos.distanceTo(fromPosition);

      if (distance <= radius) {
        const scaledForce = force * (1 - distance / radius);
        cop.applyKnockback(fromPosition, scaledForce);
        affectedCount++;
      }
    }

    return affectedCount;
  }

  /**
   * Clear all active taser beams
   */
  clearTaserBeams(): void {
    for (const cop of this.cops) {
      cop.removeTaserBeam();
    }
  }

  /**
   * Get active cop count
   */
  getActiveCopCount(): number {
    return this.cops.filter((cop) => !cop.isDeadState()).length;
  }

  /**
   * Get cop data for UI (health bars, indicators)
   */
  getCopData(): Array<{
    position: THREE.Vector3;
    health: number;
    maxHealth: number;
    variant: MotorbikeCopVariant;
    state: MotorbikeCopState;
  }> {
    return this.cops
      .filter((cop) => !cop.isDeadState())
      .map((cop) => ({
        position: cop.getPosition(),
        health: cop.getHealth(),
        maxHealth: cop.getMaxHealth(),
        variant: cop.getVariant(),
        state: cop.getState(),
      }));
  }

  /**
   * Check if wave is currently cleared (respite period)
   */
  isWaveCleared(): boolean {
    return this.currentWaveCleared;
  }

  /**
   * Get wave respite time remaining
   */
  getWaveRespiteTime(): number {
    return this.waveRespiteTimer;
  }

  /**
   * Clear all cops
   */
  clear(): void {
    for (const cop of this.cops) {
      this.scene.remove(cop);
      this.scene.remove(cop.getBlobShadow());
      cop.dispose();
    }
    this.cops = [];
    this.scoutCount = 0;
    this.swarmCount = 0;
    this.bossCount = 0;
    this.currentWaveCleared = false;
    this.waveRespiteTimer = 0;
    this.previousHeat = 0;
  }
}
