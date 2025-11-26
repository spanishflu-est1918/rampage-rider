import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import * as YUKA from 'yuka';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AssetLoader } from '../core/AssetLoader';
import { AnimationHelper } from '../utils/AnimationHelper';
import { BlobShadow, createBlobShadow } from '../rendering/BlobShadow';
import { COP_BIKE_CONFIG, MOTORBIKE_COP_CONFIG } from '../constants';

/**
 * AI State for motorbike cops
 */
export enum MotorbikeCopState {
  PATROL = 'PATROL',      // Zig-zag patrol, waiting for player
  CHASE = 'CHASE',        // Pursuing player with weaving
  RAM = 'RAM',            // Close range - ramming attack
  STUNNED = 'STUNNED',    // After being hit
}

/**
 * Motorbike Cop Variant
 */
export enum MotorbikeCopVariant {
  SCOUT = 'SCOUT',        // First spawn at 25% heat
  SWARM = 'SWARM',        // Spawns in groups at 50% heat
  BOSS = 'BOSS',          // Heavy enforcer at 75% heat
}

/**
 * MotorbikeCop Entity
 *
 * Police officer on motorbike that:
 * - Spawns based on heat level thresholds
 * - Uses Yuka AI for pursuit/flanking behaviors
 * - Has states: Patrol, Chase, Ram
 * - Can taser (1 star), shoot (2+ stars), or ram player
 * - Drops shield pickups on kill
 */
export class MotorbikeCop extends THREE.Group {
  private rigidBody: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private characterController: RAPIER.KinematicCharacterController;
  private world: RAPIER.World;
  private modelLoaded: boolean = false;
  private modelContainer: THREE.Group;
  private wheels: THREE.Object3D[] = [];

  // Yuka AI
  private yukaVehicle: YUKA.Vehicle;
  private yukaEntityManager: YUKA.EntityManager;
  // Pre-allocated behaviors (reused, not recreated each frame)
  private seekBehavior: YUKA.SeekBehavior;
  private arriveBehavior: YUKA.ArriveBehavior;
  private wanderBehavior: YUKA.WanderBehavior;
  private separationBehavior: YUKA.SeparationBehavior;
  private seekTarget: YUKA.Vector3; // Reusable target vector

  // State machine
  private state: MotorbikeCopState = MotorbikeCopState.PATROL;
  private variant: MotorbikeCopVariant;

  // Combat state
  private isDead: boolean = false;
  private health: number;
  private maxHealth: number;
  private isHitStunned: boolean = false;
  private hitStunTimer: number = 0;
  private attackCooldown: number = 0;

  // Movement
  private maxSpeed: number;
  private currentSpeed: number = 0;
  private lastTarget: THREE.Vector3 | null = null;
  private patrolAngle: number = 0;
  private patrolTimer: number = 0;

  // Visuals
  private sirenLight: THREE.PointLight | null = null;
  private sirenPhase: number = 0;
  private parentScene: THREE.Scene | null = null;

  // Rider (cop on the bike)
  private riderMixer: THREE.AnimationMixer | null = null;
  private riderModel: THREE.Object3D | null = null;

  // Attack effects
  private taserBeam: THREE.Line | null = null;
  private taserBeamActive: boolean = false;
  private bulletProjectile: THREE.Mesh | null = null;
  private bulletTarget: THREE.Vector3 | null = null;
  private readonly bulletSpeed: number = 50;

  // Callbacks
  private onDealDamage?: (damage: number, isRam: boolean) => void;

  // Fake blob shadow (cheaper than real shadows)
  private blobShadow: BlobShadow;

  // Pre-allocated vectors (reused every frame to avoid GC pressure)
  private readonly _tempPosition: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempDirection: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempMidPoint: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempTargetWithHeight: THREE.Vector3 = new THREE.Vector3();
  private readonly _taserPositions: Float32Array = new Float32Array(9); // 3 points × 3 coords

  // Collision groups
  private static readonly COLLISION_GROUPS = {
    GROUND: 0x0001,
    BUILDING: 0x0040,
    COP_BIKE: 0x0100, // New collision group for cop bikes
  };

  constructor(
    position: THREE.Vector3,
    world: RAPIER.World,
    entityManager: YUKA.EntityManager,
    variant: MotorbikeCopVariant = MotorbikeCopVariant.SCOUT
  ) {
    super();

    this.world = world;
    this.yukaEntityManager = entityManager;
    this.variant = variant;

    // Set stats based on variant
    const variantConfig = MOTORBIKE_COP_CONFIG.VARIANTS[variant];
    this.health = variantConfig.health;
    this.maxHealth = variantConfig.health;
    this.maxSpeed = variantConfig.speed;

    // Create model container
    this.modelContainer = new THREE.Group();
    (this as THREE.Group).add(this.modelContainer);

    // Create Yuka vehicle for AI steering
    this.yukaVehicle = new YUKA.Vehicle();
    this.yukaVehicle.position.set(position.x, 0, position.z);
    this.yukaVehicle.maxSpeed = this.maxSpeed;
    this.yukaVehicle.maxForce = MOTORBIKE_COP_CONFIG.MAX_FORCE;
    this.yukaVehicle.updateOrientation = false;

    // Create steering behaviors ONCE (reused, weights adjusted per state)
    this.seekTarget = new YUKA.Vector3(position.x, 0, position.z);

    this.seekBehavior = new YUKA.SeekBehavior(this.seekTarget);
    this.seekBehavior.weight = 0;
    this.yukaVehicle.steering.add(this.seekBehavior);

    this.arriveBehavior = new YUKA.ArriveBehavior(this.seekTarget);
    this.arriveBehavior.weight = 0;
    this.yukaVehicle.steering.add(this.arriveBehavior);

    this.wanderBehavior = new YUKA.WanderBehavior();
    this.wanderBehavior.weight = 0;
    this.yukaVehicle.steering.add(this.wanderBehavior);

    this.separationBehavior = new YUKA.SeparationBehavior();
    this.separationBehavior.weight = 0.5;
    this.yukaVehicle.steering.add(this.separationBehavior);

    this.yukaEntityManager.add(this.yukaVehicle);

    // Create physics body
    const { body, collider, controller } = this.createPhysicsBody(world, position);
    this.rigidBody = body;
    this.collider = collider;
    this.characterController = controller;

    // Create blob shadow (larger for motorbike)
    this.blobShadow = createBlobShadow(1.6);
    this.blobShadow.position.set(position.x, 0.01, position.z);

    // Load model
    this.loadModel();

    // Create siren light
    this.createSirenLight();
  }

  private createPhysicsBody(
    world: RAPIER.World,
    position: THREE.Vector3
  ): {
    body: RAPIER.RigidBody;
    collider: RAPIER.Collider;
    controller: RAPIER.KinematicCharacterController;
  } {
    // Create kinematic position-based body
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(position.x, position.y, position.z);
    const body = world.createRigidBody(bodyDesc);

    // Box collider for motorbike
    // Membership: COP_BIKE (0x0100)
    // Filter: GROUND | BUILDING (can't collide with player/peds - handled via game logic)
    const collisionGroups =
      ((MotorbikeCop.COLLISION_GROUPS.GROUND | MotorbikeCop.COLLISION_GROUPS.BUILDING) << 16) |
      MotorbikeCop.COLLISION_GROUPS.COP_BIKE;

    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      COP_BIKE_CONFIG.colliderWidth,
      COP_BIKE_CONFIG.colliderHeight,
      COP_BIKE_CONFIG.colliderLength
    ).setCollisionGroups(collisionGroups)
     .setTranslation(0, COP_BIKE_CONFIG.colliderHeight, 0);

    const collider = world.createCollider(colliderDesc, body);

    // Create character controller
    const controller = world.createCharacterController(0.01);
    controller.enableAutostep(0.3, 0.1, true);
    controller.enableSnapToGround(0.3);

    return { body, collider, controller };
  }

  private async loadModel(): Promise<void> {
    try {
      const assetLoader = AssetLoader.getInstance();
      const cachedGltf = assetLoader.getModel(COP_BIKE_CONFIG.modelPath);

      if (!cachedGltf) {
        console.error(`[MotorbikeCop] Model not in cache: ${COP_BIKE_CONFIG.modelPath}`);
        this.createFallbackMesh();
        return;
      }

      const model = cachedGltf.scene.clone();
      // Disable real shadow casting (we use blob shadows instead)
      AnimationHelper.setupShadows(model, false, false);

      // Apply scale and rotation
      model.scale.setScalar(COP_BIKE_CONFIG.modelScale);
      model.rotation.y = COP_BIKE_CONFIG.modelRotationY;

      // Center model
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x = -center.x;
      model.position.z = -center.z;
      model.position.y = COP_BIKE_CONFIG.modelOffsetY;

      // Apply police colors
      model.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat.color) {
            // Darken for police look
            mat.color.multiplyScalar(0.7);
          }
        }
      });

      this.modelContainer.add(model);

      // Find wheels for animation
      model.traverse((child) => {
        if (child.name) {
          const name = child.name.toLowerCase();
          if (name.includes('tire') || name.includes('wheel') || name.includes('spokes')) {
            this.wheels.push(child);
          }
        }
      });

      // Load rider (cop on the bike)
      this.loadRider();

      this.modelLoaded = true;
    } catch (error) {
      console.error('[MotorbikeCop] Failed to load model:', error);
      this.createFallbackMesh();
    }
  }

  /**
   * Load a cop rider model and attach to the bike
   */
  private loadRider(): void {
    try {
      const assetLoader = AssetLoader.getInstance();
      if (!assetLoader) {
        console.warn('[MotorbikeCop] AssetLoader not available');
        return;
      }

      // Pick a random cop model (same as foot cops)
      const copModels = ['BlueSoldier_Male', 'Soldier_Male', 'BlueSoldier_Female', 'Soldier_Female'];
      const randomCop = copModels[Math.floor(Math.random() * copModels.length)];
      const modelPath = `/assets/pedestrians/${randomCop}.gltf`;

      const cachedGltf = assetLoader.getModel(modelPath);
      if (!cachedGltf || !cachedGltf.scene) {
        console.warn(`[MotorbikeCop] Rider model not in cache: ${modelPath}`);
        return;
      }

      // Clone with skeleton for animation - wrapped in try-catch for safety
      let rider: THREE.Object3D;
      try {
        rider = SkeletonUtils.clone(cachedGltf.scene);
      } catch (cloneError) {
        console.warn('[MotorbikeCop] Failed to clone rider model:', cloneError);
        return;
      }

      if (!rider) {
        console.warn('[MotorbikeCop] Clone returned null');
        return;
      }

      // Scale rider to match bike scale
      const riderScale = 0.0032; // Slightly smaller than bike scale (0.004)
      rider.scale.setScalar(riderScale);

      // Position rider on the bike seat
      rider.position.set(0, 0.55, -0.1); // Adjust Y for seat height, Z for forward/back
      rider.rotation.y = 0; // Face forward

      // Disable shadows (using blob shadow)
      AnimationHelper.setupShadows(rider, false, false);

      // Setup animation mixer and play SitDown animation
      this.riderMixer = new THREE.AnimationMixer(rider);

      // Find SitDown animation (only if animations exist)
      if (cachedGltf.animations && cachedGltf.animations.length > 0) {
        const sitAnimation = cachedGltf.animations.find(
          (clip: THREE.AnimationClip) => clip.name === 'SitDown'
        );

        if (sitAnimation) {
          const action = this.riderMixer.clipAction(sitAnimation);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true; // Stay in seated pose
          action.play();
          // Jump to end of animation to show seated pose
          this.riderMixer.update(10); // Fast forward to seated pose
        } else {
          // Fallback to Idle if no SitDown
          const idleAnimation = cachedGltf.animations.find(
            (clip: THREE.AnimationClip) => clip.name === 'Idle'
          );
          if (idleAnimation) {
            const action = this.riderMixer.clipAction(idleAnimation);
            action.play();
          }
        }
      }

      this.riderModel = rider;
      this.modelContainer.add(rider);
    } catch (error) {
      console.error('[MotorbikeCop] Failed to load rider:', error);
      // Don't rethrow - rider is optional, bike can work without it
    }
  }

  private createFallbackMesh(): void {
    const geometry = new THREE.BoxGeometry(0.8, 0.8, 1.6);
    const material = new THREE.MeshPhongMaterial({ color: 0x0044ff });
    const fallbackMesh = new THREE.Mesh(geometry, material);
    fallbackMesh.castShadow = false; // Use blob shadow instead
    fallbackMesh.position.y = 0.5;
    this.modelContainer.add(fallbackMesh);
    this.modelLoaded = true;
  }

  private createSirenLight(): void {
    this.sirenLight = new THREE.PointLight(0x0000ff, 2, 10);
    this.sirenLight.position.set(0, 1.5, 0);
    (this as THREE.Group).add(this.sirenLight);
  }

  /**
   * Set parent scene for spawning visual effects
   */
  setParentScene(scene: THREE.Scene): void {
    this.parentScene = scene;
  }

  /**
   * Set damage callback
   */
  setDamageCallback(callback: (damage: number, isRam: boolean) => void): void {
    this.onDealDamage = callback;
  }

  // Pre-allocated target position (avoids clone() every frame)
  private _lastTargetInternal: THREE.Vector3 = new THREE.Vector3();

  /**
   * Set chase target (player position)
   */
  setChaseTarget(target: THREE.Vector3): void {
    if (this.isDead) return;
    // Copy instead of clone to avoid allocation
    this._lastTargetInternal.copy(target);
    this.lastTarget = this._lastTargetInternal;
  }

  /**
   * Update state machine based on distance to player
   */
  private updateState(distanceToTarget: number): void {
    if (this.isHitStunned) {
      this.state = MotorbikeCopState.STUNNED;
      return;
    }

    const config = MOTORBIKE_COP_CONFIG;

    if (distanceToTarget > config.PATROL_DISTANCE) {
      this.state = MotorbikeCopState.PATROL;
    } else if (distanceToTarget > config.RAM_DISTANCE) {
      this.state = MotorbikeCopState.CHASE;
    } else {
      this.state = MotorbikeCopState.RAM;
    }
  }

  /**
   * Update AI behaviors based on current state
   * NOTE: Behaviors created once in constructor, only weights/targets updated here
   */
  private updateBehaviors(deltaTime: number): void {
    if (!this.lastTarget) return;

    // Reset all weights first
    this.seekBehavior.weight = 0;
    this.arriveBehavior.weight = 0;
    this.wanderBehavior.weight = 0;

    switch (this.state) {
      case MotorbikeCopState.PATROL:
        // Zig-zag patrol behavior
        this.patrolTimer += deltaTime;
        this.patrolAngle = Math.sin(this.patrolTimer * 2) * 0.5;

        // Update seek target with patrol offset
        this.seekTarget.set(
          this.lastTarget.x + Math.sin(this.patrolAngle) * 10,
          0,
          this.lastTarget.z + Math.cos(this.patrolAngle) * 10
        );
        this.seekBehavior.weight = 1.0;
        break;

      case MotorbikeCopState.CHASE:
        // Seek with flanking offset (less random to avoid per-frame allocations)
        const flankOffset = Math.sin(this.patrolTimer * 3) * 5;
        this.seekTarget.set(
          this.lastTarget.x + flankOffset,
          0,
          this.lastTarget.z
        );
        this.seekBehavior.weight = 2.0;
        this.wanderBehavior.weight = 0.3;
        break;

      case MotorbikeCopState.RAM:
        // Arrive at player position
        this.seekTarget.set(this.lastTarget.x, 0, this.lastTarget.z);
        this.arriveBehavior.weight = 3.0;
        break;

      case MotorbikeCopState.STUNNED:
        // No movement when stunned
        this.yukaVehicle.velocity.set(0, 0, 0);
        break;
    }

    // Separation always active (already set in constructor with weight 0.5)
  }

  /**
   * Take damage
   */
  takeDamage(amount: number): void {
    if (this.isDead) return;

    this.health -= amount;

    // Hit stun
    this.isHitStunned = true;
    this.hitStunTimer = MOTORBIKE_COP_CONFIG.HIT_STUN_DURATION;

    // Visual feedback
    AnimationHelper.flashWhite(this.modelContainer);

    if (this.health <= 0) {
      this.die();
    }
  }

  /**
   * Apply knockback force
   * NOTE: Uses pre-allocated _tempDirection vector to avoid GC pressure
   */
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
    this.hitStunTimer = MOTORBIKE_COP_CONFIG.HIT_STUN_DURATION * 2;
  }

  /**
   * Die
   */
  private die(): void {
    this.isDead = true;
    this.yukaVehicle.maxSpeed = 0;
    this.yukaVehicle.steering.clear();

    // Ragdoll flip effect
    const flipDuration = 500;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / flipDuration, 1);

      // Flip over
      this.modelContainer.rotation.z = progress * Math.PI;
      this.modelContainer.position.y = Math.sin(progress * Math.PI) * 2;

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

  /**
   * Update cop
   * NOTE: playerVelocity param kept for API compatibility but not used
   */
  update(deltaTime: number, _playerVelocity?: THREE.Vector3): void {
    if (!this.modelLoaded) return;

    // Update siren light
    this.updateSirenLight(deltaTime);

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

    // Get current position (reuse pre-allocated vector)
    const currentPos = this.rigidBody.translation();
    this._tempPosition.set(currentPos.x, currentPos.y, currentPos.z);

    // Calculate distance to target
    let distanceToTarget = Infinity;
    if (this.lastTarget) {
      distanceToTarget = this._tempPosition.distanceTo(this.lastTarget);
    }

    // Update state machine
    this.updateState(distanceToTarget);

    // Update AI behaviors
    this.updateBehaviors(deltaTime);

    // Update taser beam
    if (this.taserBeamActive && this.lastTarget) {
      this.updateTaserBeam(this.lastTarget);
    }

    // Update bullet projectile
    this.updateBulletProjectile(deltaTime);

    // Handle attacks based on state
    if (this.state === MotorbikeCopState.RAM && this.attackCooldown <= 0 && this.lastTarget) {
      this.executeRamAttack(this._tempPosition);
    }

    // Don't move while stunned
    if (this.isHitStunned) {
      this.currentSpeed = Math.max(0, this.currentSpeed - MOTORBIKE_COP_CONFIG.DECELERATION * deltaTime);
      return;
    }

    // Update speed based on state
    const targetSpeed = this.state === MotorbikeCopState.RAM ? this.maxSpeed * 1.5 : this.maxSpeed;
    if (this.currentSpeed < targetSpeed) {
      this.currentSpeed = Math.min(targetSpeed, this.currentSpeed + MOTORBIKE_COP_CONFIG.ACCELERATION * deltaTime);
    }

    // Get desired position from Yuka
    const desiredX = this.yukaVehicle.position.x;
    const desiredZ = this.yukaVehicle.position.z;

    // Calculate movement delta
    const deltaX = desiredX - currentPos.x;
    const deltaZ = desiredZ - currentPos.z;

    // Normalize and apply current speed
    const moveLen = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
    const maxMove = this.currentSpeed * deltaTime;

    let moveX = deltaX;
    let moveZ = deltaZ;
    if (moveLen > maxMove) {
      const scale = maxMove / moveLen;
      moveX *= scale;
      moveZ *= scale;
    }

    const desiredMovement = { x: moveX, y: -0.1 * deltaTime, z: moveZ };

    // Use character controller for collision
    this.characterController.computeColliderMovement(
      this.collider,
      desiredMovement
    );

    const correctedMovement = this.characterController.computedMovement();
    const newPosition = {
      x: currentPos.x + correctedMovement.x,
      y: Math.max(0.3, currentPos.y + correctedMovement.y),
      z: currentPos.z + correctedMovement.z,
    };

    this.rigidBody.setNextKinematicTranslation(newPosition);
    (this as THREE.Group).position.set(newPosition.x, newPosition.y, newPosition.z);

    // Update blob shadow position (stays on ground)
    this.blobShadow.position.set(newPosition.x, 0.01, newPosition.z);

    // Update Yuka position
    this.yukaVehicle.position.set(newPosition.x, 0, newPosition.z);

    // Face movement direction
    if (moveLen > 0.01) {
      const angle = Math.atan2(moveX, moveZ);
      (this as THREE.Group).rotation.y = angle;
    }

    // Rotate wheels
    if (this.wheels.length > 0 && this.currentSpeed > 0.1) {
      const wheelRotation = (this.currentSpeed * deltaTime) / 0.3;
      for (const wheel of this.wheels) {
        wheel.rotation.y += wheelRotation;
      }
    }
  }

  /**
   * Update siren light (blue/red flash)
   */
  private updateSirenLight(deltaTime: number): void {
    if (!this.sirenLight) return;

    this.sirenPhase += deltaTime * 10;

    // Alternate blue/red
    const isBlue = Math.sin(this.sirenPhase) > 0;
    this.sirenLight.color.setHex(isBlue ? 0x0000ff : 0xff0000);

    // Pulse intensity
    this.sirenLight.intensity = 1.5 + Math.sin(this.sirenPhase * 2) * 0.5;
  }

  /**
   * Execute ram attack
   */
  private executeRamAttack(currentPosition: THREE.Vector3): void {
    if (!this.lastTarget || !this.onDealDamage) return;

    const distance = currentPosition.distanceTo(this.lastTarget);
    if (distance < MOTORBIKE_COP_CONFIG.RAM_HIT_DISTANCE) {
      const damage = MOTORBIKE_COP_CONFIG.VARIANTS[this.variant].ramDamage;
      this.onDealDamage(damage, true);
      this.attackCooldown = MOTORBIKE_COP_CONFIG.RAM_COOLDOWN;

      // Apply self-knockback on ram
      this.applyKnockback(this.lastTarget, 5);
    }
  }

  /**
   * Fire taser at target
   */
  fireTaser(targetPos: THREE.Vector3): void {
    if (!this.parentScene || this.attackCooldown > 0) return;

    this.removeTaserBeam();

    const copPos = this.getPosition();
    copPos.y += 0.8;

    const targetWithHeight = targetPos.clone().setY(targetPos.y + 0.5);
    const midPoint = copPos.clone().lerp(targetWithHeight, 0.5);

    // Create geometry with 3 points (cop, midpoint, target) to match updateTaserBeam
    const points = [copPos, midPoint, targetWithHeight];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0xffff00,
      linewidth: 3,
      transparent: true,
      opacity: 0.9,
    });

    this.taserBeam = new THREE.Line(geometry, material);
    this.taserBeamActive = true;
    this.parentScene.add(this.taserBeam);

    this.attackCooldown = MOTORBIKE_COP_CONFIG.TASER_COOLDOWN;

    if (this.onDealDamage) {
      this.onDealDamage(MOTORBIKE_COP_CONFIG.TASER_DAMAGE, false);
    }
  }

  /**
   * Update taser beam position
   * NOTE: Uses pre-allocated vectors and Float32Array to avoid GC pressure
   */
  private updateTaserBeam(targetPos: THREE.Vector3): void {
    if (!this.taserBeam) return;

    // Get cop position using pre-allocated vector
    const pos = this.rigidBody.translation();
    const copX = pos.x;
    const copY = pos.y + 0.8;
    const copZ = pos.z;

    // Target with height offset
    const targetX = targetPos.x;
    const targetY = targetPos.y + 0.5;
    const targetZ = targetPos.z;

    // Electric jitter at midpoint
    const jitter = 0.1;
    const midX = (copX + targetX) * 0.5 + (Math.random() - 0.5) * jitter;
    const midY = (copY + targetY) * 0.5 + (Math.random() - 0.5) * jitter;
    const midZ = (copZ + targetZ) * 0.5 + (Math.random() - 0.5) * jitter;

    // Update pre-allocated Float32Array directly
    this._taserPositions[0] = copX;
    this._taserPositions[1] = copY;
    this._taserPositions[2] = copZ;
    this._taserPositions[3] = midX;
    this._taserPositions[4] = midY;
    this._taserPositions[5] = midZ;
    this._taserPositions[6] = targetX;
    this._taserPositions[7] = targetY;
    this._taserPositions[8] = targetZ;

    // Update existing BufferAttribute instead of creating new one
    const posAttr = this.taserBeam.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.set(this._taserPositions);
    posAttr.needsUpdate = true;

    const material = this.taserBeam.material as THREE.LineBasicMaterial;
    material.opacity = 0.7 + Math.random() * 0.3;
  }

  /**
   * Remove taser beam
   */
  removeTaserBeam(): void {
    if (this.taserBeam && this.parentScene) {
      this.parentScene.remove(this.taserBeam);
      this.taserBeam.geometry.dispose();
      (this.taserBeam.material as THREE.Material).dispose();
      this.taserBeam = null;
    }
    this.taserBeamActive = false;
  }

  /**
   * Fire bullet at target
   */
  fireBullet(targetPos: THREE.Vector3): void {
    if (!this.parentScene || this.attackCooldown > 0) return;

    this.removeBulletProjectile();

    const copPos = this.getPosition();
    copPos.y += 0.8;

    const geometry = new THREE.SphereGeometry(0.1, 8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
    });

    this.bulletProjectile = new THREE.Mesh(geometry, material);
    this.bulletProjectile.position.copy(copPos);
    this.bulletTarget = targetPos.clone().setY(targetPos.y + 0.5);
    this.parentScene.add(this.bulletProjectile);

    this.attackCooldown = MOTORBIKE_COP_CONFIG.SHOOT_COOLDOWN;
  }

  /**
   * Update bullet movement
   * NOTE: Uses pre-allocated _tempDirection vector to avoid GC pressure
   */
  private updateBulletProjectile(deltaTime: number): void {
    if (!this.bulletProjectile || !this.bulletTarget) return;

    // Use pre-allocated vector for direction calculation
    this._tempDirection
      .subVectors(this.bulletTarget, this.bulletProjectile.position)
      .normalize();

    const distance = this.bulletProjectile.position.distanceTo(this.bulletTarget);
    const moveDistance = this.bulletSpeed * deltaTime;

    if (distance <= moveDistance) {
      // Hit target
      if (this.onDealDamage) {
        this.onDealDamage(MOTORBIKE_COP_CONFIG.SHOOT_DAMAGE, false);
      }
      this.removeBulletProjectile();
    } else {
      this.bulletProjectile.position.add(this._tempDirection.multiplyScalar(moveDistance));
    }
  }

  /**
   * Remove bullet projectile
   */
  private removeBulletProjectile(): void {
    if (this.bulletProjectile && this.parentScene) {
      this.parentScene.remove(this.bulletProjectile);
      this.bulletProjectile.geometry.dispose();
      (this.bulletProjectile.material as THREE.Material).dispose();
      this.bulletProjectile = null;
    }
    this.bulletTarget = null;
  }

  /**
   * Get position
   * NOTE: Returns a new Vector3 for external use (safe but allocates).
   * Internal methods should use _tempPosition directly.
   */
  getPosition(): THREE.Vector3 {
    const pos = this.rigidBody.translation();
    return new THREE.Vector3(pos.x, pos.y, pos.z);
  }

  /**
   * Get position into provided vector (zero allocation)
   */
  getPositionInto(out: THREE.Vector3): THREE.Vector3 {
    const pos = this.rigidBody.translation();
    return out.set(pos.x, pos.y, pos.z);
  }

  /**
   * Get Yuka vehicle
   */
  getYukaVehicle(): YUKA.Vehicle {
    return this.yukaVehicle;
  }

  /**
   * Get the blob shadow mesh (for adding to scene)
   */
  getBlobShadow(): BlobShadow {
    return this.blobShadow;
  }

  /**
   * Check if dead
   */
  isDeadState(): boolean {
    return this.isDead;
  }

  /**
   * Get health
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
   * Get variant
   */
  getVariant(): MotorbikeCopVariant {
    return this.variant;
  }

  /**
   * Get current state
   */
  getState(): MotorbikeCopState {
    return this.state;
  }

  /**
   * Check if taser is active
   */
  isTaserActive(): boolean {
    return this.taserBeamActive;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.yukaEntityManager.remove(this.yukaVehicle);
    this.removeTaserBeam();
    this.removeBulletProjectile();

    // Remove physics body from world
    if (this.rigidBody && this.world) {
      this.world.removeRigidBody(this.rigidBody);
    }

    if (this.sirenLight) {
      (this as THREE.Group).remove(this.sirenLight);
      this.sirenLight.dispose();
    }

    // Dispose rider mixer
    if (this.riderMixer) {
      this.riderMixer.stopAllAction();
      this.riderMixer = null;
    }

    // Dispose cloned materials (SkeletonUtils.clone DOES clone materials)
    // But DON'T dispose geometries - those ARE shared by reference
    this.modelContainer.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Dispose materials (cloned per instance)
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else if (child.material) {
          child.material.dispose();
        }
        // DON'T dispose geometry - shared across all clones
      }
    });
  }
}
