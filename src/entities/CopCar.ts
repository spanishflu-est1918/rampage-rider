import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import * as YUKA from 'yuka';
import { AssetLoader } from '../core/AssetLoader';
import { AnimationHelper } from '../utils/AnimationHelper';
import { BlobShadow, createBlobShadow } from '../rendering/BlobShadow';
import { COP_CAR_CONFIG, COLLISION_GROUPS } from '../constants';

/**
 * CopCar Entity
 *
 * Police car that:
 * - Spawns when player is in sedan or truck (high tier vehicles)
 * - Chases player at high speed
 * - Rams player vehicle for heavy damage
 * - Gets trampled by truck (instant kill)
 */
export class CopCar extends THREE.Group {
  private rigidBody: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private world: RAPIER.World;
  private modelLoaded: boolean = false;
  private modelContainer: THREE.Group;
  private vehicleModel: THREE.Group | null = null;

  // Yuka AI
  private yukaVehicle: YUKA.Vehicle;
  private yukaEntityManager: YUKA.EntityManager;
  private seekBehavior: YUKA.SeekBehavior;

  // State
  private isDead: boolean = false;
  private health: number = COP_CAR_CONFIG.HEALTH;
  private maxHealth: number = COP_CAR_CONFIG.HEALTH;
  private isHitStunned: boolean = false;
  private hitStunTimer: number = 0;
  private attackCooldown: number = 0;

  // Movement
  private maxSpeed: number = COP_CAR_CONFIG.MAX_SPEED;
  private currentSpeed: number = 0;
  private lastTarget: THREE.Vector3 | null = null;

  // Callbacks
  private onDealDamage?: (damage: number, attackerPosition: THREE.Vector3) => void;

  // Blob shadow
  private blobShadow: BlobShadow;

  // Pre-allocated vectors
  private readonly _tempPosition: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempDirection: THREE.Vector3 = new THREE.Vector3();
  // PERF: Pre-allocated for getPosition() return value
  private readonly _positionResult: THREE.Vector3 = new THREE.Vector3();
  private static readonly RAM_DISTANCE_SQ =
    COP_CAR_CONFIG.RAM_DISTANCE * COP_CAR_CONFIG.RAM_DISTANCE;

  constructor(
    position: THREE.Vector3,
    world: RAPIER.World,
    entityManager: YUKA.EntityManager
  ) {
    super();

    this.world = world;
    this.yukaEntityManager = entityManager;

    // Create model container
    this.modelContainer = new THREE.Group();
    (this as THREE.Group).add(this.modelContainer);

    // Create Yuka vehicle for AI steering
    this.yukaVehicle = new YUKA.Vehicle();
    this.yukaVehicle.position.set(position.x, 0, position.z);
    this.yukaVehicle.maxSpeed = this.maxSpeed;
    this.yukaVehicle.maxForce = COP_CAR_CONFIG.MAX_FORCE;
    this.yukaVehicle.updateOrientation = false;

    // Only use seek behavior
    this.seekBehavior = new YUKA.SeekBehavior(new YUKA.Vector3(position.x, 0, position.z));
    this.seekBehavior.weight = 1.0;
    this.yukaVehicle.steering.add(this.seekBehavior);

    this.yukaEntityManager.add(this.yukaVehicle);

    // Create physics body
    this.rigidBody = this.createPhysicsBody(world, position);
    this.collider = this.rigidBody.collider(0);

    // Create blob shadow (larger for car)
    this.blobShadow = createBlobShadow(2.5);
    this.blobShadow.position.set(position.x, 0.01, position.z);

    // Load model
    this.loadModel();
  }

  private createPhysicsBody(world: RAPIER.World, position: THREE.Vector3): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(position.x, position.y, position.z);
    const body = world.createRigidBody(bodyDesc);

    // Collision groups: member of COP_BIKE (reuse), collides with GROUND and BUILDING
    const collisionGroups =
      ((COLLISION_GROUPS.GROUND | COLLISION_GROUPS.BUILDING) << 16) |
      COLLISION_GROUPS.COP_BIKE;

    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      COP_CAR_CONFIG.colliderWidth,
      COP_CAR_CONFIG.colliderHeight,
      COP_CAR_CONFIG.colliderLength
    )
      .setCollisionGroups(collisionGroups)
      .setTranslation(0, COP_CAR_CONFIG.colliderHeight, 0);

    world.createCollider(colliderDesc, body);
    return body;
  }

  private async loadModel(): Promise<void> {
    try {
      const assetLoader = AssetLoader.getInstance();

      // Use pre-cloned vehicle from pool (cloned during preload, instant at runtime!)
      const precloned = assetLoader.getPreClonedVehicle(COP_CAR_CONFIG.modelPath);

      if (!precloned) {
        console.error(`[CopCar] Model not available: ${COP_CAR_CONFIG.modelPath}`);
        this.createFallbackMesh();
        return;
      }

      const model = precloned.scene;
      this.vehicleModel = model;
      AnimationHelper.setupShadows(model, false, false);

      // Apply scale and rotation
      model.scale.setScalar(COP_CAR_CONFIG.modelScale);
      model.rotation.y = COP_CAR_CONFIG.modelRotationY;

      // Center model
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x = -center.x;
      model.position.z = -center.z;
      model.position.y = COP_CAR_CONFIG.modelOffsetY;

      // Apply police colors (black and white)
      model.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat.color) {
            // Alternate black/white for police look
            mat.color.setHex(0x111111); // Dark police car
          }
        }
      });

      this.modelContainer.add(model);
      this.modelLoaded = true;
    } catch (error) {
      console.error('[CopCar] Failed to load model:', error);
      this.createFallbackMesh();
    }
  }

  private createFallbackMesh(): void {
    const geometry = new THREE.BoxGeometry(1.6, 0.8, 3.0);
    const material = new THREE.MeshPhongMaterial({ color: 0x111111 });
    const fallbackMesh = new THREE.Mesh(geometry, material);
    fallbackMesh.position.y = 0.5;
    this.modelContainer.add(fallbackMesh);
    this.modelLoaded = true;
  }

  setDamageCallback(callback: (damage: number, attackerPosition: THREE.Vector3) => void): void {
    this.onDealDamage = callback;
  }

  setChaseTarget(target: THREE.Vector3): void {
    if (this.isDead) return;
    this.lastTarget = target;
    this.seekBehavior.target.set(target.x, 0, target.z);
  }

  takeDamage(amount: number): void {
    if (this.isDead) return;

    this.health -= amount;
    this.isHitStunned = true;
    this.hitStunTimer = COP_CAR_CONFIG.HIT_STUN_DURATION;

    AnimationHelper.flashWhite(this.modelContainer);

    if (this.health <= 0) {
      this.die();
    }
  }

  /**
   * Instant kill - for truck trampling
   */
  trample(): void {
    if (this.isDead) return;
    this.health = 0;
    this.die();
  }

  applyKnockback(fromPosition: THREE.Vector3, force: number): void {
    if (this.isDead) return;

    const currentPos = this.rigidBody.translation();
    this._tempDirection.set(
      currentPos.x - fromPosition.x,
      0,
      currentPos.z - fromPosition.z
    ).normalize();

    this.yukaVehicle.velocity.set(
      this._tempDirection.x * force,
      0,
      this._tempDirection.z * force
    );

    this.isHitStunned = true;
    this.hitStunTimer = COP_CAR_CONFIG.HIT_STUN_DURATION * 2;
  }

  private die(): void {
    this.isDead = true;
    this.yukaVehicle.maxSpeed = 0;
    this.yukaVehicle.steering.clear();

    // Flip and explode animation
    const flipDuration = 600;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / flipDuration, 1);

      this.modelContainer.rotation.z = progress * Math.PI * 2;
      this.modelContainer.position.y = Math.sin(progress * Math.PI) * 3;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setTimeout(() => {
          (this as THREE.Group).visible = false;
        }, 500);
      }
    };

    animate();
  }

  update(deltaTime: number): void {
    if (!this.modelLoaded || this.isDead) return;

    // Update hit stun
    if (this.hitStunTimer > 0) {
      this.hitStunTimer -= deltaTime;
      if (this.hitStunTimer <= 0) {
        this.isHitStunned = false;
      }
    }

    // Update attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }

    // Get current position
    const currentPos = this.rigidBody.translation();
    this._tempPosition.set(currentPos.x, currentPos.y, currentPos.z);

    // Calculate distance to target
    let distanceToTargetSq = Infinity;
    if (this.lastTarget) {
      distanceToTargetSq = this._tempPosition.distanceToSquared(this.lastTarget);
    }

    // Check for ram attack
    if (distanceToTargetSq <= CopCar.RAM_DISTANCE_SQ && this.attackCooldown <= 0) {
      this.ramAttack();
    }

    // Don't move while stunned
    if (this.isHitStunned) {
      this.currentSpeed = Math.max(0, this.currentSpeed - COP_CAR_CONFIG.DECELERATION * deltaTime);
      return;
    }

    // Update speed
    if (this.currentSpeed < this.maxSpeed) {
      this.currentSpeed = Math.min(this.maxSpeed, this.currentSpeed + COP_CAR_CONFIG.ACCELERATION * deltaTime);
    }

    // Get desired position from Yuka
    const desiredX = this.yukaVehicle.position.x;
    const desiredZ = this.yukaVehicle.position.z;

    // Calculate movement delta
    const deltaX = desiredX - currentPos.x;
    const deltaZ = desiredZ - currentPos.z;

    const maxMove = this.currentSpeed * deltaTime;
    const moveLenSq = deltaX * deltaX + deltaZ * deltaZ;
    const maxMoveSq = maxMove * maxMove;

    let moveX = deltaX;
    let moveZ = deltaZ;
    if (moveLenSq > maxMoveSq && moveLenSq > 0) {
      const scale = maxMove / Math.sqrt(moveLenSq);
      moveX *= scale;
      moveZ *= scale;
    }

    const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ);

    // Apply movement
    const newPosition = {
      x: currentPos.x + moveX,
      y: Math.max(0.3, currentPos.y - 0.1 * deltaTime),
      z: currentPos.z + moveZ,
    };

    this.rigidBody.setNextKinematicTranslation(newPosition);
    (this as THREE.Group).position.set(newPosition.x, newPosition.y, newPosition.z);

    // Update blob shadow
    this.blobShadow.position.set(newPosition.x, 0.01, newPosition.z);

    // Update Yuka position
    this.yukaVehicle.position.set(newPosition.x, 0, newPosition.z);

    // Face movement direction
    if (moveLen > 0.01) {
      const angle = Math.atan2(moveX, moveZ);
      (this as THREE.Group).rotation.y = angle;
    }
  }

  private ramAttack(): void {
    this.attackCooldown = COP_CAR_CONFIG.RAM_COOLDOWN;

    AnimationHelper.flashWhite(this.modelContainer);

    if (this.onDealDamage) {
      this.onDealDamage(COP_CAR_CONFIG.RAM_DAMAGE, this.getPosition());
    }
  }

  getPosition(): THREE.Vector3 {
    const pos = this.rigidBody.translation();
    return this._positionResult.set(pos.x, pos.y, pos.z);
  }

  getPositionInto(out: THREE.Vector3): THREE.Vector3 {
    const pos = this.rigidBody.translation();
    return out.set(pos.x, pos.y, pos.z);
  }

  getBlobShadow(): BlobShadow {
    return this.blobShadow;
  }

  isDeadState(): boolean {
    return this.isDead;
  }

  getHealth(): number {
    return this.health;
  }

  getMaxHealth(): number {
    return this.maxHealth;
  }

  getPointValue(): number {
    return COP_CAR_CONFIG.POINT_VALUE;
  }

  dispose(): void {
    this.yukaEntityManager.remove(this.yukaVehicle);

    if (this.rigidBody && this.world) {
      this.world.removeRigidBody(this.rigidBody);
    }

    if (this.vehicleModel) {
      this.modelContainer.remove(this.vehicleModel);
      AssetLoader.getInstance().returnVehicleToPool(COP_CAR_CONFIG.modelPath, this.vehicleModel);
      this.vehicleModel = null;
    }
  }
}
