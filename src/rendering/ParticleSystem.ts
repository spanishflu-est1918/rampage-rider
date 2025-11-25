import * as THREE from 'three';

/**
 * ParticleEmitter - Manages blood splatter particle effects with ground collision
 * OPTIMIZED: Uses shared textures and materials, pools sprites
 */
export class ParticleEmitter {
  private scene: THREE.Scene;
  private particles: Array<{
    sprite: THREE.Sprite;
    velocity: THREE.Vector3;
    life: number;
    maxLife: number;
    hasCollided: boolean;
    size: number;
  }> = [];

  // Shared resources (created once, reused)
  private sharedTexture: THREE.Texture;
  private sharedMaterial: THREE.SpriteMaterial;

  // Object pool for sprites
  private spritePool: THREE.Sprite[] = [];
  private readonly MAX_POOL_SIZE = 200;

  private onGroundHitCallback: ((position: THREE.Vector3, size: number) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Create shared blood texture ONCE
    this.sharedTexture = this.createBloodTexture();

    // Create shared material ONCE
    this.sharedMaterial = new THREE.SpriteMaterial({
      map: this.sharedTexture,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    console.log('[ParticleEmitter] Created with shared texture/material');
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
   * Get a sprite from pool or create new one
   */
  private getSprite(): THREE.Sprite {
    if (this.spritePool.length > 0) {
      const sprite = this.spritePool.pop()!;
      sprite.visible = true;
      sprite.material.opacity = 1;
      return sprite;
    }

    // Create new sprite with CLONED material (so opacity can vary per particle)
    const material = this.sharedMaterial.clone();
    return new THREE.Sprite(material);
  }

  /**
   * Return sprite to pool
   */
  private returnSprite(sprite: THREE.Sprite): void {
    sprite.visible = false;
    this.scene.remove(sprite);

    if (this.spritePool.length < this.MAX_POOL_SIZE) {
      this.spritePool.push(sprite);
    } else {
      // Pool full, dispose
      sprite.material.dispose();
    }
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
      const sprite = this.getSprite();
      const size = 0.1 + Math.random() * 0.2;
      sprite.scale.set(size, size, 1);

      sprite.position.set(
        position.x + (Math.random() - 0.5) * 0.5,
        position.y + 0.8 + Math.random() * 0.4,
        position.z + (Math.random() - 0.5) * 0.5
      );

      this.scene.add(sprite);

      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        1 + Math.random() * 2,
        Math.sin(angle) * speed
      );

      const maxLife = 2.0; // Reduced from 3.0

      this.particles.push({
        sprite,
        velocity,
        life: maxLife,
        maxLife,
        hasCollided: false,
        size: size * 8,
      });
    }
  }

  /**
   * Emit blood spray (directional, for when player hits pedestrian while moving)
   */
  emitBloodSpray(position: THREE.Vector3, direction: THREE.Vector3, count: number = 15): void {
    // Cap particle count for performance
    const actualCount = Math.min(count, 10);

    for (let i = 0; i < actualCount; i++) {
      const sprite = this.getSprite();
      const size = 0.08 + Math.random() * 0.15;
      sprite.scale.set(size, size, 1);

      sprite.position.set(
        position.x,
        position.y + 0.8 + Math.random() * 0.4,
        position.z
      );

      this.scene.add(sprite);

      const spread = 0.5;
      const velocity = direction.clone().normalize().multiplyScalar(3 + Math.random() * 4);
      velocity.x += (Math.random() - 0.5) * spread;
      velocity.y = 0.5 + Math.random() * 1.5;
      velocity.z += (Math.random() - 0.5) * spread;

      const maxLife = 2.0; // Reduced from 3.0

      this.particles.push({
        sprite,
        velocity,
        life: maxLife,
        maxLife,
        hasCollided: false,
        size: size * 6,
      });
    }
  }

  /**
   * Update all particles
   */
  update(deltaTime: number): void {
    const gravity = -9.8;
    const groundLevel = 0.05;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];

      // Update lifetime
      particle.life -= deltaTime;

      if (particle.life <= 0) {
        this.returnSprite(particle.sprite);
        this.particles.splice(i, 1);
        continue;
      }

      particle.velocity.y += gravity * deltaTime;
      particle.sprite.position.add(
        particle.velocity.clone().multiplyScalar(deltaTime)
      );

      if (!particle.hasCollided && particle.sprite.position.y <= groundLevel) {
        particle.hasCollided = true;

        if (this.onGroundHitCallback) {
          const hitPosition = particle.sprite.position.clone();
          hitPosition.y = 0.01;
          this.onGroundHitCallback(hitPosition, particle.size);
        }
        this.returnSprite(particle.sprite);
        this.particles.splice(i, 1);
        continue;
      }

      const lifePercent = particle.life / particle.maxLife;
      (particle.sprite.material as THREE.SpriteMaterial).opacity = lifePercent;
    }
  }

  /**
   * Clear all particles
   */
  clear(): void {
    for (const particle of this.particles) {
      this.returnSprite(particle.sprite);
    }
    this.particles = [];
  }

  /**
   * Get particle count (for debugging)
   */
  getParticleCount(): number {
    return this.particles.length;
  }
}
