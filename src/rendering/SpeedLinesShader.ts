import * as THREE from 'three';

/**
 * Anime-style speed lines shader
 * Based on noise texture stretched and scrolled
 */

// Generate noise texture procedurally
function createNoiseTexture(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size);

  for (let i = 0; i < size * size; i++) {
    data[i] = Math.random() * 255;
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;

  return texture;
}

export const SpeedLinesShader = {
  uniforms: {
    tNoise: { value: createNoiseTexture() },
    lineColorA: { value: new THREE.Color(0.7, 0.0, 0.0) }, // Dark red
    lineColorB: { value: new THREE.Color(0.3, 0.0, 0.0) }, // Darker red
    lineThreshold: { value: 0.65 },
    inverseSpeed: { value: 8.0 },
    lineLength: { value: 800.0 },
    angle: { value: 45.0 }, // Diagonal
    time: { value: 0.0 },
    opacity: { value: 1.0 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tNoise;
    uniform vec3 lineColorA;
    uniform vec3 lineColorB;
    uniform float lineThreshold;
    uniform float inverseSpeed;
    uniform float lineLength;
    uniform float angle;
    uniform float time;
    uniform float opacity;

    varying vec2 vUv;

    void main() {
      // Rotate UV by angle
      float rad = radians(angle);
      float cosA = cos(rad);
      float sinA = sin(rad);
      vec2 uv = vec2(
        vUv.x * cosA - vUv.y * sinA,
        vUv.x * sinA + vUv.y * cosA
      );

      // Sample noise - stretch along X, scroll over time
      vec2 noiseUV = vec2(uv.x / lineLength + time / inverseSpeed, uv.y);
      float noise = texture2D(tNoise, noiseUV).r;

      // Threshold to create lines
      if (noise < lineThreshold) {
        discard;
      }

      // Mix colors based on noise intensity
      vec3 color = mix(lineColorA, lineColorB, 1.0 - noise);

      gl_FragColor = vec4(color, opacity * (noise - lineThreshold) / (1.0 - lineThreshold));
    }
  `,
};

/**
 * SpeedLinesEffect - Fullscreen speed lines overlay
 */
export class SpeedLinesEffect {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  private isActive = false;
  private targetOpacity = 0;
  private currentOpacity = 0;

  // Direction tracking
  private targetAngle = 45;
  private currentAngle = 45;

  constructor() {
    // Create orthographic scene for fullscreen quad
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Create fullscreen quad
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SpeedLinesShader.uniforms),
      vertexShader: SpeedLinesShader.vertexShader,
      fragmentShader: SpeedLinesShader.fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.mesh);
  }

  enter(): void {
    this.isActive = true;
    this.targetOpacity = 1;
  }

  exit(): void {
    this.isActive = false;
    this.targetOpacity = 0;
  }

  /**
   * Set direction based on player velocity
   * Lines streak opposite to movement direction
   */
  setDirection(velocityX: number, velocityZ: number): void {
    const speed = Math.sqrt(velocityX * velocityX + velocityZ * velocityZ);
    if (speed < 0.5) return; // Don't change direction if not moving

    // Calculate angle from velocity (in world space)
    // atan2 gives angle from positive X axis, we need to convert to screen space
    // In isometric view, we need to adjust for the camera angle
    const worldAngle = Math.atan2(velocityZ, velocityX) * (180 / Math.PI);

    // Convert world angle to screen angle for isometric view
    // The isometric camera is rotated 45 degrees, so we adjust
    // Lines should point opposite to movement (coming AT the player)
    this.targetAngle = worldAngle + 45 + 180; // +45 for isometric, +180 for opposite direction
  }

  update(dt: number): void {
    // Update time
    this.material.uniforms.time.value += dt;

    // Smooth opacity transition
    const lerpSpeed = this.isActive ? 8.0 : 4.0;
    this.currentOpacity += (this.targetOpacity - this.currentOpacity) * Math.min(1, dt * lerpSpeed);
    this.material.uniforms.opacity.value = this.currentOpacity;

    // Smooth angle transition (handle wraparound)
    let angleDiff = this.targetAngle - this.currentAngle;
    // Handle wraparound (take shortest path)
    if (angleDiff > 180) angleDiff -= 360;
    if (angleDiff < -180) angleDiff += 360;
    this.currentAngle += angleDiff * Math.min(1, dt * 10); // Fast but smooth
    this.material.uniforms.angle.value = this.currentAngle;
  }

  render(renderer: THREE.WebGLRenderer): void {
    if (this.currentOpacity < 0.01) return;

    // Render speed lines on top
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    (this.material.uniforms.tNoise.value as THREE.Texture).dispose();
  }
}
