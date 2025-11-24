import * as RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

/**
 * KinematicCharacterHelper
 *
 * Shared utilities for kinematic character movement with building collision.
 * Used by Player, Pedestrian, and Cop entities.
 */
export class KinematicCharacterHelper {
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
    // Format: (filter << 16) | membership
    const collisionGroups = (collisionFilter << 16) | collisionGroup;
    const colliderDesc = RAPIER.ColliderDesc.capsule(capsuleHalfHeight, capsuleRadius)
      .setCollisionGroups(collisionGroups)
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

    // Calculate new position
    const newPosition = new THREE.Vector3(
      currentPos.x + correctedMovement.x,
      currentPos.y + correctedMovement.y,
      currentPos.z + correctedMovement.z
    );

    // Apply to physics body
    body.setNextKinematicTranslation(newPosition);

    return newPosition;
  }

  /**
   * Get standard collision groups for different entity types
   */
  static getCollisionGroups() {
    return {
      GROUND: 0x0001,
      PLAYER: 0x0002,
      PEDESTRIAN: 0x0004,
      COP: 0x0008,
      DEBRIS: 0x0010,
      PROJECTILE: 0x0020,
      BUILDING: 0x0040,
    };
  }

  /**
   * Get collision filter for player (collides with GROUND, BUILDING, PEDESTRIAN, COP)
   */
  static getPlayerCollisionFilter(): number {
    const groups = this.getCollisionGroups();
    return groups.GROUND | groups.BUILDING | groups.PEDESTRIAN | groups.COP;
  }

  /**
   * Get collision filter for pedestrian (collides with GROUND, BUILDING, PLAYER, COP)
   */
  static getPedestrianCollisionFilter(): number {
    const groups = this.getCollisionGroups();
    return groups.GROUND | groups.BUILDING | groups.PLAYER | groups.COP;
  }

  /**
   * Get collision filter for cop (collides with GROUND, BUILDING, PEDESTRIAN, other COPS)
   */
  static getCopCollisionFilter(): number {
    const groups = this.getCollisionGroups();
    return groups.GROUND | groups.BUILDING | groups.PEDESTRIAN | groups.COP;
  }
}
