import * as THREE from 'three';

/**
 * Color presets for Christmas lights
 */
export type LightColorPreset = 'warm-white' | 'multicolor' | 'gold' | 'red-green';

const COLOR_PRESETS: Record<LightColorPreset, THREE.Color[]> = {
  'warm-white': [
    new THREE.Color(0xffe4b5), // Warm white
    new THREE.Color(0xffd700), // Gold tint
    new THREE.Color(0xffecb3), // Soft yellow
  ],
  'multicolor': [
    new THREE.Color(0xff4444), // Red
    new THREE.Color(0x44ff44), // Green
    new THREE.Color(0x4444ff), // Blue
    new THREE.Color(0xffff44), // Yellow
    new THREE.Color(0xff44ff), // Pink
  ],
  'gold': [
    new THREE.Color(0xffd700), // Gold
    new THREE.Color(0xffb300), // Amber
    new THREE.Color(0xffe066), // Light gold
  ],
  'red-green': [
    new THREE.Color(0xff2222), // Red
    new THREE.Color(0x22ff22), // Green
  ],
};

interface LightBulb {
  mesh: THREE.Mesh;
  baseColor: THREE.Color;
  baseIntensity: number;
  twinklePhase: number;
  twinkleSpeed: number;
}

interface LightStrand {
  group: THREE.Group;
  bulbs: LightBulb[];
  wire: THREE.Line;
  pointLights: THREE.PointLight[];
}

export interface ChristmasLightsConfig {
  bulbCount?: number;
  colorPreset?: LightColorPreset;
  bulbSize?: number;
  sag?: number;
  twinkle?: boolean;
  twinkleIntensity?: number;
  pointLightInterval?: number; // Add a point light every N bulbs (0 = no point lights)
  pointLightIntensity?: number;
  pointLightDistance?: number;
}

const DEFAULT_CONFIG: Required<ChristmasLightsConfig> = {
  bulbCount: 12,
  colorPreset: 'warm-white',
  bulbSize: 0.08,
  sag: 0.3,
  twinkle: true,
  twinkleIntensity: 0.3,
  pointLightInterval: 4, // Every 4th bulb gets a point light
  pointLightIntensity: 0.5,
  pointLightDistance: 3,
};

/**
 * ChristmasLights - Procedural string lights for festive decoration
 *
 * Creates catenary-curved string lights between two points with:
 * - Emissive bulb spheres
 * - Optional point lights for actual illumination
 * - Twinkle animation
 */
export class ChristmasLights {
  private scene: THREE.Scene;
  private strands: LightStrand[] = [];

  // Shared geometry and materials
  private bulbGeometry: THREE.SphereGeometry;
  private wireGeometry: THREE.BufferGeometry | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.bulbGeometry = new THREE.SphereGeometry(1, 8, 6); // Unit sphere, scaled per bulb
  }

  /**
   * Create a string of lights between two points
   */
  createStrand(
    startPoint: THREE.Vector3,
    endPoint: THREE.Vector3,
    config: ChristmasLightsConfig = {}
  ): LightStrand {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const colors = COLOR_PRESETS[cfg.colorPreset];

    // Create group to hold all strand elements
    const group = new THREE.Group();

    // Generate catenary curve points
    const curvePoints = this.generateCatenaryPoints(
      startPoint,
      endPoint,
      cfg.bulbCount,
      cfg.sag
    );

    // Create wire
    const wireGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const wireMaterial = new THREE.LineBasicMaterial({
      color: 0x222222,
      linewidth: 1,
    });
    const wire = new THREE.Line(wireGeometry, wireMaterial);
    group.add(wire);

    // Create bulbs
    const bulbs: LightBulb[] = [];
    const pointLights: THREE.PointLight[] = [];

    for (let i = 0; i < curvePoints.length; i++) {
      const point = curvePoints[i];
      const color = colors[i % colors.length];

      // Create simple glowing bulb material (MeshBasicMaterial avoids shader complexity)
      const bulbMaterial = new THREE.MeshBasicMaterial({
        color: color,
      });

      const bulbMesh = new THREE.Mesh(this.bulbGeometry, bulbMaterial);
      bulbMesh.scale.setScalar(cfg.bulbSize);
      bulbMesh.position.copy(point);
      group.add(bulbMesh);

      bulbs.push({
        mesh: bulbMesh,
        baseColor: color.clone(),
        baseIntensity: 2,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 1 + Math.random() * 2,
      });

      // Add point light at intervals for actual illumination
      if (cfg.pointLightInterval > 0 && i % cfg.pointLightInterval === 0) {
        const pointLight = new THREE.PointLight(
          color,
          cfg.pointLightIntensity,
          cfg.pointLightDistance
        );
        pointLight.position.copy(point);
        group.add(pointLight);
        pointLights.push(pointLight);
      }
    }

    this.scene.add(group);

    const strand: LightStrand = {
      group,
      bulbs,
      wire,
      pointLights,
    };

    this.strands.push(strand);
    return strand;
  }

  // Pre-allocated corners for perimeter lights
  private readonly _perimeterCorners: THREE.Vector3[] = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];

  /**
   * Create lights around a rectangular perimeter (for market stalls)
   */
  createPerimeterLights(
    center: THREE.Vector3,
    width: number,
    depth: number,
    height: number,
    config: ChristmasLightsConfig = {}
  ): LightStrand[] {
    const strands: LightStrand[] = [];
    const halfW = width / 2;
    const halfD = depth / 2;

    // Four corners at the roof edge - reuse pre-allocated vectors
    this._perimeterCorners[0].set(center.x - halfW, center.y + height, center.z - halfD);
    this._perimeterCorners[1].set(center.x + halfW, center.y + height, center.z - halfD);
    this._perimeterCorners[2].set(center.x + halfW, center.y + height, center.z + halfD);
    this._perimeterCorners[3].set(center.x - halfW, center.y + height, center.z + halfD);

    // Create strands along each edge
    for (let i = 0; i < 4; i++) {
      const start = this._perimeterCorners[i];
      const end = this._perimeterCorners[(i + 1) % 4];
      strands.push(this.createStrand(start, end, config));
    }

    return strands;
  }

  // Pre-allocated for catenary calculation
  private readonly _catenaryDir: THREE.Vector3 = new THREE.Vector3();

  /**
   * Generate catenary curve points between two points
   * Approximates the natural hanging curve of a cable
   * NOTE: These Vector3s are stored in geometry, not per-frame allocations
   */
  private generateCatenaryPoints(
    start: THREE.Vector3,
    end: THREE.Vector3,
    numPoints: number,
    sagAmount: number
  ): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];

    // Vector from start to end - reuse pre-allocated vector
    this._catenaryDir.subVectors(end, start);
    const length = this._catenaryDir.length();

    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1);

      // Linear interpolation along the line
      // These Vector3s are stored, not per-frame, so allocation is OK
      const point = new THREE.Vector3().lerpVectors(start, end, t);

      // Add catenary sag (parabolic approximation)
      // Maximum sag at the middle (t = 0.5)
      const sagFactor = 4 * t * (1 - t); // Parabola: 0 at ends, 1 at middle
      const sag = sagAmount * length * sagFactor;
      point.y -= sag;

      points.push(point);
    }

    return points;
  }

  /**
   * Update twinkle animation
   */
  update(deltaTime: number): void {
    for (const strand of this.strands) {
      for (const bulb of strand.bulbs) {
        // Update twinkle phase
        bulb.twinklePhase += bulb.twinkleSpeed * deltaTime;

        // Calculate twinkle factor (0.7 to 1.0 range for subtle effect)
        const twinkleFactor = 0.85 + 0.15 * Math.sin(bulb.twinklePhase);

        // Update color brightness by multiplying base color
        const material = bulb.mesh.material as THREE.MeshBasicMaterial;
        material.color.copy(bulb.baseColor).multiplyScalar(twinkleFactor);
      }

      // Update point light intensities to match (if any)
      for (let i = 0; i < strand.pointLights.length; i++) {
        const bulbIndex = i * (DEFAULT_CONFIG.pointLightInterval || 4);
        if (bulbIndex < strand.bulbs.length) {
          const bulb = strand.bulbs[bulbIndex];
          const twinkleFactor = 0.85 + 0.15 * Math.sin(bulb.twinklePhase);
          strand.pointLights[i].intensity = DEFAULT_CONFIG.pointLightIntensity * twinkleFactor;
        }
      }
    }
  }

  /**
   * Remove a specific strand
   */
  removeStrand(strand: LightStrand): void {
    const index = this.strands.indexOf(strand);
    if (index === -1) return;

    // Dispose materials
    for (const bulb of strand.bulbs) {
      (bulb.mesh.material as THREE.Material).dispose();
    }

    // Dispose wire geometry
    strand.wire.geometry.dispose();
    (strand.wire.material as THREE.Material).dispose();

    // Remove from scene
    this.scene.remove(strand.group);

    // Remove from tracking
    this.strands.splice(index, 1);
  }

  /**
   * Clear all strands
   */
  clear(): void {
    for (const strand of [...this.strands]) {
      this.removeStrand(strand);
    }
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.clear();
    this.bulbGeometry.dispose();
  }

  /**
   * Get strand count (for debugging)
   */
  getStrandCount(): number {
    return this.strands.length;
  }

  /**
   * Get total bulb count (for debugging)
   */
  getBulbCount(): number {
    return this.strands.reduce((sum, strand) => sum + strand.bulbs.length, 0);
  }
}
