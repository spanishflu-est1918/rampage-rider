import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import * as YUKA from 'yuka';
import { AssetLoader } from '../core/AssetLoader';
import { AnimationHelper } from '../utils/AnimationHelper';
import { BlobShadow, createBlobShadow } from '../rendering/BlobShadow';
import { VEHICLE_CONFIGS, VehicleType, COLLISION_GROUPS } from '../constants';

/**
 * BikeCop Entity
 *
 * Police officer on bicycle that:
 * - Spawns when player is on bicycle (Tier.BIKE)
 * - Chases player using Yuka seek behavior
 * - Tases player when within close range
 * - Faster than regular cops but slower than player bike
 */
export class BikeCop extends THREE.Group {
  private rigidBody: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private world: RAPIER.World;
  private modelLoaded: boolean = false;
  private modelContainer: THREE.Group;
  private wheels: THREE.Object3D[] = [];
  private bikeModel: THREE.Group | null = null;

  // Yuka AI (only seek behavior for performance)
  private yukaVehicle: YUKA.Vehicle;
  private yukaEntityManager: YUKA.EntityManager;
  private seekBehavior: YUKA.SeekBehavior;

  // State
  private isDead: boolean = false;
  private health: number = 4;
  private maxHealth: number = 4;
  private isHitStunned: boolean = false;
  private hitStunTimer: number = 0;
  private attackCooldown: number = 0;

  // Movement
  private maxSpeed: number = 11; // Slightly slower than player bike (14)
  private currentSpeed: number = 0;
  private lastTarget: THREE.Vector3 | null = null;

  // Rider
  private riderMixer: THREE.AnimationMixer | null = null;
  private riderModel: THREE.Group | null = null;
  private riderAnimations: THREE.AnimationClip[] = [];
  private currentAction: THREE.AnimationAction | null = null;
  private seatedAction: THREE.AnimationAction | null = null;
  private riderType: string | null = null;

  // Scene reference (kept for interface compatibility)
  private parentScene: THREE.Scene | null = null;

  // Callbacks
  private onDealDamage?: (damage: number) => void;

  // Blob shadow
  private blobShadow: BlobShadow;

  // Pre-allocated vectors
  private readonly _tempPosition: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempDirection: THREE.Vector3 = new THREE.Vector3();
  private readonly _positionResult: THREE.Vector3 = new THREE.Vector3();

  // Config
  private static readonly RAM_RANGE = 2.0; // Close range ram attack
  private static readonly RAM_RANGE_SQ = BikeCop.RAM_RANGE * BikeCop.RAM_RANGE;
  private static readonly RAM_COOLDOWN = 1.5;
  private static readonly RAM_DAMAGE = 10; // Damage to vehicle
  private static readonly HIT_STUN_DURATION = 0.6;
  private static readonly ACCELERATION = 15;
  private static readonly DECELERATION = 25;
  private static readonly MAX_FORCE = 20.0;

  // Sprint burst - become threatening when close
  private static readonly SPRINT_DISTANCE = 10; // Trigger sprint when within 10 units
  private static readonly SPRINT_DISTANCE_SQ = BikeCop.SPRINT_DISTANCE * BikeCop.SPRINT_DISTANCE;
  private static readonly SPRINT_SPEED = 15; // Faster than player bike (14) when sprinting
  private static readonly BASE_SPEED = 11; // Normal chase speed

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
    this.yukaVehicle.maxForce = BikeCop.MAX_FORCE;
    this.yukaVehicle.updateOrientation = false;

    // Only use seek behavior (O(1) not O(n²))
    this.seekBehavior = new YUKA.SeekBehavior(new YUKA.Vector3(position.x, 0, position.z));
    this.seekBehavior.weight = 1.0;
    this.yukaVehicle.steering.add(this.seekBehavior);

    this.yukaEntityManager.add(this.yukaVehicle);

    // Create physics body
    this.rigidBody = this.createPhysicsBody(world, position);
    this.collider = this.rigidBody.collider(0);

    // Create blob shadow
    this.blobShadow = createBlobShadow(1.2);
    this.blobShadow.position.set(position.x, 0.01, position.z);

    // Load model
    this.loadModel();
  }

  private createPhysicsBody(world: RAPIER.World, position: THREE.Vector3): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(position.x, position.y, position.z);
    const body = world.createRigidBody(bodyDesc);

    // Collision groups: member of COP_BIKE, collides with GROUND and BUILDING
    const collisionGroups =
      ((COLLISION_GROUPS.GROUND | COLLISION_GROUPS.BUILDING) << 16) |
      COLLISION_GROUPS.COP_BIKE;

    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.3, 0.5, 0.7)
      .setCollisionGroups(collisionGroups)
      .setTranslation(0, 0.5, 0);

    world.createCollider(colliderDesc, body);
    return body;
  }

  private loadModel(): void {
    try {
      const assetLoader = AssetLoader.getInstance();
      const bikeConfig = VEHICLE_CONFIGS[VehicleType.BICYCLE];

      // Use pre-cloned vehicle from pool (cloned during preload, instant at runtime!)
      const precloned = assetLoader.getPreClonedVehicle(bikeConfig.modelPath);

      if (!precloned) {
        console.error(`[BikeCop] Model not available: ${bikeConfig.modelPath}`);
        this.createFallbackMesh();
        return;
      }

      const model = precloned.scene;
      this.bikeModel = model;
      AnimationHelper.setupShadows(model, false, false);

      // Apply scale and rotation
      model.scale.setScalar(bikeConfig.modelScale);
      model.rotation.y = bikeConfig.modelRotationY;

      // Center model
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x = -center.x;
      model.position.z = -center.z;
      model.position.y = bikeConfig.modelOffsetY;

      // Apply police colors (darker blue tint)
      model.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat.color) {
            mat.color.setHex(0x0044aa); // Police blue
          }
        }
      });

      this.modelContainer.add(model);

      // Find wheels
      model.traverse((child) => {
        if (child.name) {
          const name = child.name.toLowerCase();
          if (name.includes('tire') || name.includes('wheel') || name.includes('spokes')) {
            this.wheels.push(child);
          }
        }
      });

      // Load rider
      this.loadRider();

      this.modelLoaded = true;
    } catch (error) {
      console.error('[BikeCop] Failed to load model:', error);
      this.createFallbackMesh();
    }
  }

  private loadRider(): void {
    try {
      const assetLoader = AssetLoader.getInstance();
      const copModels = ['BlueSoldier_Male', 'Soldier_Male', 'BlueSoldier_Female', 'Soldier_Female'];
      const randomCop = copModels[Math.floor(Math.random() * copModels.length)];

      // Use pre-cloned cop rider from pool (cloned during preload, instant at runtime!)
      const precloned = assetLoader.getPreClonedCopRider(randomCop);
      if (!precloned) {
        console.warn(`[BikeCop] Rider model not available: ${randomCop}`);
        return;
      }

      const rider = precloned.scene;
      const animations = precloned.animations;

      // Scale and position rider on bicycle
      rider.scale.setScalar(1.0); // Normal scale since bike is scaled via modelScale
      rider.position.set(0, 0.5, -0.2); // On seat
      rider.rotation.y = 0;

      AnimationHelper.setupShadows(rider, false, false);

      // Setup animation mixer
      this.riderMixer = new THREE.AnimationMixer(rider);
      this.riderAnimations = animations || [];

      if (this.riderAnimations.length > 0) {
        // Try to find seated animation
        const seatedAnim = this.riderAnimations.find(
          (clip: THREE.AnimationClip) => clip.name === 'Seated_Bike' || clip.name === 'SitDown'
        );

        if (seatedAnim) {
          this.seatedAction = this.riderMixer.clipAction(seatedAnim);
          this.seatedAction.setLoop(THREE.LoopOnce, 1);
          this.seatedAction.clampWhenFinished = true;
          this.seatedAction.play();
          this.riderMixer.update(10); // Jump to seated pose
          this.currentAction = this.seatedAction;
        }
      }

      this.riderModel = rider;
      this.riderType = randomCop;
      this.modelContainer.add(rider);
    } catch (error) {
      console.error('[BikeCop] Failed to load rider:', error);
    }
  }

  private createFallbackMesh(): void {
    const geometry = new THREE.BoxGeometry(0.6, 0.8, 1.2);
    const material = new THREE.MeshPhongMaterial({ color: 0x0044aa });
    const fallbackMesh = new THREE.Mesh(geometry, material);
    fallbackMesh.position.y = 0.5;
    this.modelContainer.add(fallbackMesh);
    this.modelLoaded = true;
  }

  setParentScene(scene: THREE.Scene): void {
    this.parentScene = scene;
  }

  setDamageCallback(callback: (damage: number) => void): void {
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
    this.hitStunTimer = BikeCop.HIT_STUN_DURATION;

    AnimationHelper.flashWhite(this.modelContainer);

    if (this.health <= 0) {
      this.die();
    }
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
    this.hitStunTimer = BikeCop.HIT_STUN_DURATION * 2;
  }

  private die(): void {
    this.isDead = true;
    this.yukaVehicle.maxSpeed = 0;
    this.yukaVehicle.steering.clear();

    // Flip over animation
    const flipDuration = 400;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / flipDuration, 1);

      this.modelContainer.rotation.z = progress * Math.PI;
      this.modelContainer.position.y = Math.sin(progress * Math.PI) * 1.5;

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
    if (!this.modelLoaded) return;

    // Update rider animation
    if (this.riderMixer) {
      this.riderMixer.update(deltaTime);
    }

    if (this.isDead) return;

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

    // Check for ram attack (close range damage)
    if (distanceToTargetSq <= BikeCop.RAM_RANGE_SQ && this.attackCooldown <= 0 && this.lastTarget) {
      this.ramAttack();
    }

    // Sprint burst when close to target - become a real threat
    const targetSpeed =
      distanceToTargetSq <= BikeCop.SPRINT_DISTANCE_SQ
        ? BikeCop.SPRINT_SPEED
        : BikeCop.BASE_SPEED;
    this.maxSpeed = targetSpeed;
    this.yukaVehicle.maxSpeed = targetSpeed;

    // Don't move while stunned
    if (this.isHitStunned) {
      this.currentSpeed = Math.max(0, this.currentSpeed - BikeCop.DECELERATION * deltaTime);
      return;
    }

    // Update speed towards target speed
    if (this.currentSpeed < this.maxSpeed) {
      this.currentSpeed = Math.min(this.maxSpeed, this.currentSpeed + BikeCop.ACCELERATION * deltaTime);
    } else if (this.currentSpeed > this.maxSpeed) {
      this.currentSpeed = Math.max(this.maxSpeed, this.currentSpeed - BikeCop.DECELERATION * deltaTime);
    }

    // Get desired position from Yuka
    const desiredX = this.yukaVehicle.position.x;
    const desiredZ = this.yukaVehicle.position.z;

    // Calculate movement delta
    const deltaX = desiredX - currentPos.x;
    const deltaZ = desiredZ - currentPos.z;

    const moveLen = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
    const maxMove = this.currentSpeed * deltaTime;

    let moveX = deltaX;
    let moveZ = deltaZ;
    if (moveLen > maxMove) {
      const scale = maxMove / moveLen;
      moveX *= scale;
      moveZ *= scale;
    }

    // Apply movement (y = 0.7 to match player bike ground level)
    const newPosition = {
      x: currentPos.x + moveX,
      y: 0.7,
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

    // Wheel animation disabled for performance (matches player vehicle)
  }

  private ramAttack(): void {
    this.attackCooldown = BikeCop.RAM_COOLDOWN;

    // Play punch animation
    this.playAttackAnimation();

    // Flash to indicate attack
    AnimationHelper.flashWhite(this.modelContainer);

    if (this.onDealDamage) {
      this.onDealDamage(BikeCop.RAM_DAMAGE);
    }
  }

  private playAttackAnimation(): void {
    if (!this.riderMixer || this.riderAnimations.length === 0) return;

    // Find punch animation
    const punchAnim = THREE.AnimationClip.findByName(this.riderAnimations, 'Punch');
    if (!punchAnim) return;

    // Stop current and play punch
    this.riderMixer.stopAllAction();
    const action = this.riderMixer.clipAction(punchAnim);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.reset();
    action.play();
  }

  removeTaserBeam(): void {
    // No-op - kept for interface compatibility with BikeCopManager
  }

  getPosition(): THREE.Vector3 {
    // PERF: Reuse pre-allocated vector instead of allocating new one
    const pos = this.rigidBody.translation();
    return this._positionResult.set(pos.x, pos.y, pos.z);
  }

  getPositionInto(out: THREE.Vector3): THREE.Vector3 {
    const pos = this.rigidBody.translation();
    return out.set(pos.x, pos.y, pos.z);
  }

  getYukaVehicle(): YUKA.Vehicle {
    return this.yukaVehicle;
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

  isAttacking(): boolean {
    return this.attackCooldown > BikeCop.RAM_COOLDOWN - 0.3; // Recently attacked
  }

  dispose(): void {
    this.yukaEntityManager.remove(this.yukaVehicle);
    this.removeTaserBeam();

    if (this.rigidBody && this.world) {
      this.world.removeRigidBody(this.rigidBody);
    }

    if (this.riderMixer) {
      this.riderMixer.stopAllAction();
      this.riderMixer = null;
    }

    if (this.bikeModel) {
      this.modelContainer.remove(this.bikeModel);
      const bikeConfig = VEHICLE_CONFIGS[VehicleType.BICYCLE];
      AssetLoader.getInstance().returnVehicleToPool(bikeConfig.modelPath, this.bikeModel);
      this.bikeModel = null;
    }

    if (this.riderModel && this.riderType) {
      this.modelContainer.remove(this.riderModel);
      AssetLoader.getInstance().returnCopRiderToPool(this.riderType, this.riderModel as THREE.Group);
      this.riderModel = null;
      this.riderType = null;
    }
  }
}
