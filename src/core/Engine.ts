import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from './PhysicsWorld';
import { AIManager } from './AIManager';
import { CrowdManager } from '../managers/CrowdManager';
import { CopManager } from '../managers/CopManager';
import { BuildingManager } from '../managers/BuildingManager';
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
    killHistory: [],
    copHealthBars: [],
    isTased: false,
    taseEscapeProgress: 0,
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

    // Initialize physics FIRST (Rapier WASM must load before anything else)
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

    // Preload all assets AFTER physics is ready (pedestrian models, etc.)
    const { AssetLoader } = await import('./AssetLoader');
    const assetLoader = AssetLoader.getInstance();
    await assetLoader.preloadAll();

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
    // Reset death flag
    this.isDying = false;

    // Clear existing player
    if (this.player) {
      this.player.dispose();
      this.scene.remove(this.player);
      this.player = null;
    }

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

    // Set taser escape callback for screen shake
    this.player.setOnEscapePress(() => {
      this.shakeCamera(0.3); // Shake on each button press
    });

    // Set taser escape explosion callback for knockback
    this.player.setOnTaserEscape((position, radius, force) => {
      // Big screen shake for the explosion
      this.shakeCamera(1.5);

      // Knockback all cops in radius
      if (this.cops) {
        this.cops.applyKnockbackInRadius(position, radius, force);
      }

      // Emit blood/spark particles for visual effect
      if (this.particles) {
        this.particles.emitBlood(position, 50); // Big burst
      }
    });

    // Set attack callback to damage pedestrians and cops
    this.player.setOnAttack((attackPosition) => {
      const attackRadius = 4.5; // Increased from 3.0 for easier kills
      const damage = 1;
      const maxKills = this.stats.combo >= 10 ? Infinity : 1;
      const attackDirection = this.player.getFacingDirection();
      const coneAngle = Math.PI; // Increased cone angle for wider arc

      let totalKills = 0;
      const allKillPositions: THREE.Vector3[] = [];

      // Attack pedestrians
      if (this.crowd) {
        const pedResult = this.crowd.damageInRadius(
          attackPosition,
          attackRadius,
          damage,
          maxKills,
          attackDirection,
          coneAngle
        );

        if (pedResult.kills > 0) {
          this.stats.kills += pedResult.kills;
          this.stats.score += pedResult.kills * 10;
          this.stats.combo += pedResult.kills;
          this.stats.comboTimer = 5.0;
          this.stats.heat = Math.min(100, this.stats.heat + (pedResult.kills * 10));

          totalKills += pedResult.kills;
          allKillPositions.push(...pedResult.positions);

          this.crowd.panicCrowd(attackPosition, 10);
        }
      }

      // Attack cops
      if (this.cops) {
        const copResult = this.cops.damageInRadius(
          attackPosition,
          attackRadius,
          damage,
          maxKills,
          attackDirection,
          coneAngle
        );

        if (copResult.kills > 0) {
          this.stats.score += copResult.kills * 50;
          this.stats.copKills += copResult.kills;

          // Calculate wanted stars based on cop kills (0 = punch, 1-3 = taser, 4+ = shoot)
          if (this.stats.copKills === 0) {
            this.stats.wantedStars = 0;
          } else if (this.stats.copKills >= 1 && this.stats.copKills <= 3) {
            this.stats.wantedStars = 1;
          } else {
            this.stats.wantedStars = 2;
          }

          // Killing cops adds SIGNIFICANT heat (25% per cop)
          this.stats.heat = Math.min(100, this.stats.heat + (copResult.kills * 25));

          totalKills += copResult.kills;
          allKillPositions.push(...copResult.positions);

        }
      }

      // Spawn blood for all kills
      if (totalKills > 0) {
        const playerPos = this.player.getPosition();
        for (const killPos of allKillPositions) {
          const direction = new THREE.Vector3().subVectors(killPos, playerPos).normalize();
          this.particles.emitBlood(killPos, 30);
          this.particles.emitBloodSpray(killPos, direction, 20);
        }

        this.shakeIntensity = 0.5 * totalKills;
      }
    });

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

    // Update player
    if (this.player) {
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
    }

    // Update buildings (spawn/despawn based on player position)
    if (this.buildings && this.player) {
      const playerPos = this.player.getPosition();
      this.buildings.update(playerPos);
    }

    // Update crowd
    if (this.crowd && this.player) {
      const playerPos = this.player.getPosition();
      this.crowd.update(dt, playerPos);

      // Handle player-pedestrian collisions
      this.crowd.handlePlayerCollisions(playerPos);

      // Cleanup pedestrians AFTER physics step
      this.crowd.cleanup(playerPos);
    }

    // Update cops
    if (this.cops && this.player) {
      const playerPos = this.player.getPosition();

      // Update cop spawns based on heat
      this.cops.updateSpawns(this.stats.heat, playerPos);

      // Check if player can be tased (not immune and not already tased)
      const playerCanBeTased = this.player.canBeTased();

      // Update cop AI with damage callback (action-based damage)
      this.cops.update(dt, playerPos, this.stats.wantedStars, playerCanBeTased, (damage: number) => {
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

        // Check for game over
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

    // Camera follow player (unless manual control is active)
    if (this.player && !this.disableCameraFollow) {
      const playerPos = this.player.getPosition();

      // Isometric camera with fixed offset
      const targetCameraPos = new THREE.Vector3(
        playerPos.x + 2.5,
        playerPos.y + 6.25,
        playerPos.z + 2.5
      );

      // Smooth lerp camera to follow player
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

    // Send stats update (including performance data)
    if (this.callbacks.onStatsUpdate) {
      this.callbacks.onStatsUpdate({ ...this.stats, performance: this.performanceStats });
    }
  }

  /**
   * Trigger camera shake
   */
  private shakeCamera(intensity: number = 0.3): void {
    this.cameraShakeIntensity = Math.max(this.cameraShakeIntensity, intensity);
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
