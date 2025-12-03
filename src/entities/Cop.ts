import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import * as YUKA from 'yuka';
import { KinematicCharacterHelper } from '../utils/KinematicCharacterHelper';
import { AnimationHelper } from '../utils/AnimationHelper';
import { AssetLoader } from '../core/AssetLoader';
import { BlobShadow, createBlobShadow } from '../rendering/BlobShadow';
import {
  SKIN_TONES,
  ENTITY_SPEEDS,
  ATTACK_CONFIG,
  HIT_STUN,
  COP_CONFIG,
} from '../constants';

/**
 * Cop Entity
 *
 * Police officer that:
 * - Chases player using Yuka seek behavior
 * - Slightly faster than player walk speed
 * - Deals contact damage
 * - Can be killed by player attacks
 */
export class Cop extends THREE.Group {
  // Shared geometry/material for bullets (one instance for all cops)
  private static sharedBulletGeometry: THREE.SphereGeometry | null = null;
  private static sharedBulletMaterial: THREE.MeshBasicMaterial | null = null;

  private rigidBody: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  // Note: characterController removed - using simple position sync instead for performance
  private world: RAPIER.World;
  private mixer: THREE.AnimationMixer | null = null;
  private animationClips: THREE.AnimationClip[] = [];
  private currentAnimation: string = 'Idle';
  private modelLoaded: boolean = false;

  // Yuka AI (only seek behavior - separation/obstacle avoidance disabled for performance)
  private yukaVehicle: YUKA.Vehicle;
  private yukaEntityManager: YUKA.EntityManager;
  private seekBehavior: YUKA.SeekBehavior;

  // State
  private isDead: boolean = false;
  private health: number = COP_CONFIG.HEALTH;
  private chaseSpeed: number = ENTITY_SPEEDS.COP_CHASE;
  private lastTarget: THREE.Vector3 | null = null;
  private isHitStunned: boolean = false;
  private hitStunTimer: number = 0;

  // Ragdoll knockback state (for taser escape explosion)
  private isRagdolling: boolean = false;
  private ragdollVelocity: THREE.Vector3 = new THREE.Vector3();
  private ragdollTimer: number = 0;

  // Attack state
  private currentWantedStars: number = 0; // 0=punch, 1=taser, 2+=shoot
  private playerCanBeTased: boolean = true;
  private attackCooldown: number = 0;
  private isCurrentlyAttacking: boolean = false;
  private onDealDamage?: (damage: number) => void;

  // Attack visual effects
  private taserBeam: THREE.Line | null = null;
  private taserBeamActive: boolean = false;
  private taserBeamPositions: Float32Array | null = null; // Reusable buffer
  private taserBeamUpdateCounter: number = 0; // Update every N frames for performance
  private bulletProjectile: THREE.Mesh | null = null;
  private bulletTarget: THREE.Vector3 | null = null;
  private bulletSpeed: number = 40; // units per second
  private parentScene: THREE.Scene | null = null;

  // Fake blob shadow (cheaper than real shadows)
  private blobShadow: BlobShadow;

  // Pre-allocated vectors (reused every frame to avoid GC pressure)
  private readonly _tempPosition: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempDirection: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempMidPoint: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempTargetWithHeight: THREE.Vector3 = new THREE.Vector3();

  constructor(
    position: THREE.Vector3,
    world: RAPIER.World,
    entityManager: YUKA.EntityManager
  ) {
    super();

    this.yukaEntityManager = entityManager;
    this.world = world;

    // Create Yuka vehicle for AI steering
    this.yukaVehicle = new YUKA.Vehicle();
    this.yukaVehicle.position.copy(position);
    this.yukaVehicle.maxSpeed = this.chaseSpeed;
    this.yukaVehicle.maxForce = COP_CONFIG.MAX_FORCE;
    this.yukaVehicle.updateOrientation = false; // We handle rotation manually

    // Create steering behaviors ONCE (reused every frame)
    // PERFORMANCE: Only use seek behavior - separation and obstacle avoidance are O(n²) expensive
    this.seekBehavior = new YUKA.SeekBehavior(new YUKA.Vector3(position.x, 0, position.z));
    this.seekBehavior.weight = 1.0;
    this.yukaVehicle.steering.add(this.seekBehavior);

    // DISABLED for performance - these iterate through all entities every frame
    // this.separationBehavior = new YUKA.SeparationBehavior();
    // this.separationBehavior.weight = 0.8;
    // this.yukaVehicle.steering.add(this.separationBehavior);

    // this.obstacleBehavior = new YUKA.ObstacleAvoidanceBehavior();
    // this.obstacleBehavior.weight = 0.5;
    // this.yukaVehicle.steering.add(this.obstacleBehavior);

    // Add to Yuka entity manager
    this.yukaEntityManager.add(this.yukaVehicle);

    // Create kinematic character with building collision using shared helper
    const groups = KinematicCharacterHelper.getCollisionGroups();
    const collisionFilter = KinematicCharacterHelper.getCopCollisionFilter();

    // Create character body (controller not used - simple position sync instead)
    const { body, collider } = KinematicCharacterHelper.createCharacterBody(
      world,
      position,
      0.3, // capsule half height
      0.3, // capsule radius
      groups.COP, // collision group membership
      collisionFilter // what this cop collides with (GROUND, BUILDING, PEDESTRIAN, other COPS)
    );

    this.rigidBody = body;
    this.collider = collider;

    // Create blob shadow (fake shadow for performance)
    this.blobShadow = createBlobShadow(0.9);
    this.blobShadow.position.set(position.x, 0.01, position.z);

    // Load police character model
    this.loadModel();

  }

  /**
   * Load cop character model from pre-cloned pool (instant, no runtime cloning)
   */
  private async loadModel(): Promise<void> {
    // 80% male, 20% female distribution
    const isFemale = Math.random() < 0.2;
    const maleTypes = ['BlueSoldier_Male', 'Soldier_Male'];
    const femaleTypes = ['BlueSoldier_Female', 'Soldier_Female'];

    const copTypes = isFemale ? femaleTypes : maleTypes;
    const randomCop = AnimationHelper.randomElement(copTypes);

    try {
      // Use pre-cloned model from pool (cloned during preload, instant at runtime!)
      const assetLoader = AssetLoader.getInstance();
      const precloned = assetLoader.getPreClonedCopRider(randomCop);

      if (!precloned) {
        console.error(`[Cop] Model not available: ${randomCop}`);
        this.createFallbackMesh();
        return;
      }

      const clonedScene = precloned.scene;

      // Disable real shadow casting (we use blob shadows instead)
      AnimationHelper.setupShadows(clonedScene, false, false);

      // Apply random skin tone
      const randomSkinTone = AnimationHelper.randomElement(SKIN_TONES);
      AnimationHelper.applySkinTone(clonedScene, randomSkinTone);

      // Apply cop uniform colors
      AnimationHelper.applyMaterialColor(clonedScene, ['Main'], COP_CONFIG.UNIFORM_COLOR);
      AnimationHelper.applyMaterialColor(clonedScene, ['Helmet', 'Black', 'Grey'], COP_CONFIG.GEAR_COLOR);

      (this as THREE.Group).add(clonedScene);

      // Setup animations
      this.mixer = new THREE.AnimationMixer(clonedScene);
      this.mixer.timeScale = 1.5;
      this.animationClips = precloned.animations;

      this.playAnimation('Run', 0.3);
      this.modelLoaded = true;

    } catch (error) {
      console.error('[Cop] Failed to load model:', error);
      this.createFallbackMesh();
    }
  }

  /**
   * Create fallback capsule mesh when model loading fails
   */
  private createFallbackMesh(): void {
    const geometry = new THREE.CapsuleGeometry(0.3, 0.6, 8, 16);
    const material = new THREE.MeshPhongMaterial({ color: 0x0044cc });
    const fallbackMesh = new THREE.Mesh(geometry, material);
    fallbackMesh.castShadow = false; // Use blob shadow instead
    fallbackMesh.position.y = 0.6;
    (this as THREE.Group).add(fallbackMesh);
    this.modelLoaded = true;
  }

  /**
   * Play animation by name
   */
  private playAnimation(clipName: string, fadeIn: number): void {
    if (!this.mixer || this.animationClips.length === 0) return;

    const clip = THREE.AnimationClip.findByName(this.animationClips, clipName);
    if (!clip) {
      console.warn(`[Cop] Animation '${clipName}' not found`);
      return;
    }

    this.mixer.stopAllAction();
    const action = this.mixer.clipAction(clip);
    action.fadeIn(fadeIn);
    action.play();

    this.currentAnimation = clipName;
  }

  /**
   * Update current wanted star level to determine attack type
   */
  setWantedStars(stars: number): void {
    this.currentWantedStars = stars;
  }

  /**
   * Set whether player can be tased (affects attack choice at 1 star)
   */
  setPlayerCanBeTased(canBeTased: boolean): void {
    this.playerCanBeTased = canBeTased;
  }

  /**
   * Set damage callback (called when cop deals damage)
   */
  setDamageCallback(callback: (damage: number) => void): void {
    this.onDealDamage = callback;
  }

  /**
   * Get attack parameters based on current wanted star level
   */
  private getAttackParams(): { range: number; animation: string; damage: number; cooldown: number } {
    if (this.currentWantedStars >= 2) {
      // 2+ stars: Shoot at range
      return ATTACK_CONFIG.SHOOT;
    } else if (this.currentWantedStars === 1 && this.playerCanBeTased) {
      // 1 star: Taser at medium-close range (only if player can be tased)
      return ATTACK_CONFIG.TASER;
    } else {
      // 0 stars OR 1 star but player can't be tased: Punch at very close range
      return ATTACK_CONFIG.PUNCH;
    }
  }

  /**
   * Set chase target (player position)
   * NOTE: Behaviors are created once in constructor - only update target here
   */
  setChaseTarget(target: THREE.Vector3): void {
    if (this.isDead) return;

    // Store target for rotation calculation
    this.lastTarget = target;

    // Just update the seek target - behaviors are created once in constructor
    this.seekBehavior.target.set(target.x, 0, target.z);
  }

  /**
   * Take damage
   */
  takeDamage(amount: number): void {
    if (this.isDead) return;

    this.health -= amount;

    // Trigger hit stun reaction
    this.isHitStunned = true;
    this.hitStunTimer = HIT_STUN.COP;

    // Visual hit reaction: flash white
    AnimationHelper.flashWhite(this as THREE.Group);

    // Try to play a hit animation if available
    if (this.mixer && this.animationClips.length > 0) {
      const hitAnimNames = ['RecieveHit', 'HitReact', 'Hit_Reaction', 'GetHit', 'TakeDamage', 'Damage'];
      const hitAnim = AnimationHelper.findAnimationByNames(this.animationClips, hitAnimNames);

      if (hitAnim) {
        const action = this.mixer.clipAction(hitAnim);
        action.setLoop(THREE.LoopOnce, 1);
        action.reset();
        action.play();
      }
    }

    if (this.health <= 0) {
      this.die();
    }
  }

  /**
   * Die
   */
  private die(): void {
    this.isDead = true;
    this.yukaVehicle.maxSpeed = 0;
    this.yukaVehicle.steering.clear();

    if (this.mixer && this.animationClips.length > 0) {
      this.playAnimation('Death', 0.1);
    }

    // Fade out and remove after delay
    setTimeout(() => {
      (this as THREE.Group).visible = false;
    }, 2000);
  }

  // Pre-calculated squared distance threshold for animation LOD (15^2 = 225)
  // Reduced from 25 for better performance - cops beyond 15 units don't animate
  private static readonly ANIMATION_LOD_DISTANCE_SQ = 225;

  /**
   * Update cop AI and animation
   */
  update(deltaTime: number, distanceToPlayerSq?: number): void {
    if (!this.modelLoaded) return;

    // Skip expensive animation updates for distant cops (LOD optimization)
    // Uses squared distance to avoid sqrt in caller's hot loop
    const skipAnimation = distanceToPlayerSq !== undefined && distanceToPlayerSq > Cop.ANIMATION_LOD_DISTANCE_SQ;

    // Update animation mixer (skip for distant entities)
    if (this.mixer && !skipAnimation) {
      this.mixer.update(deltaTime);
    }

    if (this.isDead) return;

    // Ragdoll physics (bouncing knockback from taser escape explosion)
    if (this.isRagdolling) {
      this.ragdollTimer -= deltaTime;

      // Apply gravity
      this.ragdollVelocity.y -= 25 * deltaTime;

      // Get current position
      const currentPos = this.rigidBody.translation();
      const newX = currentPos.x + this.ragdollVelocity.x * deltaTime;
      let newY = currentPos.y + this.ragdollVelocity.y * deltaTime;
      const newZ = currentPos.z + this.ragdollVelocity.z * deltaTime;

      // Floor bounce
      if (newY <= 0) {
        newY = 0;
        this.ragdollVelocity.y = Math.abs(this.ragdollVelocity.y) * 0.4; // Bounce
        this.ragdollVelocity.x *= 0.7; // Friction
        this.ragdollVelocity.z *= 0.7;
      }

      // Update position directly (bypass Yuka)
      this.rigidBody.setNextKinematicTranslation({ x: newX, y: newY, z: newZ });
      (this as THREE.Group).position.set(newX, newY, newZ);
      this.blobShadow.position.set(newX, 0.01, newZ);

      // Sync Yuka position
      this.yukaVehicle.position.set(newX, newY, newZ);

      // End ragdoll when timer expires or velocity is low
      const speed = this.ragdollVelocity.length();
      if (this.ragdollTimer <= 0 || (speed < 1 && newY <= 0.1)) {
        this.isRagdolling = false;
        this.ragdollVelocity.set(0, 0, 0);
      }

      return; // Skip normal AI while ragdolling
    }

    // Update hit stun timer
    if (this.hitStunTimer > 0) {
      this.hitStunTimer -= deltaTime;
      if (this.hitStunTimer <= 0) {
        this.isHitStunned = false;
      }
    }

    // Don't move or attack while hit stunned
    if (this.isHitStunned) {
      // Freeze in place - stop Yuka velocity
      this.yukaVehicle.velocity.set(0, 0, 0);
      return;
    }

    // Update attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }

    // Get current position (reuse pre-allocated vector)
    const currentPos = this.rigidBody.translation();
    this._tempPosition.set(currentPos.x, currentPos.y, currentPos.z);

    // Check distance to target for attack logic
    let distanceToTarget = Infinity;
    if (this.lastTarget) {
      distanceToTarget = this._tempPosition.distanceTo(this.lastTarget);
    }

    // Get attack parameters based on current heat level
    const attackParams = this.getAttackParams();

    // Update bullet projectile movement
    this.updateBulletProjectile(deltaTime);

    // Update taser beam every 3 frames for performance (60fps → 20fps updates)
    if (this.taserBeamActive && this.lastTarget) {
      this.taserBeamUpdateCounter++;
      if (this.taserBeamUpdateCounter >= 3) {
        this.updateTaserBeam(this.lastTarget);
        this.taserBeamUpdateCounter = 0;
      }
    }

    // Attack logic: if within range and cooldown ready, execute attack
    if (distanceToTarget <= attackParams.range && this.attackCooldown <= 0) {
      // Stop moving
      this.yukaVehicle.velocity.set(0, 0, 0);

      // Face target
      if (this.lastTarget) {
        const dirX = this.lastTarget.x - this._tempPosition.x;
        const dirZ = this.lastTarget.z - this._tempPosition.z;
        const angle = Math.atan2(dirX, dirZ);
        (this as THREE.Group).rotation.y = angle;
      }

      // Execute attack: play animation once and hold final pose
      if (this.mixer && this.animationClips.length > 0) {
        const clip = THREE.AnimationClip.findByName(this.animationClips, attackParams.animation);
        if (clip) {
          this.mixer.stopAllAction();
          const action = this.mixer.clipAction(clip);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true; // Hold final pose
          action.reset();
          action.play();
          this.currentAnimation = attackParams.animation;
        }
      }
      this.isCurrentlyAttacking = true;

      // Create visual effects based on attack type
      if (this.lastTarget) {
        if (this.currentWantedStars >= 2) {
          // Shooting - create bullet projectile
          this.createBulletProjectile(this.lastTarget);
        } else if (this.currentWantedStars === 1 && this.playerCanBeTased) {
          // Taser - create electric beam
          this.createTaserBeam(this.lastTarget);
        }
      }

      // Deal damage when attack executes
      if (this.onDealDamage) {
        this.onDealDamage(attackParams.damage);
      }

      // Set cooldown for next attack
      this.attackCooldown = attackParams.cooldown;
    } else if (distanceToTarget > attackParams.range) {
      this.isCurrentlyAttacking = false;

      // Simple position sync from Yuka AI (no expensive character controller)
      // Cops use Yuka's obstacle avoidance behavior to avoid buildings
      const yukaPos = this.yukaVehicle.position;
      this._tempPosition.set(yukaPos.x, 0, yukaPos.z);

      // Sync Three.js position directly (much cheaper than character controller)
      (this as THREE.Group).position.copy(this._tempPosition);

      // Update blob shadow position (stays on ground)
      this.blobShadow.position.set(this._tempPosition.x, 0.01, this._tempPosition.z);

      // Sync physics body position for collision detection by player
      this.rigidBody.setNextKinematicTranslation({ x: this._tempPosition.x, y: 0.5, z: this._tempPosition.z });

      // Instant rotation to face target (no smoothing - cops snap to face player)
      if (this.lastTarget) {
        const dirX = this.lastTarget.x - this._tempPosition.x;
        const dirZ = this.lastTarget.z - this._tempPosition.z;
        const distSq = dirX * dirX + dirZ * dirZ;

        // Only rotate if target is not too close (avoid jitter)
        if (distSq > 0.01) {
          const angle = Math.atan2(dirX, dirZ);
          (this as THREE.Group).rotation.y = angle;
        }
      }

      // Update animation based on movement (only if not attacking)
      if (!this.isCurrentlyAttacking) {
        const speed = this.yukaVehicle.velocity.length();
        if (speed > 0.5) {
          if (this.currentAnimation !== 'Run') {
            this.playAnimation('Run', 0.1);
          }
        } else {
          if (this.currentAnimation !== 'Idle') {
            this.playAnimation('Idle', 0.2);
          }
        }
      }
    }
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.yukaEntityManager.remove(this.yukaVehicle);
    this.removeTaserBeam();
    this.removeBulletProjectile();
    // Note: blob shadow is removed by CopManager when it removes from scene

    // PERF: Stop and uncache animation mixer to prevent memory leak
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mixer.getRoot());
      (this.mixer as THREE.AnimationMixer | null) = null;
    }

    // Dispose blob shadow (created per instance)
    if (this.blobShadow) {
      this.blobShadow.geometry.dispose();
      if (Array.isArray(this.blobShadow.material)) {
        this.blobShadow.material.forEach(m => m.dispose());
      } else if (this.blobShadow.material) {
        (this.blobShadow.material as THREE.Material).dispose();
      }
    }

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
  }

  /**
   * Reset cop for object pooling - reuse instead of creating new
   */
  reset(position: THREE.Vector3): void {
    // Reset state
    this.isDead = false;
    this.health = COP_CONFIG.HEALTH;
    this.isHitStunned = false;
    this.hitStunTimer = 0;
    this.isRagdolling = false;
    this.ragdollTimer = 0;
    this.ragdollVelocity.set(0, 0, 0);
    this.currentWantedStars = 0;
    this.playerCanBeTased = true;
    this.attackCooldown = 0;
    this.isCurrentlyAttacking = false;
    this.taserBeamUpdateCounter = 0;

    // Clear visual effects
    this.removeTaserBeam();
    this.removeBulletProjectile();

    // Reset physics body
    this.rigidBody.setTranslation({ x: position.x, y: 0, z: position.z }, true);
    this.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);

    // Reset Yuka AI
    this.yukaVehicle.position.set(position.x, 0, position.z);
    this.yukaVehicle.velocity.set(0, 0, 0);
    this.seekBehavior.target.set(position.x, 0, position.z);
    // Re-add to entity manager if removed during deactivate
    if (!this.yukaEntityManager.entities.includes(this.yukaVehicle)) {
      this.yukaEntityManager.add(this.yukaVehicle);
    }

    // Reset visuals
    (this as THREE.Group).visible = true;
    (this as THREE.Group).position.copy(position);
    (this as THREE.Group).rotation.set(0, 0, 0);

    // Reset blob shadow
    this.blobShadow.position.set(position.x, 0.01, position.z);
    this.blobShadow.visible = true;

    // Reset animation
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.playAnimation('Run', 0.1);
    }
  }

  /**
   * Deactivate cop when returning to pool
   */
  deactivate(): void {
    // Remove from AI manager
    this.yukaEntityManager.remove(this.yukaVehicle);

    // Clear effects
    this.removeTaserBeam();
    this.removeBulletProjectile();

    // Move physics body out of the way
    this.rigidBody.setTranslation({ x: 0, y: -500, z: 0 }, true);
    this.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);

    // Hide visuals
    (this as THREE.Group).visible = false;
    this.blobShadow.visible = false;
  }

  /**
   * Check if cop is dead
   */
  isDeadState(): boolean {
    return this.isDead;
  }

  /**
   * Get the blob shadow mesh (for adding to scene)
   */
  getBlobShadow(): BlobShadow {
    return this.blobShadow;
  }

  /**
   * Get Yuka vehicle for AI manager
   */
  getYukaVehicle(): YUKA.Vehicle {
    return this.yukaVehicle;
  }

  /**
   * Get current health (for UI health bars)
   */
  getHealth(): number {
    return this.health;
  }

  /**
   * Apply knockback force with ragdoll physics (used when player escapes taser)
   * Cops bounce back like pedestrians hit by cars
   */
  applyKnockback(fromPosition: THREE.Vector3, force: number): void {
    if (this.isDead) return;

    // Calculate direction away from the source (reuse pre-allocated vector)
    const currentPos = this.rigidBody.translation();
    this._tempDirection.set(
      currentPos.x - fromPosition.x,
      0,
      currentPos.z - fromPosition.z
    ).normalize();

    // Enable ragdoll mode with physics velocity
    this.isRagdolling = true;
    this.ragdollTimer = 1.5; // Ragdoll for 1.5 seconds
    this.ragdollVelocity.set(
      this._tempDirection.x * force,
      8, // Launch upward for bounce effect
      this._tempDirection.z * force
    );

    // Stop Yuka AI movement
    this.yukaVehicle.velocity.set(0, 0, 0);

    // Trigger hit stun so they can't immediately chase after ragdoll ends
    this.isHitStunned = true;
    this.hitStunTimer = 2.0; // Long stun after ragdoll

    // Play hit animation
    if (this.mixer && this.animationClips.length > 0) {
      const hitAnimNames = ['RecieveHit', 'HitReact', 'Hit_Reaction', 'GetHit'];
      const hitAnim = AnimationHelper.findAnimationByNames(this.animationClips, hitAnimNames);
      if (hitAnim) {
        const action = this.mixer.clipAction(hitAnim);
        action.setLoop(THREE.LoopOnce, 1);
        action.reset();
        action.play();
      }
    }
  }

  // Pre-allocated vector for getPosition (avoid per-call allocation)
  private readonly _positionResult: THREE.Vector3 = new THREE.Vector3();

  /**
   * Get cop position (reference - do not modify!)
   * Returns a reused vector to avoid per-call allocation
   */
  getPosition(): THREE.Vector3 {
    const pos = this.rigidBody.translation();
    return this._positionResult.set(pos.x, pos.y, pos.z);
  }

  /**
   * Set parent scene for spawning visual effects
   */
  setParentScene(scene: THREE.Scene): void {
    this.parentScene = scene;
  }

  /**
   * Create taser beam effect
   */
  private createTaserBeam(targetPos: THREE.Vector3): void {
    if (!this.parentScene) return;

    // Remove existing beam
    this.removeTaserBeam();

    const copPos = this.getPosition();
    copPos.y += 0.8; // Chest height

    // Reuse pre-allocated vectors to avoid GC pressure
    this._tempTargetWithHeight.copy(targetPos).setY(targetPos.y + 0.5);
    this._tempMidPoint.lerpVectors(copPos, this._tempTargetWithHeight, 0.5);

    // Create reusable Float32Array buffer for 3 points (9 floats)
    this.taserBeamPositions = new Float32Array([
      copPos.x, copPos.y, copPos.z,
      this._tempMidPoint.x, this._tempMidPoint.y, this._tempMidPoint.z,
      this._tempTargetWithHeight.x, this._tempTargetWithHeight.y, this._tempTargetWithHeight.z
    ]);

    // Create geometry with the buffer
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.taserBeamPositions, 3));

    // Electric yellow material with glow
    const material = new THREE.LineBasicMaterial({
      color: 0xffff00,
      linewidth: 3,
      transparent: true,
      opacity: 0.9,
    });

    this.taserBeam = new THREE.Line(geometry, material);
    this.taserBeamActive = true;
    this.parentScene.add(this.taserBeam);
  }

  /**
   * Update taser beam to follow cop and player
   * NOTE: Reuses pre-allocated Float32Array buffer to avoid GC pressure
   * Uses direct position calculation instead of getPosition() to avoid allocation
   */
  private updateTaserBeam(targetPos: THREE.Vector3): void {
    if (!this.taserBeam || !this.taserBeamActive || !this.taserBeamPositions) return;

    // Get cop position directly (no allocation)
    const pos = this.rigidBody.translation();
    const copX = pos.x;
    const copY = pos.y + 0.8;
    const copZ = pos.z;

    // Target with height offset
    const targetX = targetPos.x;
    const targetY = targetPos.y + 0.5;
    const targetZ = targetPos.z;

    // Add some electric jitter at midpoint
    const jitter = 0.05;
    const midX = (copX + targetX) / 2 + (Math.random() - 0.5) * jitter;
    const midY = (copY + targetY) / 2 + (Math.random() - 0.5) * jitter;
    const midZ = (copZ + targetZ) / 2 + (Math.random() - 0.5) * jitter;

    // Update buffer in-place (no allocations)
    const positions = this.taserBeamPositions;
    positions[0] = copX;
    positions[1] = copY;
    positions[2] = copZ;
    positions[3] = midX;
    positions[4] = midY;
    positions[5] = midZ;
    positions[6] = targetX;
    positions[7] = targetY;
    positions[8] = targetZ;

    this.taserBeam.geometry.attributes.position.needsUpdate = true;

    // Flicker effect
    const material = this.taserBeam.material as THREE.LineBasicMaterial;
    material.opacity = 0.7 + Math.random() * 0.3;
  }

  /**
   * Remove taser beam
   */
  removeTaserBeam(): void {
    if (this.taserBeam) {
      // Remove from scene if possible
      if (this.parentScene) {
        this.parentScene.remove(this.taserBeam);
      }
      // Always dispose geometry/material to prevent leaks
      this.taserBeam.geometry.dispose();
      (this.taserBeam.material as THREE.Material).dispose();
      this.taserBeam = null;
    }
    this.taserBeamActive = false;
  }

  /**
   * Create bullet projectile (uses shared geometry/material across all cops)
   */
  private createBulletProjectile(targetPos: THREE.Vector3): void {
    if (!this.parentScene) return;

    // Remove existing bullet
    this.removeBulletProjectile();

    // Lazily initialize shared geometry/material (one instance for all cops)
    if (!Cop.sharedBulletGeometry) {
      Cop.sharedBulletGeometry = new THREE.SphereGeometry(0.08, 8, 8);
    }
    if (!Cop.sharedBulletMaterial) {
      Cop.sharedBulletMaterial = new THREE.MeshBasicMaterial({
        color: 0xffcc00,
      });
    }

    const copPos = this.getPosition();
    copPos.y += 0.8; // Chest height

    this.bulletProjectile = new THREE.Mesh(Cop.sharedBulletGeometry, Cop.sharedBulletMaterial);
    this.bulletProjectile.position.copy(copPos);
    this.bulletTarget = targetPos.clone().setY(targetPos.y + 0.5);
    this.parentScene.add(this.bulletProjectile);
  }

  /**
   * Update bullet projectile movement
   * NOTE: Uses pre-allocated _tempDirection vector AND squared distance to avoid GC pressure + sqrt
   */
  private updateBulletProjectile(deltaTime: number): void {
    if (!this.bulletProjectile || !this.bulletTarget) return;

    // Use pre-allocated vector for direction (avoids GC pressure)
    this._tempDirection.subVectors(this.bulletTarget, this.bulletProjectile.position);

    // Use squared distance to avoid expensive sqrt
    const distanceSq = this._tempDirection.lengthSq();
    const moveDistance = this.bulletSpeed * deltaTime;
    const moveDistanceSq = moveDistance * moveDistance;

    if (distanceSq <= moveDistanceSq) {
      // Bullet reached target
      this.removeBulletProjectile();
    } else {
      // Move bullet toward target
      this._tempDirection.normalize();
      this.bulletProjectile.position.add(this._tempDirection.multiplyScalar(moveDistance));
    }
  }

  /**
   * Remove bullet projectile (does NOT dispose shared geometry/material)
   */
  private removeBulletProjectile(): void {
    if (this.bulletProjectile && this.parentScene) {
      this.parentScene.remove(this.bulletProjectile);
      // Don't dispose - geometry and material are shared across all cops
      this.bulletProjectile = null;
    }
    this.bulletTarget = null;
  }

  /**
   * Check if taser beam is active
   */
  isTaserActive(): boolean {
    return this.taserBeamActive;
  }
}
