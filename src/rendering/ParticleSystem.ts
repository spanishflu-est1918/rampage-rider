import * as THREE from 'three';

/**
 * ParticleEmitter - Manages blood splatter particle effects with ground collision
 * OPTIMIZED: Uses THREE.Points with shared geometry/material (no material clones!)
 */
export class ParticleEmitter {
  private scene: THREE.Scene;
  private particles: Array<{
    index: number;
    velocity: THREE.Vector3;
    life: number;
    maxLife: number;
    hasCollided: boolean;
    size: number;
  }> = [];

  // Shared resources (created once, reused)
  private sharedTexture: THREE.Texture;
  private pointsMaterial: THREE.PointsMaterial;
  private pointsGeometry: THREE.BufferGeometry;
  private pointsObject: THREE.Points;

  // Debris particle system (separate from blood for different colors)
  private debrisTexture: THREE.Texture;
  private debrisMaterial: THREE.PointsMaterial;
  private debrisGeometry: THREE.BufferGeometry;
  private debrisObject: THREE.Points;
  private debrisPositions: Float32Array;
  private debrisSizes: Float32Array;
  private debrisAlphas: Float32Array;
  private debrisColors: Float32Array;
  private readonly MAX_DEBRIS = 100;
  private debrisParticles: Array<{
    index: number;
    velocity: THREE.Vector3;
    life: number;
    maxLife: number;
    rotationSpeed: number;
  }> = [];
  private debrisFreeIndices: number[] = [];
  private activeDebris: number = 0;

  // Buffer attributes
  private positions: Float32Array;
  private sizes: Float32Array;
  private alphas: Float32Array;
  private readonly MAX_PARTICLES = 200;
  private activeParticles: number = 0;
  private freeIndices: number[] = [];

  private onGroundHitCallback: ((position: THREE.Vector3, size: number) => void) | null = null;

  // Pre-allocated vectors (reused every frame to avoid GC pressure)
  private readonly _tempVelocity: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempHitPosition: THREE.Vector3 = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Create shared blood texture ONCE
    this.sharedTexture = this.createBloodTexture();

    // Initialize buffer arrays
    this.positions = new Float32Array(this.MAX_PARTICLES * 3);
    this.sizes = new Float32Array(this.MAX_PARTICLES);
    this.alphas = new Float32Array(this.MAX_PARTICLES);

    // Initialize free indices pool
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      this.freeIndices.push(i);
      this.alphas[i] = 0; // Start invisible
    }

    // Create geometry with buffer attributes
    this.pointsGeometry = new THREE.BufferGeometry();
    this.pointsGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.pointsGeometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.pointsGeometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));

    // Create shared material ONCE (no clones!)
    this.pointsMaterial = new THREE.PointsMaterial({
      map: this.sharedTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
      vertexColors: false,
    });

    // Enable custom alpha per particle
    this.pointsMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
        `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `
        varying float vAlpha;
        void main() {
        `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        'gl_FragColor = vec4( outgoingLight, diffuseColor.a * opacity );',
        'gl_FragColor = vec4( outgoingLight, diffuseColor.a * opacity * vAlpha );'
      );
    };

    // Create Points object
    this.pointsObject = new THREE.Points(this.pointsGeometry, this.pointsMaterial);
    this.scene.add(this.pointsObject);

    // Initialize debris particle system
    this.initDebrisSystem();
  }

  /**
   * Initialize the debris particle system (for building destruction)
   */
  private initDebrisSystem(): void {
    this.debrisTexture = this.createDebrisTexture();

    // Initialize debris buffer arrays
    this.debrisPositions = new Float32Array(this.MAX_DEBRIS * 3);
    this.debrisSizes = new Float32Array(this.MAX_DEBRIS);
    this.debrisAlphas = new Float32Array(this.MAX_DEBRIS);
    this.debrisColors = new Float32Array(this.MAX_DEBRIS * 3);

    // Initialize debris free indices pool
    for (let i = 0; i < this.MAX_DEBRIS; i++) {
      this.debrisFreeIndices.push(i);
      this.debrisAlphas[i] = 0;
    }

    // Create debris geometry
    this.debrisGeometry = new THREE.BufferGeometry();
    this.debrisGeometry.setAttribute('position', new THREE.BufferAttribute(this.debrisPositions, 3));
    this.debrisGeometry.setAttribute('size', new THREE.BufferAttribute(this.debrisSizes, 1));
    this.debrisGeometry.setAttribute('alpha', new THREE.BufferAttribute(this.debrisAlphas, 1));
    this.debrisGeometry.setAttribute('color', new THREE.BufferAttribute(this.debrisColors, 3));

    // Create debris material with vertex colors
    this.debrisMaterial = new THREE.PointsMaterial({
      map: this.debrisTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
      vertexColors: true,
    });

    // Enable custom alpha per particle
    this.debrisMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
        `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `
        varying float vAlpha;
        void main() {
        `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        'gl_FragColor = vec4( outgoingLight, diffuseColor.a * opacity );',
        'gl_FragColor = vec4( outgoingLight, diffuseColor.a * opacity * vAlpha );'
      );
    };

    this.debrisObject = new THREE.Points(this.debrisGeometry, this.debrisMaterial);
    this.scene.add(this.debrisObject);
  }

  /**
   * Create debris texture (chunky rock/wood pieces)
   */
  private createDebrisTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;

    // Rough square chunk shape
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(4, 4, 24, 24);

    // Add some noise/texture
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(8, 8, 8, 8);
    ctx.fillRect(18, 18, 8, 8);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  /**
   * Create a single shared blood texture
   */
  private createBloodTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;

    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(80, 0, 0, 1)');
    gradient.addColorStop(0.5, 'rgba(50, 0, 0, 0.9)');
    gradient.addColorStop(1, 'rgba(30, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(16, 16, 14, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  /**
   * Get a free particle index from pool
   */
  private getParticleIndex(): number | null {
    if (this.freeIndices.length === 0) return null;
    const index = this.freeIndices.pop()!;
    this.activeParticles++;
    return index;
  }

  /**
   * Return particle index to pool
   */
  private returnParticleIndex(index: number): void {
    // Hide particle
    this.alphas[index] = 0;
    this.freeIndices.push(index);
    this.activeParticles--;
  }

  /**
   * Set callback for when particles hit the ground
   */
  setOnGroundHit(callback: (position: THREE.Vector3, size: number) => void): void {
    this.onGroundHitCallback = callback;
  }

  /**
   * Emit blood particles at a position
   */
  emitBlood(position: THREE.Vector3, count: number = 20): void {
    // Cap particle count for performance
    const actualCount = Math.min(count, 15);

    for (let i = 0; i < actualCount; i++) {
      const index = this.getParticleIndex();
      if (index === null) continue; // Pool full

      const size = 10 + Math.random() * 20; // Points size in pixels
      const baseIdx = index * 3;

      // Set position
      this.positions[baseIdx] = position.x + (Math.random() - 0.5) * 0.5;
      this.positions[baseIdx + 1] = position.y + 0.8 + Math.random() * 0.4;
      this.positions[baseIdx + 2] = position.z + (Math.random() - 0.5) * 0.5;

      // Set size and alpha
      this.sizes[index] = size;
      this.alphas[index] = 1;

      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;

      // Create velocity vector for this particle (stored in particle object, not per-frame)
      const velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        1 + Math.random() * 2,
        Math.sin(angle) * speed
      );

      const maxLife = 2.0;

      this.particles.push({
        index,
        velocity,
        life: maxLife,
        maxLife,
        hasCollided: false,
        size: size / 10, // For decal size
      });
    }

    // Mark buffers for GPU update
    this.pointsGeometry.attributes.position.needsUpdate = true;
    this.pointsGeometry.attributes.size.needsUpdate = true;
    this.pointsGeometry.attributes.alpha.needsUpdate = true;
  }

  /**
   * Emit blood spray (directional, for when player hits pedestrian while moving)
   */
  emitBloodSpray(position: THREE.Vector3, direction: THREE.Vector3, count: number = 15): void {
    // Cap particle count for performance
    const actualCount = Math.min(count, 10);

    for (let i = 0; i < actualCount; i++) {
      const index = this.getParticleIndex();
      if (index === null) continue; // Pool full

      const size = 8 + Math.random() * 15;
      const baseIdx = index * 3;

      // Set position
      this.positions[baseIdx] = position.x;
      this.positions[baseIdx + 1] = position.y + 0.8 + Math.random() * 0.4;
      this.positions[baseIdx + 2] = position.z;

      // Set size and alpha
      this.sizes[index] = size;
      this.alphas[index] = 1;

      const spread = 0.5;
      const speedMult = 3 + Math.random() * 4;
      // Normalize direction once (reuse temp vector for calculation)
      const dirLen = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z) || 1;

      // Create velocity vector for this particle (stored in particle object, not per-frame)
      const velocity = new THREE.Vector3(
        (direction.x / dirLen) * speedMult + (Math.random() - 0.5) * spread,
        0.5 + Math.random() * 1.5,
        (direction.z / dirLen) * speedMult + (Math.random() - 0.5) * spread
      );

      const maxLife = 2.0;

      this.particles.push({
        index,
        velocity,
        life: maxLife,
        maxLife,
        hasCollided: false,
        size: size / 10,
      });
    }

    // Mark buffers for GPU update
    this.pointsGeometry.attributes.position.needsUpdate = true;
    this.pointsGeometry.attributes.size.needsUpdate = true;
    this.pointsGeometry.attributes.alpha.needsUpdate = true;
  }

  /**
   * Update all particles
   */
  update(deltaTime: number): void {
    const gravity = -9.8;
    const groundLevel = 0.05;
    let needsUpdate = false;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      const index = particle.index;
      const baseIdx = index * 3;

      // Update lifetime
      particle.life -= deltaTime;

      if (particle.life <= 0) {
        this.returnParticleIndex(index);
        // PERF: Swap-and-pop instead of splice (O(1) vs O(n))
        const lastIdx = this.particles.length - 1;
        if (i !== lastIdx) {
          this.particles[i] = this.particles[lastIdx];
        }
        this.particles.pop();
        needsUpdate = true;
        continue;
      }

      // Update velocity and position (directly update buffer - no allocations)
      particle.velocity.y += gravity * deltaTime;
      this.positions[baseIdx] += particle.velocity.x * deltaTime;
      this.positions[baseIdx + 1] += particle.velocity.y * deltaTime;
      this.positions[baseIdx + 2] += particle.velocity.z * deltaTime;

      // Check ground collision
      if (!particle.hasCollided && this.positions[baseIdx + 1] <= groundLevel) {
        particle.hasCollided = true;

        if (this.onGroundHitCallback) {
          // Reuse pre-allocated vector instead of creating new one
          this._tempHitPosition.set(
            this.positions[baseIdx],
            0.01,
            this.positions[baseIdx + 2]
          );
          this.onGroundHitCallback(this._tempHitPosition, particle.size);
        }
        this.returnParticleIndex(index);
        // PERF: Swap-and-pop instead of splice (O(1) vs O(n))
        const lastIdx2 = this.particles.length - 1;
        if (i !== lastIdx2) {
          this.particles[i] = this.particles[lastIdx2];
        }
        this.particles.pop();
        needsUpdate = true;
        continue;
      }

      // Update alpha based on lifetime
      const lifePercent = particle.life / particle.maxLife;
      this.alphas[index] = lifePercent;
      needsUpdate = true;
    }

    // Only update GPU buffers if particles changed
    if (needsUpdate) {
      this.pointsGeometry.attributes.position.needsUpdate = true;
      this.pointsGeometry.attributes.alpha.needsUpdate = true;
    }

    // Update debris particles
    this.updateDebris(deltaTime);
  }

  /**
   * Emit debris particles (for building destruction)
   */
  emitDebris(position: THREE.Vector3, count: number = 30): void {
    const actualCount = Math.min(count, 25);

    for (let i = 0; i < actualCount; i++) {
      if (this.debrisFreeIndices.length === 0) continue;

      const index = this.debrisFreeIndices.pop()!;
      this.activeDebris++;

      const size = 15 + Math.random() * 35; // Big chunky pieces
      const baseIdx = index * 3;

      // Spawn around building center with spread
      this.debrisPositions[baseIdx] = position.x + (Math.random() - 0.5) * 4;
      this.debrisPositions[baseIdx + 1] = position.y + Math.random() * 3;
      this.debrisPositions[baseIdx + 2] = position.z + (Math.random() - 0.5) * 4;

      this.debrisSizes[index] = size;
      this.debrisAlphas[index] = 1;

      // Random earthy colors (browns, grays, tans)
      const colorChoice = Math.random();
      if (colorChoice < 0.3) {
        // Dark brown (wood)
        this.debrisColors[baseIdx] = 0.4;
        this.debrisColors[baseIdx + 1] = 0.25;
        this.debrisColors[baseIdx + 2] = 0.15;
      } else if (colorChoice < 0.6) {
        // Gray (concrete/stone)
        const gray = 0.4 + Math.random() * 0.2;
        this.debrisColors[baseIdx] = gray;
        this.debrisColors[baseIdx + 1] = gray;
        this.debrisColors[baseIdx + 2] = gray;
      } else if (colorChoice < 0.8) {
        // Tan/beige
        this.debrisColors[baseIdx] = 0.6;
        this.debrisColors[baseIdx + 1] = 0.5;
        this.debrisColors[baseIdx + 2] = 0.35;
      } else {
        // Red brick
        this.debrisColors[baseIdx] = 0.5;
        this.debrisColors[baseIdx + 1] = 0.2;
        this.debrisColors[baseIdx + 2] = 0.15;
      }

      // Explosive outward velocity
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 8;
      const upSpeed = 3 + Math.random() * 6;

      const velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        upSpeed,
        Math.sin(angle) * speed
      );

      this.debrisParticles.push({
        index,
        velocity,
        life: 1.5 + Math.random() * 1.0,
        maxLife: 2.5,
        rotationSpeed: (Math.random() - 0.5) * 10,
      });
    }

    // Mark buffers for update
    this.debrisGeometry.attributes.position.needsUpdate = true;
    this.debrisGeometry.attributes.size.needsUpdate = true;
    this.debrisGeometry.attributes.alpha.needsUpdate = true;
    this.debrisGeometry.attributes.color.needsUpdate = true;
  }

  /**
   * Update debris particles
   */
  private updateDebris(deltaTime: number): void {
    if (this.debrisParticles.length === 0) return;

    const gravity = -15; // Heavier debris falls faster
    let needsUpdate = false;

    for (let i = this.debrisParticles.length - 1; i >= 0; i--) {
      const particle = this.debrisParticles[i];
      const index = particle.index;
      const baseIdx = index * 3;

      particle.life -= deltaTime;

      if (particle.life <= 0 || this.debrisPositions[baseIdx + 1] < -2) {
        // Return to pool
        this.debrisAlphas[index] = 0;
        this.debrisFreeIndices.push(index);
        this.activeDebris--;
        // PERF: Swap-and-pop instead of splice (O(1) vs O(n))
        const lastIdx = this.debrisParticles.length - 1;
        if (i !== lastIdx) {
          this.debrisParticles[i] = this.debrisParticles[lastIdx];
        }
        this.debrisParticles.pop();
        needsUpdate = true;
        continue;
      }

      // Apply gravity and update position
      particle.velocity.y += gravity * deltaTime;
      this.debrisPositions[baseIdx] += particle.velocity.x * deltaTime;
      this.debrisPositions[baseIdx + 1] += particle.velocity.y * deltaTime;
      this.debrisPositions[baseIdx + 2] += particle.velocity.z * deltaTime;

      // Bounce off ground with energy loss
      if (this.debrisPositions[baseIdx + 1] < 0.1 && particle.velocity.y < 0) {
        particle.velocity.y *= -0.3; // Bounce with energy loss
        particle.velocity.x *= 0.7; // Friction
        particle.velocity.z *= 0.7;
        this.debrisPositions[baseIdx + 1] = 0.1;
      }

      // Fade based on life
      const lifePercent = particle.life / particle.maxLife;
      this.debrisAlphas[index] = lifePercent;
      needsUpdate = true;
    }

    if (needsUpdate) {
      this.debrisGeometry.attributes.position.needsUpdate = true;
      this.debrisGeometry.attributes.alpha.needsUpdate = true;
    }
  }

  /**
   * Emit metal sparks (for sedan vs cop car chip damage)
   */
  emitSparks(position: THREE.Vector3, count: number = 8): void {
    const actualCount = Math.min(count, 10);

    for (let i = 0; i < actualCount; i++) {
      if (this.debrisFreeIndices.length === 0) continue;

      const index = this.debrisFreeIndices.pop()!;
      this.activeDebris++;

      const size = 8 + Math.random() * 12; // Small bright sparks
      const baseIdx = index * 3;

      // Spawn at collision point with tight spread
      this.debrisPositions[baseIdx] = position.x + (Math.random() - 0.5) * 1;
      this.debrisPositions[baseIdx + 1] = position.y + 0.3 + Math.random() * 0.5;
      this.debrisPositions[baseIdx + 2] = position.z + (Math.random() - 0.5) * 1;

      this.debrisSizes[index] = size;
      this.debrisAlphas[index] = 1;

      // Bright yellow/orange spark colors
      const colorChoice = Math.random();
      if (colorChoice < 0.5) {
        // Bright yellow
        this.debrisColors[baseIdx] = 1.0;
        this.debrisColors[baseIdx + 1] = 0.9;
        this.debrisColors[baseIdx + 2] = 0.3;
      } else if (colorChoice < 0.8) {
        // Orange
        this.debrisColors[baseIdx] = 1.0;
        this.debrisColors[baseIdx + 1] = 0.6;
        this.debrisColors[baseIdx + 2] = 0.1;
      } else {
        // White hot
        this.debrisColors[baseIdx] = 1.0;
        this.debrisColors[baseIdx + 1] = 1.0;
        this.debrisColors[baseIdx + 2] = 0.8;
      }

      // Fast outward spray
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      const upSpeed = 1 + Math.random() * 3;

      const velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        upSpeed,
        Math.sin(angle) * speed
      );

      this.debrisParticles.push({
        index,
        velocity,
        life: 0.3 + Math.random() * 0.3, // Short-lived sparks
        maxLife: 0.6,
        rotationSpeed: 0,
      });
    }

    // Mark buffers for update
    this.debrisGeometry.attributes.position.needsUpdate = true;
    this.debrisGeometry.attributes.size.needsUpdate = true;
    this.debrisGeometry.attributes.alpha.needsUpdate = true;
    this.debrisGeometry.attributes.color.needsUpdate = true;
  }

  /**
   * Clear all particles
   */
  clear(): void {
    for (const particle of this.particles) {
      this.returnParticleIndex(particle.index);
    }
    this.particles = [];

    // Clear debris too
    for (const particle of this.debrisParticles) {
      this.debrisAlphas[particle.index] = 0;
      this.debrisFreeIndices.push(particle.index);
    }
    this.debrisParticles = [];
    this.activeDebris = 0;

    // Update buffers to hide all particles
    this.pointsGeometry.attributes.alpha.needsUpdate = true;
    this.debrisGeometry.attributes.alpha.needsUpdate = true;
  }

  /**
   * Get particle count (for debugging)
   */
  getParticleCount(): number {
    return this.activeParticles + this.activeDebris;
  }
}
