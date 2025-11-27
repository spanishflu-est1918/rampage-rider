import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from './PhysicsWorld';
import { AIManager } from './AIManager';
import { VehicleManager } from './VehicleManager';
import { VisualEffectsManager } from './VisualEffectsManager';
import { CombatManager } from './CombatManager';
import { CrowdManager } from '../managers/CrowdManager';
import { CopManager } from '../managers/CopManager';
import { MotorbikeCopManager } from '../managers/MotorbikeCopManager';
import { BuildingManager } from '../managers/BuildingManager';
import { LampPostManager } from '../managers/LampPostManager';
import { Player } from '../entities/Player';
import { Vehicle } from '../entities/Vehicle';
import { ParticleEmitter } from '../rendering/ParticleSystem';
import {
  VehicleType,
  TIER_CONFIGS,
  CAMERA_CONFIG,
  SCORING_CONFIG,
  RENDERING_CONFIG,
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
  public buildings: BuildingManager | null = null;
  public lampPosts: LampPostManager | null = null;
  public particles: ParticleEmitter;
  public bloodDecals: BloodDecalSystem;

  // Extracted managers
  private vehicleManager: VehicleManager;
  private visualEffects: VisualEffectsManager;
  private combat: CombatManager;

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

  // Camera base transform (for shake restoration)
  private cameraBasePosition: THREE.Vector3 = new THREE.Vector3();
  private cameraBaseQuaternion: THREE.Quaternion = new THREE.Quaternion();

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
  private readonly _zeroVelocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private readonly _tempCurrentPos: THREE.Vector3 = new THREE.Vector3();


  // Pre-allocated array for cop health bar projection (max 16 cops: 8 foot + 8 bike)
  private _healthBarResult: Array<{ x: number; y: number; health: number; maxHealth: number }> = [];


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

  // Vehicle state accessors (delegated to VehicleManager)
  private get vehicle(): Vehicle | null { return this.vehicleManager.getVehicle(); }
  private get awaitingVehicle(): Vehicle | null { return this.vehicleManager.getAwaitingVehicle(); }
  private get isInVehicle(): boolean { return this.vehicleManager.isPlayerInVehicle(); }
  private get vehicleSpawned(): boolean { return this.vehicleManager.isVehicleSpawned(); }
  private get currentVehicleTier(): Tier | null { return this.vehicleManager.getCurrentTier(); }

  private actionController: ActionController = new ActionController();

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

    // Initialize extracted managers
    this.vehicleManager = new VehicleManager(this.scene, () => this.physics.getWorld());
    this.vehicleManager.setCallbacks({
      onTierUnlocked: (message) => this.triggerKillNotification(message, true, 0),
      onVehicleExit: (pos) => this.particles.emitBlood(pos, 100),
      onCameraShake: (intensity) => this.shakeCamera(intensity),
    });

    this.visualEffects = new VisualEffectsManager(this.scene, this.camera);

    this.combat = new CombatManager();
    this.combat.setCallbacks({
      onKillNotification: (data) => this.triggerKillNotification(data.message, data.isPursuit, data.points),
      onCameraShake: (intensity) => this.shakeCamera(intensity),
    });
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(-30, 50, -30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = RENDERING_CONFIG.SHADOW_MAP_SIZE;
    dirLight.shadow.mapSize.height = RENDERING_CONFIG.SHADOW_MAP_SIZE;
    dirLight.shadow.camera.left = -RENDERING_CONFIG.SHADOW_CAMERA_SIZE;
    dirLight.shadow.camera.right = RENDERING_CONFIG.SHADOW_CAMERA_SIZE;
    dirLight.shadow.camera.top = RENDERING_CONFIG.SHADOW_CAMERA_SIZE;
    dirLight.shadow.camera.bottom = -RENDERING_CONFIG.SHADOW_CAMERA_SIZE;
    dirLight.shadow.camera.near = RENDERING_CONFIG.SHADOW_CAMERA_NEAR;
    dirLight.shadow.camera.far = RENDERING_CONFIG.SHADOW_CAMERA_FAR;
    this.scene.add(dirLight);
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
      this.buildings = new BuildingManager(this.scene, world);
      this.lampPosts = new LampPostManager(this.scene);
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

    this.vehicleManager.clear();
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

    if (this.buildings) {
      this.buildings.clear();
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
    if (!this.player) return;
    this.vehicleManager.spawnVehicle(tier, this.player);
  }

  debugSpawnVehicle(vehicleType: VehicleType | null): void {
    if (!this.player) return;
    this.vehicleManager.debugSpawnVehicle(vehicleType, this.player);
    if (!vehicleType) {
      this.stats.tier = Tier.FOOT;
    }
  }

  getCurrentVehicleType(): VehicleType | null {
    return this.vehicleManager.getCurrentVehicleType();
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

  private enterVehicle(): void {
    if (!this.player) return;
    if (this.vehicleManager.enterVehicle(this.player)) {
      // Update stats tier on successful entry
      const tier = this.currentVehicleTier;
      if (tier) {
        this.stats.tier = tier;
      }
    }
  }

  private isPlayerNearVehicle(): boolean {
    if (!this.player) return false;
    return this.vehicleManager.isPlayerNearVehicle(this.player);
  }

  private isPlayerNearAwaitingVehicle(): boolean {
    if (!this.player) return false;
    return this.vehicleManager.isPlayerNearAwaitingVehicle(this.player);
  }

  /**
   * Check if player should receive next tier vehicle based on SCORE
   */
  private checkTierProgression(): void {
    if (!this.player) return;

    const nextTier = this.vehicleManager.checkTierProgression(this.player, this.stats.score);
    if (nextTier !== null) {
      if (!this.vehicleSpawned) {
        // First vehicle - spawn as current vehicle
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
    if (!this.player) return;
    const sourcePos = this.isInVehicle && this.vehicle
      ? this.vehicle.getPosition()
      : this.player.getPosition();
    this.vehicleManager.spawnAwaitingVehicle(tier, sourcePos);
  }

  /**
   * Switch from current vehicle to awaiting vehicle
   */
  private switchToAwaitingVehicle(): void {
    if (!this.player) return;
    if (this.vehicleManager.switchToAwaitingVehicle(this.player)) {
      // Update stats tier on successful switch
      const tier = this.currentVehicleTier;
      if (tier) {
        this.stats.tier = tier;
      }
    }
  }

  /**
   * Exit the current vehicle
   * Note: This recreates the Player to get proper physics at the exit position
   */
  private exitVehicle(): void {
    if (!this.player) return;

    const safePos = this.vehicleManager.exitVehicle(this.player);
    if (!safePos) return;

    // Recreate player at safe position with fresh physics body
    const world = this.physics.getWorld();
    if (world) {
      const oldShadow = this.player.getBlobShadow();
      this.scene.remove(oldShadow);
      this.player.dispose();
      this.scene.remove(this.player);

      this.player = new Player();
      this.player.createPhysicsBody(world, safePos);
      this.scene.add(this.player);
      this.scene.add(this.player.getBlobShadow());

      this.setupPlayerCallbacks();
    }

    this.stats.tier = Tier.FOOT;
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
      if (this.particles) {
        this.particles.emitBlood(position, 50);
      }
    });

    this.player.setOnAttack((attackPosition) => {
      this.handlePlayerAttack(attackPosition);
    });
  }

  private handlePlayerAttack(attackPosition: THREE.Vector3): void {
    if (!this.player) return;
    this.combat.handlePlayerAttack(attackPosition, this.player, this.stats, this.crowd, this.cops, this.particles);
  }

  private handleBicycleAttack(): void {
    if (!this.vehicle) return;
    this.combat.handleBicycleAttack(this.vehicle, this.stats, this.crowd, this.cops, this.particles);
  }

  private handleMotorbikeShoot(): void {
    if (!this.vehicle) return;
    this.combat.handleMotorbikeShoot(this.vehicle, this.stats, this.crowd, this.cops, this.particles);
  }

  private handleVehicleKill(position: THREE.Vector3, wasPanicking: boolean = false): void {
    this.combat.handleVehicleKill(position, wasPanicking, this.stats, this.crowd, this.particles);
  }

  private handleBuildingDestruction(position: THREE.Vector3): void {
    this.combat.handleBuildingDestruction(position, this.stats, this.particles);
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
    const deltaTime = this.clock.getDelta();
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

    // Update visual effects (camera shake decay, escape flash, explosion effects)
    this.visualEffects.updateCameraShake(dt);

    if (this.stats.comboTimer > 0) {
      this.stats.comboTimer = Math.max(0, this.stats.comboTimer - dt);
      if (this.stats.comboTimer === 0) {
        this.stats.combo = 0;
      }
    }

    if (this.stats.heat > 0) {
      this.stats.heat = Math.max(0, this.stats.heat - (0.5 * dt));
    }

    // --- Entity Updates ---
    const entitiesStart = DEBUG_PERFORMANCE_PANEL ? performance.now() : 0;

    // Player
    const playerStart = DEBUG_PERFORMANCE_PANEL ? performance.now() : 0;

    // --- Tier Progression System ---
    // Check if player should receive next tier vehicle
    this.checkTierProgression();

    // Update vehicle manager (glow effects, cleanup queue)
    this.vehicleManager.update(dt);

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
    if (DEBUG_PERFORMANCE_PANEL) this.performanceStats.world = performance.now() - worldStart;

    // Pedestrians
    const pedestriansStart = DEBUG_PERFORMANCE_PANEL ? performance.now() : 0;
    if (this.crowd) {
      this.crowd.update(dt, currentPos);

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

    // Cops (foot cops and motorbike cops)
    const copsStart = DEBUG_PERFORMANCE_PANEL ? performance.now() : 0;
    // Regular foot cops (damage callback set once in resetGame, not every frame)
    if (this.cops) {
      this.cops.updateSpawns(this.stats.heat, currentPos);

      const playerCanBeTased = !this.isInVehicle && this.player ? this.player.canBeTased() : false;

      this.cops.update(dt, currentPos, this.stats.wantedStars, playerCanBeTased);
    }

    // Motorbike cops (heat-based pursuit system)
    if (this.motorbikeCops) {
      this.motorbikeCops.updateSpawns(this.stats.heat, currentPos, playerVelocity, dt);

      const playerCanBeTased = !this.isInVehicle && this.player ? this.player.canBeTased() : false;

      // NOTE: Damage callback is set once in resetGame(), not every frame
      this.motorbikeCops.update(dt, currentPos, playerVelocity, this.stats.wantedStars, playerCanBeTased);
    }
    if (DEBUG_PERFORMANCE_PANEL) this.performanceStats.cops = performance.now() - copsStart;

    // Update inPursuit based on total cop count
    const footCopCount = this.cops?.getActiveCopCount() || 0;
    const bikeCopCount = this.motorbikeCops?.getActiveCopCount() || 0;
    this.stats.inPursuit = footCopCount + bikeCopCount > 0;

    this.ai.update(dt);
    this.particles.update(dt);
    this.bloodDecals.update();
    this.visualEffects.update(dt);

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
    if (this.cops && this.healthBarUpdateCounter >= 3) {
      this.healthBarUpdateCounter = 0;
      const copData = this.cops.getCopData();
      const canvas = this.renderer.domElement;

      // Reset and reuse pre-allocated array
      this._healthBarResult.length = 0;

      for (const cop of copData) {
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
   * Trigger camera shake (delegates to VisualEffectsManager)
   */
  private shakeCamera(intensity: number = 0.3): void {
    this.visualEffects.shakeCamera(intensity);
  }

  /**
   * Show a cartoonish flash effect at player position during taser escape
   * (delegates to VisualEffectsManager)
   */
  private showEscapeFlash(): void {
    if (!this.player) return;
    this.visualEffects.showEscapeFlash(this.player.getPosition());
  }

  /**
   * Show big explosion effect when player escapes taser
   * (delegates to VisualEffectsManager)
   */
  private showTaserEscapeExplosion(position: THREE.Vector3): void {
    this.visualEffects.showTaserEscapeExplosion(position);
  }

  /**
   * Trigger a kill notification
   */
  private triggerKillNotification(message: string, isPursuit: boolean, points: number): void {
    if (this.callbacks.onKillNotification) {
      this.callbacks.onKillNotification({ message, isPursuit, points });
    }
  }

  /**
   * Render scene
   */
  private render(): void {
    // Apply camera shake
    const shakeIntensity = this.visualEffects.getShakeIntensity();
    if (shakeIntensity > 0) {
      this.camera.position.set(
        this.cameraBasePosition.x + (Math.random() - 0.5) * shakeIntensity,
        this.cameraBasePosition.y + (Math.random() - 0.5) * shakeIntensity,
        this.cameraBasePosition.z + (Math.random() - 0.5) * shakeIntensity
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
