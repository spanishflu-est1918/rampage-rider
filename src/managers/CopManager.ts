import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import * as YUKA from 'yuka';
import { Cop } from '../entities/Cop';

/**
 * CopManager
 *
 * Manages cop spawning and behavior based on heat level:
 * - 25% heat → 1 cop
 * - 50% heat → 2 cops
 * - 75% heat → 3 cops
 */
export class CopManager {
  private cops: Cop[] = [];
  private scene: THREE.Scene;
  private world: RAPIER.World;
  private entityManager: YUKA.EntityManager;

  private maxCops: number = 8;
  private spawnRadius: number = 15;

  constructor(scene: THREE.Scene, world: RAPIER.World) {
    this.scene = scene;
    this.world = world;
    this.entityManager = new YUKA.EntityManager();

    console.log('[CopManager] Created');
  }

  /**
   * Update cop spawns based on heat level
   */
  updateSpawns(heat: number, playerPosition: THREE.Vector3): void {
    // Remove dead cops
    this.cops = this.cops.filter(cop => {
      if (cop.isDeadState() && !(cop as THREE.Group).visible) {
        this.scene.remove(cop);
        cop.dispose();
        return false;
      }
      return true;
    });

    // Calculate desired cop count based on heat
    let desiredCops = 0;
    if (heat >= 75) desiredCops = 3;
    else if (heat >= 50) desiredCops = 2;
    else if (heat >= 25) desiredCops = 1;

    // Spawn more cops if below desired count
    const activeCops = this.cops.filter(cop => !cop.isDeadState()).length;
    const copsToSpawn = Math.min(desiredCops - activeCops, this.maxCops - this.cops.length);

    if (copsToSpawn > 0) {
      console.log(`[CopManager] Heat: ${heat.toFixed(1)}% - Spawning ${copsToSpawn} cops (desired: ${desiredCops}, active: ${activeCops})`);
    }

    for (let i = 0; i < copsToSpawn; i++) {
      this.spawnCop(playerPosition);
    }
  }

  /**
   * Spawn a cop near the player
   */
  private spawnCop(playerPosition: THREE.Vector3): void {
    // Spawn at random angle around player, outside spawn radius
    const angle = Math.random() * Math.PI * 2;
    const distance = this.spawnRadius + Math.random() * 5;

    const spawnPos = new THREE.Vector3(
      playerPosition.x + Math.cos(angle) * distance,
      0,
      playerPosition.z + Math.sin(angle) * distance
    );

    const cop = new Cop(spawnPos, this.world, this.entityManager);
    this.cops.push(cop);
    this.scene.add(cop);

  }

  /**
   * Update all cops
   */
  update(deltaTime: number, playerPosition: THREE.Vector3, wantedStars: number, playerCanBeTased: boolean, onCopAttack: (damage: number) => void): void {
    // Update Yuka entity manager
    this.entityManager.update(deltaTime);

    // Update all cops
    for (const cop of this.cops) {
      if (!cop.isDeadState()) {
        // Set wanted star level to determine attack behavior
        cop.setWantedStars(wantedStars);

        // Tell cop if player can be tased (affects attack choice at 1 star)
        cop.setPlayerCanBeTased(playerCanBeTased);

        // Set damage callback
        cop.setDamageCallback(onCopAttack);

        // Set chase target to player
        cop.setChaseTarget(playerPosition);
      }

      cop.update(deltaTime);
    }
  }

  /**
   * Damage cops in radius
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
    positions: THREE.Vector3[]
  } {
    let killCount = 0;
    const killPositions: THREE.Vector3[] = [];

    for (const cop of this.cops) {
      if (cop.isDeadState()) continue;
      if (killCount >= maxKills) break;

      const copPos = (cop as THREE.Group).position;
      const distance = copPos.distanceTo(position);

      if (distance < radius) {
        let inCone = true;

        if (direction) {
          const toCop = new THREE.Vector3().subVectors(copPos, position).normalize();
          const dotProduct = direction.dot(toCop);
          const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
          inCone = angle <= coneAngle / 2;
        }

        if (inCone) {
          cop.takeDamage(damage);

          if (cop.isDeadState()) {
            killCount++;
            killPositions.push(copPos.clone());
          }
        }
      }
    }

    return { kills: killCount, positions: killPositions };
  }

  /**
   * Handle player colliding with cops (damage player)
   * Returns the attacking cop for additional context (stun, etc.)
   * NOTE: Currently unused - damage is handled via action-based callback in update()
   */
  handlePlayerCollisions(playerPosition: THREE.Vector3, wantedStars: number): Cop | null {
    // Collision radius depends on wanted star level (attack type)
    let collisionRadius = 2.0; // Punch range (0 stars)
    if (wantedStars >= 2) {
      collisionRadius = 7.0; // Shoot range (2+ stars)
    } else if (wantedStars === 1) {
      collisionRadius = 4.0; // Taser range (1 star)
    }

    for (const cop of this.cops) {
      if (cop.isDeadState()) continue;

      const copPos = (cop as THREE.Group).position;
      const distance = copPos.distanceTo(playerPosition);

      if (distance < collisionRadius) {
        return cop; // Return the attacking cop
      }
    }

    return null;
  }

  /**
   * Clear all cops
   */
  clear(): void {
    for (const cop of this.cops) {
      this.scene.remove(cop);
      cop.dispose();
    }
    this.cops = [];
    console.log('[CopManager] Cleared all cops');
  }

  /**
   * Get active cop count
   */
  getActiveCopCount(): number {
    return this.cops.filter(cop => !cop.isDeadState()).length;
  }

  /**
   * Get all active cops' positions and health for UI rendering
   */
  getCopData(): Array<{ position: THREE.Vector3; health: number; maxHealth: number }> {
    return this.cops
      .filter(cop => !cop.isDeadState())
      .map(cop => ({
        position: (cop as THREE.Group).position.clone(),
        health: cop.getHealth(),
        maxHealth: 3
      }));
  }

  /**
   * Apply knockback to all cops within radius (used for taser escape explosion)
   */
  applyKnockbackInRadius(fromPosition: THREE.Vector3, radius: number, force: number): number {
    let affectedCount = 0;

    for (const cop of this.cops) {
      if (cop.isDeadState()) continue;

      const copPos = cop.getPosition();
      const distance = copPos.distanceTo(fromPosition);

      if (distance <= radius) {
        // Scale force by distance (closer = stronger)
        const scaledForce = force * (1 - distance / radius);
        cop.applyKnockback(fromPosition, scaledForce);
        affectedCount++;
      }
    }

    if (affectedCount > 0) {
      console.log(`[CopManager] Knockback applied to ${affectedCount} cops`);
    }

    return affectedCount;
  }
}
