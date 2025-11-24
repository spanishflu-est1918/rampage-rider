import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Player - Basic 3D movement with camera-relative controls
 * Ported from Sketchbook character movement system
 */
export class Player extends THREE.Group {
  // Physics
  private rigidBody: RAPIER.RigidBody | null = null;
  private world: RAPIER.World | null = null;

  // Movement
  private walkSpeed: number = 4; // Slow walk when holding Shift
  private sprintSpeed: number = 7; // Default speed (character naturally sprints)
  private cameraDirection: THREE.Vector3 = new THREE.Vector3(0, 0, -1);
  private isWalking: boolean = false; // Shift slows down instead of speeding up
  private isAttacking: boolean = false; // Locks movement during attack animation

  // Taser stun state
  private isTased: boolean = false; // Player is being tased (immobilized)
  private taseEscapeProgress: number = 0; // 0-100, button mashing fills this
  private readonly taseEscapeDecay: number = 20; // Progress decays 20% per second
  private readonly taseEscapePerPress: number = 12; // Each Space press adds 12%

  // Jump
  private jumpForce: number = 5;
  private isGrounded: boolean = true;
  private verticalVelocity: number = 0;
  private gravity: number = -15;

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

  constructor() {
    super();

    // Sketchbook structure: tiltContainer > modelContainer > model
    this.tiltContainer = new THREE.Group();
    (this as THREE.Group).add(this.tiltContainer);

    // Model container positioned at -0.57 to ground the character
    this.modelContainer = new THREE.Group();
    this.modelContainer.position.y = -0.57;
    this.tiltContainer.add(this.modelContainer);

    // Load boxman model asynchronously
    this.loadModel();

    console.log('[Player] Created, loading boxman model...');
  }

  /**
   * Load the boxman GLTF model
   */
  private async loadModel(): Promise<void> {
    const loader = new GLTFLoader();

    try {
      const gltf = await loader.loadAsync('/assets/boxman.glb');

      // Setup model materials for shadows
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // Add to model container
      this.modelContainer.add(gltf.scene);

      // Setup animation mixer (matching Sketchbook line 102)
      this.mixer = new THREE.AnimationMixer(gltf.scene);
      this.mixer.timeScale = 1.5; // Speed up animations by 1.5x
      this.animations = gltf.animations;

      // Play idle animation by default
      this.playAnimation('Idle_A', 0.3);

      this.modelLoaded = true;

      console.log('[Player] Rogue model loaded with', this.animations.length, 'animations');
      console.log('[Player] Available animations:', this.animations.map(a => a.name).join(', '));
    } catch (error) {
      console.error('[Player] Failed to load boxman model:', error);

      // Fallback to simple capsule
      const geometry = new THREE.CapsuleGeometry(0.25, 0.5, 8, 16);
      const material = new THREE.MeshPhongMaterial({ color: 0x4444ff });
      const fallbackMesh = new THREE.Mesh(geometry, material);
      fallbackMesh.castShadow = true;
      this.modelContainer.add(fallbackMesh);
      this.modelLoaded = true;
    }
  }


  /**
   * Play animation by name (matching Sketchbook setAnimation - line 499)
   */
  private playAnimation(clipName: string, fadeIn: number): void {
    if (!this.mixer || this.animations.length === 0) return;

    // Find animation clip
    const clip = THREE.AnimationClip.findByName(this.animations, clipName);
    if (!clip) {
      console.warn(`[Player] Animation "${clipName}" not found`);
      return;
    }

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
  createPhysicsBody(world: RAPIER.World): void {
    this.world = world;

    // Create kinematic rigid body (we control velocity directly)
    // Spawn at Y=0.57 to compensate for modelContainer offset of -0.57
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicVelocityBased()
      .setTranslation(0, 0.57, 0);

    this.rigidBody = world.createRigidBody(bodyDesc);

    // Create capsule collider
    const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.3);
    world.createCollider(colliderDesc, this.rigidBody);

    console.log('[Player] Physics body at Y=0.57, visual model at Y=0 (ground)');
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

    // Handle taser stun decay
    if (this.isTased && this.taseEscapeProgress > 0) {
      this.taseEscapeProgress = Math.max(0, this.taseEscapeProgress - (this.taseEscapeDecay * deltaTime));
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

    // Handle jump (Sketchbook JumpRunning: jump force 4)
    // When tased, Space is used for escape instead of jump
    if (this.input.jump && !this.prevInput.jump) {
      if (this.isTased) {
        // Space key = escape from taser
        this.handleEscapePress();
      } else if (this.isGrounded) {
        // Normal jump
        this.verticalVelocity = this.jumpForce;
        this.isGrounded = false;
        console.log('[Player] Jump!');
      }
    }

    // Apply gravity
    if (!this.isGrounded) {
      this.verticalVelocity += this.gravity * deltaTime;
    }

    // Ground check (simple Y position check)
    if (translation.y <= 0.57 && this.verticalVelocity <= 0) {
      this.isGrounded = true;
      this.verticalVelocity = 0;
    }

    // Update base animation (movement)
    if (!this.isGrounded && this.currentAnimation !== 'Jump_Full_Short') {
      this.playAnimation('Jump_Full_Short', 0.1);
    } else if (isMoving && !this.isWalking && this.currentAnimation !== 'Running_A') {
      // Default movement = sprint animation
      this.playAnimation('Running_A', 0.1);
    } else if (this.isWalking && this.currentAnimation !== 'Walking_A') {
      // Shift held = walk animation (slower)
      this.playAnimation('Walking_A', 0.1);
    } else if (!isMoving && this.isGrounded && this.currentAnimation !== 'Idle_A') {
      this.playAnimation('Idle_A', 0.1);
    }

    // Attack as overlay (plays on top of base animation)
    if (this.input.attack && !this.prevInput.attack) {
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

    // Apply move speed (prevent movement during attack or taser stun)
    let velocity = moveVector.multiplyScalar(currentSpeed);
    if (this.isAttacking || this.isTased) {
      velocity.set(0, 0, 0);
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

    // Set Rapier velocity (kinematic body) with vertical component
    this.rigidBody.setLinvel(
      { x: velocity.x, y: this.verticalVelocity, z: velocity.z },
      true
    );

    // Sync visual position with physics
    (this as THREE.Group).position.set(translation.x, translation.y, translation.z);

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
   * Apply taser stun to player
   */
  applyTaserStun(): void {
    if (!this.isTased) {
      this.isTased = true;
      this.taseEscapeProgress = 0;
      console.log('[Player] Tased! Mash Space to escape!');
    }
  }

  /**
   * Handle Space key press for escaping taser
   */
  handleEscapePress(): void {
    if (this.isTased) {
      this.taseEscapeProgress = Math.min(100, this.taseEscapeProgress + this.taseEscapePerPress);
      console.log(`[Player] Escape progress: ${this.taseEscapeProgress.toFixed(1)}%`);

      // Check if escaped
      if (this.taseEscapeProgress >= 100) {
        this.isTased = false;
        this.taseEscapeProgress = 0;
        console.log('[Player] Escaped from taser!');
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
   * Set attack callback (called when player attacks)
   */
  setOnAttack(callback: (position: THREE.Vector3) => void): void {
    this.onAttackCallback = callback;
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
