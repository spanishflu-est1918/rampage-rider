import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { Cop } from '../entities/Cop';
import { AIManager } from '../core/AIManager';

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
  private aiManager: AIManager;

  private maxCops: number = 8;
  private spawnRadius: number = 15;
  private damageCallback: ((damage: number) => void) | null = null;

  constructor(scene: THREE.Scene, world: RAPIER.World, aiManager: AIManager) {
    this.scene = scene;
    this.world = world;
    this.aiManager = aiManager;
  }

  /**
   * Set damage callback once (called when cop deals damage)
   */
  setDamageCallback(callback: (damage: number) => void): void {
    this.damageCallback = callback;
    // Update existing cops
    for (const cop of this.cops) {
      cop.setDamageCallback(callback);
    }
  }

  /**
   * Update cop spawns based on heat level
   */
  updateSpawns(heat: number, playerPosition: THREE.Vector3): void {
    // Remove dead cops
    this.cops = this.cops.filter(cop => {
      if (cop.isDeadState() && !(cop as THREE.Group).visible) {
        this.scene.remove(cop);
        this.scene.remove(cop.getBlobShadow());
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

    const cop = new Cop(spawnPos, this.world, this.aiManager.getEntityManager());
    cop.setParentScene(this.scene); // Enable visual effects
    if (this.damageCallback) {
      cop.setDamageCallback(this.damageCallback);
    }
    this.cops.push(cop);
    this.scene.add(cop);
    this.scene.add(cop.getBlobShadow()); // Add blob shadow to scene
  }

  /**
   * Update all cops (Yuka AI updated by Engine's AIManager)
   * NOTE: Damage callback is set once via setDamageCallback(), not every frame
   */
  update(deltaTime: number, playerPosition: THREE.Vector3, wantedStars: number, playerCanBeTased: boolean): void {
    // Update all cops
    for (const cop of this.cops) {
      if (!cop.isDeadState()) {
        // Set wanted star level to determine attack behavior
        cop.setWantedStars(wantedStars);

        // Tell cop if player can be tased (affects attack choice at 1 star)
        cop.setPlayerCanBeTased(playerCanBeTased);

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

          // Always apply knockback when hit (even if not killed) - helps player escape
          const knockbackForce = 15;
          cop.applyKnockback(position, knockbackForce);

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
      this.scene.remove(cop.getBlobShadow());
      cop.dispose();
    }
    this.cops = [];
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
   * Remove all active taser beams (called when player escapes taser)
   */
  clearTaserBeams(): void {
    for (const cop of this.cops) {
      cop.removeTaserBeam();
    }
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

    return affectedCount;
  }
}
