import * as THREE from 'three';
import { RAMPAGE_DIMENSION } from '../constants';

/**
 * Speed line instance data
 */
interface SpeedLine {
  mesh: THREE.Mesh;
  angle: number;
  distance: number;
  speed: number;
  length: number;
  life: number;
  maxLife: number;
}

/**
 * RampageDimension
 *
 * Visual effect that triggers when combo >= 10 (RAMPAGE mode).
 * Creates an anime-style "reality break" effect:
 * - White void (environment hidden)
 * - Blood red radial rays pulsing from center
 * - Speed lines radiating outward
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

  // Shared geometry for speed lines
  private speedLineGeometry: THREE.PlaneGeometry;
  private speedLineMaterial: THREE.MeshBasicMaterial;

  // Animation state
  private rayRotation = 0;
  private rayPulsePhase = 0;

  // Pre-allocated vectors and colors (avoid per-frame allocations)
  private readonly _tempVec = new THREE.Vector3();
  private readonly _tempColor = new THREE.Color();

  constructor(scene: THREE.Scene, normalBackground: THREE.Color) {
    this.scene = scene;
    this.normalBackground = normalBackground.clone();

    // Create radial rays
    const { mesh, material } = this.createRadialRays();
    this.radialRays = mesh;
    this.rayMaterial = material;
    this.scene.add(this.radialRays);

    // Create speed line pool (thicker for visibility)
    this.speedLineGeometry = new THREE.PlaneGeometry(0.15, 1);
    this.speedLineMaterial = new THREE.MeshBasicMaterial({
      color: RAMPAGE_DIMENSION.SPEED_LINE_COLOR,
      transparent: true,
      opacity: RAMPAGE_DIMENSION.SPEED_LINE_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.createSpeedLinePool();
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
        this.speedLineMaterial.clone() // Clone for per-line opacity
      );
      mesh.visible = false;
      mesh.renderOrder = 999;
      mesh.frustumCulled = false;
      this.scene.add(mesh);

      this.speedLines.push({
        mesh,
        angle: Math.random() * Math.PI * 2,
        distance: 5 + Math.random() * 15,
        speed: this.randomSpeed(),
        length: this.randomLength(),
        life: Math.random(), // Stagger initial spawn
        maxLife: this.randomLife(),
      });
    }
  }

  private randomSpeed(): number {
    const { SPEED_LINE_MIN_SPEED, SPEED_LINE_MAX_SPEED } = RAMPAGE_DIMENSION;
    return SPEED_LINE_MIN_SPEED + Math.random() * (SPEED_LINE_MAX_SPEED - SPEED_LINE_MIN_SPEED);
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
    this.radialRays.visible = true;
    for (const line of this.speedLines) {
      line.mesh.visible = true;
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
   * Update effects - call every frame
   */
  update(dt: number, camera: THREE.OrthographicCamera): void {
    // Update transition
    this.updateTransition(dt);

    if (!this.isActive && this.transitionProgress <= 0) {
      return;
    }

    // Update ray animation
    this.updateRays(dt);

    // Update speed lines
    this.updateSpeedLines(dt, camera);

    // Position rays in front of camera
    this.positionRaysForCamera(camera);
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
   * Update radial ray animation (rotation + pulse)
   */
  private updateRays(dt: number): void {
    const {
      RAY_ROTATION_SPEED,
      RAY_PULSE_FREQUENCY,
      RAY_OPACITY_MIN,
      RAY_OPACITY_MAX,
    } = RAMPAGE_DIMENSION;

    // Slow rotation
    this.rayRotation += dt * RAY_ROTATION_SPEED;
    this.radialRays.rotation.z = this.rayRotation;

    // Pulse opacity
    this.rayPulsePhase += dt * RAY_PULSE_FREQUENCY * Math.PI * 2;
    const pulseNorm = (Math.sin(this.rayPulsePhase) + 1) / 2; // 0 to 1
    const baseOpacity = RAY_OPACITY_MIN + pulseNorm * (RAY_OPACITY_MAX - RAY_OPACITY_MIN);

    // Fade with transition
    this.rayMaterial.opacity = baseOpacity * this.transitionProgress;
  }

  /**
   * Update speed lines (radiate outward, respawn)
   */
  private updateSpeedLines(dt: number, camera: THREE.OrthographicCamera): void {
    // Get camera look direction for positioning
    const cameraDir = this._tempVec;
    camera.getWorldDirection(cameraDir);

    for (const line of this.speedLines) {
      line.life += dt;

      // Respawn when life exceeds max
      if (line.life >= line.maxLife) {
        line.angle = Math.random() * Math.PI * 2;
        line.distance = 2 + Math.random() * 3; // Start near center
        line.speed = this.randomSpeed();
        line.length = this.randomLength();
        line.life = 0;
        line.maxLife = this.randomLife();
      }

      // Move outward
      line.distance += line.speed * dt;

      // Calculate opacity (fade in at start, fade out at end)
      const lifeRatio = line.life / line.maxLife;
      const fadeIn = Math.min(1, lifeRatio * 5); // Quick fade in (first 20%)
      const fadeOut = 1 - Math.pow(lifeRatio, 2); // Slow fade out
      const opacity = fadeIn * fadeOut * this.transitionProgress * RAMPAGE_DIMENSION.SPEED_LINE_OPACITY;

      const mat = line.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = opacity;

      // Position in screen space (relative to camera)
      // For orthographic, we position on a plane perpendicular to camera
      const x = Math.cos(line.angle) * line.distance;
      const y = Math.sin(line.angle) * line.distance;

      // Position relative to camera, offset forward
      line.mesh.position.set(
        camera.position.x + x,
        camera.position.y + y * 0.7, // Compress vertical slightly for isometric
        camera.position.z - 30 // In front of camera
      );

      // Rotate to point outward from center
      line.mesh.rotation.z = line.angle - Math.PI / 2;

      // Scale length
      line.mesh.scale.y = line.length;
    }
  }

  /**
   * Position radial rays in front of camera (screen-space effect)
   */
  private positionRaysForCamera(camera: THREE.OrthographicCamera): void {
    // Position at camera location, offset toward look direction
    const cameraDir = this._tempVec;
    camera.getWorldDirection(cameraDir);

    this.radialRays.position.copy(camera.position);
    this.radialRays.position.addScaledVector(cameraDir, 40);

    // Face the camera
    this.radialRays.lookAt(camera.position);
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

    this.speedLineGeometry.dispose();
    this.speedLineMaterial.dispose();
  }
}
