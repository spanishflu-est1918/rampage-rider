import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { AssetLoader } from '../core/AssetLoader';
import { AnimationHelper } from '../utils/AnimationHelper';
import { VehicleConfig } from '../constants';

/**
 * Collision groups for vehicles
 */
const COLLISION_GROUPS = {
  GROUND: 0x0001,
  BUILDING: 0x0040,
  VEHICLE: 0x0080,
} as const;

/**
 * Vehicle - Generic driveable vehicle entity
 * Configured via VehicleConfig for different vehicle types (bicycle, motorbike, sedan)
 */
export class Vehicle extends THREE.Group {
  // Config
  private config: VehicleConfig;

  // Physics
  private rigidBody: RAPIER.RigidBody | null = null;
  private world: RAPIER.World | null = null;
  private collider: RAPIER.Collider | null = null;
  private characterController: RAPIER.KinematicCharacterController | null = null;

  // Visual
  private modelContainer: THREE.Group;
  private modelLoaded: boolean = false;

  // State
  private health: number;
  private maxHealth: number;
  private speed: number;
  private isDestroyed: boolean = false;

  // Movement collision filter (collide with GROUND and BUILDING, pass through cops/peds)
  private movementCollisionFilter: number =
    ((COLLISION_GROUPS.GROUND | COLLISION_GROUPS.BUILDING) << 16) |
    COLLISION_GROUPS.VEHICLE;

  // Input state
  private input = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

  // Callbacks
  private onDestroyedCallback: (() => void) | null = null;

  constructor(config: VehicleConfig) {
    super();

    this.config = config;
    this.health = config.maxHealth;
    this.maxHealth = config.maxHealth;
    this.speed = config.speed;

    // Model container
    this.modelContainer = new THREE.Group();
    this.modelContainer.position.y = 0;
    (this as THREE.Group).add(this.modelContainer);

    // Load vehicle model
    this.loadModel();
  }

  /**
   * Get vehicle type name
   */
  getTypeName(): string {
    return this.config.name;
  }

  /**
   * Get kill radius for pedestrian collision detection
   */
  getKillRadius(): number {
    return this.config.killRadius;
  }

  /**
   * Check if this vehicle causes ragdoll physics on kill
   */
  causesRagdoll(): boolean {
    return this.config.causesRagdoll;
  }

  /**
   * Get rider position config
   */
  getRiderConfig(): { offsetY: number; offsetZ: number; hideRider: boolean } {
    return {
      offsetY: this.config.riderOffsetY,
      offsetZ: this.config.riderOffsetZ,
      hideRider: this.config.hideRider,
    };
  }

  /**
   * Load the vehicle GLTF model from cache
   */
  private async loadModel(): Promise<void> {
    try {
      const assetLoader = AssetLoader.getInstance();
      const cachedGltf = assetLoader.getModel(this.config.modelPath);

      if (!cachedGltf) {
        console.error(`[Vehicle] Model not in cache: ${this.config.modelPath}`);
        this.createFallbackMesh();
        return;
      }

      // Clone the model scene
      const model = cachedGltf.scene.clone();

      // Setup shadows
      AnimationHelper.setupShadows(model);

      // Apply scale first (needed for accurate bounding box)
      model.scale.setScalar(this.config.modelScale);
      model.rotation.y = this.config.modelRotationY;

      // Auto-center the model based on bounding box
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());

      // Offset to center on X and Z, use config offset for Y
      model.position.x = -center.x;
      model.position.z = -center.z;
      model.position.y = this.config.modelOffsetY;

      console.log(`[Vehicle] ${this.config.name} auto-centered from (${center.x.toFixed(2)}, ${center.z.toFixed(2)})`);

      this.modelContainer.add(model);
      this.modelLoaded = true;

      console.log(`[Vehicle] ${this.config.name} model loaded successfully`);
    } catch (error) {
      console.error(`[Vehicle] Failed to load ${this.config.name} model:`, error);
      this.createFallbackMesh();
    }
  }

  /**
   * Create fallback box mesh when model loading fails
   */
  private createFallbackMesh(): void {
    const geometry = new THREE.BoxGeometry(
      this.config.colliderWidth * 2,
      this.config.colliderHeight * 2,
      this.config.colliderLength * 2
    );
    const material = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    const fallbackMesh = new THREE.Mesh(geometry, material);
    fallbackMesh.castShadow = true;
    fallbackMesh.position.y = this.config.colliderHeight;
    this.modelContainer.add(fallbackMesh);
    this.modelLoaded = true;
    console.log(`[Vehicle] ${this.config.name} using fallback mesh`);
  }

  /**
   * Create Rapier physics body
   */
  createPhysicsBody(world: RAPIER.World, position: THREE.Vector3): void {
    this.world = world;

    // Create kinematic position-based body
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(position.x, position.y, position.z);

    this.rigidBody = world.createRigidBody(bodyDesc);

    // Create box collider with config dimensions
    // Membership: 0x0080 (VEHICLE group)
    // Filter: 0x0045 (can collide with GROUND=0x0001, PEDESTRIAN=0x0004, BUILDING=0x0040)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      this.config.colliderWidth,
      this.config.colliderHeight,
      this.config.colliderLength
    ).setCollisionGroups(0x00450080);

    this.collider = world.createCollider(colliderDesc, this.rigidBody);

    // Create character controller for collision handling
    this.characterController = world.createCharacterController(0.01);
    this.characterController.enableAutostep(0.3, 0.1, true);
    this.characterController.enableSnapToGround(0.3);

    // Sync visual position
    (this as THREE.Group).position.copy(position);

    console.log(`[Vehicle] ${this.config.name} physics body created at`, position);
  }

  /**
   * Spawn vehicle at position
   */
  spawn(position: THREE.Vector3): void {
    if (this.rigidBody) {
      this.rigidBody.setTranslation(
        { x: position.x, y: position.y, z: position.z },
        true
      );
    }
    (this as THREE.Group).position.copy(position);
    this.health = this.maxHealth;
    this.isDestroyed = false;
    this.modelContainer.visible = true;
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
  }

  /**
   * Get movement direction (camera-relative)
   */
  private getMovementDirection(): THREE.Vector3 {
    let x = 0;
    let z = 0;

    if (this.input.up) z -= 1;
    if (this.input.down) z += 1;
    if (this.input.left) x -= 1;
    if (this.input.right) x += 1;

    const dir = new THREE.Vector3(x, 0, z);
    return dir.length() > 0 ? dir.normalize() : dir;
  }

  /**
   * Update vehicle movement
   */
  update(deltaTime: number): void {
    if (!this.rigidBody || this.isDestroyed) return;

    const translation = this.rigidBody.translation();
    const moveVector = this.getMovementDirection();
    const isMoving = moveVector.length() > 0;

    // Calculate velocity
    const velocity = moveVector.clone().multiplyScalar(this.speed);

    // Rotate vehicle to face movement direction (smooth rotation)
    if (isMoving) {
      const targetAngle = Math.atan2(moveVector.x, moveVector.z);
      const currentRotation = (this as THREE.Group).rotation.y;
      const maxRotation = this.config.turnSpeed * deltaTime;

      // Calculate shortest rotation direction
      let angleDiff = targetAngle - currentRotation;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      // Apply rotation (clamped to max rotation speed)
      const rotationChange = Math.max(-maxRotation, Math.min(maxRotation, angleDiff));
      (this as THREE.Group).rotation.y += rotationChange;
    }

    // Use character controller to compute movement with collisions
    if (this.characterController && this.collider) {
      const desiredMovement = {
        x: velocity.x * deltaTime,
        y: -0.1 * deltaTime,
        z: velocity.z * deltaTime,
      };

      this.characterController.computeColliderMovement(
        this.collider,
        desiredMovement,
        undefined,
        this.movementCollisionFilter
      );

      const correctedMovement = this.characterController.computedMovement();

      const newPosition = {
        x: translation.x + correctedMovement.x,
        y: Math.max(0.5, translation.y + correctedMovement.y),
        z: translation.z + correctedMovement.z,
      };

      this.rigidBody.setNextKinematicTranslation(newPosition);
      (this as THREE.Group).position.set(newPosition.x, newPosition.y, newPosition.z);
    }
  }

  /**
   * Take damage (from cop gunfire)
   */
  takeDamage(amount: number): void {
    if (this.isDestroyed) return;

    this.health = Math.max(0, this.health - amount);
    console.log(`[Vehicle] ${this.config.name} took ${amount} damage, health: ${this.health}/${this.maxHealth}`);

    this.flashDamage();

    if (this.health <= 0) {
      this.explode();
    }
  }

  /**
   * Flash red when damaged
   */
  private flashDamage(): void {
    this.modelContainer.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial;
        const originalEmissive = mat.emissive?.getHex() || 0;
        if (mat.emissive) {
          mat.emissive.setHex(0xff0000);
          mat.emissiveIntensity = 0.8;

          setTimeout(() => {
            mat.emissive.setHex(originalEmissive);
            mat.emissiveIntensity = 0;
          }, 100);
        }
      }
    });
  }

  /**
   * Explode the vehicle
   */
  private explode(): void {
    if (this.isDestroyed) return;

    this.isDestroyed = true;
    console.log(`[Vehicle] ${this.config.name} EXPLODED!`);

    const originalScale = this.modelContainer.scale.clone();
    this.modelContainer.scale.multiplyScalar(1.5);

    this.modelContainer.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat.emissive) {
          mat.emissive.setHex(0xffff00);
          mat.emissiveIntensity = 2;
        }
      }
    });

    setTimeout(() => {
      this.modelContainer.scale.copy(originalScale);
      this.modelContainer.visible = false;

      if (this.onDestroyedCallback) {
        this.onDestroyedCallback();
      }
    }, 200);
  }

  /**
   * Get vehicle position
   */
  getPosition(): THREE.Vector3 {
    return (this as THREE.Group).position.clone();
  }

  /**
   * Get current velocity
   */
  getVelocity(): THREE.Vector3 {
    const moveDir = this.getMovementDirection();
    return moveDir.multiplyScalar(this.speed);
  }

  /**
   * Get current health
   */
  getHealth(): number {
    return this.health;
  }

  /**
   * Get max health
   */
  getMaxHealth(): number {
    return this.maxHealth;
  }

  /**
   * Check if vehicle is destroyed
   */
  isDestroyedState(): boolean {
    return this.isDestroyed;
  }

  /**
   * Set destroyed callback
   */
  setOnDestroyed(callback: () => void): void {
    this.onDestroyedCallback = callback;
  }

  /**
   * Cleanup physics body and mesh
   */
  dispose(): void {
    if (this.rigidBody && this.world) {
      this.world.removeRigidBody(this.rigidBody);
      this.rigidBody = null;
    }

    this.modelContainer.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else if (child.material) {
          child.material.dispose();
        }
      }
    });

    console.log(`[Vehicle] ${this.config.name} disposed`);
  }
}
