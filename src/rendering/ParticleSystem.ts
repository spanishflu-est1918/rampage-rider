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

  // Buffer attributes
  private positions: Float32Array;
  private sizes: Float32Array;
  private alphas: Float32Array;
  private readonly MAX_PARTICLES = 200;
  private activeParticles: number = 0;
  private freeIndices: number[] = [];

  private onGroundHitCallback: ((position: THREE.Vector3, size: number) => void) | null = null;

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
      const velocity = direction.clone().normalize().multiplyScalar(3 + Math.random() * 4);
      velocity.x += (Math.random() - 0.5) * spread;
      velocity.y = 0.5 + Math.random() * 1.5;
      velocity.z += (Math.random() - 0.5) * spread;

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
        this.particles.splice(i, 1);
        needsUpdate = true;
        continue;
      }

      // Update velocity and position
      particle.velocity.y += gravity * deltaTime;
      this.positions[baseIdx] += particle.velocity.x * deltaTime;
      this.positions[baseIdx + 1] += particle.velocity.y * deltaTime;
      this.positions[baseIdx + 2] += particle.velocity.z * deltaTime;

      // Check ground collision
      if (!particle.hasCollided && this.positions[baseIdx + 1] <= groundLevel) {
        particle.hasCollided = true;

        if (this.onGroundHitCallback) {
          const hitPosition = new THREE.Vector3(
            this.positions[baseIdx],
            0.01,
            this.positions[baseIdx + 2]
          );
          this.onGroundHitCallback(hitPosition, particle.size);
        }
        this.returnParticleIndex(index);
        this.particles.splice(i, 1);
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
  }

  /**
   * Clear all particles
   */
  clear(): void {
    for (const particle of this.particles) {
      this.returnParticleIndex(particle.index);
    }
    this.particles = [];

    // Update buffers to hide all particles
    this.pointsGeometry.attributes.alpha.needsUpdate = true;
  }

  /**
   * Get particle count (for debugging)
   */
  getParticleCount(): number {
    return this.activeParticles;
  }
}
