import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { BikeCop } from '../entities/BikeCop';
import { AIManager } from '../core/AIManager';

/**
 * BikeCopManager
 *
 * Manages bike cop spawning when player is on bicycle:
 * - Spawns bike cops that chase and tase player
 * - Max 2 bike cops at once (performance)
 * - Spawns based on heat level (25%+ heat)
 */
export class BikeCopManager {
  private cops: BikeCop[] = [];
  private scene: THREE.Scene;
  private world: RAPIER.World;
  private aiManager: AIManager;

  private maxCops: number = 2;
  private spawnRadius: number = 20;
  private spawnCooldown: number = 3.0;
  private lastSpawnTime: number = 0;

  private damageCallback: ((damage: number) => void) | null = null;

  // Pre-allocated vectors
  private readonly _tempSpawnPos = new THREE.Vector3();
  private readonly _tempCopPos = new THREE.Vector3();

  constructor(scene: THREE.Scene, world: RAPIER.World, aiManager: AIManager) {
    this.scene = scene;
    this.world = world;
    this.aiManager = aiManager;
  }

  setDamageCallback(callback: (damage: number) => void): void {
    this.damageCallback = callback;
    for (const cop of this.cops) {
      cop.setDamageCallback(callback);
    }
  }

  updateSpawns(heat: number, playerPosition: THREE.Vector3, deltaTime: number): void {
    // Remove dead cops
    this.cops = this.cops.filter((cop) => {
      if (cop.isDeadState() && !(cop as THREE.Group).visible) {
        this.scene.remove(cop);
        this.scene.remove(cop.getBlobShadow());
        cop.dispose();
        return false;
      }
      return true;
    });

    // Update spawn cooldown
    this.lastSpawnTime += deltaTime;
    if (this.lastSpawnTime < this.spawnCooldown) {
      return;
    }

    // Only spawn if heat >= 25%
    if (heat < 25) return;

    // Calculate desired cop count based on heat
    let desiredCops = 0;
    if (heat >= 50) desiredCops = 2;
    else if (heat >= 25) desiredCops = 1;

    // Spawn if needed
    const activeCops = this.cops.filter((cop) => !cop.isDeadState()).length;
    if (activeCops < desiredCops && this.cops.length < this.maxCops) {
      this.spawnCop(playerPosition);
      this.lastSpawnTime = 0;
    }
  }

  private spawnCop(playerPosition: THREE.Vector3): void {
    // Spawn at random angle around player
    const angle = Math.random() * Math.PI * 2;
    const distance = this.spawnRadius + Math.random() * 10;

    this._tempSpawnPos.set(
      playerPosition.x + Math.cos(angle) * distance,
      0,
      playerPosition.z + Math.sin(angle) * distance
    );

    const cop = new BikeCop(this._tempSpawnPos, this.world, this.aiManager.getEntityManager());
    cop.setParentScene(this.scene);
    if (this.damageCallback) {
      cop.setDamageCallback(this.damageCallback);
    }

    this.cops.push(cop);
    this.scene.add(cop);
    this.scene.add(cop.getBlobShadow());
  }

  update(deltaTime: number, playerPosition: THREE.Vector3, playerCanBeTased: boolean): void {
    for (const cop of this.cops) {
      if (!cop.isDeadState()) {
        cop.setChaseTarget(playerPosition);
      }
      cop.update(deltaTime);
    }
  }

  damageInRadius(
    position: THREE.Vector3,
    radius: number,
    damage: number,
    maxKills: number = Infinity,
    direction?: THREE.Vector3,
    coneAngle: number = Math.PI / 3
  ): { kills: number; positions: THREE.Vector3[] } {
    let killCount = 0;
    const killPositions: THREE.Vector3[] = [];
    const radiusSq = radius * radius;

    for (const cop of this.cops) {
      if (cop.isDeadState()) continue;
      if (killCount >= maxKills) break;

      cop.getPositionInto(this._tempCopPos);
      const distanceSq = this._tempCopPos.distanceToSquared(position);

      if (distanceSq < radiusSq) {
        let inCone = true;

        if (direction) {
          const tempDir = new THREE.Vector3().subVectors(this._tempCopPos, position).normalize();
          const dotProduct = direction.dot(tempDir);
          const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
          inCone = angle <= coneAngle / 2;
        }

        if (inCone) {
          cop.takeDamage(damage);
          cop.applyKnockback(position, 10);

          if (cop.isDeadState()) {
            killCount++;
            killPositions.push(this._tempCopPos.clone());
          }
        }
      }
    }

    return { kills: killCount, positions: killPositions };
  }

  applyKnockbackInRadius(fromPosition: THREE.Vector3, radius: number, force: number): number {
    let affectedCount = 0;

    for (const cop of this.cops) {
      if (cop.isDeadState()) continue;

      cop.getPositionInto(this._tempCopPos);
      const distance = this._tempCopPos.distanceTo(fromPosition);

      if (distance <= radius) {
        const scaledForce = force * (1 - distance / radius);
        cop.applyKnockback(fromPosition, scaledForce);
        affectedCount++;
      }
    }

    return affectedCount;
  }

  clearTaserBeams(): void {
    for (const cop of this.cops) {
      cop.removeTaserBeam();
    }
  }

  getActiveCopCount(): number {
    return this.cops.filter((cop) => !cop.isDeadState()).length;
  }

  getCopData(): Array<{ position: THREE.Vector3; health: number; maxHealth: number }> {
    const result: Array<{ position: THREE.Vector3; health: number; maxHealth: number }> = [];

    for (const cop of this.cops) {
      if (!cop.isDeadState()) {
        result.push({
          position: cop.getPosition(),
          health: cop.getHealth(),
          maxHealth: cop.getMaxHealth(),
        });
      }
    }

    return result;
  }

  clear(): void {
    for (const cop of this.cops) {
      this.scene.remove(cop);
      this.scene.remove(cop.getBlobShadow());
      cop.dispose();
    }
    this.cops = [];
    this.lastSpawnTime = 0;
  }
}
