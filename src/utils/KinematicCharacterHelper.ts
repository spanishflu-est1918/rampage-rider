import * as RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { COLLISION_GROUPS, makeCollisionGroups } from '../constants';

/**
 * KinematicCharacterHelper
 *
 * Shared utilities for kinematic character movement with building collision.
 * Used by Player, Pedestrian, and Cop entities.
 */
export class KinematicCharacterHelper {
  // Pre-allocated vector for moveCharacter (reused to avoid GC pressure)
  private static readonly _tempPosition: THREE.Vector3 = new THREE.Vector3();
  /**
   * Create a kinematic character body with collision support
   */
  static createCharacterBody(
    world: RAPIER.World,
    position: THREE.Vector3,
    capsuleHalfHeight: number,
    capsuleRadius: number,
    collisionGroup: number,
    collisionFilter: number
  ): {
    body: RAPIER.RigidBody;
    collider: RAPIER.Collider;
    controller: RAPIER.KinematicCharacterController;
  } {
    // Create kinematic position-based body
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(position.x, position.y, position.z);
    const body = world.createRigidBody(bodyDesc);

    // Create capsule collider
    const colliderDesc = RAPIER.ColliderDesc.capsule(capsuleHalfHeight, capsuleRadius)
      .setCollisionGroups(makeCollisionGroups(collisionGroup, collisionFilter))
      .setTranslation(0, capsuleHalfHeight + capsuleRadius, 0);
    const collider = world.createCollider(colliderDesc, body);

    // Create character controller
    const controller = world.createCharacterController(0.01);
    if (!controller) {
      throw new Error('[KinematicCharacterHelper] Failed to create character controller');
    }
    controller.enableAutostep(0.5, 0.2, true); // Step over small obstacles
    controller.enableSnapToGround(0.5); // Snap to ground

    return { body, collider, controller };
  }

  /**
   * Move a kinematic character with collision detection
   * Returns the actual position after collision resolution
   */
  static moveCharacter(
    body: RAPIER.RigidBody,
    collider: RAPIER.Collider,
    controller: RAPIER.KinematicCharacterController,
    desiredMovement: { x: number; y: number; z: number },
    collisionFilter?: number
  ): THREE.Vector3 {
    // Compute collision-safe movement
    controller.computeColliderMovement(
      collider,
      desiredMovement,
      undefined, // filterFlags
      collisionFilter // filterGroups (optional)
    );

    // Get corrected movement
    const correctedMovement = controller.computedMovement();
    const currentPos = body.translation();

    // Calculate new position (reuse pre-allocated vector)
    this._tempPosition.set(
      currentPos.x + correctedMovement.x,
      currentPos.y + correctedMovement.y,
      currentPos.z + correctedMovement.z
    );

    // Apply to physics body
    body.setNextKinematicTranslation(this._tempPosition);

    return this._tempPosition;
  }

  /**
   * Get standard collision groups for different entity types
   * Re-exports COLLISION_GROUPS from constants for backwards compatibility
   */
  static getCollisionGroups() {
    return COLLISION_GROUPS;
  }

  /**
   * Get collision filter for player (collides with GROUND, BUILDING, PEDESTRIAN, COP)
   */
  static getPlayerCollisionFilter(): number {
    return COLLISION_GROUPS.GROUND | COLLISION_GROUPS.BUILDING | COLLISION_GROUPS.PEDESTRIAN | COLLISION_GROUPS.COP;
  }

  /**
   * Get collision filter for pedestrian (collides with GROUND, BUILDING, PLAYER, COP, VEHICLE)
   */
  static getPedestrianCollisionFilter(): number {
    return COLLISION_GROUPS.GROUND | COLLISION_GROUPS.BUILDING | COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.COP | COLLISION_GROUPS.VEHICLE;
  }

  /**
   * Get collision filter for cop (collides with GROUND, BUILDING, PEDESTRIAN, other COPS)
   */
  static getCopCollisionFilter(): number {
    return COLLISION_GROUPS.GROUND | COLLISION_GROUPS.BUILDING | COLLISION_GROUPS.PEDESTRIAN | COLLISION_GROUPS.COP;
  }
}
