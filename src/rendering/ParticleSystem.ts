import * as THREE from 'three';

/**
 * ParticleEmitter - Manages blood splatter particle effects with ground collision
 * Particles fall with physics and trigger decals when they hit the ground
 */
export class ParticleEmitter {
  private scene: THREE.Scene;
  private particles: Array<{
    sprite: THREE.Sprite;
    velocity: THREE.Vector3;
    life: number;
    maxLife: number;
    hasCollided: boolean;
  }> = [];

  private onGroundHitCallback: ((position: THREE.Vector3, size: number) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    console.log('[ParticleEmitter] Created');
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
    for (let i = 0; i < count; i++) {
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
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.NormalBlending,
      });

      const sprite = new THREE.Sprite(material);
      const size = 0.1 + Math.random() * 0.2;
      sprite.scale.set(size, size, 1);

      sprite.position.set(
        position.x + (Math.random() - 0.5) * 0.5,
        position.y + 0.8 + Math.random() * 0.4,
        position.z + (Math.random() - 0.5) * 0.5
      );

      sprite.userData.size = size * 8;

      this.scene.add(sprite);

      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        1 + Math.random() * 2,
        Math.sin(angle) * speed
      );

      const maxLife = 3.0;

      this.particles.push({
        sprite,
        velocity,
        life: maxLife,
        maxLife,
        hasCollided: false,
      });
    }
  }

  /**
   * Emit blood spray (directional, for when player hits pedestrian while moving)
   */
  emitBloodSpray(position: THREE.Vector3, direction: THREE.Vector3, count: number = 15): void {
    for (let i = 0; i < count; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;

      const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, 'rgba(90, 0, 0, 1)');
      gradient.addColorStop(0.7, 'rgba(60, 0, 0, 0.8)');
      gradient.addColorStop(1, 'rgba(30, 0, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(16, 16, 12, 0, Math.PI * 2);
      ctx.fill();

      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.NormalBlending,
      });

      const sprite = new THREE.Sprite(material);
      const size = 0.08 + Math.random() * 0.15;
      sprite.scale.set(size, size, 1);

      sprite.position.set(
        position.x,
        position.y + 0.8 + Math.random() * 0.4,
        position.z
      );

      // Store size for decal
      sprite.userData.size = size * 6;
      this.scene.add(sprite);

      const spread = 0.5;
      const velocity = direction.clone().normalize().multiplyScalar(3 + Math.random() * 4);
      velocity.x += (Math.random() - 0.5) * spread;
      velocity.y = 0.5 + Math.random() * 1.5;
      velocity.z += (Math.random() - 0.5) * spread;

      const maxLife = 3.0;

      this.particles.push({
        sprite,
        velocity,
        life: maxLife,
        maxLife,
        hasCollided: false,
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
        this.scene.remove(particle.sprite);
        particle.sprite.material.dispose();
        (particle.sprite.material.map as THREE.Texture)?.dispose();
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
          const decalSize = particle.sprite.userData.size || 1.0;
          this.onGroundHitCallback(hitPosition, decalSize);
        }
        this.scene.remove(particle.sprite);
        particle.sprite.material.dispose();
        (particle.sprite.material.map as THREE.Texture)?.dispose();
        this.particles.splice(i, 1);
        continue;
      }

      const lifePercent = particle.life / particle.maxLife;
      particle.sprite.material.opacity = lifePercent;
    }
  }

  /**
   * Clear all particles
   */
  clear(): void {
    for (const particle of this.particles) {
      this.scene.remove(particle.sprite);
      particle.sprite.material.dispose();
      (particle.sprite.material.map as THREE.Texture)?.dispose();
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
