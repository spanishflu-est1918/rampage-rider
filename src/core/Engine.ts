import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from './PhysicsWorld';
import { AIManager } from './AIManager';
import { CrowdManager } from '../managers/CrowdManager';
import { Player } from '../entities/Player';
import { ParticleEmitter } from '../rendering/ParticleSystem';
import { BloodDecalSystem } from '../rendering/BloodDecalSystem';
import { GameState, Tier, InputState, GameStats } from '../types';

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
  public particles: ParticleEmitter;
  public bloodDecals: BloodDecalSystem;

  // Game state
  private state: GameState = GameState.MENU;
  private animationId: number | null = null;
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
    score: 0,
    tier: Tier.FOOT,
    combo: 0,
    comboTimer: 0,
    gameTime: 0,
    health: 100,
    killHistory: [],
  };

  // Callbacks
  private callbacks: {
    onStatsUpdate?: (stats: GameStats) => void;
    onGameOver?: (stats: GameStats) => void;
  } = {};

  // Temp ground reference
  private groundMesh: THREE.Mesh | null = null;

  // Player
  private player: Player | null = null;

  // Screen shake
  private shakeIntensity: number = 0;
  private shakeDecay: number = 0.9;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    // Initialize Three.js
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);
    this.scene.fog = new THREE.Fog(0x1a1a1a, 30, 80);

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

    // Initialize physics
    await this.physics.init();

    // Initialize AI
    this.ai.init();

    // Create temporary ground for testing
    this.createTestGround();

    // Initialize crowd manager
    const world = this.physics.getWorld();
    if (world) {
      this.crowd = new CrowdManager(this.scene, world);
    }

    console.log('[Engine] Initialization complete');
  }

  /**
   * Temporary test ground (will be replaced by WorldSystem)
   */
  private createTestGround(): void {
    const geometry = new THREE.PlaneGeometry(50, 50);

    // Load grainy concrete PBR textures
    const textureLoader = new THREE.TextureLoader();

    const albedoMap = textureLoader.load('/assets/textures/grainy-concrete_albedo.png');
    const normalMap = textureLoader.load('/assets/textures/grainy-concrete_normal-ogl.png');
    const roughnessMap = textureLoader.load('/assets/textures/grainy-concrete_roughness.png');
    const aoMap = textureLoader.load('/assets/textures/grainy-concrete_ao.png');

    // Set up tiling for all textures
    [albedoMap, normalMap, roughnessMap, aoMap].forEach(tex => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(10, 10);
    });

    const material = new THREE.MeshStandardMaterial({
      map: albedoMap,
      normalMap: normalMap,
      roughnessMap: roughnessMap,
      aoMap: aoMap,
      aoMapIntensity: 0.5
    });
    this.groundMesh = new THREE.Mesh(geometry, material);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    this.bloodDecals.setGroundMesh(this.groundMesh);

    // Grid helper for visual reference
    const gridHelper = new THREE.GridHelper(50, 50, 0x444444, 0x333333);
    gridHelper.position.y = 0; // At ground level
    this.scene.add(gridHelper);

    // Physics ground
    const groundBody = this.physics.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0)
    );
    this.physics.createCollider(
      RAPIER.ColliderDesc.cuboid(25, 0.1, 25),
      groundBody
    );

    console.log('[Engine] Test ground with grid created');
  }

  /**
   * Set callbacks for UI updates
   */
  setCallbacks(
    onStatsUpdate: (stats: GameStats) => void,
    onGameOver: (stats: GameStats) => void
  ): void {
    this.callbacks.onStatsUpdate = onStatsUpdate;
    this.callbacks.onGameOver = onGameOver;
  }

  /**
   * Handle input from controls
   */
  handleInput(input: InputState): void {
    this.input = input;

    // Forward input to player
    if (this.player) {
      this.player.handleInput({
        up: input.up,
        down: input.down,
        left: input.left,
        right: input.right,
        sprint: input.mount, // Shift key (walk mode - slows down)
        jump: input.action, // Space key
        attack: input.attack || false // F key
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
    // Clear existing player
    if (this.player) {
      this.player.dispose();
      this.scene.remove(this.player);
      this.player = null;
    }

    if (this.crowd) {
      this.crowd.clear();
    }

    this.particles.clear();
    this.bloodDecals.clear();

    this.stats = {
      kills: 0,
      score: 0,
      tier: Tier.FOOT,
      combo: 0,
      comboTimer: 0,
      gameTime: 0,
      health: 100,
      killHistory: [],
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

    // Set attack callback to damage pedestrians
    this.player.setOnAttack((attackPosition) => {
      if (this.crowd) {
        const attackRadius = 2.0;
        const damage = 1;
        const maxKills = this.stats.combo >= 10 ? Infinity : 1;
        const attackDirection = this.player.getFacingDirection();
        const coneAngle = Math.PI / 2;

        const result = this.crowd.damageInRadius(
          attackPosition,
          attackRadius,
          damage,
          maxKills,
          attackDirection,
          coneAngle
        );

        if (result.kills > 0) {
          this.stats.kills += result.kills;
          this.stats.score += result.kills * 10;
          this.stats.combo += result.kills;
          this.stats.comboTimer = 5.0;

          const playerPos = this.player.getPosition();
          for (const killPos of result.positions) {
            const direction = new THREE.Vector3().subVectors(killPos, playerPos).normalize();
            this.particles.emitBlood(killPos, 30);
            this.particles.emitBloodSpray(killPos, direction, 20);
          }

          this.crowd.panicCrowd(attackPosition, 10);

          this.shakeIntensity = 0.5 * result.kills;

          if (maxKills === Infinity) {
            console.log(`[Engine] MAXED OUT! ${result.kills} kills! Total: ${this.stats.kills}`);
          } else {
            console.log(`[Engine] ${result.kills} kill. Total: ${this.stats.kills}`);
          }
        }
      }
    });

    console.log('[Engine] Player spawned');
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

    const deltaTime = this.clock.getDelta();
    this.update(deltaTime);
    this.render();
  };

  /**
   * Update game logic
   */
  private update(dt: number): void {
    // Step physics
    if (this.physics.isReady()) {
      this.physics.step(dt);
    }

    // Update game time
    this.stats.gameTime += dt;

    // Update combo timer
    if (this.stats.comboTimer > 0) {
      this.stats.comboTimer = Math.max(0, this.stats.comboTimer - dt);
      if (this.stats.comboTimer === 0) {
        this.stats.combo = 0;
      }
    }

    // Update player
    if (this.player) {
      // Update camera direction for camera-relative movement
      // Use camera position as the view vector (for isometric, this works better)
      const cameraDirection = this.camera.position.clone().normalize();
      this.player.setCameraDirection(cameraDirection);

      // Update player movement
      this.player.update(dt);
    }

    // Update crowd
    if (this.crowd && this.player) {
      const playerPos = this.player.getPosition();
      this.crowd.update(dt, playerPos);

      // Handle player-pedestrian collisions
      this.crowd.handlePlayerCollisions(playerPos);
    }

    // Update AI
    this.ai.update(dt);

    // Update particles
    this.particles.update(dt);

    // Camera follow player (unless manual control is active)
    if (this.player && !this.disableCameraFollow) {
      const playerPos = this.player.getPosition();

      // Smooth lerp camera to follow player, maintaining isometric offset
      const targetCameraPos = new THREE.Vector3(
        playerPos.x + 2.5,
        playerPos.y + 6.25,
        playerPos.z + 2.5
      );
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

      // Camera always looks at player position
      const lookAtTarget = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
      this.camera.lookAt(lookAtTarget);
    }

    // Send stats update
    if (this.callbacks.onStatsUpdate) {
      this.callbacks.onStatsUpdate({ ...this.stats });
    }
  }

  /**
   * Render scene
   */
  private render(): void {
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
}
