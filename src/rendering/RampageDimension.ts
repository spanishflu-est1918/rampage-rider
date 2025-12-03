import * as THREE from 'three';
import { RAMPAGE_DIMENSION } from '../constants';

/**
 * Speed line instance data - streaks past player based on movement
 */
interface SpeedLine {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  length: number;
  life: number;
  maxLife: number;
}

/**
 * Energy mote instance data (Phase 2)
 */
interface EnergyMote {
  sprite: THREE.Sprite;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  wobblePhase: number;
  wobbleSpeed: number;
  baseY: number;
  size: number;
}

/**
 * RampageDimension
 *
 * Visual effect that triggers when combo >= 10 (RAMPAGE mode).
 * Creates an anime-style "reality break" effect:
 * - White void (environment hidden)
 * - Blood red radial rays pulsing from center
 * - Speed lines radiating outward
 * - Energy motes floating in the void (Phase 2)
 *
 * Inspired by Mob Psycho 100 ???% mode.
 */
export class RampageDimension {
  private scene: THREE.Scene;

  // State
  private isActive = false;
  private transitionProgress = 0; // 0 = normal, 1 = full dimension
  private transitionDirection: -1 | 0 | 1 = 0; // -1 = exiting, 0 = stable, 1 = entering

  // Background colors
  private normalBackground: THREE.Color;
  private readonly voidBackground = new THREE.Color(RAMPAGE_DIMENSION.VOID_COLOR);

  // Effect meshes (pre-allocated)
  private radialRays: THREE.Mesh;
  private rayMaterial: THREE.MeshBasicMaterial;
  private speedLines: SpeedLine[] = [];

  // Phase 2: Energy motes
  private energyMotes: EnergyMote[] = [];
  private moteTexture: THREE.Texture | null = null;
  private moteMaterial: THREE.SpriteMaterial | null = null;

  // Shared geometry for speed lines
  private speedLineGeometry: THREE.PlaneGeometry;
  private speedLineMaterial: THREE.MeshBasicMaterial;

  // Animation state
  private rayRotation = 0;
  private rayPulsePhase = 0;

  // Phase 2: Enhanced ray dynamics
  private rayFlashIndex = -1;
  private rayFlashTimer = 0;
  private rayOpacities: number[] = []; // Per-ray opacity for phased pulsing

  // Player position and velocity for movement-based effects
  private playerPosition: THREE.Vector3 = new THREE.Vector3();
  private playerVelocity: THREE.Vector3 = new THREE.Vector3();
  private lastPlayerPosition: THREE.Vector3 = new THREE.Vector3();

  // Pre-allocated vectors and colors (avoid per-frame allocations)
  private readonly _tempVec = new THREE.Vector3();
  private readonly _tempColor = new THREE.Color();

  constructor(scene: THREE.Scene, normalBackground: THREE.Color) {
    this.scene = scene;
    this.normalBackground = normalBackground.clone();

    // Create radial rays with per-ray opacity support
    const { mesh, material } = this.createRadialRays();
    this.radialRays = mesh;
    this.rayMaterial = material;
    this.scene.add(this.radialRays);

    // Initialize per-ray opacity array
    for (let i = 0; i < RAMPAGE_DIMENSION.RAY_COUNT; i++) {
      this.rayOpacities.push(1.0);
    }

    // Create speed line pool - visible thickness
    this.speedLineGeometry = new THREE.PlaneGeometry(0.15, 1);
    this.speedLineMaterial = new THREE.MeshBasicMaterial({
      color: RAMPAGE_DIMENSION.SPEED_LINE_COLOR,
      transparent: true,
      opacity: RAMPAGE_DIMENSION.SPEED_LINE_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.createSpeedLinePool();

    // Phase 2: Create energy motes
    this.createMoteTexture();
    this.createEnergyMotes();
  }

  /**
   * Create the radial rays mesh - 16 blood red wedges
   */
  private createRadialRays(): { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial } {
    const {
      RAY_COUNT,
      RAY_COLOR,
      RAY_INNER_RADIUS,
      RAY_OUTER_RADIUS,
    } = RAMPAGE_DIMENSION;

    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];

    // Create wedge triangles
    for (let i = 0; i < RAY_COUNT; i++) {
      const angle1 = (i / RAY_COUNT) * Math.PI * 2;
      const angle2 = ((i + 0.4) / RAY_COUNT) * Math.PI * 2; // 40% wedge width

      // Inner edge vertices
      const innerX1 = Math.cos(angle1) * RAY_INNER_RADIUS;
      const innerY1 = Math.sin(angle1) * RAY_INNER_RADIUS;
      const innerX2 = Math.cos(angle2) * RAY_INNER_RADIUS;
      const innerY2 = Math.sin(angle2) * RAY_INNER_RADIUS;

      // Outer edge vertices
      const outerX1 = Math.cos(angle1) * RAY_OUTER_RADIUS;
      const outerY1 = Math.sin(angle1) * RAY_OUTER_RADIUS;
      const outerX2 = Math.cos(angle2) * RAY_OUTER_RADIUS;
      const outerY2 = Math.sin(angle2) * RAY_OUTER_RADIUS;

      // Triangle 1: inner1 -> inner2 -> outer1
      positions.push(innerX1, innerY1, 0);
      positions.push(innerX2, innerY2, 0);
      positions.push(outerX1, outerY1, 0);

      // Triangle 2: inner2 -> outer2 -> outer1
      positions.push(innerX2, innerY2, 0);
      positions.push(outerX2, outerY2, 0);
      positions.push(outerX1, outerY1, 0);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.MeshBasicMaterial({
      color: RAY_COLOR,
      transparent: true,
      opacity: 0,
      blending: THREE.NormalBlending, // Normal instead of Additive for visibility on white
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.renderOrder = 1000; // Render on top
    mesh.frustumCulled = false; // Always render

    return { mesh, material };
  }

  /**
   * Create pool of speed line meshes
   */
  private createSpeedLinePool(): void {
    const { SPEED_LINE_COUNT } = RAMPAGE_DIMENSION;

    for (let i = 0; i < SPEED_LINE_COUNT; i++) {
      const mesh = new THREE.Mesh(
        this.speedLineGeometry,
        this.speedLineMaterial.clone()
      );
      mesh.visible = false;
      mesh.renderOrder = 999;
      mesh.frustumCulled = false;
      this.scene.add(mesh);

      this.speedLines.push({
        mesh,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        length: this.randomLength(),
        life: 999, // Start expired so they spawn fresh
        maxLife: this.randomLife(),
      });
    }
  }

  /**
   * Phase 2: Create soft circle texture for energy motes
   */
  private createMoteTexture(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Soft radial gradient - bright center, transparent edge
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 200, 150, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 100, 50, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    this.moteTexture = new THREE.CanvasTexture(canvas);
    this.moteMaterial = new THREE.SpriteMaterial({
      map: this.moteTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  /**
   * Phase 2: Create pool of energy motes
   */
  private createEnergyMotes(): void {
    const config = RAMPAGE_DIMENSION.ENERGY_MOTES;

    for (let i = 0; i < config.COUNT; i++) {
      const sprite = new THREE.Sprite(this.moteMaterial!.clone());
      sprite.visible = false;
      sprite.renderOrder = 998;
      this.scene.add(sprite);

      const mote = this.createMoteData(sprite);
      this.energyMotes.push(mote);
    }
  }

  /**
   * Create or reset mote data
   */
  private createMoteData(sprite: THREE.Sprite): EnergyMote {
    const config = RAMPAGE_DIMENSION.ENERGY_MOTES;

    // Random spawn position in ring around player
    const angle = Math.random() * Math.PI * 2;
    const radius = config.SPAWN_RADIUS_MIN + Math.random() * (config.SPAWN_RADIUS_MAX - config.SPAWN_RADIUS_MIN);
    const height = config.SPAWN_HEIGHT_MIN + Math.random() * (config.SPAWN_HEIGHT_MAX - config.SPAWN_HEIGHT_MIN);

    // Random drift direction (some toward player for "pass through" feeling)
    const driftAngle = Math.random() * Math.PI * 2;
    const driftSpeed = config.DRIFT_SPEED_MIN + Math.random() * (config.DRIFT_SPEED_MAX - config.DRIFT_SPEED_MIN);
    const towardPlayer = Math.random() < 0.3; // 30% chance to drift toward player

    const velocity = new THREE.Vector3(
      Math.cos(towardPlayer ? angle + Math.PI : driftAngle) * driftSpeed,
      0,
      Math.sin(towardPlayer ? angle + Math.PI : driftAngle) * driftSpeed
    );

    const size = config.SIZE_MIN + Math.random() * (config.SIZE_MAX - config.SIZE_MIN);
    sprite.scale.setScalar(size);

    // Set color (lerp between inner and outer)
    const colorLerp = Math.random();
    const mat = sprite.material as THREE.SpriteMaterial;
    mat.color.setHex(colorLerp < 0.5 ? config.COLOR_INNER : config.COLOR_OUTER);

    return {
      sprite,
      position: new THREE.Vector3(
        this.playerPosition.x + Math.cos(angle) * radius,
        height,
        this.playerPosition.z + Math.sin(angle) * radius
      ),
      velocity,
      life: Math.random() * config.LIFE_MAX, // Stagger initial spawn
      maxLife: config.LIFE_MIN + Math.random() * (config.LIFE_MAX - config.LIFE_MIN),
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: config.WOBBLE_SPEED_MIN + Math.random() * (config.WOBBLE_SPEED_MAX - config.WOBBLE_SPEED_MIN),
      baseY: height,
      size,
    };
  }

  /**
   * Respawn a mote at a new position
   */
  private respawnMote(mote: EnergyMote): void {
    const config = RAMPAGE_DIMENSION.ENERGY_MOTES;

    const angle = Math.random() * Math.PI * 2;
    const radius = config.SPAWN_RADIUS_MIN + Math.random() * (config.SPAWN_RADIUS_MAX - config.SPAWN_RADIUS_MIN);
    const height = config.SPAWN_HEIGHT_MIN + Math.random() * (config.SPAWN_HEIGHT_MAX - config.SPAWN_HEIGHT_MIN);

    mote.position.set(
      this.playerPosition.x + Math.cos(angle) * radius,
      height,
      this.playerPosition.z + Math.sin(angle) * radius
    );

    const driftAngle = Math.random() * Math.PI * 2;
    const driftSpeed = config.DRIFT_SPEED_MIN + Math.random() * (config.DRIFT_SPEED_MAX - config.DRIFT_SPEED_MIN);
    const towardPlayer = Math.random() < 0.3;

    mote.velocity.set(
      Math.cos(towardPlayer ? angle + Math.PI : driftAngle) * driftSpeed,
      0,
      Math.sin(towardPlayer ? angle + Math.PI : driftAngle) * driftSpeed
    );

    mote.life = 0;
    mote.maxLife = config.LIFE_MIN + Math.random() * (config.LIFE_MAX - config.LIFE_MIN);
    mote.baseY = height;
    mote.wobblePhase = Math.random() * Math.PI * 2;
    mote.size = config.SIZE_MIN + Math.random() * (config.SIZE_MAX - config.SIZE_MIN);
    mote.sprite.scale.setScalar(mote.size);
  }

  private randomLength(): number {
    const { SPEED_LINE_MIN_LENGTH, SPEED_LINE_MAX_LENGTH } = RAMPAGE_DIMENSION;
    return SPEED_LINE_MIN_LENGTH + Math.random() * (SPEED_LINE_MAX_LENGTH - SPEED_LINE_MIN_LENGTH);
  }

  private randomLife(): number {
    const { SPEED_LINE_MIN_LIFE, SPEED_LINE_MAX_LIFE } = RAMPAGE_DIMENSION;
    return SPEED_LINE_MIN_LIFE + Math.random() * (SPEED_LINE_MAX_LIFE - SPEED_LINE_MIN_LIFE);
  }

  /**
   * Trigger dimension entry (snap-in)
   */
  enter(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.transitionDirection = 1;
    this.transitionProgress = 0;

    // Show effect meshes
    // this.radialRays.visible = true; // DISABLED FOR TESTING
    // Speed lines now handled by SpeedLinesShader

    // Show energy motes
    for (const mote of this.energyMotes) {
      mote.sprite.visible = true;
    }
  }

  /**
   * Trigger dimension exit (fade-out)
   */
  exit(): void {
    if (!this.isActive) return;

    this.transitionDirection = -1;
  }

  /**
   * Check if currently in rampage dimension
   */
  isInDimension(): boolean {
    return this.isActive;
  }

  /**
   * Set player position for centered effects
   */
  setPlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
  }

  /**
   * Update effects - call every frame
   */
  update(dt: number, camera: THREE.OrthographicCamera, playerPosition?: THREE.Vector3): void {
    // Update player position if provided
    if (playerPosition) {
      this.playerPosition.copy(playerPosition);
    }

    // Update transition
    this.updateTransition(dt);

    if (!this.isActive && this.transitionProgress <= 0) {
      return;
    }

    // Update ray animation (Phase 2: enhanced dynamics)
    this.updateRays(dt);

    // Speed lines now handled by SpeedLinesShader (not here)

    // Phase 2: Update energy motes
    this.updateEnergyMotes(dt);

    // Position rays centered on player (Phase 2: not camera)
    this.positionRaysOnPlayer(camera);
  }

  /**
   * Update enter/exit transition
   */
  private updateTransition(dt: number): void {
    const { ENTER_DURATION, EXIT_DURATION } = RAMPAGE_DIMENSION;

    if (this.transitionDirection === 1) {
      // Entering - use ease-out for punchy snap
      this.transitionProgress = Math.min(1, this.transitionProgress + dt / ENTER_DURATION);

      if (this.transitionProgress >= 1) {
        this.transitionDirection = 0;
      }
    } else if (this.transitionDirection === -1) {
      // Exiting - linear fade
      this.transitionProgress = Math.max(0, this.transitionProgress - dt / EXIT_DURATION);

      if (this.transitionProgress <= 0) {
        this.transitionDirection = 0;
        this.isActive = false;

        // Hide effect meshes
        this.radialRays.visible = false;
        for (const line of this.speedLines) {
          line.mesh.visible = false;
        }
        for (const mote of this.energyMotes) {
          mote.sprite.visible = false;
        }
      }
    }

    // Apply ease-out curve for enter, linear for exit
    const eased = this.transitionDirection >= 0
      ? 1 - Math.pow(1 - this.transitionProgress, 3) // ease-out cubic
      : this.transitionProgress; // linear

    // Lerp background color (reuse pre-allocated color to avoid GC pressure)
    this._tempColor.copy(this.normalBackground).lerp(this.voidBackground, eased);
    this.scene.background = this._tempColor;
  }

  /**
   * Phase 2: Update radial ray animation with enhanced dynamics
   * - Faster rotation (5x)
   * - Per-ray pulse phasing (breathing effect)
   * - Random burst flashes
   */
  private updateRays(dt: number): void {
    const {
      RAY_COUNT,
      RAY_PULSE_FREQUENCY,
      RAY_OPACITY_MIN,
      RAY_OPACITY_MAX,
      RAY_ROTATION_SPEED_ENHANCED,
      RAY_FLASH_CHANCE,
      RAY_FLASH_DURATION,
      RAY_FLASH_INTENSITY,
    } = RAMPAGE_DIMENSION;

    // Phase 2: Faster rotation (5x)
    this.rayRotation += dt * RAY_ROTATION_SPEED_ENHANCED;
    this.radialRays.rotation.z = this.rayRotation;

    // Pulse phase advances
    this.rayPulsePhase += dt * RAY_PULSE_FREQUENCY * Math.PI * 2;

    // Phase 2: Random burst flashes
    if (this.rayFlashTimer > 0) {
      this.rayFlashTimer -= dt;
    } else if (Math.random() < RAY_FLASH_CHANCE) {
      this.rayFlashIndex = Math.floor(Math.random() * RAY_COUNT);
      this.rayFlashTimer = RAY_FLASH_DURATION;
    }

    // Calculate per-ray opacity with phased pulsing
    let totalOpacity = 0;
    for (let i = 0; i < RAY_COUNT; i++) {
      const phaseOffset = (i / RAY_COUNT) * Math.PI * 2;
      const rayPulse = (Math.sin(this.rayPulsePhase + phaseOffset) + 1) / 2;
      let opacity = RAY_OPACITY_MIN + rayPulse * (RAY_OPACITY_MAX - RAY_OPACITY_MIN);

      // Apply flash intensity if this ray is flashing
      if (i === this.rayFlashIndex && this.rayFlashTimer > 0) {
        opacity *= RAY_FLASH_INTENSITY;
      }

      this.rayOpacities[i] = opacity;
      totalOpacity += opacity;
    }

    // Use average opacity for the single material (per-ray requires shader)
    // For now, use a simple approach with the average + flash boost
    const avgOpacity = totalOpacity / RAY_COUNT;
    this.rayMaterial.opacity = avgOpacity * this.transitionProgress;
  }

  /**
   * Update speed lines - ALL parallel streaks flying past the player
   * Creates anime-style motion blur effect
   */
  private updateSpeedLines(dt: number, camera: THREE.OrthographicCamera): void {
    // Calculate player velocity from position delta
    if (dt > 0) {
      this.playerVelocity.subVectors(this.playerPosition, this.lastPlayerPosition).divideScalar(dt);
      this.lastPlayerPosition.copy(this.playerPosition);
    }

    const speed = this.playerVelocity.length();
    const isMoving = speed > 1.0; // Threshold for "moving"

    // Get movement direction - ALL lines go this direction
    const moveDir = this._tempVec;
    if (isMoving) {
      moveDir.copy(this.playerVelocity).normalize();
    } else {
      // Default: lines go diagonally (toward camera in isometric)
      moveDir.set(-0.7, 0, -0.7).normalize();
    }

    const {
      SPEED_LINE_MIN_SPEED,
      SPEED_LINE_MAX_SPEED,
      SPEED_LINE_OPACITY,
    } = RAMPAGE_DIMENSION;

    // Perpendicular direction for spawning spread
    const perpX = -moveDir.z;
    const perpZ = moveDir.x;

    for (const line of this.speedLines) {
      line.life += dt;

      // Respawn when expired
      if (line.life >= line.maxLife) {
        // Spawn in a wide band AHEAD of player
        const spawnDist = 15 + Math.random() * 10; // Distance ahead
        const lateralSpread = (Math.random() - 0.5) * 25; // Wide side spread
        const heightSpread = 0.3 + Math.random() * 4; // Height variation

        line.position.set(
          this.playerPosition.x + moveDir.x * spawnDist + perpX * lateralSpread,
          heightSpread,
          this.playerPosition.z + moveDir.z * spawnDist + perpZ * lateralSpread
        );

        // ALL lines move in SAME direction - opposite to player movement
        const streakSpeed = SPEED_LINE_MIN_SPEED + Math.random() * (SPEED_LINE_MAX_SPEED - SPEED_LINE_MIN_SPEED);
        line.velocity.set(
          -moveDir.x * streakSpeed,
          0,
          -moveDir.z * streakSpeed
        );

        line.length = this.randomLength();
        line.life = 0;
        line.maxLife = this.randomLife();
      }

      // Move the line
      line.position.x += line.velocity.x * dt;
      line.position.z += line.velocity.z * dt;

      // Calculate opacity
      const lifeRatio = line.life / line.maxLife;
      const fadeIn = Math.min(1, lifeRatio * 10); // Instant fade in
      const fadeOut = 1 - lifeRatio; // Linear fade out
      const opacity = fadeIn * fadeOut * this.transitionProgress * SPEED_LINE_OPACITY;

      const mat = line.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = opacity;

      // Position mesh
      line.mesh.position.copy(line.position);

      // Make lines face camera and align with movement direction
      line.mesh.lookAt(camera.position);

      // Calculate screen-space angle for the streak direction
      // Project movement direction to screen space
      const screenAngle = Math.atan2(moveDir.x - moveDir.z, moveDir.x + moveDir.z);
      line.mesh.rotateZ(screenAngle);

      // Scale length
      line.mesh.scale.y = line.length;
    }
  }

  /**
   * Phase 2: Update energy motes (drift, wobble, fade)
   */
  private updateEnergyMotes(dt: number): void {
    const config = RAMPAGE_DIMENSION.ENERGY_MOTES;

    for (const mote of this.energyMotes) {
      mote.life += dt;

      // Respawn when life exceeds max
      if (mote.life >= mote.maxLife) {
        this.respawnMote(mote);
      }

      // Drift in current direction
      mote.position.x += mote.velocity.x * dt;
      mote.position.z += mote.velocity.z * dt;

      // Vertical wobble
      mote.wobblePhase += mote.wobbleSpeed * dt;
      mote.position.y = mote.baseY + Math.sin(mote.wobblePhase) * config.WOBBLE_AMPLITUDE;

      // Update sprite position
      mote.sprite.position.copy(mote.position);

      // Calculate opacity (fade in at start, fade out at end)
      const lifeRatio = mote.life / mote.maxLife;
      const fadeIn = Math.min(1, lifeRatio / 0.15); // Fade in over first 15%
      const fadeOut = lifeRatio > 0.75 ? 1 - (lifeRatio - 0.75) / 0.25 : 1; // Fade out last 25%
      const opacity = fadeIn * fadeOut * this.transitionProgress;

      const mat = mote.sprite.material as THREE.SpriteMaterial;
      mat.opacity = opacity;
    }
  }

  /**
   * Phase 2: Position radial rays centered on player (ground plane)
   */
  private positionRaysOnPlayer(camera: THREE.OrthographicCamera): void {
    // Position at player location, just above ground
    this.radialRays.position.set(
      this.playerPosition.x,
      0.1, // Just above ground
      this.playerPosition.z
    );

    // Rays lie flat on ground plane, spreading outward
    this.radialRays.rotation.x = -Math.PI / 2; // Face up
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.scene.remove(this.radialRays);
    this.radialRays.geometry.dispose();
    this.rayMaterial.dispose();

    for (const line of this.speedLines) {
      this.scene.remove(line.mesh);
      (line.mesh.material as THREE.Material).dispose();
    }
    this.speedLines = [];

    for (const mote of this.energyMotes) {
      this.scene.remove(mote.sprite);
      (mote.sprite.material as THREE.Material).dispose();
    }
    this.energyMotes = [];

    this.speedLineGeometry.dispose();
    this.speedLineMaterial.dispose();
    this.moteTexture?.dispose();
    this.moteMaterial?.dispose();
  }
}
