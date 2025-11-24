import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { preloader } from './Preloader';

/**
 * PhysicsWorld - Wrapper around Rapier physics engine
 * Handles initialization, stepping, and collision management
 */
export class PhysicsWorld {
  private world: RAPIER.World | null = null;
  private initialized = false;

  // Collision groups (bit flags)
  public readonly COLLISION_GROUPS = {
    GROUND: 0x0001,
    PLAYER: 0x0002,
    PEDESTRIAN: 0x0004,
    COP: 0x0008,
    DEBRIS: 0x0010,
    PROJECTILE: 0x0020,
    BUILDING: 0x0040,
  };

  constructor() {}

  /**
   * Initialize Rapier world (async because Rapier needs to load WASM)
   */
  async init(): Promise<void> {
    // Only init RAPIER if not already loaded by preloader
    if (!preloader.isRapierReady()) {
      await RAPIER.init();
    }

    // Create world with gravity
    this.world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });
    this.initialized = true;

    console.log('[PhysicsWorld] Initialized with gravity:', this.world.gravity);
  }

  /**
   * Step the physics simulation
   */
  step(deltaTime: number): void {
    if (!this.world || !this.initialized) return;

    // Clamp dt to prevent physics explosions
    const clampedDt = Math.min(deltaTime, 0.1);
    this.world.step();
  }

  /**
   * Create a rigid body
   */
  createRigidBody(desc: RAPIER.RigidBodyDesc): RAPIER.RigidBody {
    if (!this.world) throw new Error('PhysicsWorld not initialized');
    return this.world.createRigidBody(desc);
  }

  /**
   * Create a collider attached to a rigid body
   */
  createCollider(
    desc: RAPIER.ColliderDesc,
    body: RAPIER.RigidBody
  ): RAPIER.Collider {
    if (!this.world) throw new Error('PhysicsWorld not initialized');
    return this.world.createCollider(desc, body);
  }

  /**
   * Remove a rigid body from the world
   */
  removeRigidBody(body: RAPIER.RigidBody): void {
    if (!this.world) return;
    this.world.removeRigidBody(body);
  }

  /**
   * Get all active contact pairs (for collision detection)
   * TODO: Implement when needed for entity collision handling
   */
  // getContactPairs(): RAPIER.TempContactManifold[] {
  //   if (!this.world) return [];
  //   const pairs: RAPIER.TempContactManifold[] = [];
  //   // forEachContactPair is not available in this Rapier version
  //   // Will implement collision detection via intersection observers
  //   return pairs;
  // }

  /**
   * Raycast from origin in direction
   */
  castRay(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
    filterGroups?: number
  ): RAPIER.RayColliderHit | null {
    if (!this.world) return null;

    const ray = new RAPIER.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: direction.x, y: direction.y, z: direction.z }
    );

    const hit = this.world.castRay(ray, maxDistance, true, filterGroups);
    return hit;
  }

  /**
   * Check if world is initialized
   */
  isReady(): boolean {
    return this.initialized && this.world !== null;
  }

  /**
   * Get the underlying Rapier world (use sparingly)
   */
  getWorld(): RAPIER.World | null {
    return this.world;
  }

  /**
   * Create a kinematic character controller
   */
  createCharacterController(offset: number = 0.01): RAPIER.KinematicCharacterController | null {
    if (!this.world) return null;
    return this.world.createCharacterController(offset);
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (this.world) {
      this.world.free();
      this.world = null;
    }
    this.initialized = false;
  }
}
