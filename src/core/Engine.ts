import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from './PhysicsWorld';
import { AIManager } from './AIManager';
import { CrowdManager } from '../managers/CrowdManager';
import { CopManager } from '../managers/CopManager';
import { MotorbikeCopManager } from '../managers/MotorbikeCopManager';
import { BikeCopManager } from '../managers/BikeCopManager';
import { CopCarManager } from '../managers/CopCarManager';
import { BuildingManager } from '../managers/BuildingManager';
import { LampPostManager } from '../managers/LampPostManager';
import { ChristmasTreeManager } from '../managers/ChristmasTreeManager';
import { Player } from '../entities/Player';
import { Vehicle } from '../entities/Vehicle';
import { ParticleEmitter } from '../rendering/ParticleSystem';
import {
  VehicleType,
  VehicleConfig,
  VEHICLE_CONFIGS,
  TIER_VEHICLE_MAP,
  TIER_CONFIGS,
  MOTORBIKE_COP_CONFIG,
  CAMERA_CONFIG,
  PLAYER_ATTACK_CONFIG,
  SCORING_CONFIG,
  VEHICLE_INTERACTION,
  WANTED_STARS,
  RENDERING_CONFIG,
  COLLISION_GROUPS,
  DEBUG_PERFORMANCE_PANEL,
} from '../constants';
import { BloodDecalSystem } from '../rendering/BloodDecalSystem';
import { GameState, Tier, InputState, GameStats, KillNotification } from '../types';
import { ActionController, ActionType } from './ActionController';
import { CircularBuffer } from '../utils/CircularBuffer';

export class Engine {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;

  public physics: PhysicsWorld;
  public ai: AIManager;
  public crowd: CrowdManager | null = null;
  public cops: CopManager | null = null;
  public motorbikeCops: MotorbikeCopManager | null = null;
  public bikeCops: BikeCopManager | null = null;
  public copCars: CopCarManager | null = null;
  public buildings: BuildingManager | null = null;
  public lampPosts: LampPostManager | null = null;
  public christmasTrees: ChristmasTreeManager | null = null;
  public particles: ParticleEmitter;
  public bloodDecals: BloodDecalSystem;

  private state: GameState = GameState.MENU;
  private isDying: boolean = false;
  private animationId: number | null = null;

  private performanceStats = {
    fps: 0,
    frameTime: 0,
    physics: 0,
    entities: 0, // Total entities update time
    player: 0,
    cops: 0,
    pedestrians: 0,
    world: 0, // Buildings, lamp posts
    particles: 0,
    bloodDecals: 0,
    rendering: 0,
    lastFrameTime: performance.now(),
    counts: {
      cops: 0,
      pedestrians: 0,
      particles: 0,
      bloodDecals: 0,
      buildings: 0
    },
    // Three.js renderer info (draw calls, triangles, etc.)
    renderer: {
      drawCalls: 0,
      triangles: 0,
      points: 0,
      lines: 0,
      geometries: 0,
      textures: 0,
    },
    // Circular buffers for O(1) push instead of O(n) shift
    history: {
      frameTime: new CircularBuffer(120),
      physics: new CircularBuffer(120),
      entities: new CircularBuffer(120),
      player: new CircularBuffer(120),
      cops: new CircularBuffer(120),
      pedestrians: new CircularBuffer(120),
      world: new CircularBuffer(120),
      particles: new CircularBuffer(120),
      bloodDecals: new CircularBuffer(120),
      rendering: new CircularBuffer(120),
      drawCalls: new CircularBuffer(120),
    },
    worstFrame: {
      frameTime: 0,
      physics: 0,
      entities: 0,
      player: 0,
      cops: 0,
      pedestrians: 0,
      world: 0,
      particles: 0,
      bloodDecals: 0,
      rendering: 0,
      bottleneck: 'none' as 'physics' | 'entities' | 'rendering' | 'none' | 'player' | 'cops' | 'pedestrians' | 'world' | 'particles' | 'bloodDecals',
      counts: {
        cops: 0,
        pedestrians: 0,
        particles: 0,
        bloodDecals: 0,
        buildings: 0
      },
      renderer: {
        drawCalls: 0,
        triangles: 0,
      }
    },
    avgFrameTime: 0,
    avgPhysics: 0,
    avgEntities: 0,
    avgPlayer: 0,
    avgCops: 0,
    avgPedestrians: 0,
    avgWorld: 0,
    avgParticles: 0,
    avgBloodDecals: 0,
    avgRendering: 0,
    avgDrawCalls: 0,
  };

  private cameraShakeIntensity: number = 0;
  private cameraShakeDecay: number = 5;
  private cameraBasePosition: THREE.Vector3 = new THREE.Vector3();
  private cameraBaseQuaternion: THREE.Quaternion = new THREE.Quaternion();

  // Taser escape flash effect (per-press)
  private escapeFlashSprite: THREE.Sprite | null = null;
  private escapeFlashLife: number = 0;

  // Taser escape explosion effect (on successful escape)
  private explosionSprite: THREE.Sprite | null = null;
  private explosionLife: number = 0;
  private shockwaveRing: THREE.Mesh | null = null;
  private shockwaveLife: number = 0;

  // Motorbike blast effect (reuses similar pattern but with different colors)
  private blastSprite: THREE.Sprite | null = null;
  private blastLife: number = 0;
  private blastRing: THREE.Mesh | null = null;
  private blastRingLife: number = 0;
  private lastCombatTime: number = 0; // Track last kill for idle heat decay
  private lastCopKillTime: number = 0; // Track last cop kill for wanted star decay
  private lastAnnouncedComboMilestone: number = 0; // Track combo callouts

  // Combo milestone announcer messages
  private static readonly COMBO_MILESTONES: Array<{ threshold: number; message: string }> = [
    { threshold: 5, message: 'KILLING SPREE!' },
    { threshold: 10, message: 'RAMPAGE!' },
    { threshold: 15, message: 'UNSTOPPABLE!' },
    { threshold: 20, message: 'GODLIKE!' },
    { threshold: 30, message: 'MASSACRE!' },
    { threshold: 50, message: 'LEGENDARY!' },
  ];

  // Slow-mo effect for tier unlocks (Burnout-style impact frame)
  private slowmoTimer: number = 0;
  private slowmoScale: number = 1.0;
  private readonly SLOWMO_DURATION: number = 0.8;
  private readonly SLOWMO_SCALE: number = 0.15; // 15% speed during slowmo
  private lastPlayerPosition: THREE.Vector3 = new THREE.Vector3();
  private cameraMoveThreshold: number = 0; // Update every frame (0.1 caused jerk)
  private healthBarUpdateCounter: number = 0; // Throttle health bar projection

  // Pre-allocated vectors for update loop (avoid GC pressure)
  private readonly _tempCameraPos: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempLookAt: THREE.Vector3 = new THREE.Vector3();
  // Current camera offset (smoothly lerps to target for truck zoom)
  private readonly _currentCameraOffset: THREE.Vector3 = new THREE.Vector3(2.5, 6.25, 2.5);
  // Current camera zoom (frustum size) - smoothly lerps for truck
  private currentCameraZoom: number = CAMERA_CONFIG.FRUSTUM_SIZE;
  private readonly _tempScreenPos: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempAttackDir: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempVehicleDir: THREE.Vector3 = new THREE.Vector3();
  private readonly _yAxis: THREE.Vector3 = new THREE.Vector3(0, 1, 0);
  private readonly _tempSpawnTestPos: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempSpawnDir: THREE.Vector3 = new THREE.Vector3();
  private readonly _zeroVelocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private readonly _tempCurrentPos: THREE.Vector3 = new THREE.Vector3();

  // Pre-allocated spawn position offsets (avoid per-call allocation)
  private readonly _spawnOffsets: THREE.Vector3[] = [
    new THREE.Vector3(5, 0, 0), new THREE.Vector3(-5, 0, 0),
    new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -5),
    new THREE.Vector3(7, 0, 0), new THREE.Vector3(-7, 0, 0),
    new THREE.Vector3(5, 0, 5), new THREE.Vector3(-5, 0, -5),
    new THREE.Vector3(10, 0, 0), new THREE.Vector3(-10, 0, 0),
    new THREE.Vector3(3, 0, 0), new THREE.Vector3(-3, 0, 0),
    new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 0, -3),
  ];
  private readonly _exitOffsets: THREE.Vector3[] = [
    new THREE.Vector3(3, 0, 0), new THREE.Vector3(-3, 0, 0),
    new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 0, -3),
    new THREE.Vector3(3, 0, 3), new THREE.Vector3(-3, 0, -3),
    new THREE.Vector3(3, 0, -3), new THREE.Vector3(-3, 0, 3),
  ];

  // Pre-allocated array for cop health bar projection (max 16 cops: 8 foot + 8 bike)
  private _healthBarResult: Array<{ x: number; y: number; health: number; maxHealth: number }> = [];

  // Pre-allocated Rapier rays for spawn tests (initialized lazily)
  private _horizontalRay: RAPIER.Ray | null = null;
  private _downRay: RAPIER.Ray | null = null;

  // Attack performance tracking - logs continuously after attack until settled
  private attackTrackingActive: boolean = false;
  private attackTrackingFrames: number = 0;
  private attackStartParticles: number = 0;
  private attackStartDecals: number = 0;
  private attackStartGeom: number = 0;
  private attackStartTex: number = 0;

  private input: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    action: false,
    mount: false,
  };
  public disableCameraFollow: boolean = false;

  private stats: GameStats = {
    kills: 0,
    copKills: 0,
    score: 0,
    tier: Tier.FOOT,
    combo: 0,
    comboTimer: 0,
    gameTime: 0,
    health: 100,
    heat: 0,
    wantedStars: 0,
    inPursuit: false,
    killHistory: [],
    copHealthBars: [],
    isTased: false,
    taseEscapeProgress: 0,
  };

  private callbacks: {
    onStatsUpdate?: (stats: GameStats) => void;
    onGameOver?: (stats: GameStats) => void;
    onKillNotification?: (notification: KillNotification) => void;
  } = {};

  private groundMesh: THREE.Mesh | null = null;
  private player: Player | null = null;

  // Current vehicle (the one player is riding or can enter)
  private vehicle: Vehicle | null = null;
  private isInVehicle: boolean = false;
  private vehicleSpawned: boolean = false;
  private currentVehicleTier: Tier | null = null;

  // Vehicle respawn cooldown after destruction
  private vehicleRespawnCooldown: number = 0;
  private static readonly VEHICLE_RESPAWN_COOLDOWN_TIME = 15; // 15 seconds before can get new vehicle

  // Awaiting vehicle (next tier upgrade, spawns when milestone reached)
  private awaitingVehicle: Vehicle | null = null;
  private awaitingVehicleTier: Tier | null = null;
  private awaitingVehicleGlowTime: number = 0; // For pulsing glow animation
  private vehiclesToCleanup: Array<{ vehicle: Vehicle; timer: number }> = [];

  private actionController: ActionController = new ActionController();
  private static readonly KILL_MESSAGES = ['SPLAT!', 'CRUSHED!', 'DEMOLISHED!', 'OBLITERATED!', 'TERMINATED!'];
  private static readonly PANIC_KILL_MESSAGES = ['COWARD!', 'NO ESCAPE!', 'RUN FASTER!', 'BACKSTAB!', 'EASY PREY!'];
  private static readonly PURSUIT_KILL_MESSAGES = ['HEAT KILL!', 'WANTED BONUS!', 'PURSUIT FRENZY!', 'HOT STREAK!', 'RAMPAGE!'];
  private static readonly ROADKILL_MESSAGES = ['ROADKILL!', 'PANCAKED!', 'FLATTENED!', 'SPLATTER!', 'SPEED BUMP!'];
  private static readonly COP_KILL_MESSAGES = ['BADGE DOWN!', 'OFFICER DOWN!', 'COP DROPPED!', 'BLUE DOWN!'];

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);

    const aspect = width / height;
    const frustumSize = CAMERA_CONFIG.FRUSTUM_SIZE;
    this.camera = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      frustumSize / -2,
      0.1,
      1000
    );

    this.camera.position.set(5, 12.5, 5);
    this.camera.lookAt(0, 0, 0);
    this.camera.rotation.z = -0.15; // Tilt to see building sides better
    this.cameraBasePosition.copy(this.camera.position);
    this.cameraBaseQuaternion.copy(this.camera.quaternion);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    // this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.setupLighting();

    this.clock = new THREE.Clock();

    this.physics = new PhysicsWorld();
    this.ai = new AIManager();
    this.particles = new ParticleEmitter(this.scene);
    this.bloodDecals = new BloodDecalSystem(this.scene);

    this.particles.setOnGroundHit((position, size) => {
      this.bloodDecals.addBloodDecal(position, size);
    });
  }

  private setupLighting(): void {
    // Blue-tinted ambient for night sky feel - gives depth without washing out warm lights
    const ambient = new THREE.AmbientLight(0x223355, 0.25);
    this.scene.add(ambient);

    // No directional light - all illumination comes from lamp posts and building lights
  }

  async init(): Promise<void> {
    const { preloader } = await import('./Preloader');
    await preloader.preloadAll();

    await this.physics.init();
    this.ai.init();
    this.createTestGround();

    // Initialize managers (pass shared AIManager to avoid duplicate Yuka updates)
    const world = this.physics.getWorld();
    if (world) {
      this.crowd = new CrowdManager(this.scene, world, this.ai);
      this.cops = new CopManager(this.scene, world, this.ai);
      this.motorbikeCops = new MotorbikeCopManager(this.scene, world, this.ai);
      this.bikeCops = new BikeCopManager(this.scene, world, this.ai);
      this.copCars = new CopCarManager(this.scene, world, this.ai);
      this.buildings = new BuildingManager(this.scene, world);
      this.lampPosts = new LampPostManager(this.scene);
      this.christmasTrees = new ChristmasTreeManager(this.scene);
    }
  }

  private createTestGround(): void {
    const groundSize = RENDERING_CONFIG.GROUND_SIZE;
    const geometry = new THREE.PlaneGeometry(groundSize, groundSize);

    const textureLoader = new THREE.TextureLoader();
    const albedoMap = textureLoader.load('/assets/textures/cobblestone/color.jpg');
    const normalMap = textureLoader.load('/assets/textures/cobblestone/normal.jpg');
    const roughnessMap = textureLoader.load('/assets/textures/cobblestone/roughness.jpg');
    const aoMap = textureLoader.load('/assets/textures/cobblestone/ao.jpg');

    albedoMap.colorSpace = THREE.SRGBColorSpace;

    [albedoMap, normalMap, roughnessMap, aoMap].forEach(tex => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(400, 400);
    });

    const material = new THREE.MeshStandardMaterial({
      map: albedoMap,
      normalMap: normalMap,
      roughnessMap: roughnessMap,
      aoMap: aoMap,
      aoMapIntensity: 0.5,
      roughness: 0.9
    });
    this.groundMesh = new THREE.Mesh(geometry, material);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    this.bloodDecals.setGroundMesh(this.groundMesh);

    // DEBUG: GridHelper - uncomment for debugging
    // const gridHelper = new THREE.GridHelper(groundSize, 100, 0x444444, 0x333333);
    // gridHelper.position.y = 0;
    // this.scene.add(gridHelper);

    const groundBody = this.physics.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0)
    );
    this.physics.createCollider(
      RAPIER.ColliderDesc.cuboid(groundSize / 2, 0.1, groundSize / 2),
      groundBody
    );
  }

  setCallbacks(
    onStatsUpdate: (stats: GameStats) => void,
    onGameOver: (stats: GameStats) => void,
    onKillNotification?: (notification: KillNotification) => void
  ): void {
    this.callbacks.onStatsUpdate = onStatsUpdate;
    this.callbacks.onGameOver = onGameOver;
    this.callbacks.onKillNotification = onKillNotification;
  }

  handleInput(input: InputState): void {
    this.input = input;

    if (this.isInVehicle && this.vehicle) {
      this.vehicle.handleInput({
        up: input.up,
        down: input.down,
        left: input.left,
        right: input.right,
      });
    } else if (this.player) {
      this.player.handleInput({
        up: input.up,
        down: input.down,
        left: input.left,
        right: input.right,
        sprint: input.mount,
        jump: false,
        attack: false,
      });
    }
  }

  start(): void {
    if (this.state === GameState.PLAYING) return;

    this.state = GameState.PLAYING;
    this.resetGame();
    this.clock.start();
    this.animate();
  }

  stop(): void {
    this.state = GameState.PAUSED;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private resetGame(): void {
    this.isDying = false;

    if (this.player) {
      this.player.dispose();
      this.scene.remove(this.player);
      this.player = null;
    }

    if (this.vehicle) {
      this.vehicle.dispose();
      this.scene.remove(this.vehicle);
      this.vehicle = null;
    }
    this.isInVehicle = false;
    this.vehicleSpawned = false;
    this.vehicleRespawnCooldown = 0; // Reset cooldown on new game
    this.actionController.reset();

    if (this.crowd) {
      this.crowd.clear();
    }

    if (this.cops) {
      this.cops.clear();
      // Set damage callback once (not every frame)
      this.cops.setDamageCallback((damage: number) => {
        if (this.isInVehicle && this.vehicle) {
          this.vehicle.takeDamage(damage);
        } else if (this.player) {
          const isTaserAttack = this.stats.wantedStars === 1 && this.player.canBeTased();

          if (isTaserAttack) {
            this.player.applyTaserStun();
          } else {
            this.stats.health -= damage;
            this.player.applyHitStun();
          }

          if (this.stats.health <= 0 && !this.isDying) {
            this.stats.health = 0;
            this.isDying = true;

            this.player.die(() => {
              this.state = GameState.GAME_OVER;
              if (this.callbacks.onGameOver) {
                this.callbacks.onGameOver({ ...this.stats });
              }
            });
          }
        }
      });
    }

    if (this.bikeCops) {
      this.bikeCops.clear();
      // Bike cops ram attack damages vehicle, then player if dismounted
      this.bikeCops.setDamageCallback((damage: number) => {
        if (this.isInVehicle && this.vehicle) {
          // Damage the bicycle
          this.vehicle.takeDamage(damage);
          this.shakeCamera(0.5);
        } else if (this.player) {
          // If player dismounted, damage player directly
          this.player.takeDamage(damage);
        }
      });
    }

    if (this.motorbikeCops) {
      this.motorbikeCops.clear();
      // Set damage callback once (not every frame)
      this.motorbikeCops.setDamageCallback((damage: number, isRam: boolean) => {
        if (this.isInVehicle && this.vehicle) {
          const vehicleDamage = isRam ? damage * 2 : damage;
          this.vehicle.takeDamage(vehicleDamage);
          if (isRam) {
            this.shakeCamera(1.5);
          }
        } else if (this.player) {
          const isTaserAttack = this.stats.wantedStars === 1 && this.player.canBeTased() && !isRam;

          if (isTaserAttack) {
            this.player.applyTaserStun();
          } else {
            this.stats.health -= damage;
            this.player.applyHitStun();
            if (isRam) {
              this.shakeCamera(2.0);
            }
          }

          if (this.stats.health <= 0 && !this.isDying) {
            this.stats.health = 0;
            this.isDying = true;

            this.player.die(() => {
              this.state = GameState.GAME_OVER;
              if (this.callbacks.onGameOver) {
                this.callbacks.onGameOver({ ...this.stats });
              }
            });
          }
        }
      });
    }

    if (this.copCars) {
      this.copCars.clear();
      // Cop cars ram damage to vehicle (with directional check for truck)
      this.copCars.setDamageCallback((damage: number, attackerPosition: THREE.Vector3) => {
        if (this.isInVehicle && this.vehicle) {
          // Use directional damage - truck only takes damage from sides/back
          const tookDamage = this.vehicle.takeDamageFromPosition(damage, attackerPosition);
          if (tookDamage) {
            this.shakeCamera(1.5);
          }
        }
      });
    }

    if (this.buildings) {
      this.buildings.clear();
    }
    if (this.christmasTrees) {
      this.christmasTrees.clear();
    }

    this.particles.clear();
    this.bloodDecals.clear();

    this.stats = {
      kills: 0,
      copKills: 0,
      score: 0,
      tier: Tier.FOOT,
      combo: 0,
      comboTimer: 0,
      gameTime: 0,
      health: 100,
      heat: 0,
      wantedStars: 0,
      inPursuit: false,
      killHistory: [],
      copHealthBars: [],
      isTased: false,
      taseEscapeProgress: 0,
    };

    this.spawnPlayer();

    if (this.crowd && this.player) {
      this.crowd.spawnInitialCrowd(this.player.getPosition());
    }
  }

  private spawnPlayer(): void {
    this.player = new Player();
    this.scene.add(this.player);
    this.scene.add(this.player.getBlobShadow()); // Add blob shadow to scene

    const world = this.physics.getWorld();
    if (world) {
      this.player.createPhysicsBody(world);
    }

    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    this.player.setCameraDirection(cameraDirection);

    this.setupPlayerCallbacks();
    this.player.playSpawnAnimation();
  }

  private spawnVehicle(tier: Tier): void {
    if (!this.player || this.vehicleSpawned) return;

    const vehicleType = TIER_VEHICLE_MAP[tier];
    if (!vehicleType) return;

    const vehicleConfig = VEHICLE_CONFIGS[vehicleType];
    const world = this.physics.getWorld();
    if (!world) return;

    const playerPos = this.player.getPosition();
    const spawnPos = this.findSafeVehicleSpawnPosition(playerPos);

    this.vehicle = new Vehicle(vehicleConfig);
    this.vehicle.createPhysicsBody(world, spawnPos);
    this.scene.add(this.vehicle);

    this.vehicle.setOnDestroyed(() => {
      this.exitVehicle();
    });

    this.vehicleSpawned = true;
    this.currentVehicleTier = tier;

    const tierConfig = TIER_CONFIGS[tier];
    this.triggerKillNotification(`${tierConfig.name.toUpperCase()} UNLOCKED!`, true, 0);

    // Burnout-style slow-mo impact frame on tier unlock
    this.triggerSlowmo();
    this.shakeCamera(3.0);

    // Crowd surge - spawn more pedestrians for the new vehicle to rampage through
    this.crowd?.triggerCrowdSurge();
  }

  debugSpawnVehicle(vehicleType: VehicleType | null): void {
    if (this.isInVehicle) return;

    // Clean up current vehicle if any
    if (this.vehicle) {
      this.scene.remove(this.vehicle);
      this.vehicle.dispose();
      this.vehicle = null;
    }

    // Clean up awaiting vehicle if any
    if (this.awaitingVehicle) {
      this.scene.remove(this.awaitingVehicle);
      this.awaitingVehicle.dispose();
      this.awaitingVehicle = null;
      this.awaitingVehicleTier = null;
      this.awaitingVehicleGlowTime = 0;
      this.awaitingVehicleMaterials = [];
    }

    // Reset vehicle state ALWAYS (ensures clean state for spawning)
    this.vehicleSpawned = false;
    this.currentVehicleTier = null;

    if (!vehicleType) {
      this.stats.tier = Tier.FOOT;
      return;
    }

    let targetTier: Tier | undefined;
    if (vehicleType === VehicleType.BICYCLE) targetTier = Tier.BIKE;
    else if (vehicleType === VehicleType.MOTORBIKE) targetTier = Tier.MOTO;
    else if (vehicleType === VehicleType.SEDAN) targetTier = Tier.SEDAN;
    else if (vehicleType === VehicleType.TRUCK) targetTier = Tier.TRUCK;

    if (targetTier) {
      this.spawnVehicle(targetTier);
    }
  }

  getCurrentVehicleType(): VehicleType | null {
    if (!this.vehicleSpawned || !this.currentVehicleTier) return null;
    return TIER_VEHICLE_MAP[this.currentVehicleTier] || null;
  }

  getAnimationNames(): string[] {
    return this.player?.getAnimationNames() || [];
  }

  debugPlayAnimation(name: string): void {
    this.player?.debugPlayAnimation(name);
  }

  debugPlayAnimationOnce(name: string): void {
    this.player?.playAnimationWithCallback(name, () => {});
  }

  /**
   * Debug: Boost heat to trigger motorbike cops immediately
   * Press H key to use
   */
  debugBoostHeat(): void {
    this.stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, this.stats.heat + SCORING_CONFIG.HEAT_DEBUG_BOOST);
    console.log(`[DEBUG] Heat boosted to ${this.stats.heat}%`);
  }

  private findSafeVehicleSpawnPosition(playerPos: THREE.Vector3): THREE.Vector3 {
    const world = this.physics.getWorld();
    if (!world) {
      this._tempSpawnTestPos.copy(playerPos).add(this._spawnOffsets[0]);
      return this._tempSpawnTestPos.clone();
    }

    // Use centralized collision group constants
    const BUILDING_GROUP = COLLISION_GROUPS.BUILDING;
    const GROUND_GROUP = COLLISION_GROUPS.GROUND;

    // Lazily initialize reusable Rapier rays
    if (!this._horizontalRay) {
      this._horizontalRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    }
    if (!this._downRay) {
      this._downRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    }

    for (const offset of this._spawnOffsets) {
      // Reuse temp vectors instead of cloning
      this._tempSpawnTestPos.copy(playerPos).add(offset);
      this._tempSpawnDir.copy(offset).normalize();

      // Update horizontal ray origin and direction
      this._horizontalRay.origin.x = playerPos.x;
      this._horizontalRay.origin.y = playerPos.y + 1;
      this._horizontalRay.origin.z = playerPos.z;
      this._horizontalRay.dir.x = this._tempSpawnDir.x;
      this._horizontalRay.dir.y = 0;
      this._horizontalRay.dir.z = this._tempSpawnDir.z;

      const horizontalHit = world.castRay(this._horizontalRay, offset.length(), true);
      if (horizontalHit) {
        const hitGroups = horizontalHit.collider.collisionGroups() & 0xFFFF;
        if (hitGroups === BUILDING_GROUP) {
          continue;
        }
      }

      // Update down ray origin
      this._downRay.origin.x = this._tempSpawnTestPos.x;
      this._downRay.origin.y = this._tempSpawnTestPos.y + 10;
      this._downRay.origin.z = this._tempSpawnTestPos.z;

      const downHit = world.castRay(this._downRay, 15, true);
      if (downHit) {
        const hitGroups = downHit.collider.collisionGroups() & 0xFFFF;
        if (hitGroups === GROUND_GROUP) {
          return this._tempSpawnTestPos.clone();
        }
      }
    }

    return playerPos.clone();
  }

  private enterVehicle(): void {
    if (!this.player || !this.vehicle || this.isInVehicle) return;

    const riderConfig = this.vehicle.getRiderConfig();

    if (riderConfig.hideRider) {
      this.player.setVisible(false);
    } else {
      this.player.setVisible(true);
      (this.vehicle as THREE.Group).add(this.player);
      (this.player as THREE.Group).position.set(0, riderConfig.offsetY, riderConfig.offsetZ);
      (this.player as THREE.Group).rotation.set(0, 0, 0);
      this.player.playSeatedAnimation();
    }

    this.isInVehicle = true;

    if (this.currentVehicleTier) {
      this.stats.tier = this.currentVehicleTier;
    }

    this.shakeCamera(1.0);
  }

  // Pre-calculated squared enter distance (avoid sqrt in comparison)
  private readonly ENTER_DISTANCE_SQ = VEHICLE_INTERACTION.ENTER_DISTANCE * VEHICLE_INTERACTION.ENTER_DISTANCE;

  private isPlayerNearVehicle(): boolean {
    if (!this.player || !this.vehicle) return false;

    const playerPos = this.player.getPosition();
    const vehiclePos = this.vehicle.getPosition();
    const distanceSq = playerPos.distanceToSquared(vehiclePos);

    return distanceSq < this.ENTER_DISTANCE_SQ;
  }

  private isPlayerNearAwaitingVehicle(): boolean {
    if (!this.player || !this.awaitingVehicle) return false;

    const playerPos = this.player.getPosition();
    const vehiclePos = this.awaitingVehicle.getPosition();
    const distanceSq = playerPos.distanceToSquared(vehiclePos);

    return distanceSq < this.ENTER_DISTANCE_SQ;
  }

  /**
   * Check if player should receive next tier vehicle based on SCORE
   * Score incorporates combo multipliers, pursuit bonuses, and kill types
   */
  private checkTierProgression(): void {
    if (!this.player) return;

    // Determine current effective tier (what player is riding or has access to)
    const effectiveTier = this.isInVehicle ? this.currentVehicleTier :
                          this.vehicleSpawned ? this.currentVehicleTier : Tier.FOOT;

    // Don't spawn awaiting vehicle if one already exists
    if (this.awaitingVehicle) return;

    // Check for next tier unlock based on current tier and SCORE
    let nextTier: Tier | null = null;

    if (effectiveTier === Tier.FOOT || effectiveTier === null) {
      // On foot: check for bike unlock (150 score)
      if (this.stats.score >= TIER_CONFIGS[Tier.BIKE].minScore) {
        nextTier = Tier.BIKE;
      }
    } else if (effectiveTier === Tier.BIKE) {
      // On bike: check for moto unlock (1000 score)
      if (this.stats.score >= TIER_CONFIGS[Tier.MOTO].minScore) {
        nextTier = Tier.MOTO;
      }
    } else if (effectiveTier === Tier.MOTO) {
      // On moto: check for sedan unlock (4000 score)
      if (this.stats.score >= TIER_CONFIGS[Tier.SEDAN].minScore) {
        nextTier = Tier.SEDAN;
      }
    } else if (effectiveTier === Tier.SEDAN) {
      // On sedan: check for truck unlock (10000 score)
      if (this.stats.score >= TIER_CONFIGS[Tier.TRUCK].minScore) {
        nextTier = Tier.TRUCK;
      }
    }
    // Truck is max tier, no more upgrades

    // If we should unlock a tier and no vehicle is spawned yet (first unlock)
    // OR if we have a current vehicle but need to spawn an upgrade
    if (nextTier !== null) {
      if (!this.vehicleSpawned && this.vehicleRespawnCooldown <= 0) {
        // First vehicle (or respawn after cooldown) - spawn as current vehicle
        this.spawnVehicle(nextTier);
      } else if (this.isInVehicle) {
        // Player is in a vehicle - spawn the upgrade as awaiting
        this.spawnAwaitingVehicle(nextTier);
      }
    }
  }

  /**
   * Spawn awaiting vehicle (next tier upgrade)
   */
  private spawnAwaitingVehicle(tier: Tier): void {
    if (!this.player || this.awaitingVehicle) return;

    const vehicleType = TIER_VEHICLE_MAP[tier];
    if (!vehicleType) return;

    const vehicleConfig = VEHICLE_CONFIGS[vehicleType];
    const world = this.physics.getWorld();
    if (!world) return;

    // Get spawn position based on player's current position (or vehicle if in one)
    const sourcePos = this.isInVehicle && this.vehicle
      ? this.vehicle.getPosition()
      : this.player.getPosition();
    const spawnPos = this.findSafeVehicleSpawnPosition(sourcePos);

    this.awaitingVehicle = new Vehicle(vehicleConfig);
    this.awaitingVehicle.createPhysicsBody(world, spawnPos);
    this.scene.add(this.awaitingVehicle);

    this.awaitingVehicleTier = tier;
    this.awaitingVehicleGlowTime = 0;

    // Start the glow effect and cache materials for efficient per-frame updates
    this.setVehicleGlow(this.awaitingVehicle, 1.0, 0x00ffaa, true); // Bright cyan-green, cache=true

    const tierConfig = TIER_CONFIGS[tier];
    this.triggerKillNotification(`${tierConfig.name.toUpperCase()} UNLOCKED!`, true, 0);

    // Burnout-style slow-mo impact frame on tier unlock
    this.triggerSlowmo();
    this.shakeCamera(3.0);

    // Crowd surge - spawn more pedestrians for the new vehicle to rampage through
    this.crowd?.triggerCrowdSurge();
  }

  // Cache for awaiting vehicle materials (avoid traverse every frame)
  private awaitingVehicleMaterials: THREE.MeshStandardMaterial[] = [];

  /**
   * Set glow effect on a vehicle using emissive material
   * Also caches materials for efficient per-frame updates
   */
  private setVehicleGlow(vehicle: Vehicle, intensity: number, color: number, cacheForUpdates: boolean = false): void {
    if (cacheForUpdates) {
      this.awaitingVehicleMaterials = [];
    }

    (vehicle as THREE.Group).traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat.emissive) {
          mat.emissive.setHex(color);
          mat.emissiveIntensity = intensity;
          if (cacheForUpdates) {
            this.awaitingVehicleMaterials.push(mat);
          }
        }
      }
    });
  }

  /**
   * Update awaiting vehicle glow effect (pulsing animation)
   * Uses cached materials to avoid expensive traverse() every frame
   */
  private updateAwaitingVehicleGlow(dt: number): void {
    if (!this.awaitingVehicle || this.awaitingVehicleMaterials.length === 0) return;

    this.awaitingVehicleGlowTime += dt;

    // Pulsing glow: oscillate between 0.5 and 1.5 intensity
    const pulseSpeed = 3; // Hz
    const intensity = 0.8 + 0.5 * Math.sin(this.awaitingVehicleGlowTime * pulseSpeed * Math.PI * 2);

    // Update cached materials directly (O(n) materials, not O(n) traverse)
    for (const mat of this.awaitingVehicleMaterials) {
      mat.emissiveIntensity = intensity;
    }
  }

  /**
   * Switch from current vehicle to awaiting vehicle
   */
  private switchToAwaitingVehicle(): void {
    if (!this.awaitingVehicle || !this.player) return;

    // Exit current vehicle if in one
    if (this.isInVehicle && this.vehicle) {
      // Remove player from current vehicle
      if ((this.player as THREE.Group).parent === this.vehicle) {
        (this.vehicle as THREE.Group).remove(this.player);
        this.scene.add(this.player);
        this.scene.add(this.player.getBlobShadow());
      }
      this.player.setVisible(true);

      // Queue old vehicle for cleanup (delayed destruction for performance)
      this.vehiclesToCleanup.push({ vehicle: this.vehicle, timer: 3.0 }); // 3 seconds
      this.vehicle = null;
      this.isInVehicle = false;
    }

    // Clear glow from awaiting vehicle
    this.setVehicleGlow(this.awaitingVehicle, 0, 0x000000);

    // Make awaiting vehicle the current vehicle
    this.vehicle = this.awaitingVehicle;
    this.currentVehicleTier = this.awaitingVehicleTier;
    this.vehicleSpawned = true;

    // Clear awaiting state
    this.awaitingVehicle = null;
    this.awaitingVehicleTier = null;
    this.awaitingVehicleGlowTime = 0;
    this.awaitingVehicleMaterials = []; // Clear cached materials

    // Enter the new vehicle
    this.enterVehicle();
  }

  /**
   * Update vehicles pending cleanup and respawn cooldown
   */
  private updateVehicleCleanup(dt: number): void {
    // Update vehicle respawn cooldown
    if (this.vehicleRespawnCooldown > 0) {
      this.vehicleRespawnCooldown -= dt;
    }

    for (let i = this.vehiclesToCleanup.length - 1; i >= 0; i--) {
      const entry = this.vehiclesToCleanup[i];
      entry.timer -= dt;

      if (entry.timer <= 0) {
        // Remove and dispose
        this.scene.remove(entry.vehicle);
        entry.vehicle.dispose();
        this.vehiclesToCleanup.splice(i, 1);
      }
    }
  }

  private exitVehicle(): void {
    if (!this.vehicle || !this.player) return;

    const vehiclePos = this.vehicle.getPosition();
    const safePos = this.findSafeExitPosition(vehiclePos);

    if ((this.player as THREE.Group).parent === this.vehicle) {
      (this.vehicle as THREE.Group).remove(this.player);
      this.scene.add(this.player);
      this.scene.add(this.player.getBlobShadow()); // Re-add blob shadow
    }

    this.player.setVisible(true);

    this.scene.remove(this.vehicle);
    this.vehicle.dispose();
    this.vehicle = null;

    const world = this.physics.getWorld();
    if (world) {
      const oldShadow = this.player.getBlobShadow();
      this.scene.remove(oldShadow);
      this.player.dispose();
      this.scene.remove(this.player);

      this.player = new Player();
      this.player.createPhysicsBody(world, safePos);
      this.scene.add(this.player);
      this.scene.add(this.player.getBlobShadow()); // Add new blob shadow

      this.setupPlayerCallbacks();
    }

    this.isInVehicle = false;
    this.vehicleSpawned = false;
    this.stats.tier = Tier.FOOT;

    // Start vehicle respawn cooldown
    this.vehicleRespawnCooldown = Engine.VEHICLE_RESPAWN_COOLDOWN_TIME;

    this.shakeCamera(2.0);
    this.particles.emitBlood(vehiclePos, 100);
  }

  private findSafeExitPosition(vehiclePos: THREE.Vector3): THREE.Vector3 {
    const world = this.physics.getWorld();
    if (!world) return vehiclePos;

    // Lazily initialize reusable down ray if needed
    if (!this._downRay) {
      this._downRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    }

    for (const offset of this._exitOffsets) {
      // Reuse temp vector instead of cloning
      this._tempSpawnTestPos.copy(vehiclePos).add(offset);

      // Update down ray origin
      this._downRay.origin.x = this._tempSpawnTestPos.x;
      this._downRay.origin.y = this._tempSpawnTestPos.y + 5;
      this._downRay.origin.z = this._tempSpawnTestPos.z;

      const hit = world.castRay(this._downRay, 10, true);
      if (hit) {
        const hitCollider = hit.collider;
        const groups = hitCollider.collisionGroups();
        const membership = groups & 0xFFFF;

        if (membership === COLLISION_GROUPS.GROUND) {
          return this._tempSpawnTestPos.clone();
        }
      }
    }

    return vehiclePos;
  }

  private setupPlayerCallbacks(): void {
    if (!this.player) return;

    this.player.setOnEscapePress(() => {
      this.shakeCamera(0.3);
      this.showEscapeFlash();
    });

    this.player.setOnTaserEscape((position, radius, force) => {
      this.shakeCamera(2.5); // Big shake!
      this.showTaserEscapeExplosion(position);
      if (this.cops) {
        this.cops.applyKnockbackInRadius(position, radius, force);
        this.cops.clearTaserBeams();
      }
      if (this.bikeCops) {
        this.bikeCops.applyKnockbackInRadius(position, radius, force);
        this.bikeCops.clearTaserBeams();
      }
      if (this.particles) {
        this.particles.emitBlood(position, 50);
      }
    });

    this.player.setOnAttack((attackPosition) => {
      this.handlePlayerAttack(attackPosition);
    });
  }

  /**
   * Update wanted stars based on cop kills - consolidated from multiple attack handlers
   * Stars decay by 1 after 45 seconds without killing cops
   */
  private updateWantedStars(copKilled: boolean = false): void {
    // Update last cop kill time if cop was killed
    if (copKilled) {
      this.lastCopKillTime = this.stats.gameTime;
    }

    // Calculate base star level from cop kills
    let baseStars = 0;
    if (this.stats.copKills >= WANTED_STARS.STAR_2) {
      baseStars = 2;
    } else if (this.stats.copKills >= WANTED_STARS.STAR_1) {
      baseStars = 1;
    }

    // Apply decay: reduce stars by 1 if no cop kills for 45+ seconds
    const timeSinceLastCopKill = this.stats.gameTime - this.lastCopKillTime;
    const decayLevels = Math.floor(timeSinceLastCopKill / 45); // 1 level per 45s
    const decayedStars = Math.max(0, baseStars - decayLevels);

    this.stats.wantedStars = decayedStars;
  }

  /**
   * Emit blood effects at kill positions - consolidated from multiple attack handlers
   */
  private emitBloodEffects(
    killPositions: THREE.Vector3[],
    sourcePosition: THREE.Vector3,
    particleCount: number = 30,
    sprayCount: number = 20
  ): void {
    for (const killPos of killPositions) {
      this._tempAttackDir.subVectors(killPos, sourcePosition).normalize();
      this.particles.emitBlood(killPos, particleCount);
      this.particles.emitBloodSpray(killPos, this._tempAttackDir, sprayCount);
    }
  }

  private handlePlayerAttack(attackPosition: THREE.Vector3): void {
    const attackStart = performance.now();
    const cfg = PLAYER_ATTACK_CONFIG.KNIFE;

    const pedAttackRadius = cfg.pedRadius;
    const copAttackRadius = cfg.copRadius;
    const damage = cfg.damage;
    const maxKills = this.stats.combo >= cfg.comboThreshold ? Infinity : 1;
    const attackDirection = this.player!.getFacingDirection();
    const coneAngle = cfg.coneAngle;

    let totalKills = 0;
    const allKillPositions: THREE.Vector3[] = [];

    // --- Pedestrian damage ---
    const pedDamageStart = performance.now();
    let pedKills = 0;
    if (this.crowd) {
      const pedResult = this.crowd.damageInRadius(
        attackPosition,
        pedAttackRadius,
        damage,
        maxKills,
        attackDirection,
        coneAngle
      );
      pedKills = pedResult.kills;

      if (pedResult.kills > 0) {
        this.stats.kills += pedResult.kills;

        const basePoints = SCORING_CONFIG.PEDESTRIAN_BASE;
        const regularKills = pedResult.kills - pedResult.panicKills;
        const panicKills = pedResult.panicKills;

        const regularPoints = regularKills * (this.stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER : basePoints);
        const panicPoints = panicKills * (this.stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER * SCORING_CONFIG.PANIC_MULTIPLIER : basePoints * SCORING_CONFIG.PANIC_MULTIPLIER);

        this.stats.score += regularPoints + panicPoints;
        this.stats.combo += pedResult.kills;
        this.stats.comboTimer = SCORING_CONFIG.COMBO_DURATION;
        this.lastCombatTime = this.stats.gameTime;
        this.stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, this.stats.heat + (pedResult.kills * SCORING_CONFIG.HEAT_PER_PED_KILL));

        totalKills += pedResult.kills;
        allKillPositions.push(...pedResult.positions);

        for (let i = 0; i < regularKills; i++) {
          const message = this.stats.inPursuit
            ? Engine.randomFrom(Engine.PURSUIT_KILL_MESSAGES)
            : Engine.randomFrom(Engine.KILL_MESSAGES);
          const points = this.stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER : basePoints;
          this.triggerKillNotification(message, this.stats.inPursuit, points);
        }
        for (let i = 0; i < panicKills; i++) {
          const message = Engine.randomFrom(Engine.PANIC_KILL_MESSAGES);
          const points = this.stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER * SCORING_CONFIG.PANIC_MULTIPLIER : basePoints * SCORING_CONFIG.PANIC_MULTIPLIER;
          this.triggerKillNotification(message, true, points);
        }

        this.crowd.panicCrowd(attackPosition, cfg.panicRadius);
      }
    }
    const pedDamageTime = performance.now() - pedDamageStart;

    // --- Cop damage (foot cops, bike cops, motorbike cops) ---
    const copDamageStart = performance.now();
    let copKills = 0;

    // Foot cops
    if (this.cops) {
      const copResult = this.cops.damageInRadius(
        attackPosition,
        copAttackRadius,
        damage,
        maxKills,
        attackDirection,
        coneAngle
      );
      copKills += copResult.kills;

      if (copResult.kills > 0) {
        const basePoints = SCORING_CONFIG.COP_BASE;
        const pointsPerKill = basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER;
        this.stats.score += copResult.kills * pointsPerKill;
        this.stats.copKills += copResult.kills;
        this.updateWantedStars(true);
        this.stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, this.stats.heat + (copResult.kills * SCORING_CONFIG.HEAT_PER_COP_KILL));

        totalKills += copResult.kills;
        allKillPositions.push(...copResult.positions);

        for (let i = 0; i < copResult.kills; i++) {
          this.triggerKillNotification(Engine.randomFrom(Engine.COP_KILL_MESSAGES), true, pointsPerKill);
        }
      }
    }

    // Bike cops
    if (this.bikeCops) {
      const bikeResult = this.bikeCops.damageInRadius(
        attackPosition,
        copAttackRadius,
        damage,
        maxKills - copKills,
        attackDirection,
        coneAngle
      );
      copKills += bikeResult.kills;

      if (bikeResult.kills > 0) {
        const basePoints = SCORING_CONFIG.COP_BASE;
        const pointsPerKill = basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER;
        this.stats.score += bikeResult.kills * pointsPerKill;
        this.stats.copKills += bikeResult.kills;
        this.updateWantedStars(true);
        this.stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, this.stats.heat + (bikeResult.kills * SCORING_CONFIG.HEAT_PER_COP_KILL));

        totalKills += bikeResult.kills;
        allKillPositions.push(...bikeResult.positions);

        for (let i = 0; i < bikeResult.kills; i++) {
          this.triggerKillNotification(Engine.randomFrom(Engine.COP_KILL_MESSAGES), true, pointsPerKill);
        }
      }
    }
    const copDamageTime = performance.now() - copDamageStart;

    // --- Blood particles and decals ---
    const particlesStart = performance.now();
    if (totalKills > 0) {
      this.emitBloodEffects(allKillPositions, this.player!.getPosition(), cfg.particleCount, cfg.decalCount);
      this.shakeCamera(cfg.cameraShakeMultiplier * totalKills);
    }
    const particlesTime = performance.now() - particlesStart;

    const totalTime = performance.now() - attackStart;

  }

  private handleBicycleAttack(): void {
    if (!this.vehicle || !this.player) return;
    const cfg = PLAYER_ATTACK_CONFIG.BICYCLE;

    const attackPosition = this.vehicle.getPosition();
    // Reuse pre-allocated vectors instead of new THREE.Vector3()
    this._tempVehicleDir.set(0, 0, 1).applyAxisAngle(this._yAxis, this.vehicle.getRotationY());

    const attackRadius = cfg.attackRadius;
    const damage = cfg.damage;
    const maxKills = this.stats.combo >= cfg.comboThreshold ? Infinity : cfg.maxKills;
    const coneAngle = cfg.coneAngle;

    let totalKills = 0;
    const allKillPositions: THREE.Vector3[] = [];

    if (this.crowd) {
      const pedResult = this.crowd.damageInRadius(
        attackPosition,
        attackRadius,
        damage,
        maxKills,
        this._tempVehicleDir,
        coneAngle
      );

      if (pedResult.kills > 0) {
        const basePoints = SCORING_CONFIG.PEDESTRIAN_BICYCLE;
        const regularKills = pedResult.kills - pedResult.panicKills;
        const panicKills = pedResult.panicKills;

        const regularPoints = regularKills * (this.stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER : basePoints);
        const panicPoints = panicKills * (this.stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER * SCORING_CONFIG.PANIC_MULTIPLIER : basePoints * SCORING_CONFIG.PANIC_MULTIPLIER);

        this.stats.score += regularPoints + panicPoints;
        this.stats.kills += pedResult.kills;
        this.stats.combo += pedResult.kills;
        this.stats.comboTimer = SCORING_CONFIG.COMBO_DURATION;
        this.lastCombatTime = this.stats.gameTime;
        this.stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, this.stats.heat + (pedResult.kills * SCORING_CONFIG.HEAT_PER_PED_KILL));

        totalKills += pedResult.kills;
        allKillPositions.push(...pedResult.positions);

        for (let i = 0; i < regularKills; i++) {
          const message = this.stats.inPursuit
            ? Engine.randomFrom(Engine.PURSUIT_KILL_MESSAGES)
            : 'BIKE SLASH!';
          const points = this.stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER : basePoints;
          this.triggerKillNotification(message, this.stats.inPursuit, points);
        }
        for (let i = 0; i < panicKills; i++) {
          const points = this.stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER * SCORING_CONFIG.PANIC_MULTIPLIER : basePoints * SCORING_CONFIG.PANIC_MULTIPLIER;
          this.triggerKillNotification('CYCLE SLAUGHTER!', true, points);
        }

        this.crowd.panicCrowd(attackPosition, cfg.panicRadius);
      }
    }

    // Foot cops
    if (this.cops) {
      const copResult = this.cops.damageInRadius(
        attackPosition,
        attackRadius + 1,
        damage,
        maxKills,
        this._tempVehicleDir,
        coneAngle
      );

      if (copResult.kills > 0) {
        const basePoints = SCORING_CONFIG.COP_BASE;
        const pointsPerKill = basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER;
        this.stats.score += copResult.kills * pointsPerKill;
        this.stats.copKills += copResult.kills;
        this.updateWantedStars(true);
        this.stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, this.stats.heat + (copResult.kills * SCORING_CONFIG.HEAT_PER_COP_KILL));
        totalKills += copResult.kills;
        allKillPositions.push(...copResult.positions);

        for (let i = 0; i < copResult.kills; i++) {
          this.triggerKillNotification('COP CYCLIST!', true, pointsPerKill);
        }
      }
    }

    // Bike cops
    if (this.bikeCops) {
      const bikeResult = this.bikeCops.damageInRadius(
        attackPosition,
        attackRadius + 1,
        damage,
        maxKills - totalKills,
        this._tempVehicleDir,
        coneAngle
      );

      if (bikeResult.kills > 0) {
        const basePoints = SCORING_CONFIG.COP_BASE;
        const pointsPerKill = basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER;
        this.stats.score += bikeResult.kills * pointsPerKill;
        this.stats.copKills += bikeResult.kills;
        this.updateWantedStars(true);
        this.stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, this.stats.heat + (bikeResult.kills * SCORING_CONFIG.HEAT_PER_COP_KILL));
        totalKills += bikeResult.kills;
        allKillPositions.push(...bikeResult.positions);

        for (let i = 0; i < bikeResult.kills; i++) {
          this.triggerKillNotification('COP CYCLIST!', true, pointsPerKill);
        }
      }
    }

    if (totalKills > 0) {
      this.emitBloodEffects(allKillPositions, this.vehicle.getPosition(), cfg.particleCount, cfg.decalCount);
      this.shakeCamera(cfg.cameraShakeMultiplier * totalKills);
    }
  }

  private handleMotorbikeShoot(): void {
    if (!this.vehicle || !this.player) return;
    const cfg = PLAYER_ATTACK_CONFIG.MOTORBIKE;

    const attackPosition = this.vehicle.getPosition();
    // Reuse pre-allocated vectors instead of new THREE.Vector3()
    this._tempVehicleDir.set(0, 0, 1).applyAxisAngle(this._yAxis, this.vehicle.getRotationY());

    let totalKills = 0;
    let totalKnockedBack = 0;
    const allKillPositions: THREE.Vector3[] = [];

    // --- BLAST ATTACK: 360° knockback around player ---
    // Blast max kills scales with combo: 5 base → 8 at 10+ → unlimited at 15+
    let blastMaxKills = cfg.blastMaxKills; // Base: 5
    if (this.stats.combo >= 15) {
      blastMaxKills = Infinity;
    } else if (this.stats.combo >= 10) {
      blastMaxKills = 8;
    }

    if (this.crowd) {
      const blastResult = this.crowd.blastInRadius(
        attackPosition,
        cfg.blastRadius,
        cfg.blastForce,
        cfg.blastDamage,
        blastMaxKills
      );

      if (blastResult.kills > 0) {
        const basePoints = SCORING_CONFIG.PEDESTRIAN_MOTORBIKE;
        const points = this.stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER : basePoints;

        this.stats.score += points * blastResult.kills;
        this.stats.kills += blastResult.kills;
        this.stats.combo += blastResult.kills;
        this.stats.comboTimer = SCORING_CONFIG.COMBO_DURATION;
        this.lastCombatTime = this.stats.gameTime;
        this.stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, this.stats.heat + (blastResult.kills * SCORING_CONFIG.HEAT_PER_MOTORBIKE_PED_KILL));

        totalKills += blastResult.kills;
        allKillPositions.push(...blastResult.positions);

        this.triggerKillNotification('BLAST KILL!', true, points);
        this.crowd.panicCrowd(attackPosition, cfg.panicRadius);
      }

      totalKnockedBack += blastResult.knockedBack;
    }

    // Apply knockback to cops in blast radius
    if (this.cops) {
      this.cops.applyKnockbackInRadius(attackPosition, cfg.blastRadius, cfg.blastForce);
    }
    if (this.motorbikeCops) {
      this.motorbikeCops.applyKnockbackInRadius(attackPosition, cfg.blastRadius, cfg.blastForce);
    }

    // Show blast visual FX
    if (totalKills > 0 || totalKnockedBack > 0) {
      this.showMotorbikeBlast(attackPosition);
      this.shakeCamera(1.5);

      // Blood effects for kills
      if (totalKills > 0) {
        this.emitBloodEffects(allKillPositions, attackPosition, cfg.particleCount, cfg.decalCount);
      }
    } else {
      // Miss feedback
      this.shakeCamera(cfg.cameraShakeMiss);
    }

    // Update stats
    if (totalKills > 0) {
      this.updateWantedStars(true);
    }
  }

  /**
   * Original forward-cone motorbike shooting (kept for reference, could be secondary attack)
   */
  private handleMotorbikeShootCone(): void {
    if (!this.vehicle || !this.player) return;
    const cfg = PLAYER_ATTACK_CONFIG.MOTORBIKE;

    const attackPosition = this.vehicle.getPosition();
    this._tempVehicleDir.set(0, 0, 1).applyAxisAngle(this._yAxis, this.vehicle.getRotationY());

    const attackRadius = cfg.attackRadius;
    const damage = cfg.damage;
    const maxKills = cfg.maxKills;
    const coneAngle = cfg.coneAngle;

    let totalKills = 0;
    const allKillPositions: THREE.Vector3[] = [];

    if (this.crowd) {
      const pedResult = this.crowd.damageInRadius(
        attackPosition,
        attackRadius,
        damage,
        maxKills,
        this._tempVehicleDir,
        coneAngle
      );

      if (pedResult.kills > 0) {
        const basePoints = SCORING_CONFIG.PEDESTRIAN_MOTORBIKE;
        const points = this.stats.inPursuit ? basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER : basePoints;

        this.stats.score += points * pedResult.kills;
        this.stats.kills += pedResult.kills;
        this.stats.combo += pedResult.kills;
        this.stats.comboTimer = SCORING_CONFIG.COMBO_DURATION;
        this.lastCombatTime = this.stats.gameTime;
        this.stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, this.stats.heat + (pedResult.kills * SCORING_CONFIG.HEAT_PER_MOTORBIKE_PED_KILL));

        totalKills += pedResult.kills;
        allKillPositions.push(...pedResult.positions);

        const message = pedResult.panicKills > 0 ? 'DRIVE-BY TERROR!' : 'DRIVE-BY!';
        this.triggerKillNotification(message, true, points);

        this.crowd.panicCrowd(attackPosition, cfg.panicRadius);
      }
    }

    // Foot cops
    if (this.cops) {
      const copResult = this.cops.damageInRadius(
        attackPosition,
        attackRadius,
        damage,
        maxKills,
        this._tempVehicleDir,
        coneAngle
      );

      if (copResult.kills > 0) {
        const basePoints = SCORING_CONFIG.COP_MOTORBIKE;
        const pointsPerKill = basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER;
        this.stats.score += copResult.kills * pointsPerKill;
        this.stats.copKills += copResult.kills;
        this.updateWantedStars(true);
        this.stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, this.stats.heat + (copResult.kills * SCORING_CONFIG.HEAT_PER_MOTORBIKE_COP_KILL));
        totalKills += copResult.kills;
        allKillPositions.push(...copResult.positions);

        this.triggerKillNotification('COP KILLER!', true, pointsPerKill);
      }
    }

    // Motorbike cops
    if (this.motorbikeCops) {
      const motoResult = this.motorbikeCops.damageInRadius(
        attackPosition,
        attackRadius,
        damage,
        maxKills - totalKills,
        this._tempVehicleDir,
        coneAngle
      );

      if (motoResult.kills > 0) {
        const basePoints = SCORING_CONFIG.COP_MOTORBIKE;
        const pointsPerKill = basePoints * SCORING_CONFIG.PURSUIT_MULTIPLIER;
        this.stats.score += motoResult.kills * pointsPerKill + motoResult.points;
        this.stats.copKills += motoResult.kills;
        this.updateWantedStars(true);
        this.stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, this.stats.heat + (motoResult.kills * SCORING_CONFIG.HEAT_PER_MOTORBIKE_COP_KILL));
        totalKills += motoResult.kills;
        allKillPositions.push(...motoResult.positions);

        this.triggerKillNotification('BIKER DOWN!', true, pointsPerKill);
      }
    }

    if (totalKills > 0) {
      this.emitBloodEffects(allKillPositions, this.vehicle.getPosition(), cfg.particleCount, cfg.decalCount);
      this.shakeCamera(cfg.cameraShakeHit);
    }

    if (totalKills === 0) {
      this.shakeCamera(cfg.cameraShakeMiss);
    }
  }

  private handleVehicleKill(position: THREE.Vector3, wasPanicking: boolean = false): void {
    const cfg = PLAYER_ATTACK_CONFIG.VEHICLE_HIT;
    this.stats.kills++;

    const basePoints = SCORING_CONFIG.PEDESTRIAN_ROADKILL;
    let points = basePoints;
    if (wasPanicking) points *= SCORING_CONFIG.PANIC_MULTIPLIER;
    if (this.stats.inPursuit) points *= SCORING_CONFIG.PURSUIT_MULTIPLIER;

    this.stats.score += points;
    this.stats.combo++;
    this.stats.comboTimer = SCORING_CONFIG.COMBO_DURATION;
        this.lastCombatTime = this.stats.gameTime;
    this.stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, this.stats.heat + SCORING_CONFIG.HEAT_PER_PED_KILL);

    this.particles.emitBlood(position, cfg.particleCount);
    if (this.crowd) {
      this.crowd.panicCrowd(position, cfg.panicRadius);
      this.crowd.panicTablePedestrians(position);
    }

    let message: string;
    if (wasPanicking) {
      message = Engine.randomFrom(Engine.PANIC_KILL_MESSAGES);
    } else if (this.stats.inPursuit) {
      message = Engine.randomFrom(Engine.PURSUIT_KILL_MESSAGES);
    } else {
      message = Engine.randomFrom(Engine.ROADKILL_MESSAGES);
    }
    this.triggerKillNotification(message, wasPanicking || this.stats.inPursuit, points);

    this.shakeCamera(cfg.cameraShake);
  }

  private static readonly BUILDING_DESTROY_MESSAGES = ['DEMOLISHED!', 'WRECKED!', 'CRUSHED!', 'LEVELED!', 'OBLITERATED!'];

  private handleBuildingDestruction(position: THREE.Vector3): void {
    // Big points for destroying a building!
    const basePoints = 500;
    let points = basePoints;
    if (this.stats.inPursuit) points *= SCORING_CONFIG.PURSUIT_MULTIPLIER;

    this.stats.score += points;
    this.stats.combo++;
    this.stats.comboTimer = SCORING_CONFIG.COMBO_DURATION;
        this.lastCombatTime = this.stats.gameTime;
    this.stats.heat = Math.min(SCORING_CONFIG.HEAT_MAX, this.stats.heat + 50); // Big heat boost!

    // Debris explosion (not blood!)
    this.particles.emitDebris(position, 30);

    // Camera shake (same as vehicle kill)
    this.shakeCamera(1.0);

    const message = Engine.randomFrom(Engine.BUILDING_DESTROY_MESSAGES);
    this.triggerKillNotification(message, true, points);
  }

  resize(width: number, height: number): void {
    const aspect = width / height;
    const frustumSize = CAMERA_CONFIG.FRUSTUM_SIZE;

    this.camera.left = (frustumSize * aspect) / -2;
    this.camera.right = (frustumSize * aspect) / 2;
    this.camera.top = frustumSize / 2;
    this.camera.bottom = frustumSize / -2;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  private animate = (): void => {
    if (this.state !== GameState.PLAYING) return;

    this.animationId = requestAnimationFrame(this.animate);

    const frameStart = DEBUG_PERFORMANCE_PANEL ? performance.now() : 0;
    const rawDeltaTime = this.clock.getDelta();

    // Apply slow-mo effect (Burnout-style impact frame on tier unlock)
    if (this.slowmoTimer > 0) {
      this.slowmoTimer -= rawDeltaTime;
      // Ease out of slowmo in final 20% of duration
      if (this.slowmoTimer < this.SLOWMO_DURATION * 0.2) {
        const t = this.slowmoTimer / (this.SLOWMO_DURATION * 0.2);
        this.slowmoScale = this.SLOWMO_SCALE + (1 - this.SLOWMO_SCALE) * (1 - t);
      }
      if (this.slowmoTimer <= 0) {
        this.slowmoScale = 1.0;
      }
    }
    const deltaTime = rawDeltaTime * this.slowmoScale;
    this.update(deltaTime);

    const renderStart = DEBUG_PERFORMANCE_PANEL ? performance.now() : 0;
    this.render();

    // Performance tracking (only when DEBUG_PERFORMANCE_PANEL is enabled)
    if (DEBUG_PERFORMANCE_PANEL) {
      const renderEnd = performance.now();

      this.performanceStats.rendering = renderEnd - renderStart;
      this.performanceStats.frameTime = renderEnd - frameStart;
      this.performanceStats.fps = 1000 / (frameStart - this.performanceStats.lastFrameTime);
      this.performanceStats.lastFrameTime = frameStart;

      // Capture Three.js renderer stats (draw calls, triangles, memory)
      const info = this.renderer.info;
      this.performanceStats.renderer = {
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        points: info.render.points,
        lines: info.render.lines,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      };

      this.performanceStats.counts = {
        cops: this.cops?.getActiveCopCount() || 0,
        pedestrians: this.crowd?.getPedestrianCount() || 0,
        particles: this.particles?.getParticleCount() || 0,
        bloodDecals: this.bloodDecals?.getDecalCount() || 0,
        buildings: this.buildings?.getBuildingCount() || 0
      };

      // Push to circular buffers (O(1) - no shift needed, auto-overwrites old values)
      const history = this.performanceStats.history;
      history.frameTime.push(this.performanceStats.frameTime);
      history.physics.push(this.performanceStats.physics);
      history.entities.push(this.performanceStats.entities);
      history.player.push(this.performanceStats.player);
      history.cops.push(this.performanceStats.cops);
      history.pedestrians.push(this.performanceStats.pedestrians);
      history.world.push(this.performanceStats.world);
      history.rendering.push(this.performanceStats.rendering);
      history.drawCalls.push(this.performanceStats.renderer.drawCalls);

      // Calculate averages using circular buffer's built-in average()
      this.performanceStats.avgFrameTime = history.frameTime.average();
      this.performanceStats.avgPhysics = history.physics.average();
      this.performanceStats.avgEntities = history.entities.average();
      this.performanceStats.avgPlayer = history.player.average();
      this.performanceStats.avgCops = history.cops.average();
      this.performanceStats.avgPedestrians = history.pedestrians.average();
      this.performanceStats.avgWorld = history.world.average();
      this.performanceStats.avgRendering = history.rendering.average();
      this.performanceStats.avgDrawCalls = history.drawCalls.average();

      if (this.performanceStats.frameTime > this.performanceStats.worstFrame.frameTime) {
        const { physics, entities, player, cops, pedestrians, world, rendering, renderer } = this.performanceStats;

        let bottleneck: typeof this.performanceStats.worstFrame.bottleneck = 'none';
        let maxTime = 0;

        if (physics > maxTime) { maxTime = physics; bottleneck = 'physics'; }
        if (player > maxTime) { maxTime = player; bottleneck = 'player'; }
        if (cops > maxTime) { maxTime = cops; bottleneck = 'cops'; }
        if (pedestrians > maxTime) { maxTime = pedestrians; bottleneck = 'pedestrians'; }
        if (world > maxTime) { maxTime = world; bottleneck = 'world'; }
        if (rendering > maxTime) { maxTime = rendering; bottleneck = 'rendering'; }

        this.performanceStats.worstFrame = {
          frameTime: this.performanceStats.frameTime,
          physics,
          entities,
          player,
          cops,
          pedestrians,
          world,
          particles: this.performanceStats.particles,
          bloodDecals: this.performanceStats.bloodDecals,
          rendering,
          bottleneck,
          counts: { ...this.performanceStats.counts },
          renderer: {
            drawCalls: renderer.drawCalls,
            triangles: renderer.triangles,
          }
        };
      }
    }
  };

  private update(dt: number): void {
    const physicsStart = DEBUG_PERFORMANCE_PANEL ? performance.now() : 0;
    if (this.physics.isReady()) {
      this.physics.step(dt);
    }
    if (DEBUG_PERFORMANCE_PANEL) this.performanceStats.physics = performance.now() - physicsStart;

    this.stats.gameTime += dt;

    if (this.cameraShakeIntensity > 0) {
      this.cameraShakeIntensity = Math.max(0, this.cameraShakeIntensity - (this.cameraShakeDecay * dt));
    }

    if (this.stats.comboTimer > 0) {
      this.stats.comboTimer = Math.max(0, this.stats.comboTimer - dt);
      if (this.stats.comboTimer === 0) {
        this.stats.combo = 0;
      }
    }

    // Check for combo milestone announcements
    this.checkComboMilestones();

    if (this.stats.heat > 0) {
      // Faster heat decay when not in combat for 10+ seconds (3x normal rate)
      const timeSinceCombat = this.stats.gameTime - this.lastCombatTime;
      const heatDecayRate = timeSinceCombat > 10 ? 1.5 : 0.5; // 3x decay when idle
      this.stats.heat = Math.max(0, this.stats.heat - (heatDecayRate * dt));
    }

    // Update wanted stars decay (stars decrease over time without cop kills)
    this.updateWantedStars(false);

    // --- Entity Updates ---
    const entitiesStart = DEBUG_PERFORMANCE_PANEL ? performance.now() : 0;

    // Player
    const playerStart = DEBUG_PERFORMANCE_PANEL ? performance.now() : 0;

    // --- Tier Progression System ---
    // Check if player should receive next tier vehicle
    this.checkTierProgression();

    // Update awaiting vehicle glow effect
    this.updateAwaitingVehicleGlow(dt);

    // Update vehicles pending cleanup
    this.updateVehicleCleanup(dt);

    const taserState = this.player?.getTaserState() || { isTased: false, escapeProgress: 0 };
    const isNearCurrentVehicle = this.isPlayerNearVehicle();
    const isNearAwaitingVehicle = this.isPlayerNearAwaitingVehicle();
    const actionContext = {
      isTased: taserState.isTased,
      isNearCar: this.vehicleSpawned && isNearCurrentVehicle,
      isNearAwaitingVehicle: this.awaitingVehicle !== null && isNearAwaitingVehicle,
      isInVehicle: this.isInVehicle,
    };
    const { action, isNewPress } = this.actionController.resolve(this.input, actionContext);

    if (isNewPress) {
      switch (action) {
        case ActionType.ENTER_CAR:
          this.enterVehicle();
          break;
        case ActionType.SWITCH_VEHICLE:
          this.switchToAwaitingVehicle();
          break;
        case ActionType.ESCAPE_TASER:
          this.player?.handleEscapePress();
          break;
        case ActionType.ATTACK:
          if (this.player) {
            if (!this.isInVehicle) {
              this.player.performAttack();
            } else if (this.getCurrentVehicleType() === VehicleType.BICYCLE) {
              this.handleBicycleAttack();
              this.player.playBicycleAttack();
            } else if (this.getCurrentVehicleType() === VehicleType.MOTORBIKE) {
              this.handleMotorbikeShoot();
              this.player.playMotorbikeShoot();
            }
          }
          break;
      }
    }

    if (this.vehicle) {
      if (this.isInVehicle) {
        this.vehicle.update(dt);
      }
    }

    if (this.player) {
      if (!this.isInVehicle) {
        // Reuse pre-allocated vector for camera direction (avoid per-frame clone)
        this._tempCameraPos.copy(this.camera.position).normalize();
        this.player.setCameraDirection(this._tempCameraPos);
        this.player.update(dt);

        const taserState = this.player.getTaserState();
        this.stats.isTased = taserState.isTased;
        this.stats.taseEscapeProgress = taserState.escapeProgress;
      } else {
        this.player.updateAnimations(dt);
      }
    }
    if (DEBUG_PERFORMANCE_PANEL) this.performanceStats.player = performance.now() - playerStart;

    // Get current position (reuse pre-allocated vector for fallback)
    const playerPos = this.isInVehicle && this.vehicle
      ? this.vehicle.getPosition()
      : this.player?.getPosition();
    const currentPos = playerPos || this._tempCurrentPos.set(0, 0, 0);

    // World elements (buildings, lampposts)
    const worldStart = DEBUG_PERFORMANCE_PANEL ? performance.now() : 0;
    if (this.buildings) {
      this.buildings.update(currentPos);
      this.buildings.updateDestructionAnimations();
    }
    if (this.lampPosts) {
      this.lampPosts.update(currentPos);
    }
    if (this.christmasTrees) {
      this.christmasTrees.update(currentPos);
    }
    if (DEBUG_PERFORMANCE_PANEL) this.performanceStats.world = performance.now() - worldStart;

    // Pedestrians
    const pedestriansStart = DEBUG_PERFORMANCE_PANEL ? performance.now() : 0;
    if (this.crowd) {
      this.crowd.update(dt, currentPos);
      this.crowd.updateTables(currentPos);
      this.crowd.updateSurge(dt); // Handle tier unlock crowd surge

      const isBicycle = this.getCurrentVehicleType() === VehicleType.BICYCLE;
      const isTruck = this.getCurrentVehicleType() === VehicleType.TRUCK;
      if (this.isInVehicle && this.vehicle && !isBicycle) {
        const vehicleVelocity = this.vehicle.getVelocity();
        const speed = vehicleVelocity.length();

        // Truck kills even when stationary (it's massive), other vehicles need speed > 1
        if (isTruck || speed > 1) {
          let result: { kills: number; panicKills: number; positions: THREE.Vector3[] };

          if (isTruck) {
            // Truck uses box collision with swept detection for rotation
            const dims = this.vehicle.getColliderDimensions();
            const rotation = this.vehicle.getRotationY();
            const prevRotation = this.vehicle.getPreviousRotationY();
            result = this.crowd.damageInBox(currentPos, dims.width, dims.length, rotation, 999, prevRotation);

            if (this.vehicle.causesRagdoll()) {
              this.crowd.applyBoxKnockback(currentPos, vehicleVelocity, dims.width, dims.length, rotation);
            }

            // Truck building destruction
            if (this.buildings) {
              const destroyedPos = this.buildings.checkTruckCollision(currentPos, Math.max(dims.width, dims.length));
              if (destroyedPos) {
                this.handleBuildingDestruction(destroyedPos);
              }
            }
          } else {
            // Other vehicles use circular radius
            const vehicleKillRadius = this.vehicle.getKillRadius();
            result = this.crowd.damageInRadius(currentPos, vehicleKillRadius, 999, Infinity);

            if (this.vehicle.causesRagdoll()) {
              this.crowd.applyVehicleKnockback(currentPos, vehicleVelocity, vehicleKillRadius);
            }
          }

          const regularKills = result.kills - result.panicKills;
          for (let i = 0; i < regularKills; i++) {
            this.handleVehicleKill(result.positions[i] || currentPos, false);
          }
          for (let i = 0; i < result.panicKills; i++) {
            this.handleVehicleKill(result.positions[regularKills + i] || currentPos, true);
          }

        }
      } else if (this.player) {
        this.crowd.handlePlayerCollisions(currentPos);
      }

      this.crowd.cleanup(currentPos);
    }
    if (DEBUG_PERFORMANCE_PANEL) this.performanceStats.pedestrians = performance.now() - pedestriansStart;

    // Get player velocity for cop AI prediction (reuse pre-allocated zero vector for fallback)
    const playerVelocity = this.isInVehicle && this.vehicle
      ? this.vehicle.getVelocity()
      : this._zeroVelocity;

    // Cops - spawn type depends on player's current vehicle tier
    const copsStart = DEBUG_PERFORMANCE_PANEL ? performance.now() : 0;
    const playerCanBeTased = !this.isInVehicle && this.player ? this.player.canBeTased() : false;

    // Regular foot cops - only when player is on foot (not spawning or updating when in any vehicle)
    if (this.cops) {
      if (!this.isInVehicle) {
        this.cops.updateSpawns(this.stats.heat, currentPos);
        this.cops.update(dt, currentPos, this.stats.wantedStars, playerCanBeTased);
      }
    }

    // Bike cops - only when player is on bicycle
    if (this.bikeCops) {
      if (this.isInVehicle && this.currentVehicleTier === Tier.BIKE) {
        this.bikeCops.updateSpawns(this.stats.heat, currentPos, dt);
      }
      this.bikeCops.update(dt, currentPos, playerCanBeTased);
    }

    // Motorbike cops - only when player is on motorbike or higher
    if (this.motorbikeCops) {
      if (this.isInVehicle && this.currentVehicleTier !== null &&
          this.currentVehicleTier !== Tier.FOOT && this.currentVehicleTier !== Tier.BIKE) {
        this.motorbikeCops.updateSpawns(this.stats.heat, currentPos, playerVelocity, dt);
      }
      this.motorbikeCops.update(dt, currentPos, playerVelocity, this.stats.wantedStars, playerCanBeTased);
    }

    // Cop cars - only when player is in sedan or truck
    if (this.copCars) {
      if (this.isInVehicle && this.currentVehicleTier !== null &&
          (this.currentVehicleTier === Tier.SEDAN || this.currentVehicleTier === Tier.TRUCK)) {
        this.copCars.updateSpawns(this.stats.heat, currentPos, playerVelocity, dt);

        // Truck tramples cop cars
        if (this.currentVehicleTier === Tier.TRUCK && this.vehicle) {
          const trampleResult = this.copCars.trampleInRadius(currentPos, 6.0);
          if (trampleResult.kills > 0) {
            this.stats.score += trampleResult.points;
            this.stats.copKills += trampleResult.kills;
            this.updateWantedStars(true);
            this.shakeCamera(2.0);
            for (const pos of trampleResult.positions) {
              this.particles.emitBlood(pos, 80);
              this.triggerKillNotification('COP CAR CRUSHED!', true, 500);
            }
          }
        }
      }
      this.copCars.update(dt, currentPos);
    }
    if (DEBUG_PERFORMANCE_PANEL) this.performanceStats.cops = performance.now() - copsStart;

    // Update inPursuit based on total cop count
    const footCopCount = this.cops?.getActiveCopCount() || 0;
    const bikeCopCount = (this.bikeCops?.getActiveCopCount() || 0) + (this.motorbikeCops?.getActiveCopCount() || 0);
    const carCopCount = this.copCars?.getActiveCopCount() || 0;
    this.stats.inPursuit = footCopCount + bikeCopCount + carCopCount > 0;

    this.ai.update(dt);
    this.particles.update(dt);
    this.bloodDecals.update();
    this.updateEscapeFlash(dt);
    this.updateExplosionEffects(dt);

    // Total entities update time
    if (DEBUG_PERFORMANCE_PANEL) this.performanceStats.entities = performance.now() - entitiesStart;

    // Camera follow player/car (unless manual control is active)
    if (!this.disableCameraFollow) {
      // Get target position (reuse currentPos already calculated above)
      const targetPos = currentPos;

      // Camera offset depends on vehicle - truck needs higher/further view
      const isTruck = this.isInVehicle && this.currentVehicleTier === Tier.TRUCK;
      const targetOffsetX = isTruck ? 5 : 2.5;
      const targetOffsetY = isTruck ? 14 : 6.25;
      const targetOffsetZ = isTruck ? 5 : 2.5;
      // Truck needs 2x zoom out (larger frustum = more visible area)
      const targetZoom = isTruck ? CAMERA_CONFIG.FRUSTUM_SIZE * 2 : CAMERA_CONFIG.FRUSTUM_SIZE;

      // Smoothly lerp camera offset (for truck zoom in/out transitions)
      this._currentCameraOffset.x += (targetOffsetX - this._currentCameraOffset.x) * 0.05;
      this._currentCameraOffset.y += (targetOffsetY - this._currentCameraOffset.y) * 0.05;
      this._currentCameraOffset.z += (targetOffsetZ - this._currentCameraOffset.z) * 0.05;

      // Smoothly lerp camera zoom (frustum size for orthographic camera)
      this.currentCameraZoom += (targetZoom - this.currentCameraZoom) * 0.05;

      // Update orthographic camera frustum for zoom effect
      const aspect = this.renderer.domElement.width / this.renderer.domElement.height;
      this.camera.left = (this.currentCameraZoom * aspect) / -2;
      this.camera.right = (this.currentCameraZoom * aspect) / 2;
      this.camera.top = this.currentCameraZoom / 2;
      this.camera.bottom = this.currentCameraZoom / -2;
      this.camera.updateProjectionMatrix();

      // Isometric camera with smoothly-interpolated offset
      this._tempCameraPos.set(
        targetPos.x + this._currentCameraOffset.x,
        targetPos.y + this._currentCameraOffset.y,
        targetPos.z + this._currentCameraOffset.z
      );

      // Smooth lerp camera to follow target
      this.camera.position.lerp(this._tempCameraPos, 0.1);

      // Update lookAt (reuse pre-allocated vector)
      this._tempLookAt.set(targetPos.x, targetPos.y, targetPos.z);
      this.camera.lookAt(this._tempLookAt);
      this.lastPlayerPosition.copy(targetPos);

      // Update base position AND rotation AFTER lookAt (so render() applies shake from this base)
      this.cameraBasePosition.copy(this.camera.position);
      this.cameraBaseQuaternion.copy(this.camera.quaternion);
    }

    // Update cop health bars every 3 frames (project 3D positions to 2D screen space)
    this.healthBarUpdateCounter++;
    if (this.healthBarUpdateCounter >= 3) {
      this.healthBarUpdateCounter = 0;
      const canvas = this.renderer.domElement;

      // Reset and reuse pre-allocated array
      this._healthBarResult.length = 0;

      // Collect cop data from all cop managers
      const allCopData: Array<{ position: THREE.Vector3; health: number; maxHealth: number }> = [];
      if (this.cops) {
        allCopData.push(...this.cops.getCopData());
      }
      if (this.bikeCops) {
        allCopData.push(...this.bikeCops.getCopData());
      }
      if (this.copCars) {
        allCopData.push(...this.copCars.getCopData());
      }

      for (const cop of allCopData) {
        // Project 3D world position to 2D screen coordinates
        // Just offset up from cop's actual position for head height
        this._tempScreenPos.copy(cop.position);
        this._tempScreenPos.y += 1.5; // Offset up to above head
        this._tempScreenPos.project(this.camera);

        // Convert normalized device coordinates to screen pixels
        const x = (this._tempScreenPos.x * 0.5 + 0.5) * canvas.clientWidth;
        const y = (-(this._tempScreenPos.y * 0.5) + 0.5) * canvas.clientHeight;

        this._healthBarResult.push({
          x,
          y,
          health: cop.health,
          maxHealth: cop.maxHealth
        });
      }

      this.stats.copHealthBars = this._healthBarResult;
    }

    // Send stats update (including performance data and vehicle state)
    if (this.callbacks.onStatsUpdate) {
      const isNearCar = this.vehicleSpawned && !this.isInVehicle && this.isPlayerNearVehicle();
      const vehicleStats = this.isInVehicle && this.vehicle ? {
        vehicleHealth: this.vehicle.getHealth(),
        vehicleMaxHealth: this.vehicle.getMaxHealth(),
        isInVehicle: true,
        isNearCar: false,
      } : {
        vehicleHealth: undefined,
        vehicleMaxHealth: undefined,
        isInVehicle: false,
        isNearCar: isNearCar,
      };

      this.callbacks.onStatsUpdate({
        ...this.stats,
        ...vehicleStats,
        performance: DEBUG_PERFORMANCE_PANEL ? this.performanceStats : undefined
      });
    }
  }

  /**
   * Trigger camera shake
   */
  private shakeCamera(intensity: number = 0.3): void {
    this.cameraShakeIntensity = Math.max(this.cameraShakeIntensity, intensity);
  }

  /**
   * Show a cartoonish flash effect at player position during taser escape
   */
  private showEscapeFlash(): void {
    if (!this.player) return;

    const position = this.player.getPosition();

    // Create or reuse flash sprite
    if (!this.escapeFlashSprite) {
      // Create a radial gradient texture for the flash
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;

      // Draw a cartoonish starburst/flash pattern
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 128, 128);

      // Radial gradient for glow
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255, 255, 100, 1)');
      gradient.addColorStop(0.2, 'rgba(255, 255, 200, 0.9)');
      gradient.addColorStop(0.4, 'rgba(255, 200, 50, 0.7)');
      gradient.addColorStop(0.7, 'rgba(255, 150, 0, 0.3)');
      gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(64, 64, 64, 0, Math.PI * 2);
      ctx.fill();

      // Add starburst rays for cartoonish effect
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 3;
      const rays = 8;
      for (let i = 0; i < rays; i++) {
        const angle = (i / rays) * Math.PI * 2;
        const innerRadius = 20;
        const outerRadius = 55;
        ctx.beginPath();
        ctx.moveTo(64 + Math.cos(angle) * innerRadius, 64 + Math.sin(angle) * innerRadius);
        ctx.lineTo(64 + Math.cos(angle) * outerRadius, 64 + Math.sin(angle) * outerRadius);
        ctx.stroke();
      }

      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      this.escapeFlashSprite = new THREE.Sprite(material);
      this.escapeFlashSprite.scale.set(3, 3, 1);
      this.scene.add(this.escapeFlashSprite);
    }

    // Position flash at player
    this.escapeFlashSprite.position.set(position.x, position.y + 1, position.z);
    this.escapeFlashSprite.visible = true;

    // Randomize rotation for variety
    this.escapeFlashSprite.material.rotation = Math.random() * Math.PI * 2;

    // Set life for fade out
    this.escapeFlashLife = 0.15; // 150ms flash
  }

  /**
   * Update escape flash effect
   */
  private updateEscapeFlash(dt: number): void {
    if (this.escapeFlashLife > 0 && this.escapeFlashSprite) {
      this.escapeFlashLife -= dt;
      const alpha = Math.max(0, this.escapeFlashLife / 0.15);
      this.escapeFlashSprite.material.opacity = alpha;
      // Scale up as it fades
      const scale = 3 + (1 - alpha) * 2;
      this.escapeFlashSprite.scale.set(scale, scale, 1);

      if (this.escapeFlashLife <= 0) {
        this.escapeFlashSprite.visible = false;
      }
    }
  }

  /**
   * Show big explosion effect when player escapes taser
   */
  private showTaserEscapeExplosion(position: THREE.Vector3): void {
    // Create explosion sprite (bright flash)
    if (!this.explosionSprite) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;

      // Big radial gradient explosion
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.2, 'rgba(255, 255, 150, 1)');
      gradient.addColorStop(0.4, 'rgba(255, 200, 50, 0.8)');
      gradient.addColorStop(0.6, 'rgba(255, 100, 0, 0.5)');
      gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(64, 64, 64, 0, Math.PI * 2);
      ctx.fill();

      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      this.explosionSprite = new THREE.Sprite(material);
      this.scene.add(this.explosionSprite);
    }

    // Create shockwave ring
    if (!this.shockwaveRing) {
      const ringGeometry = new THREE.RingGeometry(0.5, 1, 32);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      });
      this.shockwaveRing = new THREE.Mesh(ringGeometry, ringMaterial);
      this.shockwaveRing.rotation.x = -Math.PI / 2; // Lay flat
      this.scene.add(this.shockwaveRing);
    }

    // Position and activate explosion
    this.explosionSprite.position.set(position.x, position.y + 1, position.z);
    this.explosionSprite.scale.set(2, 2, 1);
    this.explosionSprite.visible = true;
    this.explosionSprite.material.opacity = 1;
    this.explosionLife = 0.4;

    // Position and activate shockwave
    this.shockwaveRing.position.set(position.x, 0.1, position.z);
    this.shockwaveRing.scale.set(1, 1, 1);
    this.shockwaveRing.visible = true;
    (this.shockwaveRing.material as THREE.MeshBasicMaterial).opacity = 0.8;
    this.shockwaveLife = 0.5;
  }

  /**
   * Update explosion and shockwave effects
   */
  private updateExplosionEffects(dt: number): void {
    // Update explosion sprite
    if (this.explosionLife > 0 && this.explosionSprite) {
      this.explosionLife -= dt;
      const progress = 1 - (this.explosionLife / 0.4);
      this.explosionSprite.material.opacity = 1 - progress;
      const scale = 2 + progress * 10; // Expand from 2 to 12
      this.explosionSprite.scale.set(scale, scale, 1);

      if (this.explosionLife <= 0) {
        this.explosionSprite.visible = false;
      }
    }

    // Update shockwave ring
    if (this.shockwaveLife > 0 && this.shockwaveRing) {
      this.shockwaveLife -= dt;
      const progress = 1 - (this.shockwaveLife / 0.5);
      (this.shockwaveRing.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - progress);
      const scale = 1 + progress * 16; // Expand from 1 to 17
      this.shockwaveRing.scale.set(scale, scale, 1);

      if (this.shockwaveLife <= 0) {
        this.shockwaveRing.visible = false;
      }
    }

    // Update motorbike blast sprite
    if (this.blastLife > 0 && this.blastSprite) {
      this.blastLife -= dt;
      const progress = 1 - (this.blastLife / 0.3);
      this.blastSprite.material.opacity = 1 - progress;
      const scale = 1.5 + progress * 8; // Expand from 1.5 to 9.5
      this.blastSprite.scale.set(scale, scale, 1);

      if (this.blastLife <= 0) {
        this.blastSprite.visible = false;
      }
    }

    // Update motorbike blast ring
    if (this.blastRingLife > 0 && this.blastRing) {
      this.blastRingLife -= dt;
      const progress = 1 - (this.blastRingLife / 0.4);
      (this.blastRing.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - progress);
      const scale = 0.5 + progress * 12; // Expand from 0.5 to 12.5
      this.blastRing.scale.set(scale, scale, 1);

      if (this.blastRingLife <= 0) {
        this.blastRing.visible = false;
      }
    }
  }

  /**
   * Show motorbike blast visual effect (cyan/white energy wave)
   */
  private showMotorbikeBlast(position: THREE.Vector3): void {
    // Create blast sprite (bright cyan flash)
    if (!this.blastSprite) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;

      // Cyan energy blast gradient
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.2, 'rgba(150, 255, 255, 1)');
      gradient.addColorStop(0.4, 'rgba(0, 200, 255, 0.8)');
      gradient.addColorStop(0.7, 'rgba(0, 100, 200, 0.4)');
      gradient.addColorStop(1, 'rgba(0, 50, 150, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(64, 64, 64, 0, Math.PI * 2);
      ctx.fill();

      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      this.blastSprite = new THREE.Sprite(material);
      this.scene.add(this.blastSprite);
    }

    // Create blast ring (expanding cyan ring)
    if (!this.blastRing) {
      const ringGeometry = new THREE.RingGeometry(0.3, 0.8, 32);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ccff,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
      });
      this.blastRing = new THREE.Mesh(ringGeometry, ringMaterial);
      this.blastRing.rotation.x = -Math.PI / 2; // Lay flat
      this.scene.add(this.blastRing);
    }

    // Position and activate blast
    this.blastSprite.position.set(position.x, position.y + 0.8, position.z);
    this.blastSprite.scale.set(1.5, 1.5, 1);
    this.blastSprite.visible = true;
    this.blastSprite.material.opacity = 1;
    this.blastLife = 0.3;

    // Position and activate blast ring
    this.blastRing.position.set(position.x, 0.15, position.z);
    this.blastRing.scale.set(0.5, 0.5, 1);
    this.blastRing.visible = true;
    (this.blastRing.material as THREE.MeshBasicMaterial).opacity = 0.7;
    this.blastRingLife = 0.4;
  }

  /**
   * Get random element from array
   */
  private static randomFrom<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Trigger a kill notification
   */
  private triggerKillNotification(message: string, isPursuit: boolean, points: number): void {
    if (this.callbacks.onKillNotification) {
      this.callbacks.onKillNotification({ message, isPursuit, points, combo: this.stats.combo });
    }
  }

  /**
   * Trigger slow-motion effect (Burnout-style impact frame)
   */
  private triggerSlowmo(): void {
    this.slowmoTimer = this.SLOWMO_DURATION;
    this.slowmoScale = this.SLOWMO_SCALE;
  }

  /**
   * Check and announce combo milestones (5, 10, 15, 20, 30, 50)
   */
  private checkComboMilestones(): void {
    // Find the highest milestone we've crossed
    let highestMilestone = 0;
    let milestoneMessage = '';

    for (const milestone of Engine.COMBO_MILESTONES) {
      if (this.stats.combo >= milestone.threshold && milestone.threshold > this.lastAnnouncedComboMilestone) {
        highestMilestone = milestone.threshold;
        milestoneMessage = milestone.message;
      }
    }

    // Announce if we crossed a new milestone
    if (highestMilestone > this.lastAnnouncedComboMilestone) {
      this.lastAnnouncedComboMilestone = highestMilestone;
      this.triggerKillNotification(milestoneMessage, true, 0);
      this.shakeCamera(2.0 + highestMilestone * 0.05); // Bigger shake for bigger milestones
    }

    // Reset milestone tracker when combo resets
    if (this.stats.combo === 0) {
      this.lastAnnouncedComboMilestone = 0;
    }
  }

  /**
   * Render scene
   */
  private render(): void {
    // Apply camera shake
    if (this.cameraShakeIntensity > 0) {
      const shake = this.cameraShakeIntensity;
      this.camera.position.set(
        this.cameraBasePosition.x + (Math.random() - 0.5) * shake,
        this.cameraBasePosition.y + (Math.random() - 0.5) * shake,
        this.cameraBasePosition.z + (Math.random() - 0.5) * shake
      );
    } else {
      this.camera.position.copy(this.cameraBasePosition);
    }

    // Restore rotation from update()
    this.camera.quaternion.copy(this.cameraBaseQuaternion);

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.stop();
    this.physics.dispose();
    this.ai.clear();
    if (this.crowd) {
      this.crowd.clear();
    }
    if (this.cops) {
      this.cops.clear();
    }
    if (this.buildings) {
      this.buildings.clear();
    }
    if (this.christmasTrees) {
      this.christmasTrees.dispose();
    }
    this.particles.clear();
    this.bloodDecals.dispose();
    this.renderer.dispose();

    // Clear scene
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
  }

  /**
   * Get scene (for adding entities)
   */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /**
   * Get camera (for camera controller)
   */
  getCamera(): THREE.OrthographicCamera {
    return this.camera;
  }

  /**
   * Get current stats
   */
  getStats(): GameStats {
    return { ...this.stats };
  }

  /**
   * Get performance stats
   */
  getPerformanceStats() {
    return { ...this.performanceStats };
  }
}
