import * as THREE from 'three';
import { CrowdManager } from '../managers/CrowdManager';
import { CopManager } from '../managers/CopManager';
import { ParticleEmitter } from '../rendering/ParticleSystem';
import { Vehicle } from '../entities/Vehicle';
import { Player } from '../entities/Player';
import {
  PLAYER_ATTACK_CONFIG,
  SCORING_CONFIG,
  WANTED_STARS,
} from '../constants';
import { GameStats } from '../types';

/**
 * Result of a combat action
 */
export interface CombatResult {
  totalKills: number;
  pedKills: number;
  copKills: number;
  scoreGained: number;
  heatGained: number;
}

/**
 * Kill notification data
 */
export interface KillNotificationData {
  message: string;
  isPursuit: boolean;
  points: number;
}

/**
 * CombatManager
 *
 * Handles all combat-related logic:
 * - Player melee attacks
 * - Vehicle attacks (bicycle, motorbike)
 * - Vehicle kills (roadkill)
 * - Building destruction
 * - Score/combo/heat calculations
 */
export class CombatManager {
  // Pre-allocated vectors
  private readonly _tempAttackDir: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempVehicleDir: THREE.Vector3 = new THREE.Vector3();
  private readonly _yAxis: THREE.Vector3 = new THREE.Vector3(0, 1, 0);

  // Kill messages
  private static readonly KILL_MESSAGES = ['SPLAT!', 'CRUSHED!', 'DEMOLISHED!', 'OBLITERATED!', 'TERMINATED!'];
  private static readonly PANIC_KILL_MESSAGES = ['COWARD!', 'NO ESCAPE!', 'RUN FASTER!', 'BACKSTAB!', 'EASY PREY!'];
  private static readonly PURSUIT_KILL_MESSAGES = ['HEAT KILL!', 'WANTED BONUS!', 'PURSUIT FRENZY!', 'HOT STREAK!', 'RAMPAGE!'];
  private static readonly ROADKILL_MESSAGES = ['ROADKILL!', 'PANCAKED!', 'FLATTENED!', 'SPLATTER!', 'SPEED BUMP!'];
  private static readonly COP_KILL_MESSAGES = ['BADGE DOWN!', 'OFFICER DOWN!', 'COP DROPPED!', 'BLUE DOWN!'];
  private static readonly BUILDING_DESTROY_MESSAGES = ['DEMOLISHED!', 'WRECKED!', 'CRUSHED!', 'LEVELED!', 'OBLITERATED!'];

  // Callbacks
  private onKillNotification: ((data: KillNotificationData) => void) | null = null;
  private onCameraShake: ((intensity: number) => void) | null = null;

  constructor() {}

  setCallbacks(callbacks: {
    onKillNotification?: (data: KillNotificationData) => void;
    onCameraShake?: (intensity: number) => void;
  }): void {
    this.onKillNotification = callbacks.onKillNotification || null;
    this.onCameraShake = callbacks.onCameraShake || null;
  }

  /**
   * Update wanted stars based on cop kills
   */
  updateWantedStars(stats: GameStats): void {
    if (stats.copKills < WANTED_STARS.STAR_1) {
      stats.wantedStars = 0;
    } else if (stats.copKills < WANTED_STARS.STAR_2) {
      stats.wantedStars = 1;
    } else {
      stats.wantedStars = 2;
    }
  }

  /**
   * Emit blood effects at kill positions
   */
  emitBloodEffects(
    particles: ParticleEmitter,
    killPositions: THREE.Vector3[],
    sourcePosition: THREE.Vector3,
    particleCount: number = 30,
    sprayCount: number = 20
  ): void {
    for (const killPos of killPositions) {
      this._tempAttackDir.subVectors(killPos, sourcePosition).normalize();
      particles.emitBlood(killPos, particleCount);
      particles.emitBloodSpray(killPos, this._tempAttackDir, sprayCount);
    }
  }

  /**
   * Handle player melee attack (knife)
   */
  handlePlayerAttack(
    attackPosition: THREE.Vector3,
    player: Player,
    stats: GameStats,
    crowd: CrowdManager | null,
    cops: CopManager | null,
    particles: ParticleEmitter
  ): CombatResult {
    const cfg = PLAYER_ATTACK_CONFIG.KNIFE;

    const pedAttackRadius = cfg.pedRadius;
    const copAttackRadius = cfg.copRadius;
    const damage = cfg.damage;
    const maxKills = stats.combo >= cfg.comboThreshold ? Infinity : 1;
    const attackDirection = player.getFacingDirection();
    const coneAngle = cfg.coneAngle;

    let totalKills = 0;
    let scoreGained = 0;
    let heatGained = 0;
    const allKillPositions: THREE.Vector3[] = [];

    // --- Pedestrian damage ---
    let pedKills = 0;
    if (crowd) {
      const pedResult = crowd.damageInRadius(
        attackPosition,
        pedAttackRadius,
        damage,
        maxKills,
        attackDirection,
        coneAngle
      );
      pedKills = pedResult.kills;

      if (pedResult.kills > 0) {
        stats.kills += pedResult.kills;

        const basePoints = SCORING_CONFIG.PEDESTRIAN_BASE;
        const regularKills = pedResult.kills - pedResult.panicKills;
        const panicKills = pedResult.panicKills;

        const regularPoints = regularKills * (stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER : basePoints);
        const panicPoints = panicKills * (stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER * SCORING_CONFIG.PANIC_MULTIPLIER : basePoints * SCORING_CONFIG.PANIC_MULTIPLIER);

        scoreGained += regularPoints + panicPoints;
        stats.score += regularPoints + panicPoints;
        stats.combo += pedResult.kills;
        stats.comboTimer = SCORING_CONFIG.COMBO_DURATION;
        heatGained += pedResult.kills * SCORING_CONFIG.HEAT_PER_PED_KILL;
        stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, stats.heat + heatGained);

        totalKills += pedResult.kills;
        allKillPositions.push(...pedResult.positions);

        for (let i = 0; i < regularKills; i++) {
          const message = stats.inPursuit
            ? CombatManager.randomFrom(CombatManager.PURSUIT_KILL_MESSAGES)
            : CombatManager.randomFrom(CombatManager.KILL_MESSAGES);
          const points = stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER : basePoints;
          this.triggerKillNotification(message, stats.inPursuit, points);
        }
        for (let i = 0; i < panicKills; i++) {
          const message = CombatManager.randomFrom(CombatManager.PANIC_KILL_MESSAGES);
          const points = stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER * SCORING_CONFIG.PANIC_MULTIPLIER : basePoints * SCORING_CONFIG.PANIC_MULTIPLIER;
          this.triggerKillNotification(message, true, points);
        }

        crowd.panicCrowd(attackPosition, cfg.panicRadius);
      }
    }

    // --- Cop damage ---
    let copKills = 0;
    if (cops) {
      const copResult = cops.damageInRadius(
        attackPosition,
        copAttackRadius,
        damage,
        maxKills,
        attackDirection,
        coneAngle
      );
      copKills = copResult.kills;

      if (copResult.kills > 0) {
        const basePoints = SCORING_CONFIG.COP_BASE;
        const pointsPerKill = basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER;
        scoreGained += copResult.kills * pointsPerKill;
        stats.score += copResult.kills * pointsPerKill;
        stats.copKills += copResult.kills;
        this.updateWantedStars(stats);
        const copHeat = copResult.kills * SCORING_CONFIG.HEAT_PER_COP_KILL;
        heatGained += copHeat;
        stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, stats.heat + copHeat);

        totalKills += copResult.kills;
        allKillPositions.push(...copResult.positions);

        for (let i = 0; i < copResult.kills; i++) {
          this.triggerKillNotification(CombatManager.randomFrom(CombatManager.COP_KILL_MESSAGES), true, pointsPerKill);
        }
      }
    }

    // --- Blood particles and decals ---
    if (totalKills > 0) {
      this.emitBloodEffects(particles, allKillPositions, player.getPosition(), cfg.particleCount, cfg.decalCount);
      this.onCameraShake?.(cfg.cameraShakeMultiplier * totalKills);
    }

    return { totalKills, pedKills, copKills, scoreGained, heatGained };
  }

  /**
   * Handle bicycle attack
   */
  handleBicycleAttack(
    vehicle: Vehicle,
    stats: GameStats,
    crowd: CrowdManager | null,
    cops: CopManager | null,
    particles: ParticleEmitter
  ): CombatResult {
    const cfg = PLAYER_ATTACK_CONFIG.BICYCLE;

    const attackPosition = vehicle.getPosition();
    this._tempVehicleDir.set(0, 0, 1).applyAxisAngle(this._yAxis, vehicle.getRotationY());

    const attackRadius = cfg.attackRadius;
    const damage = cfg.damage;
    const maxKills = stats.combo >= cfg.comboThreshold ? Infinity : cfg.maxKills;
    const coneAngle = cfg.coneAngle;

    let totalKills = 0;
    let scoreGained = 0;
    let heatGained = 0;
    const allKillPositions: THREE.Vector3[] = [];

    let pedKills = 0;
    if (crowd) {
      const pedResult = crowd.damageInRadius(
        attackPosition,
        attackRadius,
        damage,
        maxKills,
        this._tempVehicleDir,
        coneAngle
      );
      pedKills = pedResult.kills;

      if (pedResult.kills > 0) {
        const basePoints = SCORING_CONFIG.PEDESTRIAN_BICYCLE;
        const regularKills = pedResult.kills - pedResult.panicKills;
        const panicKills = pedResult.panicKills;

        const regularPoints = regularKills * (stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER : basePoints);
        const panicPoints = panicKills * (stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER * SCORING_CONFIG.PANIC_MULTIPLIER : basePoints * SCORING_CONFIG.PANIC_MULTIPLIER);

        scoreGained += regularPoints + panicPoints;
        stats.score += regularPoints + panicPoints;
        stats.kills += pedResult.kills;
        stats.combo += pedResult.kills;
        stats.comboTimer = SCORING_CONFIG.COMBO_DURATION;
        heatGained += pedResult.kills * SCORING_CONFIG.HEAT_PER_PED_KILL;
        stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, stats.heat + heatGained);

        totalKills += pedResult.kills;
        allKillPositions.push(...pedResult.positions);

        for (let i = 0; i < regularKills; i++) {
          const message = stats.inPursuit
            ? CombatManager.randomFrom(CombatManager.PURSUIT_KILL_MESSAGES)
            : 'BIKE SLASH!';
          const points = stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER : basePoints;
          this.triggerKillNotification(message, stats.inPursuit, points);
        }
        for (let i = 0; i < panicKills; i++) {
          const points = stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER * SCORING_CONFIG.PANIC_MULTIPLIER : basePoints * SCORING_CONFIG.PANIC_MULTIPLIER;
          this.triggerKillNotification('CYCLE SLAUGHTER!', true, points);
        }

        crowd.panicCrowd(attackPosition, cfg.panicRadius);
      }
    }

    let copKills = 0;
    if (cops) {
      const copResult = cops.damageInRadius(
        attackPosition,
        attackRadius + 1,
        damage,
        maxKills,
        this._tempVehicleDir,
        coneAngle
      );
      copKills = copResult.kills;

      if (copResult.kills > 0) {
        const basePoints = SCORING_CONFIG.COP_BASE;
        const pointsPerKill = basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER;
        scoreGained += copResult.kills * pointsPerKill;
        stats.score += copResult.kills * pointsPerKill;
        stats.copKills += copResult.kills;
        this.updateWantedStars(stats);
        const copHeat = copResult.kills * SCORING_CONFIG.HEAT_PER_COP_KILL;
        heatGained += copHeat;
        stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, stats.heat + copHeat);
        totalKills += copResult.kills;
        allKillPositions.push(...copResult.positions);

        for (let i = 0; i < copResult.kills; i++) {
          this.triggerKillNotification('COP CYCLIST!', true, pointsPerKill);
        }
      }
    }

    if (totalKills > 0) {
      this.emitBloodEffects(particles, allKillPositions, vehicle.getPosition(), cfg.particleCount, cfg.decalCount);
      this.onCameraShake?.(cfg.cameraShakeMultiplier * totalKills);
    }

    return { totalKills, pedKills, copKills, scoreGained, heatGained };
  }

  /**
   * Handle motorbike shooting attack
   */
  handleMotorbikeShoot(
    vehicle: Vehicle,
    stats: GameStats,
    crowd: CrowdManager | null,
    cops: CopManager | null,
    particles: ParticleEmitter
  ): CombatResult {
    const cfg = PLAYER_ATTACK_CONFIG.MOTORBIKE;

    const attackPosition = vehicle.getPosition();
    this._tempVehicleDir.set(0, 0, 1).applyAxisAngle(this._yAxis, vehicle.getRotationY());

    const attackRadius = cfg.attackRadius;
    const damage = cfg.damage;
    const maxKills = cfg.maxKills;
    const coneAngle = cfg.coneAngle;

    let totalKills = 0;
    let scoreGained = 0;
    let heatGained = 0;
    const allKillPositions: THREE.Vector3[] = [];

    let pedKills = 0;
    if (crowd) {
      const pedResult = crowd.damageInRadius(
        attackPosition,
        attackRadius,
        damage,
        maxKills,
        this._tempVehicleDir,
        coneAngle
      );
      pedKills = pedResult.kills;

      if (pedResult.kills > 0) {
        const basePoints = SCORING_CONFIG.PEDESTRIAN_MOTORBIKE;
        const points = stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER : basePoints;

        scoreGained += points * pedResult.kills;
        stats.score += points * pedResult.kills;
        stats.kills += pedResult.kills;
        stats.combo += pedResult.kills;
        stats.comboTimer = SCORING_CONFIG.COMBO_DURATION;
        heatGained += pedResult.kills * SCORING_CONFIG.HEAT_PER_MOTORBIKE_PED_KILL;
        stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, stats.heat + heatGained);

        totalKills += pedResult.kills;
        allKillPositions.push(...pedResult.positions);

        const message = pedResult.panicKills > 0 ? 'DRIVE-BY TERROR!' : 'DRIVE-BY!';
        this.triggerKillNotification(message, true, points);

        crowd.panicCrowd(attackPosition, cfg.panicRadius);
      }
    }

    let copKills = 0;
    if (cops) {
      const copResult = cops.damageInRadius(
        attackPosition,
        attackRadius,
        damage,
        maxKills,
        this._tempVehicleDir,
        coneAngle
      );
      copKills = copResult.kills;

      if (copResult.kills > 0) {
        const basePoints = SCORING_CONFIG.COP_MOTORBIKE;
        const pointsPerKill = basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER;
        scoreGained += copResult.kills * pointsPerKill;
        stats.score += copResult.kills * pointsPerKill;
        stats.copKills += copResult.kills;
        this.updateWantedStars(stats);
        const copHeat = copResult.kills * SCORING_CONFIG.HEAT_PER_MOTORBIKE_COP_KILL;
        heatGained += copHeat;
        stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, stats.heat + copHeat);
        totalKills += copResult.kills;
        allKillPositions.push(...copResult.positions);

        this.triggerKillNotification('COP KILLER!', true, pointsPerKill);
      }
    }

    if (totalKills > 0) {
      this.emitBloodEffects(particles, allKillPositions, vehicle.getPosition(), cfg.particleCount, cfg.decalCount);
      this.onCameraShake?.(cfg.cameraShakeHit);
    }

    if (totalKills === 0) {
      this.onCameraShake?.(cfg.cameraShakeMiss);
    }

    return { totalKills, pedKills, copKills, scoreGained, heatGained };
  }

  /**
   * Handle vehicle kill (roadkill)
   */
  handleVehicleKill(
    position: THREE.Vector3,
    wasPanicking: boolean,
    stats: GameStats,
    crowd: CrowdManager | null,
    particles: ParticleEmitter
  ): void {
    const cfg = PLAYER_ATTACK_CONFIG.VEHICLE_HIT;
    stats.kills++;

    const basePoints = SCORING_CONFIG.PEDESTRIAN_ROADKILL;
    let points = basePoints;
    if (wasPanicking) points *= SCORING_CONFIG.PANIC_MULTIPLIER;
    if (stats.inPursuit) points *= SCORING_CONFIG.PURSUIT_MULTIPLIER;

    stats.score += points;
    stats.combo++;
    stats.comboTimer = SCORING_CONFIG.COMBO_DURATION;
    stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, stats.heat + SCORING_CONFIG.HEAT_PER_PED_KILL);

    particles.emitBlood(position, cfg.particleCount);
    if (crowd) {
      crowd.panicCrowd(position, cfg.panicRadius);
    }

    let message: string;
    if (wasPanicking) {
      message = CombatManager.randomFrom(CombatManager.PANIC_KILL_MESSAGES);
    } else if (stats.inPursuit) {
      message = CombatManager.randomFrom(CombatManager.PURSUIT_KILL_MESSAGES);
    } else {
      message = CombatManager.randomFrom(CombatManager.ROADKILL_MESSAGES);
    }
    this.triggerKillNotification(message, wasPanicking || stats.inPursuit, points);

    this.onCameraShake?.(cfg.cameraShake);
  }

  /**
   * Handle building destruction
   */
  handleBuildingDestruction(
    position: THREE.Vector3,
    stats: GameStats,
    particles: ParticleEmitter
  ): void {
    const basePoints = 500;
    let points = basePoints;
    if (stats.inPursuit) points *= SCORING_CONFIG.PURSUIT_MULTIPLIER;

    stats.score += points;
    stats.combo++;
    stats.comboTimer = SCORING_CONFIG.COMBO_DURATION;
    stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, stats.heat + 50);

    particles.emitDebris(position, 30);
    this.onCameraShake?.(1.0);

    const message = CombatManager.randomFrom(CombatManager.BUILDING_DESTROY_MESSAGES);
    this.triggerKillNotification(message, true, points);
  }

  private triggerKillNotification(message: string, isPursuit: boolean, points: number): void {
    this.onKillNotification?.({ message, isPursuit, points });
  }

  private static randomFrom<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }
}
