import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as YUKA from 'yuka';
import { KinematicCharacterHelper } from '../utils/KinematicCharacterHelper';

/**
 * Cop Entity
 *
 * Police officer that:
 * - Chases player using Yuka seek behavior
 * - Slightly faster than player walk speed
 * - Deals contact damage
 * - Can be killed by player attacks
 */
export class Cop extends THREE.Group {
  private rigidBody: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private characterController: RAPIER.KinematicCharacterController;
  private world: RAPIER.World;
  private mixer: THREE.AnimationMixer | null = null;
  private animations: THREE.AnimationClip[] = [];
  private currentAnimation: string = 'Idle';
  private modelLoaded: boolean = false;

  // Yuka AI
  private yukaVehicle: YUKA.Vehicle;
  private yukaEntityManager: YUKA.EntityManager;

  // State
  private isDead: boolean = false;
  private health: number = 3; // Requires 3 knife hits to kill
  private chaseSpeed: number = 9.0; // Much faster than player
  private lastTarget: THREE.Vector3 | null = null; // Track player position for rotation
  private isHitStunned: boolean = false;
  private hitStunTimer: number = 0;
  private readonly hitStunDuration: number = 0.6; // 600ms hit stun (more visible)

  // Attack state
  private currentWantedStars: number = 0; // 0=punch, 1=taser, 2+=shoot
  private playerCanBeTased: boolean = true; // If false, cop punches instead of tasing at 1 star
  private attackCooldown: number = 0;
  private isCurrentlyAttacking: boolean = false;
  private onDealDamage?: (damage: number) => void; // Callback to damage player

  // Attack ranges and damage based on wanted stars
  private readonly punchRange: number = 1.5; // 0 stars: punch at very close range
  private readonly taserRange: number = 6.0; // 1 star: taser at medium range (doubled)
  private readonly shootRange: number = 8.0; // 2+ stars: shoot at longer range

  private readonly punchDamage: number = 10;
  private readonly taserDamage: number = 15;
  private readonly shootDamage: number = 20;

  private readonly punchCooldown: number = 1.5; // 1.5 seconds between punches
  private readonly taserCooldown: number = 2.0; // 2 seconds between tasers
  private readonly shootCooldown: number = 1.0; // 1 second between shots

  constructor(
    position: THREE.Vector3,
    world: RAPIER.World,
    entityManager: YUKA.EntityManager
  ) {
    super();

    this.yukaEntityManager = entityManager;
    this.world = world;

    // Create Yuka vehicle for AI steering
    this.yukaVehicle = new YUKA.Vehicle();
    this.yukaVehicle.position.copy(position);
    this.yukaVehicle.maxSpeed = this.chaseSpeed;
    this.yukaVehicle.maxForce = 20.0; // Very high force for instant direction changes
    this.yukaVehicle.updateOrientation = false; // We handle rotation manually for instant turning

    // Add to Yuka entity manager
    this.yukaEntityManager.add(this.yukaVehicle);

    // Create kinematic character with building collision using shared helper
    const groups = KinematicCharacterHelper.getCollisionGroups();
    const collisionFilter = KinematicCharacterHelper.getCopCollisionFilter();

    const { body, collider, controller } = KinematicCharacterHelper.createCharacterBody(
      world,
      position,
      0.3, // capsule half height
      0.3, // capsule radius
      groups.COP, // collision group membership
      collisionFilter // what this cop collides with (GROUND, BUILDING, PEDESTRIAN, other COPS)
    );

    this.rigidBody = body;
    this.collider = collider;
    this.characterController = controller;

    // Load police character model
    this.loadModel();

    console.log('[Cop] Created at', position);
  }

  /**
   * Load cop character model
   */
  private async loadModel(): Promise<void> {
    const loader = new GLTFLoader();

    // 80% male, 20% female distribution
    const isFemale = Math.random() < 0.2;
    const maleTypes = ['BlueSoldier_Male', 'Soldier_Male'];
    const femaleTypes = ['BlueSoldier_Female', 'Soldier_Female'];

    const copTypes = isFemale ? femaleTypes : maleTypes;
    const randomCop = copTypes[Math.floor(Math.random() * copTypes.length)];

    console.log('[Cop] Spawning', isFemale ? 'female' : 'male', 'cop:', randomCop);

    try {
      const gltf = await loader.loadAsync(`/assets/pedestrians/${randomCop}.gltf`);

      // European skin tone range (lighter to darker)
      const skinTones = [
        0xF5D0B8, // Very light peachy
        0xE8B196, // Light peachy tan
        0xDDA886, // Medium peachy
        0xD5A27A, // Light tan
        0xCCA070, // Medium tan
      ];

      // Pick random skin tone for this cop
      const randomSkinTone = skinTones[Math.floor(Math.random() * skinTones.length)];

      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          if (child.material) {
            const mat = child.material as THREE.MeshStandardMaterial;

            // Apply skin tone
            if (mat.name?.startsWith('Skin')) {
              mat.color.setHex(randomSkinTone);
            }

            // Tint cop uniform bright police blue
            if (mat.name?.startsWith('Main')) {
              mat.color.set(0x0066ff); // Bright police blue
            }

            // Tint helmet/gear dark navy
            if (mat.name?.startsWith('Helmet') || mat.name?.startsWith('Black') || mat.name?.startsWith('Grey')) {
              mat.color.set(0x001a4d); // Dark navy/black
            }
          }
        }
      });

      (this as THREE.Group).add(gltf.scene);

      // Setup animations
      this.mixer = new THREE.AnimationMixer(gltf.scene);
      this.mixer.timeScale = 1.5;
      this.animations = gltf.animations;

      this.playAnimation('Run', 0.3);
      this.modelLoaded = true;

      console.log('[Cop] Model loaded with', this.animations.length, 'animations');
      console.log('[Cop] Available animations:', this.animations.map(a => a.name).join(', '));
    } catch (error) {
      console.error('[Cop] Failed to load model:', error);

      // Fallback: blue capsule
      const geometry = new THREE.CapsuleGeometry(0.3, 0.6, 8, 16);
      const material = new THREE.MeshPhongMaterial({ color: 0x0044cc });
      const fallbackMesh = new THREE.Mesh(geometry, material);
      fallbackMesh.castShadow = true;
      fallbackMesh.position.y = 0.6;
      (this as THREE.Group).add(fallbackMesh);
      this.modelLoaded = true;
    }
  }

  /**
   * Play animation by name
   */
  private playAnimation(clipName: string, fadeIn: number): void {
    if (!this.mixer || this.animations.length === 0) return;

    const clip = THREE.AnimationClip.findByName(this.animations, clipName);
    if (!clip) {
      console.warn(`[Cop] Animation '${clipName}' not found`);
      return;
    }

    this.mixer.stopAllAction();
    const action = this.mixer.clipAction(clip);
    action.fadeIn(fadeIn);
    action.play();

    this.currentAnimation = clipName;
  }

  /**
   * Update current wanted star level to determine attack type
   */
  setWantedStars(stars: number): void {
    this.currentWantedStars = stars;
  }

  /**
   * Set whether player can be tased (affects attack choice at 1 star)
   */
  setPlayerCanBeTased(canBeTased: boolean): void {
    this.playerCanBeTased = canBeTased;
  }

  /**
   * Set damage callback (called when cop deals damage)
   */
  setDamageCallback(callback: (damage: number) => void): void {
    this.onDealDamage = callback;
  }

  /**
   * Get attack parameters based on current wanted star level
   */
  private getAttackParams(): { range: number; animation: string; damage: number; cooldown: number } {
    if (this.currentWantedStars >= 2) {
      // 2+ stars: Shoot at range
      return {
        range: this.shootRange,
        animation: 'Shoot_OneHanded',
        damage: this.shootDamage,
        cooldown: this.shootCooldown
      };
    } else if (this.currentWantedStars === 1 && this.playerCanBeTased) {
      // 1 star: Taser at medium-close range (only if player can be tased)
      return {
        range: this.taserRange,
        animation: 'Punch', // Using Punch for taser effect
        damage: this.taserDamage,
        cooldown: this.taserCooldown
      };
    } else {
      // 0 stars OR 1 star but player can't be tased: Punch at very close range
      return {
        range: this.punchRange,
        animation: 'Punch',
        damage: this.punchDamage,
        cooldown: this.punchCooldown
      };
    }
  }

  /**
   * Set chase target (player position)
   */
  setChaseTarget(target: THREE.Vector3): void {
    if (this.isDead) return;

    // Store target for rotation calculation
    this.lastTarget = target;

    // Clear existing behaviors
    this.yukaVehicle.steering.clear();

    // Flatten target to 2D to prevent vertical movement
    const flatTarget = new YUKA.Vector3(target.x, 0, target.z);

    // Chase player with high priority
    const seekBehavior = new YUKA.SeekBehavior(flatTarget);
    seekBehavior.weight = 2.0; // Much stronger seek
    this.yukaVehicle.steering.add(seekBehavior);

    // Separate from other cops to prevent overlapping
    const separationBehavior = new YUKA.SeparationBehavior();
    separationBehavior.weight = 0.8; // Reduced to prioritize chase
    this.yukaVehicle.steering.add(separationBehavior);

    // Add obstacle avoidance
    const obstacleBehavior = new YUKA.ObstacleAvoidanceBehavior();
    obstacleBehavior.weight = 0.5;
    this.yukaVehicle.steering.add(obstacleBehavior);
  }

  /**
   * Take damage
   */
  takeDamage(amount: number): void {
    if (this.isDead) return;

    this.health -= amount;

    // Trigger hit stun reaction
    this.isHitStunned = true;
    this.hitStunTimer = this.hitStunDuration;
    console.log(`[Cop] Hit stunned for ${this.hitStunDuration}s!`);

    // Visual hit reaction: flash white
    (this as THREE.Group).traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial;
        const originalEmissive = mat.emissive.getHex();
        const originalEmissiveIntensity = mat.emissiveIntensity;

        // Flash white
        mat.emissive.setHex(0xffffff);
        mat.emissiveIntensity = 1.0;

        // Reset after short delay
        setTimeout(() => {
          mat.emissive.setHex(originalEmissive);
          mat.emissiveIntensity = originalEmissiveIntensity;
        }, 100);
      }
    });

    // Try to play a hit animation if available
    if (this.mixer && this.animations.length > 0) {
      const hitAnimNames = ['RecieveHit', 'HitReact', 'Hit_Reaction', 'GetHit', 'TakeDamage', 'Damage'];
      let hitAnim = null;

      for (const name of hitAnimNames) {
        hitAnim = THREE.AnimationClip.findByName(this.animations, name);
        if (hitAnim) {
          console.log(`[Cop] Playing hit animation: ${name}`);
          const action = this.mixer.clipAction(hitAnim);
          action.setLoop(THREE.LoopOnce, 1);
          action.reset();
          action.play();
          break;
        }
      }

      if (!hitAnim) {
        console.log('[Cop] No hit reaction animation found, using visual flash only. Available:', this.animations.map(a => a.name).join(', '));
      }
    }

    if (this.health <= 0) {
      this.die();
    }
  }

  /**
   * Die
   */
  private die(): void {
    this.isDead = true;
    this.yukaVehicle.maxSpeed = 0;
    this.yukaVehicle.steering.clear();

    if (this.mixer && this.animations.length > 0) {
      this.playAnimation('Death', 0.1);
    }

    // Fade out and remove after delay
    setTimeout(() => {
      (this as THREE.Group).visible = false;
    }, 2000);
  }

  /**
   * Update cop AI and animation
   */
  update(deltaTime: number): void {
    if (!this.modelLoaded) return;

    // Update animation mixer
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }

    if (this.isDead) return;

    // Update hit stun timer
    if (this.hitStunTimer > 0) {
      this.hitStunTimer -= deltaTime;
      if (this.hitStunTimer <= 0) {
        this.isHitStunned = false;
      }
    }

    // Don't move or attack while hit stunned
    if (this.isHitStunned) {
      // Freeze in place - stop Yuka velocity
      this.yukaVehicle.velocity.set(0, 0, 0);
      return;
    }

    // Update attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
    }

    // Get current position
    const currentPos = this.rigidBody.translation();
    const currentPosition = new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z);

    // Check distance to target for attack logic
    let distanceToTarget = Infinity;
    if (this.lastTarget) {
      distanceToTarget = currentPosition.distanceTo(this.lastTarget);
    }

    // Get attack parameters based on current heat level
    const attackParams = this.getAttackParams();

    // Attack logic: if within range and cooldown ready, execute attack
    if (distanceToTarget <= attackParams.range && this.attackCooldown <= 0) {
      // Stop moving
      this.yukaVehicle.velocity.set(0, 0, 0);

      // Face target
      if (this.lastTarget) {
        const dirX = this.lastTarget.x - currentPosition.x;
        const dirZ = this.lastTarget.z - currentPosition.z;
        const angle = Math.atan2(dirX, dirZ);
        (this as THREE.Group).rotation.y = angle;
      }

      // Execute attack: play animation once and hold final pose
      if (this.mixer && this.animations.length > 0) {
        const clip = THREE.AnimationClip.findByName(this.animations, attackParams.animation);
        if (clip) {
          this.mixer.stopAllAction();
          const action = this.mixer.clipAction(clip);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true; // Hold final pose
          action.reset();
          action.play();
          this.currentAnimation = attackParams.animation;
        }
      }
      this.isCurrentlyAttacking = true;

      // Deal damage when attack executes
      if (this.onDealDamage) {
        this.onDealDamage(attackParams.damage);
        console.log(`[Cop] Dealt ${attackParams.damage} damage!`);
      }

      // Set cooldown for next attack
      this.attackCooldown = attackParams.cooldown;
    } else if (distanceToTarget > attackParams.range) {
      this.isCurrentlyAttacking = false;
      // Chase logic: move toward target
      // Get desired position from Yuka AI
      const desiredX = this.yukaVehicle.position.x;
      const desiredZ = this.yukaVehicle.position.z;

      // Calculate desired movement delta
      const deltaX = desiredX - currentPos.x;
      const deltaZ = desiredZ - currentPos.z;
      const desiredMovement = { x: deltaX, y: 0.0, z: deltaZ };

      // Use shared helper to move with collision detection
      const newPosition = KinematicCharacterHelper.moveCharacter(
        this.rigidBody,
        this.collider,
        this.characterController,
        desiredMovement
      );

      // Sync Three.js
      (this as THREE.Group).position.copy(newPosition);

      // Update Yuka position to match actual position (feedback collision response to AI)
      this.yukaVehicle.position.set(newPosition.x, 0, newPosition.z);

      // Instant rotation to face target (no smoothing - cops snap to face player)
      if (this.lastTarget) {
        const dirX = this.lastTarget.x - newPosition.x;
        const dirZ = this.lastTarget.z - newPosition.z;
        const distSq = dirX * dirX + dirZ * dirZ;

        // Only rotate if target is not too close (avoid jitter)
        if (distSq > 0.01) {
          const angle = Math.atan2(dirX, dirZ);
          (this as THREE.Group).rotation.y = angle;
        }
      }

      // Update animation based on movement (only if not attacking)
      if (!this.isCurrentlyAttacking) {
        const speed = this.yukaVehicle.velocity.length();
        if (speed > 0.5) {
          if (this.currentAnimation !== 'Run') {
            this.playAnimation('Run', 0.1);
          }
        } else {
          if (this.currentAnimation !== 'Idle') {
            this.playAnimation('Idle', 0.2);
          }
        }
      }
    }
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.yukaEntityManager.remove(this.yukaVehicle);
  }

  /**
   * Check if cop is dead
   */
  isDeadState(): boolean {
    return this.isDead;
  }

  /**
   * Get Yuka vehicle for AI manager
   */
  getYukaVehicle(): YUKA.Vehicle {
    return this.yukaVehicle;
  }

  /**
   * Get current health (for UI health bars)
   */
  getHealth(): number {
    return this.health;
  }
}
