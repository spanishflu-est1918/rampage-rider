import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from './PhysicsWorld';
import { AIManager } from './AIManager';
import { CrowdManager } from '../managers/CrowdManager';
import { CopManager } from '../managers/CopManager';
import { BuildingManager } from '../managers/BuildingManager';
import { Player } from '../entities/Player';
import { Vehicle } from '../entities/Vehicle';
import { ParticleEmitter } from '../rendering/ParticleSystem';
import { VehicleType, VehicleConfig, VEHICLE_CONFIGS, TIER_VEHICLE_MAP, TIER_CONFIGS } from '../constants';
import { BloodDecalSystem } from '../rendering/BloodDecalSystem';
import { GameState, Tier, InputState, GameStats, KillNotification } from '../types';
import { ActionController, ActionType } from './ActionController';

/**
 * Engine - Core game engine
 * Orchestrates rendering, physics, AI, and game logic
 */
export class Engine {
  // Three.js core
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;

  // Systems
  public physics: PhysicsWorld;
  public ai: AIManager;
  public crowd: CrowdManager | null = null;
  public cops: CopManager | null = null;
  public buildings: BuildingManager | null = null;
  public particles: ParticleEmitter;
  public bloodDecals: BloodDecalSystem;

  // Game state
  private state: GameState = GameState.MENU;
  private isDying: boolean = false; // Player is playing death animation
  private animationId: number | null = null;

  // Performance monitoring
  private performanceStats = {
    fps: 0,
    frameTime: 0,
    physics: 0,
    entities: 0,
    rendering: 0,
    lastFrameTime: performance.now(),
    // Detailed counts (what's actually causing the load)
    counts: {
      cops: 0,
      pedestrians: 0,
      particles: 0,
      bloodDecals: 0,
      buildings: 0
    },
    // Historical tracking (last 120 frames = ~2 seconds at 60fps)
    history: {
      frameTime: [] as number[],
      physics: [] as number[],
      entities: [] as number[],
      rendering: [] as number[],
      maxSize: 120
    },
    // Worst frame tracking
    worstFrame: {
      frameTime: 0,
      physics: 0,
      entities: 0,
      rendering: 0,
      bottleneck: 'none' as 'physics' | 'entities' | 'rendering' | 'none',
      counts: {
        cops: 0,
        pedestrians: 0,
        particles: 0,
        bloodDecals: 0,
        buildings: 0
      }
    },
    // Averages
    avgFrameTime: 0,
    avgPhysics: 0,
    avgEntities: 0,
    avgRendering: 0
  };

  // Camera shake
  private cameraShakeIntensity: number = 0;
  private cameraShakeDecay: number = 5; // Shake decays per second
  private cameraBasePosition: THREE.Vector3 = new THREE.Vector3();
  private cameraBaseQuaternion: THREE.Quaternion = new THREE.Quaternion();
  private input: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    action: false,
    mount: false,
  };
  public disableCameraFollow: boolean = false;

  // Stats
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

  // Callbacks
  private callbacks: {
    onStatsUpdate?: (stats: GameStats) => void;
    onGameOver?: (stats: GameStats) => void;
    onKillNotification?: (notification: KillNotification) => void;
  } = {};

  // Temp ground reference
  private groundMesh: THREE.Mesh | null = null;

  // Player
  private player: Player | null = null;

  // Vehicle system
  private vehicle: Vehicle | null = null;
  private isInVehicle: boolean = false;
  private vehicleSpawned: boolean = false;
  private currentVehicleTier: Tier | null = null; // Which tier's vehicle is currently spawned

  // Action controller - resolves SPACE key based on context
  private actionController: ActionController = new ActionController();

  // Screen shake
  private shakeIntensity: number = 0;
  private shakeDecay: number = 0.9;

  // Kill notification messages
  private static readonly KILL_MESSAGES = ['SPLAT!', 'CRUSHED!', 'DEMOLISHED!', 'OBLITERATED!', 'TERMINATED!'];
  private static readonly PANIC_KILL_MESSAGES = ['COWARD!', 'NO ESCAPE!', 'RUN FASTER!', 'BACKSTAB!', 'EASY PREY!'];
  private static readonly PURSUIT_KILL_MESSAGES = ['HEAT KILL!', 'WANTED BONUS!', 'PURSUIT FRENZY!', 'HOT STREAK!', 'RAMPAGE!'];
  private static readonly ROADKILL_MESSAGES = ['ROADKILL!', 'PANCAKED!', 'FLATTENED!', 'SPLATTER!', 'SPEED BUMP!'];
  private static readonly COP_KILL_MESSAGES = ['BADGE DOWN!', 'OFFICER DOWN!', 'COP DROPPED!', 'BLUE DOWN!'];

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    // Initialize Three.js
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);
    // Note: Fog disabled due to WebGL 3D texture warnings on some GPUs
    // this.scene.fog = new THREE.Fog(0x1a1a1a, 30, 80);

    // Orthographic camera for isometric view
    const aspect = width / height;
    const frustumSize = 15; // Double the previous 7.5 to pull back camera
    this.camera = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      frustumSize / -2,
      1,
      1000
    );

    // Isometric position: double distance (was 2.5, 6.25, 2.5)
    this.camera.position.set(5, 12.5, 5);
    this.camera.lookAt(0, 0, 0);
    this.cameraBasePosition.copy(this.camera.position);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lighting
    this.setupLighting();

    // Clock
    this.clock = new THREE.Clock();

    // Initialize systems
    this.physics = new PhysicsWorld();
    this.ai = new AIManager();
    this.particles = new ParticleEmitter(this.scene);
    this.bloodDecals = new BloodDecalSystem(this.scene);

    this.particles.setOnGroundHit((position, size) => {
      this.bloodDecals.addBloodDecal(position, size);
    });

    console.log('[Engine] Created with isometric camera at (2.5, 6.25, 2.5)');
  }

  /**
   * Setup scene lighting
   */
  private setupLighting(): void {
    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    // Directional light (sun)
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(-30, 50, -30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 200;
    this.scene.add(dirLight);
  }

  /**
   * Initialize engine (async because Rapier needs WASM loading)
   */
  async init(): Promise<void> {
    console.log('[Engine] Initializing...');

    // Wait for preloader to finish (RAPIER WASM + assets)
    const { preloader } = await import('./Preloader');
    await preloader.preloadAll();

    // Initialize physics (RAPIER already loaded by preloader)
    await this.physics.init();

    // Initialize AI
    this.ai.init();

    // Create temporary ground for testing
    this.createTestGround();

    // Initialize managers
    const world = this.physics.getWorld();
    if (world) {
      this.crowd = new CrowdManager(this.scene, world);
      this.cops = new CopManager(this.scene, world);
      this.buildings = new BuildingManager(this.scene, world);
    }

    // Assets already loaded by preloader
    console.log('[Engine] Initialization complete');
  }

  /**
   * Temporary test ground (will be replaced by WorldSystem)
   */
  private createTestGround(): void {
    // Large ground for infinite city
    const groundSize = 1000;
    const geometry = new THREE.PlaneGeometry(groundSize, groundSize);

    // Load wood planks PBR textures
    const textureLoader = new THREE.TextureLoader();

    const albedoMap = textureLoader.load('/assets/textures/wood-planks/color.jpg');
    const normalMap = textureLoader.load('/assets/textures/wood-planks/normal.png');
    const roughnessMap = textureLoader.load('/assets/textures/wood-planks/roughness.jpg');
    const aoMap = textureLoader.load('/assets/textures/wood-planks/ao.jpg');

    // Set color space
    albedoMap.colorSpace = THREE.SRGBColorSpace;

    // Set up tiling for all textures (more repeats for larger ground)
    [albedoMap, normalMap, roughnessMap, aoMap].forEach(tex => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(100, 100); // More tiling for large ground
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

    // Grid helper for visual reference
    const gridHelper = new THREE.GridHelper(groundSize, 100, 0x444444, 0x333333);
    gridHelper.position.y = 0; // At ground level
    this.scene.add(gridHelper);

    // Physics ground (much larger)
    const groundBody = this.physics.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0)
    );
    this.physics.createCollider(
      RAPIER.ColliderDesc.cuboid(groundSize / 2, 0.1, groundSize / 2),
      groundBody
    );

    console.log('[Engine] Test ground with grid created');
  }

  /**
   * Set callbacks for UI updates
   */
  setCallbacks(
    onStatsUpdate: (stats: GameStats) => void,
    onGameOver: (stats: GameStats) => void,
    onKillNotification?: (notification: KillNotification) => void
  ): void {
    this.callbacks.onStatsUpdate = onStatsUpdate;
    this.callbacks.onGameOver = onGameOver;
    this.callbacks.onKillNotification = onKillNotification;
  }

  /**
   * Handle input from controls
   */
  handleInput(input: InputState): void {
    this.input = input;

    // Forward input to car or player based on vehicle state
    if (this.isInVehicle && this.vehicle) {
      this.vehicle.handleInput({
        up: input.up,
        down: input.down,
        left: input.left,
        right: input.right,
      });
    } else if (this.player) {
      // Movement only - action (SPACE) is handled by ActionController in update()
      this.player.handleInput({
        up: input.up,
        down: input.down,
        left: input.left,
        right: input.right,
        sprint: input.mount, // Shift key (walk mode - slows down)
        jump: false,
        attack: false, // Attack is triggered by ActionController via performAttack()
      });
    }
  }

  /**
   * Start the game
   */
  start(): void {
    if (this.state === GameState.PLAYING) return;

    console.log('[Engine] Starting game...');
    this.state = GameState.PLAYING;
    this.resetGame();
    this.clock.start();
    this.animate();
  }

  /**
   * Stop the game
   */
  stop(): void {
    console.log('[Engine] Stopping game...');
    this.state = GameState.PAUSED;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Reset game state
   */
  private resetGame(): void {
    // Reset death flag
    this.isDying = false;

    // Clear existing player
    if (this.player) {
      this.player.dispose();
      this.scene.remove(this.player);
      this.player = null;
    }

    // Clear existing car
    if (this.vehicle) {
      this.vehicle.dispose();
      this.scene.remove(this.vehicle);
      this.vehicle = null;
    }
    this.isInVehicle = false;
    this.vehicleSpawned = false;
    this.actionController.reset();

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

    // Spawn player
    this.spawnPlayer();

    // Spawn initial crowd around player
    if (this.crowd && this.player) {
      this.crowd.spawnInitialCrowd(this.player.getPosition());
    }

    console.log('[Engine] Game reset - Player and crowd spawned');
  }

  /**
   * Spawn the player
   */
  private spawnPlayer(): void {
    this.player = new Player();

    // Add to scene
    this.scene.add(this.player);

    // Create physics body
    const world = this.physics.getWorld();
    if (world) {
      this.player.createPhysicsBody(world);
    }

    // Set initial camera direction
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    this.player.setCameraDirection(cameraDirection);

    // Setup all player callbacks
    this.setupPlayerCallbacks();

    // Play spawn animation when game starts
    this.player.playSpawnAnimation();
  }

  /**
   * Spawn vehicle near player based on tier
   */
  private spawnVehicle(tier: Tier): void {
    if (!this.player || this.vehicleSpawned) return;

    // Get vehicle type for this tier
    const vehicleType = TIER_VEHICLE_MAP[tier];
    if (!vehicleType) {
      console.warn(`[Engine] No vehicle defined for tier ${tier}`);
      return;
    }

    const vehicleConfig = VEHICLE_CONFIGS[vehicleType];
    const world = this.physics.getWorld();
    if (!world) return;

    const playerPos = this.player.getPosition();

    // Find a safe spawn position (not inside buildings)
    const spawnPos = this.findSafeVehicleSpawnPosition(playerPos);

    // Create vehicle with config
    this.vehicle = new Vehicle(vehicleConfig);
    this.vehicle.createPhysicsBody(world, spawnPos);
    this.scene.add(this.vehicle);

    // Set vehicle destruction callback
    this.vehicle.setOnDestroyed(() => {
      this.exitVehicle();
    });

    this.vehicleSpawned = true;
    this.currentVehicleTier = tier;

    // Debug: verify positions match
    const vehiclePos = this.vehicle.getPosition();
    console.log(`[VEHICLE] Spawned ${vehicleConfig.name} at (${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)}), player at (${playerPos.x.toFixed(1)}, ${playerPos.y.toFixed(1)}, ${playerPos.z.toFixed(1)}), distance=${playerPos.distanceTo(vehiclePos).toFixed(1)}, type=${vehicleType}`);

    // Notify player that vehicle is available
    const tierConfig = TIER_CONFIGS[tier];
    this.triggerKillNotification(`${tierConfig.name.toUpperCase()} UNLOCKED!`, true, 0);
  }

  /**
   * Debug: Spawn a specific vehicle type (or remove vehicle if null)
   */
  debugSpawnVehicle(vehicleType: VehicleType | null): void {
    // Don't allow spawning while in vehicle
    if (this.isInVehicle) {
      console.log('[VEHICLE] Cannot spawn vehicle while driving');
      return;
    }

    // Remove existing vehicle if any
    if (this.vehicle) {
      this.scene.remove(this.vehicle);
      this.vehicle.dispose();
      this.vehicle = null;
      this.vehicleSpawned = false;
      this.currentVehicleTier = null;
    }

    // If null, just go back to foot
    if (!vehicleType) {
      this.stats.tier = Tier.FOOT;
      return;
    }

    // Find tier for this vehicle type (reverse lookup from TIER_VEHICLE_MAP)
    let targetTier: Tier | undefined;
    if (vehicleType === VehicleType.BICYCLE) targetTier = Tier.BIKE;
    else if (vehicleType === VehicleType.MOTORBIKE) targetTier = Tier.MOTO;
    else if (vehicleType === VehicleType.SEDAN) targetTier = Tier.SEDAN;

    if (targetTier) {
      this.spawnVehicle(targetTier);
    }
  }

  /**
   * Get current vehicle type (for UI)
   */
  getCurrentVehicleType(): VehicleType | null {
    if (!this.vehicleSpawned || !this.currentVehicleTier) return null;
    return TIER_VEHICLE_MAP[this.currentVehicleTier] || null;
  }

  /**
   * DEBUG: Get list of all available animation names
   */
  getAnimationNames(): string[] {
    return this.player?.getAnimationNames() || [];
  }

  /**
   * DEBUG: Play any animation by name (for testing)
   */
  debugPlayAnimation(name: string): void {
    console.log(`[ANIM] Engine: ${name}, player=${!!this.player}`);
    this.player?.debugPlayAnimation(name);
  }

  /**
   * DEBUG: Play animation once with callback (for testing)
   */
  debugPlayAnimationOnce(name: string): void {
    console.log(`[ANIM] Engine playOnce: ${name}`);
    this.player?.playAnimationWithCallback(name, () => {
      console.log(`[ANIM] Animation complete: ${name}`);
    });
  }

  /**
   * Find a safe position to spawn vehicle (not inside buildings)
   */
  private findSafeVehicleSpawnPosition(playerPos: THREE.Vector3): THREE.Vector3 {
    const world = this.physics.getWorld();
    if (!world) return playerPos.clone().add(new THREE.Vector3(5, 0, 5));

    // Collision group for buildings
    const BUILDING_GROUP = 0x0040;
    const GROUND_GROUP = 0x0001;

    // Try offsets at increasing distances, preferring road areas
    const offsets = [
      new THREE.Vector3(5, 0, 0),    // Right (along road)
      new THREE.Vector3(-5, 0, 0),   // Left (along road)
      new THREE.Vector3(0, 0, 5),    // Forward
      new THREE.Vector3(0, 0, -5),   // Back
      new THREE.Vector3(7, 0, 0),    // Further right
      new THREE.Vector3(-7, 0, 0),   // Further left
      new THREE.Vector3(5, 0, 5),    // Diagonal
      new THREE.Vector3(-5, 0, -5),  // Diagonal
      new THREE.Vector3(10, 0, 0),   // Even further
      new THREE.Vector3(-10, 0, 0),
      new THREE.Vector3(3, 0, 0),    // Closer options
      new THREE.Vector3(-3, 0, 0),
      new THREE.Vector3(0, 0, 3),
      new THREE.Vector3(0, 0, -3),
    ];

    for (const offset of offsets) {
      const testPos = playerPos.clone().add(offset);

      // First check: horizontal ray to see if we'd hit a building
      // Cast from player position towards test position
      const dirToTest = offset.clone().normalize();
      const horizontalRay = new RAPIER.Ray(
        { x: playerPos.x, y: playerPos.y + 1, z: playerPos.z },
        { x: dirToTest.x, y: 0, z: dirToTest.z }
      );

      const horizontalHit = world.castRay(horizontalRay, offset.length(), true);
      if (horizontalHit) {
        const hitGroups = horizontalHit.collider.collisionGroups() & 0xFFFF;
        if (hitGroups === BUILDING_GROUP) {
          // Would hit a building, skip this offset
          continue;
        }
      }

      // Second check: downward ray to ensure we have ground below
      const downRay = new RAPIER.Ray(
        { x: testPos.x, y: testPos.y + 10, z: testPos.z },
        { x: 0, y: -1, z: 0 }
      );

      const downHit = world.castRay(downRay, 15, true);
      if (downHit) {
        const hitGroups = downHit.collider.collisionGroups() & 0xFFFF;

        // If we hit ground (not a building), this is a safe spot
        if (hitGroups === GROUND_GROUP) {
          console.log(`[VEHICLE] Safe spawn found at offset (${offset.x}, ${offset.z})`);
          return testPos;
        }
      }
    }

    // Fallback: spawn at player position (they can walk to it)
    console.log('[VEHICLE] No safe spawn found, using player position');
    return playerPos.clone();
  }

  /**
   * Enter an existing spawned car
   */
  private enterVehicle(): void {
    console.log(`[VEHICLE] enterVehicle() called: player=${!!this.player}, vehicle=${!!this.vehicle}, isInVehicle=${this.isInVehicle}`);

    if (!this.player) {
      console.log('[VEHICLE] enterVehicle() ABORTED: no player');
      return;
    }
    if (!this.vehicle) {
      console.log('[VEHICLE] enterVehicle() ABORTED: no vehicle');
      return;
    }
    if (this.isInVehicle) {
      console.log('[VEHICLE] enterVehicle() ABORTED: already in vehicle');
      return;
    }

    // Get rider config from vehicle
    const riderConfig = this.vehicle.getRiderConfig();

    // Hide player only for enclosed vehicles (like cars)
    if (riderConfig.hideRider) {
      this.player.setVisible(false);
    } else {
      // Keep player visible and attach to vehicle
      this.player.setVisible(true);
      // Add player to vehicle group so it moves with vehicle
      (this.vehicle as THREE.Group).add(this.player);
      // Position player at rider offset (local to vehicle)
      console.log(`[VEHICLE] Rider offset: Y=${riderConfig.offsetY}, Z=${riderConfig.offsetZ}`);
      (this.player as THREE.Group).position.set(0, riderConfig.offsetY, riderConfig.offsetZ);
      (this.player as THREE.Group).rotation.set(0, 0, 0); // Face same direction as vehicle
      // Play seated animation
      this.player.playSeatedAnimation();
    }

    this.isInVehicle = true;

    // Set tier based on current vehicle
    if (this.currentVehicleTier) {
      this.stats.tier = this.currentVehicleTier;
    }

    // Screen shake for entering vehicle
    this.shakeCamera(1.0);

    console.log(`[VEHICLE] SUCCESS: Entered ${this.vehicle.getTypeName()}! isInVehicle=${this.isInVehicle}, hideRider=${riderConfig.hideRider}`);
  }

  /**
   * Check if player is near the car
   */
  private isPlayerNearVehicle(): boolean {
    if (!this.player || !this.vehicle) {
      return false;
    }

    const playerPos = this.player.getPosition();
    const vehiclePos = this.vehicle.getPosition();
    const distance = playerPos.distanceTo(vehiclePos);

    return distance < 15.0; // Within 15 units - generous range for vehicle entry
  }

  /**
   * Exit vehicle (car exploded)
   */
  private exitVehicle(): void {
    if (!this.vehicle || !this.player) return;

    const vehiclePos = this.vehicle.getPosition();

    // Find safe spawn position (try multiple offsets to avoid buildings)
    const safePos = this.findSafeExitPosition(vehiclePos);

    // Detach player from vehicle before disposing
    // Check if player is a child of vehicle (for bikes/motorcycles)
    if ((this.player as THREE.Group).parent === this.vehicle) {
      (this.vehicle as THREE.Group).remove(this.player);
      this.scene.add(this.player);
    }

    // Make player visible again
    this.player.setVisible(true);

    // Remove and dispose vehicle
    this.scene.remove(this.vehicle);
    this.vehicle.dispose();
    this.vehicle = null;

    // Recreate player physics at safe position
    const world = this.physics.getWorld();
    if (world) {
      this.player.dispose();
      this.scene.remove(this.player);

      this.player = new Player();
      this.player.createPhysicsBody(world, safePos);
      this.scene.add(this.player);

      // Re-setup callbacks
      this.setupPlayerCallbacks();
    }

    this.isInVehicle = false;
    this.vehicleSpawned = false;
    this.stats.tier = Tier.FOOT;

    // Explosion effects
    this.shakeCamera(2.0);
    this.particles.emitBlood(vehiclePos, 100);

    console.log('[VEHICLE] Exited vehicle (destroyed)');
  }

  /**
   * Find a safe position to spawn player when exiting vehicle
   */
  private findSafeExitPosition(vehiclePos: THREE.Vector3): THREE.Vector3 {
    // Try offsets in different directions
    const offsets = [
      new THREE.Vector3(3, 0, 0),   // Right
      new THREE.Vector3(-3, 0, 0),  // Left
      new THREE.Vector3(0, 0, 3),   // Forward
      new THREE.Vector3(0, 0, -3),  // Back
      new THREE.Vector3(3, 0, 3),   // Diagonal
      new THREE.Vector3(-3, 0, -3), // Diagonal
      new THREE.Vector3(3, 0, -3),  // Diagonal
      new THREE.Vector3(-3, 0, 3),  // Diagonal
    ];

    const world = this.physics.getWorld();
    if (!world) return vehiclePos;

    // Try each offset and check if position is clear of buildings
    for (const offset of offsets) {
      const testPos = vehiclePos.clone().add(offset);

      // Cast ray downward to check for ground
      const ray = new RAPIER.Ray(
        { x: testPos.x, y: testPos.y + 5, z: testPos.z },
        { x: 0, y: -1, z: 0 }
      );

      // Check if we hit ground (not building)
      const hit = world.castRay(ray, 10, true);
      if (hit) {
        const hitCollider = hit.collider;
        const groups = hitCollider.collisionGroups();
        const membership = groups & 0xFFFF;

        // If we hit ground (0x0001), this is a safe spot
        if (membership === 0x0001) {
          console.log(`[VEHICLE] Safe exit found at offset (${offset.x}, ${offset.z})`);
          return testPos;
        }
      }
    }

    // Fallback: just use vehicle position
    console.log('[VEHICLE] No safe exit found, using vehicle position');
    return vehiclePos;
  }

  /**
   * Setup player callbacks (factored out for reuse)
   */
  private setupPlayerCallbacks(): void {
    if (!this.player) return;

    // Set taser escape callback for screen shake
    this.player.setOnEscapePress(() => {
      this.shakeCamera(0.3);
    });

    // Set taser escape explosion callback for knockback
    this.player.setOnTaserEscape((position, radius, force) => {
      this.shakeCamera(1.5);
      if (this.cops) {
        this.cops.applyKnockbackInRadius(position, radius, force);
        this.cops.clearTaserBeams();
      }
      if (this.particles) {
        this.particles.emitBlood(position, 50);
      }
    });

    // Set attack callback
    this.player.setOnAttack((attackPosition) => {
      this.handlePlayerAttack(attackPosition);
    });
  }

  /**
   * Handle player attack (factored out for reuse)
   */
  private handlePlayerAttack(attackPosition: THREE.Vector3): void {
    const pedAttackRadius = 2.5; // Shorter range for pedestrians
    const copAttackRadius = 4.5; // Longer range for cops (escape tool)
    const damage = 1;
    const maxKills = this.stats.combo >= 10 ? Infinity : 1;
    const attackDirection = this.player!.getFacingDirection();
    const coneAngle = Math.PI;

    let totalKills = 0;
    const allKillPositions: THREE.Vector3[] = [];

    // Attack pedestrians (shorter range)
    if (this.crowd) {
      const pedResult = this.crowd.damageInRadius(
        attackPosition,
        pedAttackRadius,
        damage,
        maxKills,
        attackDirection,
        coneAngle
      );

      if (pedResult.kills > 0) {
        this.stats.kills += pedResult.kills;

        // Point calculation:
        // - Base: 10 points
        // - Panic bonus: 2x for killing someone running away
        // - Pursuit bonus: 2x when cops are chasing (stacks with panic)
        const basePoints = 10;
        const regularKills = pedResult.kills - pedResult.panicKills;
        const panicKills = pedResult.panicKills;

        // Regular kills (with pursuit bonus if applicable)
        const regularPoints = regularKills * (this.stats.inPursuit ? basePoints * 2 : basePoints);
        // Panic kills get 2x (or 4x if also in pursuit)
        const panicPoints = panicKills * (this.stats.inPursuit ? basePoints * 4 : basePoints * 2);

        this.stats.score += regularPoints + panicPoints;
        this.stats.combo += pedResult.kills;
        this.stats.comboTimer = 5.0;
        this.stats.heat = Math.min(100, this.stats.heat + (pedResult.kills * 10));

        totalKills += pedResult.kills;
        allKillPositions.push(...pedResult.positions);

        // Send kill notifications - panic kills get special message and show bonus
        for (let i = 0; i < regularKills; i++) {
          const message = this.stats.inPursuit
            ? Engine.randomFrom(Engine.PURSUIT_KILL_MESSAGES)
            : Engine.randomFrom(Engine.KILL_MESSAGES);
          const points = this.stats.inPursuit ? basePoints * 2 : basePoints;
          this.triggerKillNotification(message, this.stats.inPursuit, points);
        }
        for (let i = 0; i < panicKills; i++) {
          const message = Engine.randomFrom(Engine.PANIC_KILL_MESSAGES);
          const points = this.stats.inPursuit ? basePoints * 4 : basePoints * 2;
          this.triggerKillNotification(message, true, points); // Always highlight panic kills
        }

        this.crowd.panicCrowd(attackPosition, 10);
      }
    }

    // Attack cops (longer range for escape)
    if (this.cops) {
      const copResult = this.cops.damageInRadius(
        attackPosition,
        copAttackRadius,
        damage,
        maxKills,
        attackDirection,
        coneAngle
      );

      if (copResult.kills > 0) {
        // Cops always give pursuit bonus since you're definitely in pursuit
        const basePoints = 50;
        const pointsPerKill = basePoints * 2; // Always 2x for cop kills
        this.stats.score += copResult.kills * pointsPerKill;
        this.stats.copKills += copResult.kills;

        if (this.stats.copKills === 0) {
          this.stats.wantedStars = 0;
        } else if (this.stats.copKills >= 1 && this.stats.copKills <= 3) {
          this.stats.wantedStars = 1;
        } else {
          this.stats.wantedStars = 2;
        }

        this.stats.heat = Math.min(100, this.stats.heat + (copResult.kills * 25));

        totalKills += copResult.kills;
        allKillPositions.push(...copResult.positions);

        // Send kill notifications for cop kills
        for (let i = 0; i < copResult.kills; i++) {
          this.triggerKillNotification(Engine.randomFrom(Engine.COP_KILL_MESSAGES), true, pointsPerKill);
        }
      }
    }

    // Spawn blood for all kills
    if (totalKills > 0) {
      const playerPos = this.player!.getPosition();
      for (const killPos of allKillPositions) {
        const direction = new THREE.Vector3().subVectors(killPos, playerPos).normalize();
        this.particles.emitBlood(killPos, 30);
        this.particles.emitBloodSpray(killPos, direction, 20);
      }

      this.shakeIntensity = 0.5 * totalKills;
    }
  }

  /**
   * Handle vehicle kill (pedestrian hit by car)
   */
  private handleVehicleKill(position: THREE.Vector3, wasPanicking: boolean = false): void {
    this.stats.kills++;

    // Point calculation:
    // - Base: 15 points (vehicle kills worth more)
    // - Panic bonus: 2x for killing someone running away
    // - Pursuit bonus: 2x when cops are chasing (stacks with panic)
    const basePoints = 15;
    let points = basePoints;
    if (wasPanicking) points *= 2;
    if (this.stats.inPursuit) points *= 2;

    this.stats.score += points;
    this.stats.combo++;
    this.stats.comboTimer = 5.0;
    this.stats.heat = Math.min(100, this.stats.heat + 10);

    this.particles.emitBlood(position, 40);
    if (this.crowd) {
      this.crowd.panicCrowd(position, 15);
    }

    // Trigger kill notification - panic kills get special message
    let message: string;
    if (wasPanicking) {
      message = Engine.randomFrom(Engine.PANIC_KILL_MESSAGES);
    } else if (this.stats.inPursuit) {
      message = Engine.randomFrom(Engine.PURSUIT_KILL_MESSAGES);
    } else {
      message = Engine.randomFrom(Engine.ROADKILL_MESSAGES);
    }
    this.triggerKillNotification(message, wasPanicking || this.stats.inPursuit, points);

    this.shakeIntensity = 0.3;
  }

  /**
   * Resize handler
   */
  resize(width: number, height: number): void {
    const aspect = width / height;
    const frustumSize = 15; // Match the doubled camera distance

    this.camera.left = (frustumSize * aspect) / -2;
    this.camera.right = (frustumSize * aspect) / 2;
    this.camera.top = frustumSize / 2;
    this.camera.bottom = frustumSize / -2;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  /**
   * Main animation loop
   */
  private animate = (): void => {
    if (this.state !== GameState.PLAYING) return;

    this.animationId = requestAnimationFrame(this.animate);

    const frameStart = performance.now();
    const deltaTime = this.clock.getDelta();
    this.update(deltaTime);

    const renderStart = performance.now();
    this.render();
    const renderEnd = performance.now();

    this.performanceStats.rendering = renderEnd - renderStart;
    this.performanceStats.frameTime = renderEnd - frameStart;
    this.performanceStats.fps = 1000 / (frameStart - this.performanceStats.lastFrameTime);
    this.performanceStats.lastFrameTime = frameStart;

    // Collect detailed counts (what's causing the load)
    this.performanceStats.counts = {
      cops: this.cops?.getActiveCopCount() || 0,
      pedestrians: this.crowd?.getPedestrianCount() || 0,
      particles: this.particles?.getParticleCount() || 0,
      bloodDecals: this.bloodDecals?.getDecalCount() || 0,
      buildings: this.buildings?.getBuildingCount() || 0
    };

    // Track historical data
    const history = this.performanceStats.history;
    history.frameTime.push(this.performanceStats.frameTime);
    history.physics.push(this.performanceStats.physics);
    history.entities.push(this.performanceStats.entities);
    history.rendering.push(this.performanceStats.rendering);

    // Keep only last N frames
    if (history.frameTime.length > history.maxSize) {
      history.frameTime.shift();
      history.physics.shift();
      history.entities.shift();
      history.rendering.shift();
    }

    // Calculate averages
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    this.performanceStats.avgFrameTime = sum(history.frameTime) / history.frameTime.length;
    this.performanceStats.avgPhysics = sum(history.physics) / history.physics.length;
    this.performanceStats.avgEntities = sum(history.entities) / history.entities.length;
    this.performanceStats.avgRendering = sum(history.rendering) / history.rendering.length;

    // Track worst frame and identify bottleneck
    if (this.performanceStats.frameTime > this.performanceStats.worstFrame.frameTime) {
      this.performanceStats.worstFrame = {
        frameTime: this.performanceStats.frameTime,
        physics: this.performanceStats.physics,
        entities: this.performanceStats.entities,
        rendering: this.performanceStats.rendering,
        bottleneck:
          this.performanceStats.physics > this.performanceStats.entities &&
          this.performanceStats.physics > this.performanceStats.rendering
            ? 'physics'
            : this.performanceStats.entities > this.performanceStats.rendering
            ? 'entities'
            : 'rendering',
        counts: { ...this.performanceStats.counts }
      };
    }
  };

  /**
   * Update game logic
   */
  private update(dt: number): void {
    // Step physics
    const physicsStart = performance.now();
    if (this.physics.isReady()) {
      this.physics.step(dt);
    }
    this.performanceStats.physics = performance.now() - physicsStart;

    // Update game time
    this.stats.gameTime += dt;

    // Decrease camera shake
    if (this.cameraShakeIntensity > 0) {
      this.cameraShakeIntensity = Math.max(0, this.cameraShakeIntensity - (this.cameraShakeDecay * dt));
    }

    // Update combo timer
    if (this.stats.comboTimer > 0) {
      this.stats.comboTimer = Math.max(0, this.stats.comboTimer - dt);
      if (this.stats.comboTimer === 0) {
        this.stats.combo = 0;
      }
    }

    // Update heat (decay over time)
    if (this.stats.heat > 0) {
      this.stats.heat = Math.max(0, this.stats.heat - (0.5 * dt));
    }

    // Measure entity updates
    const entitiesStart = performance.now();

    // Tier progression: spawn vehicles at kill thresholds
    // Check each tier in order (highest first to handle upgrades)
    if (!this.vehicleSpawned && this.player) {
      if (this.stats.kills >= TIER_CONFIGS[Tier.SEDAN].minKills) {
        this.spawnVehicle(Tier.SEDAN);
      } else if (this.stats.kills >= TIER_CONFIGS[Tier.MOTO].minKills) {
        this.spawnVehicle(Tier.MOTO);
      } else if (this.stats.kills >= TIER_CONFIGS[Tier.BIKE].minKills) {
        this.spawnVehicle(Tier.BIKE);
      }
    }

    // Resolve SPACE action based on context
    const taserState = this.player?.getTaserState() || { isTased: false, escapeProgress: 0 };
    const isNearVehicle = this.isPlayerNearVehicle();
    const actionContext = {
      isTased: taserState.isTased,
      isNearCar: this.vehicleSpawned && !this.isInVehicle && isNearVehicle,
      isInVehicle: this.isInVehicle,
    };
    const { action, isNewPress } = this.actionController.resolve(this.input, actionContext);

    // Debug: Log EVERY time SPACE is pressed with full context
    // Filter in console with: [VEHICLE]
    if (isNewPress && this.input.action) {
      const playerPos = this.player?.getPosition();
      const vehiclePos = this.vehicle?.getPosition();
      const dist = playerPos && vehiclePos ? playerPos.distanceTo(vehiclePos) : -1;
      console.log(`[VEHICLE] SPACE pressed: spawned=${this.vehicleSpawned}, inVehicle=${this.isInVehicle}, near=${isNearVehicle}, dist=${dist.toFixed(2)}, action=${action}`);
    }

    // Handle resolved action - ActionController is the SINGLE source of truth
    if (isNewPress) {
      switch (action) {
        case ActionType.ENTER_CAR:
          console.log('[VEHICLE] Entering vehicle...');
          this.enterVehicle();
          break;
        case ActionType.ESCAPE_TASER:
          this.player?.handleEscapePress();
          break;
        case ActionType.ATTACK:
          // Directly trigger attack (bypasses Player's edge detection)
          if (this.player && !this.isInVehicle) {
            this.player.performAttack();
          }
          break;
      }
    }

    // Update car (always update if spawned, even if player not inside)
    if (this.vehicle) {
      if (this.isInVehicle) {
        this.vehicle.update(dt);
      }
      // Car sits idle when player not inside
    }

    // Update player
    if (this.player) {
      if (!this.isInVehicle) {
        // Full update when on foot
        // Update camera direction for camera-relative movement
        // Use camera position as the view vector (for isometric, this works better)
        const cameraDirection = this.camera.position.clone().normalize();
        this.player.setCameraDirection(cameraDirection);

        // Update player movement
        this.player.update(dt);

        // Update taser state in stats
        const taserState = this.player.getTaserState();
        this.stats.isTased = taserState.isTased;
        this.stats.taseEscapeProgress = taserState.escapeProgress;
      } else {
        // Just update animations when in vehicle
        this.player.updateAnimations(dt);
      }
    }

    // Get current position (car or player)
    const currentPos = this.isInVehicle && this.vehicle
      ? this.vehicle.getPosition()
      : this.player?.getPosition() || new THREE.Vector3();

    // Update buildings (spawn/despawn based on current position)
    if (this.buildings) {
      this.buildings.update(currentPos);
    }

    // Update crowd
    if (this.crowd) {
      this.crowd.update(dt, currentPos);

      // Handle pedestrian collisions
      if (this.isInVehicle && this.vehicle) {
        // Vehicle contact kills - use vehicle's configured kill radius
        const vehicleKillRadius = this.vehicle.getKillRadius();
        const vehicleVelocity = this.vehicle.getVelocity();

        // Only check when vehicle is actually moving (speed > 1)
        const speed = vehicleVelocity.length();
        if (speed > 1) {
          // Kill pedestrians in vehicle's path
          const result = this.crowd.damageInRadius(currentPos, vehicleKillRadius, 999, Infinity);

          // Only heavy vehicles send bodies flying (ragdoll effect)
          if (this.vehicle.causesRagdoll()) {
            this.crowd.applyVehicleKnockback(currentPos, vehicleVelocity, vehicleKillRadius);
          }

          // Handle kills with panic bonus tracking
          const regularKills = result.kills - result.panicKills;
          for (let i = 0; i < regularKills; i++) {
            this.handleVehicleKill(result.positions[i] || currentPos, false);
          }
          for (let i = 0; i < result.panicKills; i++) {
            this.handleVehicleKill(result.positions[regularKills + i] || currentPos, true);
          }
        }
      } else if (this.player) {
        // Player-pedestrian collisions (knockback only)
        this.crowd.handlePlayerCollisions(currentPos);
      }

      // Cleanup pedestrians AFTER physics step
      this.crowd.cleanup(currentPos);
    }

    // Update cops
    if (this.cops) {
      // Update cop spawns based on heat
      this.cops.updateSpawns(this.stats.heat, currentPos);

      // Track pursuit state - in pursuit when any cops are active
      this.stats.inPursuit = this.cops.getActiveCopCount() > 0;

      // Check if player can be tased (not immune and not already tased, and NOT in vehicle)
      const playerCanBeTased = !this.isInVehicle && this.player ? this.player.canBeTased() : false;

      // Update cop AI with damage callback (action-based damage)
      this.cops.update(dt, currentPos, this.stats.wantedStars, playerCanBeTased, (damage: number) => {
        // Route damage to vehicle or player
        if (this.isInVehicle && this.vehicle) {
          // Cops damage car instead of player (no taser in vehicle, only shooting)
          this.vehicle.takeDamage(damage);
        } else if (this.player) {
          // Check if this is a taser attack (1 star AND player can be tased right now)
          const isTaserAttack = this.stats.wantedStars === 1 && this.player.canBeTased();

          if (isTaserAttack) {
            // Taser attacks don't deal damage - only stun
            this.player.applyTaserStun();
          } else {
            // Punch, Shoot, or fallback punch at 1 star - apply damage normally
            this.stats.health -= damage;
            this.player.applyHitStun();
          }

          // Check for game over (only when on foot)
          if (this.stats.health <= 0 && !this.isDying) {
            this.stats.health = 0;
            this.isDying = true;
            console.log('[Engine] Player killed');

            // Trigger death animation, then show game over screen
            this.player.die(() => {
              console.log('[Engine] Game Over');
              this.state = GameState.GAME_OVER;
              if (this.callbacks.onGameOver) {
                this.callbacks.onGameOver({ ...this.stats });
              }
            });
          }
        }
      });
    }

    // Update AI
    this.ai.update(dt);

    // Update particles
    this.particles.update(dt);

    // Update blood decals (removes expired ones)
    this.bloodDecals.update();

    // Record entity update timing
    this.performanceStats.entities = performance.now() - entitiesStart;

    // Camera follow player/car (unless manual control is active)
    if (!this.disableCameraFollow) {
      // Get target position (car or player)
      const targetPos = this.isInVehicle && this.vehicle
        ? this.vehicle.getPosition()
        : this.player?.getPosition() || new THREE.Vector3();

      // Isometric camera with fixed offset
      const targetCameraPos = new THREE.Vector3(
        targetPos.x + 2.5,
        targetPos.y + 6.25,
        targetPos.z + 2.5
      );

      // Smooth lerp camera to follow target
      this.camera.position.lerp(targetCameraPos, 0.1);

      // Apply screen shake AFTER lerp (so it's not smoothed out)
      if (this.shakeIntensity > 0) {
        const shakeX = (Math.random() - 0.5) * this.shakeIntensity;
        const shakeY = (Math.random() - 0.5) * this.shakeIntensity;
        const shakeZ = (Math.random() - 0.5) * this.shakeIntensity;

        this.camera.position.x += shakeX;
        this.camera.position.y += shakeY;
        this.camera.position.z += shakeZ;

        // Decay shake intensity
        this.shakeIntensity -= dt * 2; // Decay over time instead of exponential
        if (this.shakeIntensity < 0) {
          this.shakeIntensity = 0;
        }
      }

      // Camera always looks at target position
      const lookAtTarget = new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);
      this.camera.lookAt(lookAtTarget);

      // Update base position AND rotation AFTER lookAt (so render() preserves both)
      this.cameraBasePosition.copy(this.camera.position);
      this.cameraBaseQuaternion.copy(this.camera.quaternion);
    }

    // Update cop health bars (project 3D positions to 2D screen space)
    if (this.cops) {
      const copData = this.cops.getCopData();
      this.stats.copHealthBars = copData.map(cop => {
        // Project 3D world position to 2D screen coordinates
        // Just offset up from cop's actual position for head height
        const screenPos = cop.position.clone();
        screenPos.y += 1.5; // Offset up to above head
        screenPos.project(this.camera);

        // Convert normalized device coordinates to screen pixels
        const canvas = this.renderer.domElement;
        const x = (screenPos.x * 0.5 + 0.5) * canvas.clientWidth;
        const y = (-(screenPos.y * 0.5) + 0.5) * canvas.clientHeight;

        return {
          x,
          y,
          health: cop.health,
          maxHealth: cop.maxHealth
        };
      });
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
        performance: this.performanceStats
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
      this.callbacks.onKillNotification({ message, isPursuit, points });
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
