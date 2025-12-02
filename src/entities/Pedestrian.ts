import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import * as YUKA from 'yuka';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { KinematicCharacterHelper } from '../utils/KinematicCharacterHelper';
import { AnimationHelper } from '../utils/AnimationHelper';
import { AssetLoader } from '../core/AssetLoader';
import { InstancedBlobShadows } from '../rendering/InstancedBlobShadows';
import {
  SKIN_TONES,
  ENTITY_SPEEDS,
  PEDESTRIAN_CONFIG,
} from '../constants';

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
  private health: number = PEDESTRIAN_CONFIG.HEALTH;
  private walkSpeed: number = ENTITY_SPEEDS.PEDESTRIAN_WALK;
  private runSpeed: number = ENTITY_SPEEDS.PEDESTRIAN_RUN;
  private isPanicking: boolean = false;
  private panicFreezeTimer: number = 0; // Brief freeze before fleeing (0.6s)
  private pendingDangerPosition: THREE.Vector3 | null = null; // For delayed flee
  private isStumbling: boolean = false;
  private stumbleTimer: number = 0;

  // Festive state (for table pedestrians)
  private isFestive: boolean = false;
  private festiveSwayTime: number = 0;
  private festiveSwaySpeed: number = 0;
  private festiveSwayAmount: number = 0;
  private santaHat: THREE.Group | null = null;
  private headBone: THREE.Bone | null = null;

  // Dead body knockback velocity (for ragdoll sliding)
  private deadVelocity: THREE.Vector3 = new THREE.Vector3();
  private timeSinceDeath: number = 0; // Track time for raycast limiting

  // Pre-allocated vectors (reused every frame to avoid GC pressure)
  private readonly _tempPosition: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempKnockback: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempCarDir: THREE.Vector3 = new THREE.Vector3();

  // Pre-allocated Rapier ray for dead body physics (avoid per-frame allocation)
  private _deadBodyRay: RAPIER.Ray | null = null;

  // Instanced shadow system
  private shadowManager: InstancedBlobShadows;
  private shadowIndex: number = -1;
  private readonly shadowRadius = 0.8;

  constructor(
    position: THREE.Vector3,
    world: RAPIER.World,
    characterType: string,
    entityManager: YUKA.EntityManager,
    shadowManager: InstancedBlobShadows
  ) {
    super();

    this.yukaEntityManager = entityManager;
    this.world = world;
    this.shadowManager = shadowManager;

    // Reserve shadow index
    this.shadowIndex = shadowManager.reserveIndex();
    if (this.shadowIndex >= 0) {
      shadowManager.updateShadow(this.shadowIndex, position.x, position.z, this.shadowRadius);
    }

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

  }

  /**
   * Load pedestrian character model with animations
   */
  private async loadModel(characterType: string): Promise<void> {
    try {
      // Use cached model from AssetLoader instead of loading fresh!
      const assetLoader = AssetLoader.getInstance();
      const cachedGltf = assetLoader.getModel(`/assets/pedestrians/${characterType}.gltf`);

      if (!cachedGltf) {
        console.error(`[Pedestrian] Model not in cache: ${characterType}`);
        return;
      }

      // Use SkeletonUtils to properly clone animated models
      const clonedScene = SkeletonUtils.clone(cachedGltf.scene);
      const gltf = {
        scene: clonedScene,
        animations: cachedGltf.animations
      };

      // Disable real shadow casting (we use blob shadows instead)
      AnimationHelper.setupShadows(gltf.scene, false, false);

      // Apply random skin tone
      const randomSkinTone = AnimationHelper.randomElement(SKIN_TONES);
      AnimationHelper.applySkinTone(gltf.scene, randomSkinTone);

      (this as THREE.Group).add(gltf.scene);

      // Find head bone for Santa hat attachment
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Bone && child.name.toLowerCase().includes('head')) {
          this.headBone = child;
        }
      });

      // Setup animation mixer
      this.mixer = new THREE.AnimationMixer(gltf.scene);
      this.animations = gltf.animations;

      // Play idle by default
      this.playAnimation('Idle', 0.3);

      this.modelLoaded = true;

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
   * Set idle behavior (standing still with optional animation)
   */
  setIdleBehavior(animation: string = 'Idle'): void {
    // Clear steering behaviors - pedestrian will stand still
    this.yukaVehicle.steering.clear();
    this.yukaVehicle.maxSpeed = 0;
    this.playAnimation(animation, 0.3);
  }

  /**
   * Set sitting behavior (for table pedestrians - sit at table)
   */
  setSitBehavior(): void {
    // Clear steering behaviors - pedestrian will sit still
    this.yukaVehicle.steering.clear();
    this.yukaVehicle.maxSpeed = 0;
    this.playAnimation('SitDown', 0.3);
  }

  /**
   * Set festive behavior for table pedestrians - sway, cheer, Santa hat
   */
  setFestiveBehavior(): void {
    this.isFestive = true;
    this.yukaVehicle.steering.clear();
    this.yukaVehicle.maxSpeed = 0;

    // Random sway parameters - forward/backward rocking
    this.festiveSwayTime = Math.random() * Math.PI * 2; // Random phase offset
    this.festiveSwaySpeed = 2.0 + Math.random() * 1.5; // 2.0-3.5 Hz
    this.festiveSwayAmount = 0.08 + Math.random() * 0.06; // More visible rocking

    // 50% chance to play Victory (cheering) animation, otherwise Idle
    if (Math.random() < 0.5) {
      this.playAnimation('Victory', 0.3);
    } else {
      this.playAnimation('Idle', 0.3);
    }

  }

  /**
   * Add a Santa hat to the pedestrian's head
   */
  private addSantaHat(): void {
    if (this.santaHat) return; // Already has hat

    this.santaHat = new THREE.Group();

    // Red cone (main hat)
    const coneGeom = new THREE.ConeGeometry(0.15, 0.35, 8);
    const redMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.8 });
    const cone = new THREE.Mesh(coneGeom, redMat);
    cone.position.y = 0.15;
    cone.rotation.x = -0.1; // Slight tilt back
    this.santaHat.add(cone);

    // White pom-pom at top
    const pomGeom = new THREE.SphereGeometry(0.06, 8, 6);
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const pom = new THREE.Mesh(pomGeom, whiteMat);
    pom.position.y = 0.35;
    this.santaHat.add(pom);

    // White brim
    const brimGeom = new THREE.TorusGeometry(0.14, 0.04, 6, 12);
    const brim = new THREE.Mesh(brimGeom, whiteMat);
    brim.rotation.x = Math.PI / 2;
    brim.position.y = 0.0;
    this.santaHat.add(brim);

    // Attach to head bone if found, otherwise attach to group
    if (this.headBone) {
      this.santaHat.position.set(0, 0.15, 0);
      this.headBone.add(this.santaHat);
    } else {
      // Fallback: attach to model at approximate head height
      this.santaHat.position.set(0, 1.7, 0);
      (this as THREE.Group).add(this.santaHat);
    }
  }

  /**
   * Update festive sway animation - forward/backward rocking
   */
  private updateFestiveSway(deltaTime: number): void {
    if (!this.isFestive || this.isDead) return;

    this.festiveSwayTime += deltaTime * this.festiveSwaySpeed;

    // Forward-backward rocking motion (more visible)
    const rockX = Math.sin(this.festiveSwayTime) * this.festiveSwayAmount;

    (this as THREE.Group).rotation.x = rockX;
  }

  /**
   * Make pedestrian panic and run away from danger
   */
  // Pre-allocated YUKA vector for flee behavior (avoids per-panic allocation)
  private _fleeTarget: YUKA.Vector3 = new YUKA.Vector3();
  private _fleeBehavior: YUKA.FleeBehavior | null = null;

  panic(dangerPosition: THREE.Vector3): void {
    if (this.isDead) return;
    // Already panicking and past freeze? Don't restart
    if (this.isPanicking && this.panicFreezeTimer <= 0) return;

    this.isPanicking = true;

    // Deer-in-headlights: freeze briefly before fleeing (gives player time to catch)
    this.panicFreezeTimer = 0.6;
    this.pendingDangerPosition = dangerPosition.clone();

    // Stop moving during freeze
    this.yukaVehicle.steering.clear();
    this.yukaVehicle.maxSpeed = 0;

    // Play startled/idle animation during freeze
    this.playAnimation('Idle', 0.1);
  }

  /**
   * Start actual flee behavior (called after freeze timer expires)
   */
  private startFleeing(): void {
    if (!this.pendingDangerPosition) return;

    this.yukaVehicle.maxSpeed = this.runSpeed;

    // Clear existing behaviors
    this.yukaVehicle.steering.clear();

    // Flee from danger (flatten to 2D to prevent vertical movement)
    this._fleeTarget.set(this.pendingDangerPosition.x, 0, this.pendingDangerPosition.z);
    if (!this._fleeBehavior) {
      this._fleeBehavior = new YUKA.FleeBehavior(this._fleeTarget);
    } else {
      this._fleeBehavior.target = this._fleeTarget;
    }
    this._fleeBehavior.panicDistance = PEDESTRIAN_CONFIG.PANIC_DISTANCE;
    this.yukaVehicle.steering.add(this._fleeBehavior);

    // Play walk animation (speed will be increased in update loop)
    this.playAnimation('Walk', 0.1);

    this.pendingDangerPosition = null;
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

  }

  /**
   * Update pedestrian (called every frame)
   */
  // Pre-calculated squared distance threshold for animation LOD (25^2 = 625)
  private static readonly ANIMATION_LOD_DISTANCE_SQ = 625;

  update(deltaTime: number, distanceToPlayerSq?: number): void {
    if (!this.modelLoaded) return;

    // Skip expensive animation updates for distant pedestrians (LOD optimization)
    // Uses squared distance to avoid sqrt in caller's hot loop
    const skipAnimation = distanceToPlayerSq !== undefined && distanceToPlayerSq > Pedestrian.ANIMATION_LOD_DISTANCE_SQ;

    // Update animation mixer (skip for distant entities)
    if (this.mixer && !skipAnimation) {
      this.mixer.update(deltaTime);
    }

    // Update festive sway animation (table pedestrians)
    if (this.isFestive && !skipAnimation) {
      this.updateFestiveSway(deltaTime);
    }

    // Dead body ragdoll physics (bounce off car, buildings, and floor)
    if (this.isDead) {
      this.timeSinceDeath += deltaTime;
      const speed = this.deadVelocity.length();
      if (speed > 0.5) {
        const currentPos = (this as THREE.Group).position;

        // Apply gravity
        this.deadVelocity.y -= 25 * deltaTime;

        // Check for building collision via raycast (horizontal)
        // Only raycast for first 2 seconds after death to limit expense
        if (this.timeSinceDeath < 2.0 && Math.abs(this.deadVelocity.x) + Math.abs(this.deadVelocity.z) > 1) {
          // Reuse pre-allocated ray to avoid per-frame allocation
          if (!this._deadBodyRay) {
            this._deadBodyRay = new RAPIER.Ray(
              { x: currentPos.x, y: 0.5, z: currentPos.z },
              { x: this.deadVelocity.x, y: 0, z: this.deadVelocity.z }
            );
          } else {
            this._deadBodyRay.origin.x = currentPos.x;
            this._deadBodyRay.origin.y = 0.5;
            this._deadBodyRay.origin.z = currentPos.z;
            this._deadBodyRay.dir.x = this.deadVelocity.x;
            this._deadBodyRay.dir.y = 0;
            this._deadBodyRay.dir.z = this.deadVelocity.z;
          }
          // Use castRayAndGetNormal to get surface normal for bounce calculation
          const hit = this.world.castRayAndGetNormal(this._deadBodyRay, 1.0, true);

          if (hit && hit.timeOfImpact < 0.5) {
            // Hit building! Bounce off using reflection formula
            const normal = hit.normal;
            const dot = this.deadVelocity.x * normal.x + this.deadVelocity.z * normal.z;
            this.deadVelocity.x -= 2 * dot * normal.x;
            this.deadVelocity.z -= 2 * dot * normal.z;
            // Lose energy and add some vertical bounce
            this.deadVelocity.x *= 0.5;
            this.deadVelocity.z *= 0.5;
            this.deadVelocity.y = Math.abs(this.deadVelocity.y) * 0.3 + 3;
          }
        }

        // Apply velocity to position
        currentPos.x += this.deadVelocity.x * deltaTime;
        currentPos.y += this.deadVelocity.y * deltaTime;
        currentPos.z += this.deadVelocity.z * deltaTime;

        // Floor bounce
        if (currentPos.y <= 0) {
          currentPos.y = 0;
          // Bounce up with energy loss
          this.deadVelocity.y = Math.abs(this.deadVelocity.y) * 0.4;
          // Friction on ground contact
          this.deadVelocity.x *= 0.7;
          this.deadVelocity.z *= 0.7;
        }

        // Air friction (less than ground)
        this.deadVelocity.x *= 0.98;
        this.deadVelocity.z *= 0.98;

        // Sync physics body
        this.rigidBody.setNextKinematicTranslation({ x: currentPos.x, y: currentPos.y + 0.5, z: currentPos.z });

        // Update instanced shadow (stays on ground even when body is airborne)
        if (this.shadowIndex >= 0) {
          this.shadowManager.updateShadow(this.shadowIndex, currentPos.x, currentPos.z, this.shadowRadius);
        }
      }
      return;
    }

    // Update stumble timer
    if (this.isStumbling) {
      this.stumbleTimer -= deltaTime;
      if (this.stumbleTimer <= 0) {
        this.isStumbling = false;
      }
    }

    // Update panic freeze timer (deer-in-headlights before fleeing)
    if (this.panicFreezeTimer > 0) {
      this.panicFreezeTimer -= deltaTime;
      if (this.panicFreezeTimer <= 0) {
        this.startFleeing();
      }
    }

    // Get desired movement from Yuka AI
    const yukaPos = this.yukaVehicle.position;
    const currentPos = this.rigidBody.translation();

    // Calculate desired movement vector
    const desiredMovement = {
      x: yukaPos.x - currentPos.x,
      y: 0,
      z: yukaPos.z - currentPos.z
    };

    // Use character controller for collision-aware movement
    // This prevents pedestrians from walking through vehicles
    const collisionFilter = KinematicCharacterHelper.getPedestrianCollisionFilter();
    this.characterController.computeColliderMovement(
      this.collider,
      desiredMovement,
      undefined, // filterFlags
      collisionFilter
    );

    // Get collision-corrected movement
    const correctedMovement = this.characterController.computedMovement();

    // Apply corrected position to physics body
    this._tempPosition.set(
      currentPos.x + correctedMovement.x,
      currentPos.y + correctedMovement.y,
      currentPos.z + correctedMovement.z
    );
    this.rigidBody.setNextKinematicTranslation(this._tempPosition);

    // Sync Yuka position back to match physics (so AI knows where it actually is)
    this.yukaVehicle.position.x = this._tempPosition.x;
    this.yukaVehicle.position.z = this._tempPosition.z;

    // Sync Three.js visual position
    (this as THREE.Group).position.set(this._tempPosition.x, 0, this._tempPosition.z);

    // Update instanced shadow position (stays on ground)
    if (this.shadowIndex >= 0) {
      this.shadowManager.updateShadow(this.shadowIndex, this._tempPosition.x, this._tempPosition.z, this.shadowRadius);
    }

    // Sync rotation (Yuka handles orientation)
    if (this.yukaVehicle.velocity.length() > 0.1) {
      const angle = Math.atan2(this.yukaVehicle.velocity.x, this.yukaVehicle.velocity.z);
      (this as THREE.Group).rotation.y = angle;
    }

    // Update animation based on movement (but don't override stumble or death)
    if (!this.isStumbling) {
      const speed = this.yukaVehicle.velocity.length();
      if (speed > 0.5) {
        // Use Walk animation for both states, but speed up when panicking
        if (this.currentAnimation !== 'Walk') {
          this.playAnimation('Walk', 0.1);
        }
        // Speed up animation when panicking to simulate running
        if (this.mixer) {
          this.mixer.timeScale = this.isPanicking ? 2.5 : 1.0;
        }
      } else {
        if (this.currentAnimation !== 'Idle') {
          this.playAnimation('Idle', 0.2);
        }
        // Reset animation speed when idle
        if (this.mixer) {
          this.mixer.timeScale = 1.0;
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
   * Check if pedestrian is panicking (running away)
   */
  isPanickingState(): boolean {
    return this.isPanicking;
  }

  /**
   * Get shadow index (for debugging)
   */
  getShadowIndex(): number {
    return this.shadowIndex;
  }

  /**
   * Apply knockback/stumble effect when colliding with player
   */
  applyKnockback(direction: THREE.Vector3, force: number): void {
    if (this.isDead || this.isStumbling) return;

    // Apply impulse to Yuka vehicle to make them stumble
    // Reuse pre-allocated vector instead of clone()
    this._tempKnockback.copy(direction).normalize().multiplyScalar(force);
    this.yukaVehicle.velocity.x += this._tempKnockback.x;
    this.yukaVehicle.velocity.z += this._tempKnockback.z;

    // Set stumbling state and play RecieveHit animation
    this.isStumbling = true;
    this.stumbleTimer = PEDESTRIAN_CONFIG.STUMBLE_DURATION;
    this.playAnimation('RecieveHit', 0.1);
  }

  /**
   * Apply violent knockback from vehicle hit - launches them far ("salir despedido")
   */
  applyVehicleKnockback(carPosition: THREE.Vector3, carVelocity: THREE.Vector3): void {
    // Direction away from car - reuse pre-allocated vector
    this._tempKnockback
      .subVectors((this as THREE.Group).position, carPosition)
      .setY(0)
      .normalize();

    // Add car's velocity direction for realistic physics - bodies fly in direction car was going
    const carSpeed = carVelocity.length();
    // Normalize car velocity into temp vector, then combine
    if (carSpeed > 0.1) {
      this._tempCarDir.copy(carVelocity).normalize().multiplyScalar(1.5);
      this._tempKnockback.add(this._tempCarDir).normalize();
    }

    // Strong knockback force based on car speed
    const horizontalForce = 10 + carSpeed * 1.5 + Math.random() * 5;
    // Launch them UP into the air!
    const verticalForce = 8 + carSpeed * 0.5 + Math.random() * 4;

    // For dead bodies, use deadVelocity (processed in update loop)
    if (this.isDead) {
      this.deadVelocity.set(
        this._tempKnockback.x * horizontalForce,
        verticalForce,
        this._tempKnockback.z * horizontalForce
      );
    } else {
      // For alive pedestrians, use Yuka velocity (no vertical)
      this.yukaVehicle.velocity.set(
        this._tempKnockback.x * horizontalForce,
        0,
        this._tempKnockback.z * horizontalForce
      );
    }
  }

  /**
   * Reset pedestrian for object pooling
   */
  reset(position: THREE.Vector3, characterType: string): void {
    // Revive
    this.isDead = false;
    this.health = PEDESTRIAN_CONFIG.HEALTH;
    this.isPanicking = false;
    this.panicFreezeTimer = 0;
    this.pendingDangerPosition = null;
    this.isStumbling = false;
    this.stumbleTimer = 0;
    this.deadVelocity.set(0, 0, 0);

    // TODO: Handle character type change (requires async model loading)
    // For now, we assume character type remains the same on reset

    // Reset Yuka vehicle
    this.yukaVehicle.position.copy(position);
    this.yukaVehicle.velocity.set(0, 0, 0);
    this.yukaVehicle.maxSpeed = this.walkSpeed;
    this.yukaVehicle.steering.clear();
    this.yukaEntityManager.add(this.yukaVehicle); // Re-register with entity manager

    // Reset physics body
    this.rigidBody.setTranslation({ x: position.x, y: 0, z: position.z }, true);
    this.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    const numColliders = this.rigidBody.numColliders();
    for (let i = 0; i < numColliders; i++) {
      const collider = this.rigidBody.collider(i);
      const collisionFilter = KinematicCharacterHelper.getPedestrianCollisionFilter();
      collider.setCollisionGroups(collisionFilter);
    }

    // Reset instanced shadow position
    if (this.shadowIndex >= 0) {
      this.shadowManager.updateShadow(this.shadowIndex, position.x, position.z, this.shadowRadius);
    }

    // Reset animation
    this.playAnimation('Idle', 0.1);
  }

  /**
   * Cleanup
   */
  destroy(world: RAPIER.World): void {
    // Release shadow index back to pool
    if (this.shadowIndex >= 0) {
      this.shadowManager.releaseIndex(this.shadowIndex);
      this.shadowIndex = -1;
    }

    // Remove from Yuka
    this.yukaEntityManager.remove(this.yukaVehicle);

    // Stop and dispose animation mixer FIRST (before physics)
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mixer.getRoot());
    }

    // Remove Rapier body
    world.removeRigidBody(this.rigidBody);

    // Dispose cloned materials (SkeletonUtils.clone DOES clone materials)
    // But DON'T dispose geometries - those ARE shared by reference
    (this as THREE.Group).traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Dispose materials (cloned per instance)
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat.dispose());
        } else if (child.material) {
          child.material.dispose();
        }
        // DON'T dispose geometry - shared across all clones
      }
    });

    // Remove from scene
    (this as THREE.Group).parent?.remove(this);
  }
}
