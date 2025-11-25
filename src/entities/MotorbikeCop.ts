import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import * as YUKA from 'yuka';
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

      this.modelLoaded = true;
    } catch (error) {
      console.error('[MotorbikeCop] Failed to load model:', error);
      this.createFallbackMesh();
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

  /**
   * Set chase target (player position)
   */
  setChaseTarget(target: THREE.Vector3): void {
    if (this.isDead) return;
    this.lastTarget = target.clone();
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
   */
  private updateBehaviors(deltaTime: number): void {
    this.yukaVehicle.steering.clear();

    if (!this.lastTarget) return;

    const flatTarget = new YUKA.Vector3(this.lastTarget.x, 0, this.lastTarget.z);

    switch (this.state) {
      case MotorbikeCopState.PATROL:
        // Zig-zag patrol behavior
        this.patrolTimer += deltaTime;
        this.patrolAngle = Math.sin(this.patrolTimer * 2) * 0.5;

        const patrolTarget = flatTarget.clone();
        patrolTarget.x += Math.sin(this.patrolAngle) * 10;
        patrolTarget.z += Math.cos(this.patrolAngle) * 10;

        const patrolSeek = new YUKA.SeekBehavior(patrolTarget);
        patrolSeek.weight = 1.0;
        this.yukaVehicle.steering.add(patrolSeek);
        break;

      case MotorbikeCopState.CHASE:
        // Seek with flanking offset
        const flankOffset = (Math.random() - 0.5) * 10;
        const flankTarget = new YUKA.Vector3(
          flatTarget.x + flankOffset,
          0,
          flatTarget.z
        );

        const seekBehavior = new YUKA.SeekBehavior(flankTarget);
        seekBehavior.weight = 2.0;
        this.yukaVehicle.steering.add(seekBehavior);

        // Weave for unpredictability
        const weaveBehavior = new YUKA.WanderBehavior();
        weaveBehavior.weight = 0.3;
        this.yukaVehicle.steering.add(weaveBehavior);
        break;

      case MotorbikeCopState.RAM:
        // Arrive at predicted position
        const arriveBehavior = new YUKA.ArriveBehavior(flatTarget);
        arriveBehavior.weight = 3.0;
        this.yukaVehicle.steering.add(arriveBehavior);
        break;

      case MotorbikeCopState.STUNNED:
        // No movement when stunned
        this.yukaVehicle.velocity.set(0, 0, 0);
        break;
    }

    // Separation from other cops
    const separationBehavior = new YUKA.SeparationBehavior();
    separationBehavior.weight = 0.5;
    this.yukaVehicle.steering.add(separationBehavior);
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
   */
  applyKnockback(fromPosition: THREE.Vector3, force: number): void {
    if (this.isDead) return;

    const currentPos = this.rigidBody.translation();
    const direction = new THREE.Vector3(
      currentPos.x - fromPosition.x,
      0,
      currentPos.z - fromPosition.z
    ).normalize();

    this.yukaVehicle.velocity.set(
      direction.x * force,
      0,
      direction.z * force
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
   */
  update(deltaTime: number, playerVelocity: THREE.Vector3 = new THREE.Vector3()): void {
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

    // Get current position
    const currentPos = this.rigidBody.translation();
    const currentPosition = new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z);

    // Calculate distance to target
    let distanceToTarget = Infinity;
    if (this.lastTarget) {
      distanceToTarget = currentPosition.distanceTo(this.lastTarget);
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
      this.executeRamAttack(currentPosition);
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

    const points = [copPos, targetPos.clone().setY(targetPos.y + 0.5)];
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
   */
  private updateTaserBeam(targetPos: THREE.Vector3): void {
    if (!this.taserBeam) return;

    const copPos = this.getPosition();
    copPos.y += 0.8;
    const targetWithHeight = targetPos.clone().setY(targetPos.y + 0.5);

    // Electric jitter
    const jitter = 0.1;
    const midPoint = new THREE.Vector3().lerpVectors(copPos, targetWithHeight, 0.5);
    midPoint.x += (Math.random() - 0.5) * jitter;
    midPoint.y += (Math.random() - 0.5) * jitter;
    midPoint.z += (Math.random() - 0.5) * jitter;

    const positions = new Float32Array([
      copPos.x, copPos.y, copPos.z,
      midPoint.x, midPoint.y, midPoint.z,
      targetWithHeight.x, targetWithHeight.y, targetWithHeight.z
    ]);
    this.taserBeam.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.taserBeam.geometry.attributes.position.needsUpdate = true;

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
   */
  private updateBulletProjectile(deltaTime: number): void {
    if (!this.bulletProjectile || !this.bulletTarget) return;

    const direction = new THREE.Vector3()
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
      this.bulletProjectile.position.add(direction.multiplyScalar(moveDistance));
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
   */
  getPosition(): THREE.Vector3 {
    const pos = this.rigidBody.translation();
    return new THREE.Vector3(pos.x, pos.y, pos.z);
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
