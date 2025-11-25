import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { AssetLoader } from '../core/AssetLoader';
import { AnimationHelper } from '../utils/AnimationHelper';
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

  // Attack callback
  private onAttackCallback: ((position: THREE.Vector3) => void) | null = null;

  // Taser escape callback (for screen shake feedback)
  private onEscapePressCallback: (() => void) | null = null;

  // Taser escape explosion callback (knockback nearby cops)
  private onTaserEscapeCallback: ((position: THREE.Vector3, radius: number, force: number) => void) | null = null;

  constructor() {
    super();

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
  private playAnimation(clipName: string, fadeIn: number): void {
    if (!this.mixer || this.animations.length === 0) return;

    // Find animation clip
    const clip = THREE.AnimationClip.findByName(this.animations, clipName);
    if (!clip) return;

    // Stop all current actions and play new one
    this.mixer.stopAllAction();
    const action = this.mixer.clipAction(clip);
    action.fadeIn(fadeIn);
    action.play();

    this.currentAnimation = clipName;
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

    // Handle taser escape with SPACE (attack input)
    // When tased, SPACE is used for escape instead of attack
    if (this.isTased && this.input.attack && !this.prevInput.attack) {
      this.handleEscapePress();
    }

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

    // Attack as overlay (plays on top of base animation)
    if (this.input.attack && !this.prevInput.attack && !this.isDead) {
      // Only start if not already attacking
      if (!this.isAttacking) {
        // Randomize attack animation
        const attackAnimations = [
          'Melee_1H_Attack_Stab',
          'Melee_1H_Attack_Chop',
          'Melee_1H_Attack_Jump_Chop'
        ];
        const randomAttack = attackAnimations[Math.floor(Math.random() * attackAnimations.length)];

        const clip = THREE.AnimationClip.findByName(this.animations, randomAttack);
        if (clip) {
          this.attackAction = this.mixer!.clipAction(clip);
          this.attackAction.setLoop(THREE.LoopOnce, 1);
          this.attackAction.clampWhenFinished = false; // Don't clamp - let it finish cleanly
          this.attackAction.timeScale = 2.0;
          this.attackAction.reset();
          this.attackAction.play();

          this.isAttacking = true;
          // Set max attack duration (500ms) as safety timeout
          this.attackTimer = 0.5;

          if (this.onAttackCallback) {
            this.onAttackCallback((this as THREE.Group).position.clone());
          }
        }
      }
    }

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

      // Compute movement accounting for obstacles
      this.characterController.computeColliderMovement(this.collider, desiredMovement);

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
