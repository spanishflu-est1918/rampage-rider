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
  private attackAnimationName: string = 'drop_running'; // Default attack animation

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
      this.animations = gltf.animations;

      // Play idle animation by default
      this.playAnimation('idle', 0.3);

      this.modelLoaded = true;

      console.log('[Player] Boxman model loaded with', this.animations.length, 'animations');
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
   * Set attack animation name
   */
  setAttackAnimation(animName: string): void {
    this.attackAnimationName = animName;
    console.log('[Player] Attack animation set to:', animName);
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
    if (this.input.jump && this.isGrounded && !this.prevInput.jump) {
      this.verticalVelocity = this.jumpForce;
      this.isGrounded = false;
      console.log('[Player] Jump!');
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

    // Update animation based on state priority
    if (this.input.attack) {
      // Attack - play selected attack animation
      if (this.currentAnimation !== this.attackAnimationName) {
        this.playAnimation(this.attackAnimationName, 0.05);
      }
    } else if (!this.isGrounded && this.currentAnimation !== 'jump_running') {
      this.playAnimation('jump_running', 0.1);
    } else if (isMoving && !this.isWalking && this.currentAnimation !== 'sprint') {
      // Default movement = sprint animation
      this.playAnimation('sprint', 0.1);
    } else if (this.isWalking && this.currentAnimation !== 'run') {
      // Shift held = walk/run animation (slower)
      this.playAnimation('run', 0.1);
    } else if (!isMoving && this.isGrounded && this.currentAnimation !== 'idle') {
      this.playAnimation('idle', 0.1);
    }

    // Store current input for next frame
    if (inputChanged) {
      this.prevInput = { ...this.input };
    }

    // Apply move speed
    const velocity = moveVector.multiplyScalar(currentSpeed);

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
