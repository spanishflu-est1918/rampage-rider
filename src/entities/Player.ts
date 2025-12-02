import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { AssetLoader } from '../core/AssetLoader';
import { AnimationHelper } from '../utils/AnimationHelper';
import { KinematicCharacterHelper } from '../utils/KinematicCharacterHelper';
import { BlobShadow, createBlobShadow } from '../rendering/BlobShadow';
import {
  ENTITY_SPEEDS,
  PHYSICS_CONFIG,
  TASER_CONFIG,
  COLLISION_GROUPS,
  makeCollisionGroups,
} from '../constants';

/**
 * Player - Basic 3D movement with camera-relative controls
 * Ported from Sketchbook character movement system
 */
export class Player extends THREE.Group {
  // Physics
  private rigidBody: RAPIER.RigidBody | null = null;
  private world: RAPIER.World | null = null;
  private collider: RAPIER.Collider | null = null;
  private characterController: RAPIER.KinematicCharacterController | null = null;

  // Movement
  private walkSpeed: number = ENTITY_SPEEDS.PLAYER_WALK;
  private sprintSpeed: number = ENTITY_SPEEDS.PLAYER_SPRINT;
  private cameraDirection: THREE.Vector3 = new THREE.Vector3(0, 0, -1);
  private isWalking: boolean = false;
  private isAttacking: boolean = false;

  // Taser stun state
  private isTased: boolean = false;
  private taseEscapeProgress: number = 0;
  private taseFlashTimer: number = 0;
  private taserImmunityTimer: number = 0;
  private jumpCooldown: number = 0; // Prevents jumping briefly after taser escape

  // Hit stun state (when damaged by cops)
  private isHitStunned: boolean = false;
  private hitStunTimer: number = 0;

  // Death state
  private isDead: boolean = false;
  private onDeathComplete?: () => void;

  // Jump
  private jumpForce: number = PHYSICS_CONFIG.JUMP_FORCE;
  private isGrounded: boolean = true;
  private verticalVelocity: number = 0;
  private gravity: number = PHYSICS_CONFIG.GRAVITY;

  // Movement collision filter - only collide with ground and buildings (not pedestrians/cops)
  private movementCollisionFilter: number;

  // Input state
  private input = {
    up: false,
    down: false,
    left: false,
    right: false,
    sprint: false,
    jump: false,
    attack: false,
  };

  // Previous input state for change detection
  private prevInput = {
    up: false,
    down: false,
    left: false,
    right: false,
    sprint: false,
    jump: false,
    attack: false,
  };

  // Visual containers (matching Sketchbook structure)
  private tiltContainer: THREE.Group;
  private modelContainer: THREE.Group;
  private modelLoaded: boolean = false;

  // Animation
  private mixer: THREE.AnimationMixer | null = null;
  private animations: THREE.AnimationClip[] = [];
  private currentAnimation: string = 'idle';
  private attackAction: THREE.AnimationAction | null = null;
  private attackTimer: number = 0; // Timeout to force reset isAttacking
  private debugAnimationLock: boolean = false; // Prevents auto-animation updates

  // Attack callback
  private onAttackCallback: ((position: THREE.Vector3) => void) | null = null;

  // Taser escape callback (for screen shake feedback)
  private onEscapePressCallback: (() => void) | null = null;

  // Taser escape explosion callback (knockback nearby cops)
  private onTaserEscapeCallback: ((position: THREE.Vector3, radius: number, force: number) => void) | null = null;

  // Fake blob shadow (cheaper than real shadows)
  private blobShadow: BlobShadow;

  // Pre-allocated vectors (reused every frame to avoid GC pressure)
  private readonly _tempDirection: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempVelocity: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempAttackPos: THREE.Vector3 = new THREE.Vector3();
  private readonly _facingDir: THREE.Vector3 = new THREE.Vector3();
  private static readonly _Y_AXIS: THREE.Vector3 = new THREE.Vector3(0, 1, 0);
  // PERF: Pre-allocated for RAPIER movement (avoid object creation per frame)
  private readonly _rapierMovement = { x: 0, y: 0, z: 0 };
  private readonly _rapierPosition = { x: 0, y: 0, z: 0 };

  constructor() {
    super();

    // Initialize movement collision filter - only ground and buildings (walk through pedestrians/cops)
    // Format: (filter << 16) | membership
    const groups = KinematicCharacterHelper.getCollisionGroups();
    const movementFilter = groups.GROUND | groups.BUILDING; // What player movement collides WITH
    this.movementCollisionFilter = (movementFilter << 16) | groups.PLAYER;

    // Sketchbook structure: tiltContainer > modelContainer > model
    this.tiltContainer = new THREE.Group();
    (this as THREE.Group).add(this.tiltContainer);

    // Model container positioned to ground the character
    this.modelContainer = new THREE.Group();
    this.modelContainer.position.y = PHYSICS_CONFIG.MODEL_CONTAINER_Y;
    this.tiltContainer.add(this.modelContainer);

    // Create blob shadow (fake shadow for performance)
    this.blobShadow = createBlobShadow(1.0);
    this.blobShadow.position.set(0, 0.01, 0);

    // Load boxman model asynchronously
    this.loadModel();

  }

  /**
   * Load the boxman GLTF model from cache
   */
  private async loadModel(): Promise<void> {
    const modelPath = '/assets/boxman.glb';

    try {
      // Use cached model from AssetLoader instead of loading fresh
      const assetLoader = AssetLoader.getInstance();
      const cachedGltf = assetLoader.getModel(modelPath);

      if (!cachedGltf) {
        console.error(`[Player] Model not in cache: ${modelPath}`);
        this.createFallbackMesh();
        return;
      }

      // Player uses the model directly (single instance)
      // Disable real shadow casting (we use blob shadows instead)
      AnimationHelper.setupShadows(cachedGltf.scene, false, false);

      // Add to model container
      this.modelContainer.add(cachedGltf.scene);

      // Setup animation mixer
      this.mixer = new THREE.AnimationMixer(cachedGltf.scene);
      this.mixer.timeScale = 1.5;
      this.animations = cachedGltf.animations;

      // Play idle animation by default
      this.playAnimation('Idle_A', 0.3);

      this.modelLoaded = true;

    } catch (error) {
      console.error('[Player] Failed to load boxman model:', error);
      this.createFallbackMesh();
    }
  }

  /**
   * Create fallback capsule mesh when model loading fails
   */
  private createFallbackMesh(): void {
    const geometry = new THREE.CapsuleGeometry(0.25, 0.5, 8, 16);
    const material = new THREE.MeshPhongMaterial({ color: 0x4444ff });
    const fallbackMesh = new THREE.Mesh(geometry, material);
    fallbackMesh.castShadow = false; // Use blob shadow instead
    this.modelContainer.add(fallbackMesh);
    this.modelLoaded = true;
  }


  /**
   * Play animation by name (matching Sketchbook setAnimation - line 499)
   */
  private playAnimation(clipName: string, fadeIn: number, force: boolean = false): void {
    if (!this.mixer || this.animations.length === 0) return;

    if (this.debugAnimationLock && !force) return;

    const clip = THREE.AnimationClip.findByName(this.animations, clipName);
    if (!clip) return;

    this.mixer.stopAllAction();
    const action = this.mixer.clipAction(clip);
    action.fadeIn(fadeIn);
    action.play();

    this.currentAnimation = clipName;
  }

  /**
   * Play animation once and call callback when complete
   * Locks normal animation updates until complete
   */
  playAnimationWithCallback(clipName: string, onComplete: () => void, fadeIn: number = 0.1): void {
    if (!this.mixer || this.animations.length === 0) {
      onComplete();
      return;
    }

    const clip = THREE.AnimationClip.findByName(this.animations, clipName);
    if (!clip) {
      console.warn(`[Player] Animation not found: ${clipName}`);
      onComplete();
      return;
    }

    // Lock animations during playback
    this.debugAnimationLock = true;

    // Stop current and play new
    this.mixer.stopAllAction();
    const action = this.mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.reset();
    action.fadeIn(fadeIn);
    action.play();

    this.currentAnimation = clipName;

    // Call callback after animation duration
    const duration = clip.duration * 1000 / this.mixer.timeScale;
    setTimeout(() => {
      this.debugAnimationLock = false;
      onComplete();
    }, duration);
  }

  /**
   * Create Rapier physics body
   */
  createPhysicsBody(world: RAPIER.World, spawnPosition?: THREE.Vector3): void {
    this.world = world;

    // Create kinematic position-based body for character controller
    // Default spawn in a street (odd grid cell) not in a building (even grid cell)
    const pos = spawnPosition || new THREE.Vector3(6.5, 0.57, 10);
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(pos.x, pos.y, pos.z);

    this.rigidBody = world.createRigidBody(bodyDesc);

    // Create capsule collider with collision groups
    // Membership: PLAYER group
    // Filter: can collide with GROUND, PEDESTRIAN, BUILDING
    const playerFilter = COLLISION_GROUPS.GROUND | COLLISION_GROUPS.PEDESTRIAN | COLLISION_GROUPS.BUILDING;
    const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.3)
      .setCollisionGroups(makeCollisionGroups(COLLISION_GROUPS.PLAYER, playerFilter));

    this.collider = world.createCollider(colliderDesc, this.rigidBody);

    // Create character controller for collision handling
    this.characterController = world.createCharacterController(0.01);
    this.characterController.enableAutostep(0.5, 0.2, true);
    this.characterController.enableSnapToGround(0.5);

  }

  /**
   * Handle keyboard input
   */
  handleInput(inputState: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    sprint?: boolean;
    jump?: boolean;
    attack?: boolean;
  }): void {
    this.input.up = inputState.up;
    this.input.down = inputState.down;
    this.input.left = inputState.left;
    this.input.right = inputState.right;
    this.input.sprint = inputState.sprint || false;
    this.input.jump = inputState.jump || false;
    this.input.attack = inputState.attack || false;
  }

  /**
   * Perform an attack (called by ActionController)
   * Directly triggers the attack, bypassing input edge detection
   */
  performAttack(): void {
    if (this.isDead || this.isAttacking) return;

    const attackAnimations = [
      'Melee_1H_Attack_Stab',
      'Melee_1H_Attack_Chop',
      'Melee_1H_Attack_Jump_Chop'
    ];
    const randomAttack = attackAnimations[Math.floor(Math.random() * attackAnimations.length)];

    const clip = THREE.AnimationClip.findByName(this.animations, randomAttack);
    if (clip && this.mixer) {
      this.attackAction = this.mixer.clipAction(clip);
      this.attackAction.setLoop(THREE.LoopOnce, 1);
      this.attackAction.clampWhenFinished = false;
      this.attackAction.timeScale = 2.0;
      this.attackAction.reset();
      this.attackAction.play();

      this.isAttacking = true;
      this.attackTimer = 0.5;

      if (this.onAttackCallback) {
        // Reuse pre-allocated vector instead of clone()
        this._tempAttackPos.copy((this as THREE.Group).position);
        this.onAttackCallback(this._tempAttackPos);
      }
    }
  }

  /**
   * Set camera direction for camera-relative movement
   */
  setCameraDirection(direction: THREE.Vector3): void {
    this.cameraDirection.copy(direction).normalize();
  }

  /**
   * Get movement direction for isometric controls
   * Camera at (2.5, 6.25, 2.5) looking at origin
   */
  private getLocalMovementDirection(): THREE.Vector3 {
    let x = 0;
    let z = 0;

    // W: move up-right on screen
    if (this.input.up) {
      z -= 1;
    }
    // S: move down-left on screen
    if (this.input.down) {
      z += 1;
    }
    // A: move up-left on screen
    if (this.input.left) {
      x -= 1;
    }
    // D: move down-right on screen
    if (this.input.right) {
      x += 1;
    }

    // Reuse pre-allocated vector
    this._tempDirection.set(x, 0, z);
    return this._tempDirection.length() > 0 ? this._tempDirection.normalize() : this._tempDirection;
  }

  /**
   * Get camera-relative movement direction
   * For isometric view - just return local direction (already in world space)
   */
  private getCameraRelativeMovementVector(): THREE.Vector3 {
    return this.getLocalMovementDirection();
  }

  /**
   * Transform vector by rotation matrix (XZ plane only)
   * Ported from Sketchbook: appplyVectorMatrixXZ()
   */
  private applyVectorMatrixXZ(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(
      a.x * b.z + a.z * b.x,
      b.y,
      a.z * b.z + -a.x * b.x
    );
  }

  /**
   * Update movement
   */
  update(deltaTime: number): void {
    if (!this.rigidBody) return;

    // Get current position before updates
    const translation = this.rigidBody.translation();

    // Stop all movement and input when dead
    if (this.isDead) {
      this.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      if (this.mixer) {
        this.mixer.update(deltaTime);
      }
      return;
    }

    // Handle taser stun decay - EXPONENTIAL: faster drain as progress increases
    if (this.isTased && this.taseEscapeProgress > 0) {
      // Base decay + exponential multiplier based on progress
      // At 0%: decay = base (15/s)
      // At 50%: decay = base * 1.5 (~22/s)
      // At 80%: decay = base * 2.9 (~44/s)
      // At 95%: decay = base * 4.8 (~72/s)
      const progressRatio = this.taseEscapeProgress / 100;
      const exponentialMultiplier = 1 + Math.pow(progressRatio, 2.2) * 4.5; // 1x to 5.5x
      const decayRate = TASER_CONFIG.ESCAPE_DECAY * exponentialMultiplier;
      this.taseEscapeProgress = Math.max(0, this.taseEscapeProgress - (decayRate * deltaTime));
    }

    // Decrement taser immunity timer
    if (this.taserImmunityTimer > 0) {
      this.taserImmunityTimer = Math.max(0, this.taserImmunityTimer - deltaTime);
      // Taser immunity expired
    }

    // Taser visual effect: flash between normal and white
    if (this.isTased) {
      this.taseFlashTimer += deltaTime;
      const flashSpeed = 10; // Flashes per second
      const isFlashOn = Math.floor(this.taseFlashTimer * flashSpeed) % 2 === 0;

      (this as THREE.Group).traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (isFlashOn) {
            mat.emissive.setHex(0xffffff);
            mat.emissiveIntensity = 0.8;
          } else {
            mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0;
          }
        }
      });
    } else {
      // Reset flash timer and ensure emissive is off
      this.taseFlashTimer = 0;
      (this as THREE.Group).traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mat = child.material as THREE.MeshStandardMaterial;
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        }
      });
    }

    // Check if input changed
    const inputChanged =
      this.input.up !== this.prevInput.up ||
      this.input.down !== this.prevInput.down ||
      this.input.left !== this.prevInput.left ||
      this.input.right !== this.prevInput.right ||
      this.input.sprint !== this.prevInput.sprint ||
      this.input.jump !== this.prevInput.jump ||
      this.input.attack !== this.prevInput.attack;

    // Get movement direction relative to camera
    const localDir = this.getLocalMovementDirection();
    const moveVector = this.getCameraRelativeMovementVector();
    const isMoving = localDir.length() > 0;

    // Handle walk (Shift slows down from default sprint)
    this.isWalking = this.input.sprint && isMoving; // Shift = walk, no shift = sprint
    const currentSpeed = this.isWalking ? this.walkSpeed : this.sprintSpeed;

    // Handle jump cooldown (prevents jumping after taser escape)
    if (this.jumpCooldown > 0) {
      this.jumpCooldown -= deltaTime;
    }

    // Note: Taser escape is handled by Engine via ActionController

    // Apply gravity
    if (!this.isGrounded) {
      this.verticalVelocity += this.gravity * deltaTime;
    }

    // Ground check (simple Y position check)
    if (translation.y <= PHYSICS_CONFIG.GROUND_CHECK_Y && this.verticalVelocity <= 0) {
      this.isGrounded = true;
      this.verticalVelocity = 0;
    }

    // Update base animation (movement) - skip if dead
    if (!this.isDead) {
      if (this.isTased) {
        // When tased: play stunned/hit animation and allow slow crawling
        if (isMoving && this.currentAnimation !== 'Walking_A') {
          this.playAnimation('Walking_A', 0.2);
        } else if (!isMoving && this.currentAnimation !== 'Hit_A') {
          this.playAnimation('Hit_A', 0.1);
        }
      } else if (!this.isGrounded) {
        // In air - always play jump animation
        if (this.currentAnimation !== 'Jump_Full_Short') {
          this.playAnimation('Jump_Full_Short', 0.1);
        }
      } else if (isMoving) {
        // On ground and moving
        if (!this.isWalking && this.currentAnimation !== 'Running_A') {
          this.playAnimation('Running_A', 0.1);
        } else if (this.isWalking && this.currentAnimation !== 'Walking_A') {
          this.playAnimation('Walking_A', 0.1);
        }
      } else if (this.currentAnimation !== 'Idle_A') {
        // On ground and not moving
        this.playAnimation('Idle_A', 0.1);
      }
    }

    // NOTE: Attacks are now triggered via performAttack() from ActionController
    // This ensures ActionController is the single source of truth for SPACE key actions

    // Update attack timer and reset state when animation completes
    if (this.isAttacking && this.attackAction) {
      this.attackTimer -= deltaTime;

      // Check if attack animation finished OR timeout exceeded
      const attackDuration = this.attackAction.getClip().duration / this.attackAction.timeScale;
      const attackTime = this.attackAction.time;

      if (attackTime >= attackDuration || this.attackTimer <= 0) {
        // Reset attack state
        this.isAttacking = false;
        this.attackAction.stop();
        this.attackAction = null;
        this.attackTimer = 0;
      }
    }

    // Store current input for next frame (PERF: manual copy instead of spread)
    if (inputChanged) {
      this.prevInput.up = this.input.up;
      this.prevInput.down = this.input.down;
      this.prevInput.left = this.input.left;
      this.prevInput.right = this.input.right;
      this.prevInput.sprint = this.input.sprint;
      this.prevInput.jump = this.input.jump;
      this.prevInput.attack = this.input.attack;
    }

    // Apply move speed (reduced during taser stun, blocked during attack)
    // Reuse pre-allocated _tempVelocity to avoid allocations
    if (this.isAttacking) {
      this._tempVelocity.set(0, 0, 0);
    } else if (this.isTased) {
      // Allow slow crawling while tased - player can try to escape
      this._tempVelocity.copy(moveVector).multiplyScalar(TASER_CONFIG.CRAWL_SPEED);
    } else {
      this._tempVelocity.copy(moveVector).multiplyScalar(currentSpeed);
    }
    const velocity = this._tempVelocity;

    // Rotate character to face movement direction
    if (isMoving && !this.isAttacking) {
      // Calculate target rotation from movement direction
      const targetAngle = Math.atan2(moveVector.x, moveVector.z);

      // Smoothly rotate towards target (lerp)
      const currentRotation = (this as THREE.Group).rotation.y;
      const rotationSpeed = 10; // radians per second
      const maxRotation = rotationSpeed * deltaTime;

      // Calculate shortest rotation direction
      let angleDiff = targetAngle - currentRotation;
      // Normalize to -PI to PI range
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      // Apply rotation (clamped to max rotation speed)
      const rotationChange = Math.max(-maxRotation, Math.min(maxRotation, angleDiff));
      (this as THREE.Group).rotation.y += rotationChange;
    }

    // Use character controller to compute movement with collisions
    if (this.characterController && this.collider) {
      // PERF: Reuse pre-allocated objects instead of creating new ones per frame
      const desiredMovement = this._rapierMovement;
      desiredMovement.x = velocity.x * deltaTime;
      desiredMovement.y = this.verticalVelocity * deltaTime;
      desiredMovement.z = velocity.z * deltaTime;

      // Compute movement accounting for obstacles (only collide with ground/buildings, not NPCs)
      this.characterController.computeColliderMovement(
        this.collider,
        desiredMovement,
        undefined, // filterFlags
        this.movementCollisionFilter // only collide with ground and buildings
      );

      // Get corrected movement
      const correctedMovement = this.characterController.computedMovement();

      // Apply to rigid body
      const newPosition = this._rapierPosition;
      newPosition.x = translation.x + correctedMovement.x;
      newPosition.y = translation.y + correctedMovement.y;
      newPosition.z = translation.z + correctedMovement.z;

      this.rigidBody.setNextKinematicTranslation(newPosition);

      // Sync visual position
      (this as THREE.Group).position.set(newPosition.x, newPosition.y, newPosition.z);

      // Update blob shadow position (stays on ground)
      this.blobShadow.position.set(newPosition.x, 0.01, newPosition.z);
    }

    // Update animation mixer
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }
  }

  /**
   * Get player position (reference - do not modify!)
   * Returns the actual position vector to avoid per-frame allocation
   */
  getPosition(): THREE.Vector3 {
    return (this as THREE.Group).position;
  }

  /**
   * Get the blob shadow mesh (for adding to scene)
   */
  getBlobShadow(): BlobShadow {
    return this.blobShadow;
  }

  /**
   * Get player facing direction (normalized vector in XZ plane)
   * PERF: Reuses pre-allocated vector - do NOT store reference, copy if needed
   */
  getFacingDirection(): THREE.Vector3 {
    this._facingDir.set(0, 0, 1);
    this._facingDir.applyAxisAngle(Player._Y_AXIS, (this as THREE.Group).rotation.y);
    return this._facingDir;
  }

  /**
   * Set player visibility
   */
  setVisible(visible: boolean): void {
    (this as THREE.Group).visible = visible;
  }

  /**
   * Apply taser stun to player
   */
  applyTaserStun(): void {
    // Check immunity
    if (this.taserImmunityTimer > 0) {
      return;
    }

    if (!this.isTased) {
      this.isTased = true;
      this.taseEscapeProgress = 0;
    }
  }

  /**
   * Trigger death animation and call callback when complete
   */
  die(onComplete: () => void): void {
    if (this.isDead) return;

    this.isDead = true;
    this.onDeathComplete = onComplete;

    // Play random death animation (Death_A or Death_B)
    if (this.mixer && this.animations.length > 0) {
      const deathAnim = Math.random() < 0.5 ? 'Death_A' : 'Death_B';
      const clip = THREE.AnimationClip.findByName(this.animations, deathAnim);

      if (clip) {
        this.mixer.stopAllAction();
        const action = this.mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.reset();
        action.play();

        // Call callback after animation finishes (minus 150ms to feel snappier)
        const duration = clip.duration * 1000 - 150;
        setTimeout(() => {
          if (this.onDeathComplete) {
            this.onDeathComplete();
          }
        }, duration);
      } else {
        // No death animation found, call immediately
        if (this.onDeathComplete) {
          this.onDeathComplete();
        }
      }
    } else {
      // No animations available, call immediately
      if (this.onDeathComplete) {
        this.onDeathComplete();
      }
    }
  }

  /**
   * Apply hit stun to player (when damaged by cops)
   * No visual effects - player is never stunned except by taser
   */
  applyHitStun(): void {
    // Do nothing - player doesn't get stunned or show effects when hit
    // Only taser (applyTaserStun) causes visual effects
  }

  /**
   * Take damage (placeholder - player currently doesn't have health on foot)
   * Just applies hit stun for now
   */
  takeDamage(_damage: number): void {
    this.applyHitStun();
  }

  /**
   * Handle Space key press for escaping taser
   * Uses INVERSE EXPONENTIAL: the higher your progress, the less each press adds
   */
  handleEscapePress(): void {
    if (this.isTased) {
      // Diminishing returns: each press gives less as you get closer to 100%
      // At 0%: gain = full (15%)
      // At 50%: gain = 80% of full (~12%)
      // At 80%: gain = 52% of full (~7.8%)
      // At 95%: gain = 32% of full (~4.8%)
      const progressRatio = this.taseEscapeProgress / 100;
      const diminishingMultiplier = 1 - Math.pow(progressRatio, 1.9) * 0.66; // ~34% at 95%
      const actualGain = TASER_CONFIG.ESCAPE_PER_PRESS * diminishingMultiplier;

      this.taseEscapeProgress = Math.min(100, this.taseEscapeProgress + actualGain);

      // Trigger screen shake feedback
      if (this.onEscapePressCallback) {
        this.onEscapePressCallback();
      }

      // Check if escaped
      if (this.taseEscapeProgress >= 100) {
        this.isTased = false;
        this.taseEscapeProgress = 0;
        this.taserImmunityTimer = TASER_CONFIG.IMMUNITY_DURATION;
        this.jumpCooldown = 0.5;

        // Force play idle animation immediately to avoid T-pose
        this.playAnimation('Idle_A', 0.1);

        // Trigger explosion knockback to push away nearby cops
        if (this.onTaserEscapeCallback) {
          this.onTaserEscapeCallback(
            (this as THREE.Group).position.clone(),
            TASER_CONFIG.ESCAPE_KNOCKBACK,
            TASER_CONFIG.ESCAPE_FORCE
          );
        }
      }
    }
  }

  /**
   * Get taser stun state (for UI display)
   */
  getTaserState(): { isTased: boolean; escapeProgress: number } {
    return {
      isTased: this.isTased,
      escapeProgress: this.taseEscapeProgress
    };
  }

  /**
   * Check if player can be tased (not immune and not already tased)
   */
  canBeTased(): boolean {
    return this.taserImmunityTimer <= 0 && !this.isTased;
  }

  /**
   * Play seated animation for vehicle riding (bike/motorbike)
   * Uses Melee_Blocking which has arms forward like holding handlebars
   */
  playSeatedAnimation(): void {
    if (!this.mixer) return;

    this.debugAnimationLock = true;

    const clip = THREE.AnimationClip.findByName(this.animations, 'Melee_Blocking');
    if (!clip) return;

    this.mixer.stopAllAction();
    const action = this.mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.reset();
    action.play();

    this.currentAnimation = 'Melee_Blocking';
  }

  /**
   * Resume normal animations after exiting vehicle
   */
  resumeNormalAnimations(): void {
    this.debugAnimationLock = false; // Unlock so movement can control animations
    this.playAnimation('Idle_A', 0.1);
  }

  /**
   * Update only animations (used when player is in vehicle)
   */
  updateAnimations(deltaTime: number): void {
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }
  }

  /**
   * Play bicycle attack animation (kick/slash while seated)
   * Plays a quick attack then returns to seated pose
   */
  playBicycleAttack(): void {
    if (!this.mixer || this.animations.length === 0) return;

    // Use horizontal slice for bike attack (looks like a swing)
    const attackClip = THREE.AnimationClip.findByName(this.animations, 'Melee_1H_Attack_Slice_Horizontal');
    const seatedClip = THREE.AnimationClip.findByName(this.animations, 'Melee_Blocking');

    if (!attackClip || !seatedClip) {
      console.warn('[Player] Missing animation clips for bicycle attack');
      return;
    }

    // Stop current animation and play attack
    this.mixer.stopAllAction();
    const attackAction = this.mixer.clipAction(attackClip);
    attackAction.setLoop(THREE.LoopOnce, 1);
    attackAction.clampWhenFinished = false;
    attackAction.timeScale = 2.5; // Fast attack
    attackAction.reset();
    attackAction.play();

    // Return to seated pose after attack completes
    const duration = attackClip.duration * 1000 / attackAction.timeScale;
    setTimeout(() => {
      if (this.mixer) {
        this.mixer.stopAllAction();
        const seatedAction = this.mixer.clipAction(seatedClip);
        seatedAction.setLoop(THREE.LoopRepeat, Infinity);
        seatedAction.reset();
        seatedAction.play();
        this.currentAnimation = 'Melee_Blocking';
      }
    }, duration);
  }

  /**
   * Play motorbike shooting animation (drive-by)
   * Plays one-handed shooting then returns to seated pose
   */
  playMotorbikeShoot(): void {
    if (!this.mixer || this.animations.length === 0) return;

    // Use one-handed shooting for drive-by
    const shootClip = THREE.AnimationClip.findByName(this.animations, 'Throw');
    const seatedClip = THREE.AnimationClip.findByName(this.animations, 'Melee_Blocking');

    if (!shootClip || !seatedClip) {
      console.warn('[Player] Missing animation clips for motorbike shoot');
      return;
    }

    // Stop current animation and play shooting
    this.mixer.stopAllAction();
    const shootAction = this.mixer.clipAction(shootClip);
    shootAction.setLoop(THREE.LoopOnce, 1);
    shootAction.clampWhenFinished = false;
    shootAction.timeScale = 3.0; // Very fast - rapid fire feel
    shootAction.reset();
    shootAction.play();

    // Return to seated pose after animation completes
    const duration = shootClip.duration * 1000 / shootAction.timeScale;
    setTimeout(() => {
      if (this.mixer) {
        this.mixer.stopAllAction();
        const seatedAction = this.mixer.clipAction(seatedClip);
        seatedAction.setLoop(THREE.LoopRepeat, Infinity);
        seatedAction.reset();
        seatedAction.play();
        this.currentAnimation = 'Melee_Blocking';
      }
    }, duration);
  }

  /**
   * Play spawn animation (Spawn_Air) when game starts
   * Starts player high in the air and drops them to ground
   */
  playSpawnAnimation(): void {
    // Wait for model to load first
    if (!this.modelLoaded || !this.mixer) {
      // Retry after a short delay if model not ready
      setTimeout(() => this.playSpawnAnimation(), 100);
      return;
    }

    // Start player high in the air
    const startY = 12;
    const groundY = 0.57;
    const gravity = 35; // Fast gravity for snappy feel

    if (this.rigidBody) {
      const pos = this.rigidBody.translation();
      this.rigidBody.setNextKinematicTranslation({ x: pos.x, y: startY, z: pos.z });
      (this as THREE.Group).position.y = startY;
    }

    // Physics-based drop with gravity
    let velocity = 0;
    let currentY = startY;
    let lastTime = performance.now();

    const animateDrop = () => {
      const now = performance.now();
      const dt = (now - lastTime) / 1000; // seconds
      lastTime = now;

      // Apply gravity: v += g * dt, y -= v * dt
      velocity += gravity * dt;
      currentY -= velocity * dt;

      // Clamp to ground
      if (currentY <= groundY) {
        currentY = groundY;
        if (this.rigidBody) {
          const pos = this.rigidBody.translation();
          this.rigidBody.setNextKinematicTranslation({ x: pos.x, y: groundY, z: pos.z });
          (this as THREE.Group).position.y = groundY;
        }
        return; // Stop animation
      }

      if (this.rigidBody) {
        const pos = this.rigidBody.translation();
        this.rigidBody.setNextKinematicTranslation({ x: pos.x, y: currentY, z: pos.z });
        (this as THREE.Group).position.y = currentY;
      }

      requestAnimationFrame(animateDrop);
    };

    requestAnimationFrame(animateDrop);

    this.playAnimationWithCallback('Spawn_Air', () => {
      // Ensure final position is at ground
      if (this.rigidBody) {
        const pos = this.rigidBody.translation();
        this.rigidBody.setNextKinematicTranslation({ x: pos.x, y: groundY, z: pos.z });
        (this as THREE.Group).position.y = groundY;
      }
      // Transition to idle after spawn animation
      this.playAnimation('Idle_A', 0.2);
    }, 0.1);
  }

  /**
   * DEBUG: Get list of all available animation names
   */
  getAnimationNames(): string[] {
    return this.animations.map(clip => clip.name);
  }

  /**
   * DEBUG: Play any animation by name (for testing)
   */
  debugPlayAnimation(name: string): void {
    if (!this.mixer) return;
    this.debugAnimationLock = true;
    this.playAnimation(name, 0.2, true);
  }

  /**
   * DEBUG: Unlock animation so game can control it again
   */
  debugUnlockAnimation(): void {
    this.debugAnimationLock = false;
  }

  /**
   * Set attack callback (called when player attacks)
   */
  setOnAttack(callback: (position: THREE.Vector3) => void): void {
    this.onAttackCallback = callback;
  }

  /**
   * Set taser escape press callback (for screen shake feedback)
   */
  setOnEscapePress(callback: () => void): void {
    this.onEscapePressCallback = callback;
  }

  /**
   * Set taser escape explosion callback (for knockback nearby cops)
   */
  setOnTaserEscape(callback: (position: THREE.Vector3, radius: number, force: number) => void): void {
    this.onTaserEscapeCallback = callback;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (this.rigidBody && this.world) {
      this.world.removeRigidBody(this.rigidBody);
      this.rigidBody = null;
    }

    // PERF: Stop and uncache animation mixer to prevent memory leak
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mixer.getRoot());
      (this.mixer as THREE.AnimationMixer | null) = null;
    }

    // Dispose blob shadow (created per instance in constructor)
    if (this.blobShadow) {
      this.blobShadow.geometry.dispose();
      if (Array.isArray(this.blobShadow.material)) {
        this.blobShadow.material.forEach(m => m.dispose());
      } else if (this.blobShadow.material) {
        (this.blobShadow.material as THREE.Material).dispose();
      }
    }

    // Cleanup model - DON'T dispose geometries (shared via AssetLoader)
    // Only dispose cloned materials
    this.modelContainer.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // DON'T dispose geometry - shared across all instances
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
