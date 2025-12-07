import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { MotorbikeCop, MotorbikeCopVariant, MotorbikeCopState } from '../entities/MotorbikeCop';
import { MOTORBIKE_COP_CONFIG } from '../constants';
import { AIManager } from '../core/AIManager';

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
 *
 * NOTE: Uses shared AIManager EntityManager - Engine.ai.update() handles Yuka updates
 */
export class MotorbikeCopManager {
  private cops: MotorbikeCop[] = [];
  private scene: THREE.Scene;
  private world: RAPIER.World;
  private aiManager: AIManager;

  // Spawn tracking
  private scoutCount: number = 0;
  private swarmCount: number = 0;
  private bossCount: number = 0;
  private lastSpawnTime: number = 0;
  private spawnCooldown: number = 2.0; // Seconds between spawns

  // Wave state
  private currentWaveCleared: boolean = false;
  private waveRespiteTimer: number = 0;
  private readonly WAVE_RESPITE_DURATION: number = 5; // Seconds of respite after clearing (reduced for better pacing)

  // Heat tracking
  private previousHeat: number = 0;

  // Damage callback (set once, not every frame)
  private damageCallback: ((damage: number, isRam: boolean) => void) | null = null;

  // Pre-allocated vectors (avoid GC pressure)
  private readonly _tempCopPos: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempDirection: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempSpawnPos: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempBehindDir: THREE.Vector3 = new THREE.Vector3();
  private readonly _coneDirection: THREE.Vector3 = new THREE.Vector3();
  private readonly _killPositionPool: THREE.Vector3[] = [];
  private readonly MAX_KILL_POSITIONS = MOTORBIKE_COP_CONFIG.MAX_TOTAL;
  private _killPositionPoolIndex = 0;

  // Pre-calculated squared distances for attack range checks (avoid sqrt in hot loop)
  private static readonly SHOOT_RANGE_SQ = MOTORBIKE_COP_CONFIG.SHOOT_RANGE * MOTORBIKE_COP_CONFIG.SHOOT_RANGE;
  private static readonly TASER_RANGE_SQ = MOTORBIKE_COP_CONFIG.TASER_RANGE * MOTORBIKE_COP_CONFIG.TASER_RANGE;

  // Pre-allocated array for getCopData (reused each call, avoids filter/map allocations)
  private _copDataResult: Array<{
    position: THREE.Vector3;
    health: number;
    maxHealth: number;
    variant: MotorbikeCopVariant;
    state: MotorbikeCopState;
  }> = [];

  constructor(scene: THREE.Scene, world: RAPIER.World, aiManager: AIManager) {
    this.scene = scene;
    this.world = world;
    this.aiManager = aiManager;

    for (let i = 0; i < this.MAX_KILL_POSITIONS; i++) {
      this._killPositionPool.push(new THREE.Vector3());
    }
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

    // Remove dead cops (PERF: use splice loop instead of filter)
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const cop = this.cops[i];
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

        this.cops.splice(i, 1);
      }
    }

    // Check for wave clear (only if cops existed previously)
    const activeCops = this.getActiveCopCount();
    const hadCopsPreviously = this.scoutCount > 0 || this.swarmCount > 0 || this.bossCount > 0;
    if (activeCops === 0 && this.previousHeat >= 25 && !this.currentWaveCleared && hadCopsPreviously) {
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

    // Calculate desired cop counts based on heat (staggered to avoid 50% cliff)
    let desiredScouts = 0;
    let desiredSwarm = 0;
    let desiredBosses = 0;

    if (heat >= thresholds.BOSS) {
      // Full assault at 75%+ heat
      desiredScouts = limits.MAX_SCOUTS;
      desiredSwarm = limits.MAX_SWARM;
      desiredBosses = limits.MAX_BOSSES;
    } else if (heat >= thresholds.SWARM_FULL) {
      // Full swarm at 55%+ heat (6 bikes)
      desiredScouts = limits.MAX_SCOUTS;
      desiredSwarm = limits.MAX_SWARM;
      desiredBosses = 0;
    } else if (heat >= thresholds.SWARM_INITIAL) {
      // Initial swarm at 45%+ heat (only 2 bikes)
      desiredScouts = limits.MAX_SCOUTS;
      desiredSwarm = 2;
      desiredBosses = 0;
    } else if (heat >= thresholds.SCOUT) {
      // Scouts at 25%+ heat
      desiredScouts = Math.min(1, limits.MAX_SCOUTS);
      desiredSwarm = 0;
      desiredBosses = 0;
    }

    // Check total cap
    const _totalDesired = desiredScouts + desiredSwarm + desiredBosses;
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
      case MotorbikeCopVariant.BOSS: {
        // Boss spawns ahead of player
        // PERF: Reuse pre-allocated vectors instead of clone()
        const aheadDir = this._tempDirection.copy(playerVelocity);
        if (aheadDir.lengthSq() < 0.01) {
          aheadDir.set(0, 0, -1); // Default forward if stationary
        } else {
          aheadDir.normalize();
        }
        spawnPos = this._tempSpawnPos.copy(playerPosition).add(
          aheadDir.multiplyScalar(config.SPAWN_AHEAD_DISTANCE)
        );
        break;
      }

      case MotorbikeCopVariant.SWARM: {
        // Swarm spawns at flanking positions
        const flankAngle = Math.random() * Math.PI * 2;
        const flankDistance = config.SPAWN_BEHIND_DISTANCE * (0.7 + Math.random() * 0.6);
        this._tempSpawnPos.set(
          playerPosition.x + Math.cos(flankAngle) * flankDistance,
          0,
          playerPosition.z + Math.sin(flankAngle) * flankDistance
        );
        spawnPos = this._tempSpawnPos;
        break;
      }

      case MotorbikeCopVariant.SCOUT:
      default: {
        // Scout spawns behind player
        this._tempBehindDir.copy(playerVelocity).negate();
        if (this._tempBehindDir.lengthSq() < 0.01) {
          this._tempBehindDir.set(0, 0, 1); // Default behind if stationary
        } else {
          this._tempBehindDir.normalize();
        }
        const lateralOffset = (Math.random() - 0.5) * config.SPAWN_FLANK_OFFSET;
        this._tempSpawnPos.copy(playerPosition)
          .add(this._tempBehindDir.multiplyScalar(config.SPAWN_BEHIND_DISTANCE));
        this._tempSpawnPos.x += lateralOffset;
        spawnPos = this._tempSpawnPos;
        break;
      }
    }

    // Ensure spawn position is on ground
    spawnPos.y = 0;

    // Create the cop (uses shared AIManager EntityManager)
    const cop = new MotorbikeCop(spawnPos, this.world, this.aiManager.getEntityManager(), variant);
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
    // NOTE: Yuka EntityManager update is handled by Engine.ai.update() - no duplicate call here

    // Update each cop
    for (const cop of this.cops) {
      if (!cop.isDeadState()) {
        // Set chase target
        cop.setChaseTarget(playerPosition);

        // Handle ranged attacks based on wanted stars and distance
        // Use squared distance to avoid sqrt in hot loop
        cop.getPositionInto(this._tempCopPos);
        const distanceSq = this._tempCopPos.distanceToSquared(playerPosition);
        const state = cop.getState();

        if (state === MotorbikeCopState.CHASE) {
          if (wantedStars >= 2 && distanceSq <= MotorbikeCopManager.SHOOT_RANGE_SQ) {
            // 2+ stars: shoot
            cop.fireBullet(playerPosition);
          } else if (wantedStars === 1 && playerCanBeTased && distanceSq <= MotorbikeCopManager.TASER_RANGE_SQ) {
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
    const radiusSq = radius * radius;

    this._killPositionPoolIndex = 0;
    let normalizedDirection: THREE.Vector3 | null = null;
    let coneThreshold = 0;
    if (direction) {
      normalizedDirection = this._coneDirection.copy(direction).normalize();
      coneThreshold = Math.cos(coneAngle * 0.5);
    }

    for (const cop of this.cops) {
      if (cop.isDeadState()) continue;
      if (killCount >= maxKills) break;

      const copPos = cop.getPosition();
      const distanceSq = copPos.distanceToSquared(position);

      if (distanceSq < radiusSq) {
        let inCone = true;

        if (normalizedDirection) {
          // Reuse pre-allocated vector for cone check
          this._tempDirection.subVectors(copPos, position).normalize();
          const dotProduct = normalizedDirection.dot(this._tempDirection);
          inCone = dotProduct >= coneThreshold;
        }

        if (inCone) {
          cop.takeDamage(damage);

          // Apply knockback
          cop.applyKnockback(position, 15);

          if (cop.isDeadState()) {
            killCount++;
            if (this._killPositionPoolIndex < this.MAX_KILL_POSITIONS) {
              const pooledPos = this._killPositionPool[this._killPositionPoolIndex++];
              pooledPos.copy(copPos);
              killPositions.push(pooledPos);
            }

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
   * Get active cop count (PERF: loop instead of filter)
   */
  getActiveCopCount(): number {
    let count = 0;
    for (const cop of this.cops) {
      if (!cop.isDeadState()) count++;
    }
    return count;
  }

  /**
   * Get cop data for UI (health bars, indicators)
   * Returns pre-allocated array (reused each call) - caller should not hold references
   */
  getCopData(): Array<{
    position: THREE.Vector3;
    health: number;
    maxHealth: number;
    variant: MotorbikeCopVariant;
    state: MotorbikeCopState;
  }> {
    // Reset length without deallocating (reuse array)
    this._copDataResult.length = 0;

    for (const cop of this.cops) {
      if (!cop.isDeadState()) {
        this._copDataResult.push({
          position: cop.getPosition(),
          health: cop.getHealth(),
          maxHealth: cop.getMaxHealth(),
          variant: cop.getVariant(),
          state: cop.getState(),
        });
      }
    }

    return this._copDataResult;
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
   * Get all cop objects (for visibility toggling during rampage)
   */
  getCops(): MotorbikeCop[] {
    return this.cops;
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

  /**
   * Reset spawn timer to allow immediate spawning (called after rampage exits)
   */
  resetSpawnTimer(): void {
    this.lastSpawnTime = this.spawnCooldown;
  }
}
