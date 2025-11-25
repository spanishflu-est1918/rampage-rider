import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { AssetLoader } from '../core/AssetLoader';
import { AnimationHelper } from '../utils/AnimationHelper';
import { KinematicCharacterHelper } from '../utils/KinematicCharacterHelper';
import {
  ENTITY_SPEEDS,
  PHYSICS_CONFIG,
  TASER_CONFIG,
  HIT_STUN,
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
      // Setup shadows
      AnimationHelper.setupShadows(cachedGltf.scene);

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
    fallbackMesh.castShadow = true;
    this.modelContainer.add(fallbackMesh);
    this.modelLoaded = true;
  }


  /**
   * Play animation by name (matching Sketchbook setAnimation - line 499)
   */
  private playAnimation(clipName: string, fadeIn: number, force: boolean = false): void {
    if (!this.mixer || this.animations.length === 0) {
      console.log(`[ANIM] playAnimation SKIP: no mixer or animations`);
      return;
    }

    // Skip if debug animation is locked (unless forced)
    if (this.debugAnimationLock && !force) {
      console.log(`[ANIM] playAnimation SKIP: locked, clip=${clipName}`);
      return;
    }

    // Find animation clip
    const clip = THREE.AnimationClip.findByName(this.animations, clipName);
    if (!clip) {
      console.log(`[ANIM] playAnimation SKIP: clip not found: ${clipName}`);
      return;
    }

    console.log(`[ANIM] playAnimation: ${clipName}, duration=${clip.duration.toFixed(2)}s`);

    // Stop all current actions and play new one
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
    // Membership: 0x0002 (PLAYER group)
    // Filter: 0x0045 (can collide with GROUND=0x0001, PEDESTRIAN=0x0004, BUILDING=0x0040)
    const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.3)
      .setCollisionGroups(0x00450002); // Filter=0x0045, Membership=0x0002

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
    console.log(`[PLAYER] performAttack() called: isDead=${this.isDead}, isAttacking=${this.isAttacking}`);

    if (this.isDead || this.isAttacking) {
      console.log('[PLAYER] performAttack() ABORTED');
      return;
    }

    // Randomize attack animation
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
      this.attackTimer = 0.5; // 500ms max attack duration

      console.log('[PLAYER] performAttack() SUCCESS - attack started');

      // Trigger attack callback
      if (this.onAttackCallback) {
        this.onAttackCallback((this as THREE.Group).position.clone());
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

    const dir = new THREE.Vector3(x, 0, z);
    return dir.length() > 0 ? dir.normalize() : dir;
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

    // Handle taser stun decay
    if (this.isTased && this.taseEscapeProgress > 0) {
      this.taseEscapeProgress = Math.max(0, this.taseEscapeProgress - (TASER_CONFIG.ESCAPE_DECAY * deltaTime));
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

    // Store current input for next frame
    if (inputChanged) {
      this.prevInput = { ...this.input };
    }

    // Apply move speed (reduced during taser stun, blocked during attack)
    let velocity: THREE.Vector3;
    if (this.isAttacking) {
      velocity = new THREE.Vector3(0, 0, 0);
    } else if (this.isTased) {
      // Allow slow crawling while tased - player can try to escape
      velocity = moveVector.clone().multiplyScalar(TASER_CONFIG.CRAWL_SPEED);
    } else {
      velocity = moveVector.clone().multiplyScalar(currentSpeed);
    }

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
      // Desired movement including gravity
      const desiredMovement = {
        x: velocity.x * deltaTime,
        y: this.verticalVelocity * deltaTime,
        z: velocity.z * deltaTime
      };

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
      const newPosition = {
        x: translation.x + correctedMovement.x,
        y: translation.y + correctedMovement.y,
        z: translation.z + correctedMovement.z
      };

      this.rigidBody.setNextKinematicTranslation(newPosition);

      // Sync visual position
      (this as THREE.Group).position.set(newPosition.x, newPosition.y, newPosition.z);
    }

    // Update animation mixer
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }
  }

  /**
   * Get player position
   */
  getPosition(): THREE.Vector3 {
    return (this as THREE.Group).position.clone();
  }

  /**
   * Get player facing direction (normalized vector in XZ plane)
   */
  getFacingDirection(): THREE.Vector3 {
    const direction = new THREE.Vector3(0, 0, 1);
    direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), (this as THREE.Group).rotation.y);
    return direction;
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
      console.log('[Player] Tased! Mash Space to escape!');
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
   * Handle Space key press for escaping taser
   */
  handleEscapePress(): void {
    if (this.isTased) {
      this.taseEscapeProgress = Math.min(100, this.taseEscapeProgress + TASER_CONFIG.ESCAPE_PER_PRESS);

      // Trigger screen shake feedback
      if (this.onEscapePressCallback) {
        this.onEscapePressCallback();
      }

      // Check if escaped
      if (this.taseEscapeProgress >= 100) {
        this.isTased = false;
        this.taseEscapeProgress = 0;
        this.taserImmunityTimer = TASER_CONFIG.IMMUNITY_DURATION;
        console.log('[Player] Escaped taser!');

        // Set jump cooldown to prevent Space mashing from triggering jumps
        this.jumpCooldown = 0.5; // 500ms cooldown

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
    console.log(`[ANIM] playSeatedAnimation called, mixer=${!!this.mixer}, anims=${this.animations.length}`);
    if (!this.mixer) return;

    // Lock to prevent movement overrides
    this.debugAnimationLock = true;

    // Debug: list all animation names
    console.log(`[ANIM] Available animations:`, this.animations.map(a => a.name));

    const clip = THREE.AnimationClip.findByName(this.animations, 'Melee_Blocking');
    if (!clip) {
      console.log(`[ANIM] Melee_Blocking not found!`);
      return;
    }

    // Debug: check clip details
    console.log(`[ANIM] Melee_Blocking clip details:`, {
      name: clip.name,
      duration: clip.duration,
      tracks: clip.tracks.length,
      trackNames: clip.tracks.map(t => t.name).slice(0, 5), // First 5 track names
    });

    // Stop all and play looping
    this.mixer.stopAllAction();
    const action = this.mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.reset();
    action.play();

    // Debug: check action state
    console.log(`[ANIM] Action state:`, {
      isRunning: action.isRunning(),
      enabled: action.enabled,
      weight: action.weight,
      timeScale: action.timeScale,
      time: action.time,
    });

    this.currentAnimation = 'Melee_Blocking';

    // Debug: check action again after a frame
    setTimeout(() => {
      console.log(`[ANIM] Action state after 100ms:`, {
        isRunning: action.isRunning(),
        enabled: action.enabled,
        weight: action.weight,
        time: action.time,
      });
    }, 100);
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
    console.log(`[ANIM] Player: ${name}, mixer=${!!this.mixer}, anims=${this.animations.length}`);
    if (!this.mixer) {
      console.warn('[ANIM] No mixer - model not loaded yet');
      return;
    }
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

    // Cleanup model
    this.modelContainer.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
