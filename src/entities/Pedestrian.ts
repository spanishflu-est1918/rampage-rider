import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as YUKA from 'yuka';
import { KinematicCharacterHelper } from '../utils/KinematicCharacterHelper';

/**
 * Pedestrian Entity
 *
 * Represents a civilian NPC that:
 * - Wanders using Yuka flocking behavior
 * - Has walk, run, and death animations
 * - Can be killed by player attacks
 * - Uses Rapier physics for collision
 */
export class Pedestrian extends THREE.Group {
  private rigidBody: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private characterController: RAPIER.KinematicCharacterController;
  private world: RAPIER.World;
  private mixer: THREE.AnimationMixer | null = null;
  private animations: THREE.AnimationClip[] = [];
  private currentAnimation: string = 'Idle';
  private modelLoaded: boolean = false;

  // Yuka AI
  private yukaVehicle: YUKA.Vehicle;
  private yukaEntityManager: YUKA.EntityManager;

  // State
  private isDead: boolean = false;
  private health: number = 1; // One-shot kill
  private walkSpeed: number = 1.5; // Normal walk speed
  private runSpeed: number = 6.0; // Panic run speed (1.5x faster)
  private isPanicking: boolean = false;
  private isStumbling: boolean = false;
  private stumbleTimer: number = 0;

  constructor(
    position: THREE.Vector3,
    world: RAPIER.World,
    characterType: string,
    entityManager: YUKA.EntityManager
  ) {
    super();

    this.yukaEntityManager = entityManager;
    this.world = world;

    // Create Yuka vehicle for AI steering
    this.yukaVehicle = new YUKA.Vehicle();
    this.yukaVehicle.position.copy(position);
    this.yukaVehicle.maxSpeed = this.walkSpeed;
    this.yukaVehicle.maxForce = 2.0; // Increase turning force
    this.yukaVehicle.updateOrientation = false; // We'll handle rotation manually

    // Add to Yuka entity manager
    this.yukaEntityManager.add(this.yukaVehicle);

    // Create kinematic character with building collision using shared helper
    const groups = KinematicCharacterHelper.getCollisionGroups();
    const collisionFilter = KinematicCharacterHelper.getPedestrianCollisionFilter();

    const { body, collider, controller } = KinematicCharacterHelper.createCharacterBody(
      world,
      position,
      0.3, // capsule half height
      0.3, // capsule radius
      groups.PEDESTRIAN, // collision group membership
      collisionFilter // what this pedestrian collides with
    );

    this.rigidBody = body;
    this.collider = collider;
    this.characterController = controller;

    // Load character model
    this.loadModel(characterType);

    console.log(`[Pedestrian] Created ${characterType} at`, position);
  }

  /**
   * Load pedestrian character model with animations
   */
  private async loadModel(characterType: string): Promise<void> {
    const loader = new GLTFLoader();

    try {
      const gltf = await loader.loadAsync(`/assets/pedestrians/${characterType}.gltf`);

      // European skin tone range (lighter to darker)
      const skinTones = [
        0xF5D0B8, // Very light peachy
        0xE8B196, // Light peachy tan
        0xDDA886, // Medium peachy
        0xD5A27A, // Light tan
        0xCCA070, // Medium tan
      ];

      // Pick random skin tone for this pedestrian
      const randomSkinTone = skinTones[Math.floor(Math.random() * skinTones.length)];

      // Setup shadows and fix skin material
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          // Fix black skin material with realistic skin tone
          if (child.material && (child.material as THREE.Material).name?.startsWith('Skin')) {
            const mat = child.material as THREE.MeshStandardMaterial;
            mat.color.setHex(randomSkinTone);
          }
        }
      });

      (this as THREE.Group).add(gltf.scene);

      // Setup animation mixer
      this.mixer = new THREE.AnimationMixer(gltf.scene);
      this.animations = gltf.animations;

      // Play idle by default
      this.playAnimation('Idle', 0.3);

      this.modelLoaded = true;

      console.log(`[Pedestrian] Loaded ${characterType} with`, this.animations.length, 'animations');
    } catch (error) {
      console.error(`[Pedestrian] Failed to load ${characterType}:`, error);
    }
  }

  /**
   * Play animation by name
   */
  private playAnimation(name: string, fadeTime: number = 0.2): void {
    if (!this.mixer || this.currentAnimation === name) return;

    const clip = THREE.AnimationClip.findByName(this.animations, name);
    if (!clip) {
      console.warn(`[Pedestrian] Animation '${name}' not found`);
      return;
    }

    const action = this.mixer.clipAction(clip);

    // Death animation plays once and stays
    if (name === 'Death') {
      this.mixer.stopAllAction();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.reset().fadeIn(fadeTime).play();
    } else {
      // Other animations loop normally
      this.mixer.stopAllAction();
      action.reset().fadeIn(fadeTime).play();
    }

    this.currentAnimation = name;
  }

  /**
   * Set wander behavior
   */
  setWanderBehavior(): void {
    const wanderBehavior = new YUKA.WanderBehavior();
    wanderBehavior.radius = 2; // Smaller radius for less circular movement
    wanderBehavior.distance = 5; // Distance ahead to project wander circle
    wanderBehavior.jitter = 1; // Random displacement
    wanderBehavior.weight = 0.8;

    this.yukaVehicle.steering.add(wanderBehavior);
  }

  /**
   * Make pedestrian panic and run away from danger
   */
  panic(dangerPosition: THREE.Vector3): void {
    if (this.isDead) return;

    this.isPanicking = true;
    this.yukaVehicle.maxSpeed = this.runSpeed;

    // Clear existing behaviors
    this.yukaVehicle.steering.clear();

    // Flee from danger (flatten to 2D to prevent vertical movement)
    const flatDangerPosition = new YUKA.Vector3(dangerPosition.x, 0, dangerPosition.z);
    const fleeBehavior = new YUKA.FleeBehavior(flatDangerPosition);
    fleeBehavior.panicDistance = 15;
    this.yukaVehicle.steering.add(fleeBehavior);

    // Play run animation
    this.playAnimation('Run', 0.1);
  }

  /**
   * Take damage
   */
  takeDamage(amount: number): void {
    if (this.isDead) return;

    this.health -= amount;

    if (this.health <= 0) {
      this.die();
    }
  }

  /**
   * Die and play death animation
   */
  private die(): void {
    this.isDead = true;
    this.yukaVehicle.maxSpeed = 0;
    this.yukaVehicle.steering.clear();

    // Disable physics collider so dead bodies don't block player movement
    const numColliders = this.rigidBody.numColliders();
    for (let i = 0; i < numColliders; i++) {
      const collider = this.rigidBody.collider(i);
      // Set collision groups to 0 to disable all collisions
      collider.setCollisionGroups(0);
    }

    // Play death animation
    this.playAnimation('Death', 0.1);

    console.log('[Pedestrian] Died');
  }

  /**
   * Update pedestrian (called every frame)
   */
  update(deltaTime: number): void {
    if (!this.modelLoaded) return;

    // Update animation mixer
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }

    if (this.isDead) return;

    // Update stumble timer
    if (this.isStumbling) {
      this.stumbleTimer -= deltaTime;
      if (this.stumbleTimer <= 0) {
        this.isStumbling = false;
      }
    }

    // Get current position from physics body
    const currentPos = this.rigidBody.translation();

    // Calculate desired movement from Yuka AI
    const desiredX = this.yukaVehicle.position.x;
    const desiredZ = this.yukaVehicle.position.z;
    const deltaX = desiredX - currentPos.x;
    const deltaZ = desiredZ - currentPos.z;

    // Use character controller to move with collision detection
    const desiredMovement = { x: deltaX, y: 0, z: deltaZ };
    const newPosition = KinematicCharacterHelper.moveCharacter(
      this.rigidBody,
      this.collider,
      this.characterController,
      desiredMovement
    );

    // Sync Three.js position
    (this as THREE.Group).position.copy(newPosition);

    // Update Yuka position to match actual collision-corrected position (feedback to AI)
    this.yukaVehicle.position.set(newPosition.x, 0, newPosition.z);

    // Sync rotation (Yuka handles orientation)
    if (this.yukaVehicle.velocity.length() > 0.1) {
      const angle = Math.atan2(this.yukaVehicle.velocity.x, this.yukaVehicle.velocity.z);
      (this as THREE.Group).rotation.y = angle;
    }

    // Update animation based on movement (but don't override stumble or death)
    if (!this.isStumbling) {
      const speed = this.yukaVehicle.velocity.length();
      if (speed > 0.5) {
        if (this.isPanicking) {
          if (this.currentAnimation !== 'Run') {
            this.playAnimation('Run', 0.1);
          }
        } else {
          if (this.currentAnimation !== 'Walk') {
            this.playAnimation('Walk', 0.1);
          }
        }
      } else {
        if (this.currentAnimation !== 'Idle') {
          this.playAnimation('Idle', 0.2);
        }
      }
    }
  }

  /**
   * Get Yuka vehicle (for flocking behavior)
   */
  getYukaVehicle(): YUKA.Vehicle {
    return this.yukaVehicle;
  }

  /**
   * Check if pedestrian is dead
   */
  isDeadState(): boolean {
    return this.isDead;
  }

  /**
   * Apply knockback/stumble effect when colliding with player
   */
  applyKnockback(direction: THREE.Vector3, force: number): void {
    if (this.isDead || this.isStumbling) return;

    // Apply impulse to Yuka vehicle to make them stumble
    const knockbackVelocity = direction.clone().normalize().multiplyScalar(force);
    this.yukaVehicle.velocity.add(knockbackVelocity);

    // Set stumbling state and play RecieveHit animation
    this.isStumbling = true;
    this.stumbleTimer = 0.8; // Stumble for 0.8 seconds
    this.playAnimation('RecieveHit', 0.1);
  }

  /**
   * Cleanup
   */
  destroy(world: RAPIER.World): void {
    // Remove from Yuka
    this.yukaEntityManager.remove(this.yukaVehicle);

    // Remove Rapier body
    world.removeRigidBody(this.rigidBody);

    // Remove from scene
    (this as THREE.Group).parent?.remove(this);

    console.log('[Pedestrian] Destroyed');
  }
}
