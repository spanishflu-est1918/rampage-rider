import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from './PhysicsWorld';
import { AIManager } from './AIManager';
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

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    // Initialize Three.js
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);
    this.scene.fog = new THREE.Fog(0x1a1a1a, 30, 80);

    // Orthographic camera for isometric view (closer than before)
    const aspect = width / height;
    const frustumSize = 25; // Reduced from 35 for closer view
    this.camera = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      frustumSize / -2,
      1,
      1000
    );

    // Closer isometric position: (10, 25, 10) instead of (20, 40, 20)
    this.camera.position.set(10, 25, 10);
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

    console.log('[Engine] Created with closer camera at (10, 25, 10)');
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

    console.log('[Engine] Initialization complete');
  }

  /**
   * Temporary test ground (will be replaced by WorldSystem)
   */
  private createTestGround(): void {
    const geometry = new THREE.PlaneGeometry(50, 50);
    const material = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
    this.groundMesh = new THREE.Mesh(geometry, material);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    // Physics ground
    const groundBody = this.physics.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0)
    );
    this.physics.createCollider(
      RAPIER.ColliderDesc.cuboid(25, 0.1, 25),
      groundBody
    );

    console.log('[Engine] Test ground created');
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

    // TODO: Spawn player
    console.log('[Engine] Game reset');
  }

  /**
   * Resize handler
   */
  resize(width: number, height: number): void {
    const aspect = width / height;
    const frustumSize = 25;

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

    // TODO: Update player
    // TODO: Update entities

    // Update AI
    this.ai.update(dt);

    // TODO: Update camera follow

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
