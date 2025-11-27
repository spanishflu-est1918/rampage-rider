import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { AssetLoader } from '../core/AssetLoader';
import { AnimationHelper } from '../utils/AnimationHelper';
import { VehicleConfig, COLLISION_GROUPS, makeCollisionGroups } from '../constants';

export class Vehicle extends THREE.Group {
  private config: VehicleConfig;

  private rigidBody: RAPIER.RigidBody | null = null;
  private world: RAPIER.World | null = null;
  private collider: RAPIER.Collider | null = null;
  private characterController: RAPIER.KinematicCharacterController | null = null;

  private modelContainer: THREE.Group;
  private modelLoaded: boolean = false;
  private wheels: THREE.Object3D[] = [];
  private frontWheels: THREE.Object3D[] = [];
  private rearWheels: THREE.Object3D[] = [];
  private currentSteeringAngle: number = 0;
  private readonly maxSteeringAngle: number = Math.PI / 6; // 30 degrees max steering
  private readonly steeringSpeed: number = 8; // How fast steering responds

  private health: number;
  private maxHealth: number;
  private maxSpeed: number;
  private currentSpeed: number = 0;
  private isDestroyed: boolean = false;

  private readonly acceleration: number = 15;
  private readonly deceleration: number = 20;

  private movementCollisionFilter: number = 0; // Set in constructor based on config

  private input = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

  private onDestroyedCallback: (() => void) | null = null;

  // Track previous rotation for swept collision detection
  private previousRotationY: number = 0;

  // Pre-allocated vectors (reused every frame to avoid GC pressure)
  private readonly _tempDirection: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempVelocity: THREE.Vector3 = new THREE.Vector3();

  constructor(config: VehicleConfig) {
    super();

    this.config = config;
    this.health = config.maxHealth;
    this.maxHealth = config.maxHealth;
    this.maxSpeed = config.speed;

    // Set collision filter - trucks that crush buildings don't collide with them
    if (config.canCrushBuildings) {
      // Only collide with ground (not buildings)
      this.movementCollisionFilter =
        (COLLISION_GROUPS.GROUND << 16) | COLLISION_GROUPS.VEHICLE;
    } else {
      // Normal vehicles collide with ground and buildings
      this.movementCollisionFilter =
        ((COLLISION_GROUPS.GROUND | COLLISION_GROUPS.BUILDING) << 16) |
        COLLISION_GROUPS.VEHICLE;
    }

    this.modelContainer = new THREE.Group();
    this.modelContainer.position.y = 0;
    (this as THREE.Group).add(this.modelContainer);

    this.loadModel();
  }

  getTypeName(): string {
    return this.config.name;
  }

  getKillRadius(): number {
    return this.config.killRadius;
  }

  /**
   * Get collision box dimensions (half-extents) for box-based collision
   */
  getColliderDimensions(): { width: number; length: number } {
    return {
      width: this.config.colliderWidth,
      length: this.config.colliderLength,
    };
  }

  causesRagdoll(): boolean {
    return this.config.causesRagdoll;
  }

  getRiderConfig(): { offsetY: number; offsetZ: number; hideRider: boolean } {
    return {
      offsetY: this.config.riderOffsetY,
      offsetZ: this.config.riderOffsetZ,
      hideRider: this.config.hideRider,
    };
  }

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
      // Disable real shadows (shadow mapping disabled for performance)
      AnimationHelper.setupShadows(model, false, false);

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

      this.modelContainer.add(model);
      this.modelLoaded = true;

      // DEBUG boxes removed for performance

      // Find wheel objects for rotation animation
      this.wheels = [];
      this.frontWheels = [];
      this.rearWheels = [];
      model.traverse((child) => {
        if (child.name) {
          const name = child.name.toLowerCase();
          if ((name.includes('tire') || name.includes('spokes')) &&
              !name.includes('pattern')) {
            this.wheels.push(child);
            // Categorize as front or rear wheel based on name
            if (name.includes('front') || name.includes('_f_') || name.includes('_f.')) {
              this.frontWheels.push(child);
            } else if (name.includes('rear') || name.includes('back') || name.includes('_r_') || name.includes('_r.')) {
              this.rearWheels.push(child);
            }
          }
        }
      });

      // If no wheels were categorized by name, use Z position to determine front/rear
      if (this.frontWheels.length === 0 && this.rearWheels.length === 0 && this.wheels.length > 0) {
        // Get world positions of all wheels
        const wheelPositions: { wheel: THREE.Object3D; z: number }[] = [];
        for (const wheel of this.wheels) {
          const worldPos = new THREE.Vector3();
          wheel.getWorldPosition(worldPos);
          wheelPositions.push({ wheel, z: worldPos.z });
        }

        // Sort by Z position (in model space, lower Z is typically front)
        wheelPositions.sort((a, b) => a.z - b.z);

        // First half are front wheels, second half are rear
        const midpoint = Math.floor(wheelPositions.length / 2);
        for (let i = 0; i < wheelPositions.length; i++) {
          if (i < midpoint) {
            this.frontWheels.push(wheelPositions[i].wheel);
          } else {
            this.rearWheels.push(wheelPositions[i].wheel);
          }
        }
      }
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
    fallbackMesh.castShadow = false; // Shadow mapping disabled
    fallbackMesh.position.y = this.config.colliderHeight;
    this.modelContainer.add(fallbackMesh);
    this.modelLoaded = true;
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
    // Membership: VEHICLE group
    // Filter: can collide with GROUND, PEDESTRIAN, BUILDING
    const vehicleFilter = COLLISION_GROUPS.GROUND | COLLISION_GROUPS.PEDESTRIAN | COLLISION_GROUPS.BUILDING;
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      this.config.colliderWidth,
      this.config.colliderHeight,
      this.config.colliderLength
    ).setCollisionGroups(makeCollisionGroups(COLLISION_GROUPS.VEHICLE, vehicleFilter));

    this.collider = world.createCollider(colliderDesc, this.rigidBody);

    // Create character controller for collision handling
    this.characterController = world.createCharacterController(0.01);
    this.characterController.enableAutostep(0.3, 0.1, true);
    this.characterController.enableSnapToGround(0.3);

    (this as THREE.Group).position.copy(position);
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

    // Reuse pre-allocated vector
    this._tempDirection.set(x, 0, z);
    return this._tempDirection.length() > 0 ? this._tempDirection.normalize() : this._tempDirection;
  }

  /**
   * Update vehicle movement
   */
  update(deltaTime: number): void {
    if (!this.rigidBody || this.isDestroyed) return;

    // Store previous rotation for swept collision detection
    this.previousRotationY = (this as THREE.Group).rotation.y;

    const translation = this.rigidBody.translation();
    const moveVector = this.getMovementDirection();
    const isMoving = moveVector.length() > 0;

    // Accelerate or decelerate
    if (isMoving) {
      // Accelerate towards max speed
      this.currentSpeed = Math.min(
        this.maxSpeed,
        this.currentSpeed + this.acceleration * deltaTime
      );
    } else {
      // Decelerate (friction/braking)
      this.currentSpeed = Math.max(
        0,
        this.currentSpeed - this.deceleration * deltaTime
      );
    }

    // Calculate velocity using current speed (reuse pre-allocated vector)
    this._tempVelocity.copy(moveVector).multiplyScalar(this.currentSpeed);
    const velocity = this._tempVelocity;

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

    // Calculate target steering angle based on input
    let targetSteeringAngle = 0;
    if (this.input.left) targetSteeringAngle = this.maxSteeringAngle;
    if (this.input.right) targetSteeringAngle = -this.maxSteeringAngle;

    // Smoothly interpolate steering angle
    const steeringDelta = targetSteeringAngle - this.currentSteeringAngle;
    this.currentSteeringAngle += steeringDelta * Math.min(1, this.steeringSpeed * deltaTime);

    // Rotate wheels based on velocity
    if (this.wheels.length > 0) {
      // Wheel rotation speed based on velocity magnitude
      // Assuming wheel radius ~0.3m, rotation = distance / radius
      const wheelRadius = 0.3;
      const distance = velocity.length() * deltaTime;
      const rotationAngle = distance / wheelRadius;

      // Wheel animation disabled for performance
    }
  }

  /**
   * Take damage (from cop gunfire)
   */
  takeDamage(amount: number): void {
    if (this.isDestroyed) return;

    this.health = Math.max(0, this.health - amount);
    this.flashDamage();

    if (this.health <= 0) {
      this.explode();
    }
  }

  /**
   * Take damage from a specific position (for directional vulnerability)
   * Truck only takes damage from sides and back
   */
  takeDamageFromPosition(amount: number, attackerPosition: THREE.Vector3): boolean {
    if (this.isDestroyed) return false;

    // For truck, check if attack comes from vulnerable direction
    if (this.config.canCrushBuildings) {
      const vehiclePos = this.getPosition();
      const toAttacker = new THREE.Vector3()
        .subVectors(attackerPosition, vehiclePos)
        .normalize();

      // Get vehicle's forward direction
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyQuaternion((this as THREE.Group).quaternion);

      // Dot product: 1 = same direction (front), -1 = opposite (back), 0 = perpendicular (side)
      const dot = forward.dot(toAttacker);

      // Only take damage if attack is from sides (|dot| < 0.5) or back (dot < -0.3)
      const isVulnerable = Math.abs(dot) < 0.5 || dot < -0.3;

      if (!isVulnerable) {
        // Attack from front - no damage, but show blocked effect
        return false;
      }
    }

    this.takeDamage(amount);
    return true;
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
   * Get vehicle position (reference - do not modify!)
   * Returns the actual position vector to avoid per-frame allocation
   */
  getPosition(): THREE.Vector3 {
    return (this as THREE.Group).position;
  }

  /**
   * Get current velocity
   */
  getVelocity(): THREE.Vector3 {
    const moveDir = this.getMovementDirection();
    return moveDir.multiplyScalar(this.currentSpeed);
  }

  /**
   * Get vehicle rotation Y (facing direction)
   */
  getRotationY(): number {
    return (this as THREE.Group).rotation.y;
  }

  /**
   * Get previous frame's rotation Y (for swept collision)
   */
  getPreviousRotationY(): number {
    return this.previousRotationY;
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
  }
}
