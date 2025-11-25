import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { CITY_CONFIG } from '../constants';

/**
 * BuildingManager
 *
 * Manages infinite procedural city generation using modulo-based grid system.
 * Textured boxes arranged in a Christmas market pattern:
 * - Uniform rectangular buildings (8x15 units)
 * - Equal spacing on all sides (5 unit streets)
 * - Painted wood facades, brown plank sides
 * - Infinite generation based on player position
 */
export class BuildingManager {
  private scene: THREE.Scene;
  private world: RAPIER.World;

  // Track visible buildings by grid coordinates "x,z"
  private buildings: Map<string, {
    mesh: THREE.Mesh;
    roof: THREE.Mesh;
    body: RAPIER.RigidBody;
  }> = new Map();

  // Grid cell size (building + street)
  private cellWidth: number;
  private cellDepth: number;

  // Texture loader
  private textureLoader: THREE.TextureLoader;

  // Preloaded textures
  private facadeTexture: THREE.Texture | null = null;
  private facadeRoughness: THREE.Texture | null = null;
  private facadeNormal: THREE.Texture | null = null;
  private sideTexture: THREE.Texture | null = null;
  private sideRoughness: THREE.Texture | null = null;
  private texturesLoaded: boolean = false;

  // Cached materials (shared across all buildings)
  private sideMaterial: THREE.MeshStandardMaterial | null = null;
  private roofMaterial: THREE.MeshStandardMaterial | null = null;
  private bottomMaterial: THREE.MeshStandardMaterial | null = null;
  private facadeMaterial: THREE.MeshStandardMaterial | null = null;

  constructor(scene: THREE.Scene, world: RAPIER.World) {
    this.scene = scene;
    this.world = world;
    this.textureLoader = new THREE.TextureLoader();

    // Calculate grid cell size (building dimension + street gap)
    this.cellWidth = CITY_CONFIG.BUILDING_WIDTH + CITY_CONFIG.STREET_WIDTH;
    this.cellDepth = CITY_CONFIG.BUILDING_DEPTH + CITY_CONFIG.STREET_WIDTH;

    // Preload textures
    this.preloadTextures();

    console.log('[BuildingManager] Created with grid cells:', this.cellWidth, 'x', this.cellDepth);
  }

  /**
   * Preload all textures
   */
  private preloadTextures(): void {
    // Facade (Painted Wood)
    this.facadeTexture = this.textureLoader.load('/assets/textures/painted-wood/color.jpg', () => {
      this.checkTexturesLoaded();
    });
    this.facadeTexture.wrapS = THREE.RepeatWrapping;
    this.facadeTexture.wrapT = THREE.RepeatWrapping;
    this.facadeTexture.colorSpace = THREE.SRGBColorSpace;

    this.facadeRoughness = this.textureLoader.load('/assets/textures/painted-wood/roughness.jpg');
    this.facadeRoughness.wrapS = THREE.RepeatWrapping;
    this.facadeRoughness.wrapT = THREE.RepeatWrapping;

    this.facadeNormal = this.textureLoader.load('/assets/textures/painted-wood/normal.jpg');
    this.facadeNormal.wrapS = THREE.RepeatWrapping;
    this.facadeNormal.wrapT = THREE.RepeatWrapping;

    // Sides (Brown Planks)
    this.sideTexture = this.textureLoader.load('/assets/textures/brown-planks/color.jpg');
    this.sideTexture.wrapS = THREE.RepeatWrapping;
    this.sideTexture.wrapT = THREE.RepeatWrapping;
    this.sideTexture.colorSpace = THREE.SRGBColorSpace;

    this.sideRoughness = this.textureLoader.load('/assets/textures/brown-planks/roughness.jpg');
    this.sideRoughness.wrapS = THREE.RepeatWrapping;
    this.sideRoughness.wrapT = THREE.RepeatWrapping;
  }

  private checkTexturesLoaded(): void {
    this.texturesLoaded = true;

    // Create shared materials once textures are loaded
    this.sideMaterial = new THREE.MeshStandardMaterial({
      map: this.sideTexture,
      roughnessMap: this.sideRoughness,
      roughness: 1.0,
      side: THREE.DoubleSide
    });

    this.facadeMaterial = new THREE.MeshStandardMaterial({
      map: this.facadeTexture,
      roughnessMap: this.facadeRoughness,
      normalMap: this.facadeNormal,
      roughness: 0.8,
      side: THREE.DoubleSide
    });

    this.roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c4033,
      roughness: 0.9,
      side: THREE.DoubleSide
    });

    this.bottomMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3728,
      roughness: 1.0,
      side: THREE.DoubleSide
    });

    console.log('[BuildingManager] Textures loaded and materials cached');
  }

  /**
   * Update visible buildings based on player position
   */
  update(playerPosition: THREE.Vector3): void {
    // Wait for textures to load
    if (!this.texturesLoaded) return;

    // Calculate player's grid cell
    const playerGridX = Math.floor(playerPosition.x / this.cellWidth);
    const playerGridZ = Math.floor(playerPosition.z / this.cellDepth);

    // Track which buildings should be visible
    const visibleKeys = new Set<string>();

    // Check all grid cells within render distance
    for (let x = playerGridX - CITY_CONFIG.RENDER_DISTANCE; x <= playerGridX + CITY_CONFIG.RENDER_DISTANCE; x++) {
      for (let z = playerGridZ - CITY_CONFIG.RENDER_DISTANCE; z <= playerGridZ + CITY_CONFIG.RENDER_DISTANCE; z++) {
        // Only place buildings at even grid coordinates (creates checkerboard with streets)
        if (this.shouldHaveBuilding(x, z)) {
          const key = `${x},${z}`;
          visibleKeys.add(key);

          // Create building if it doesn't exist yet
          if (!this.buildings.has(key)) {
            this.createBuilding(x, z);
          }
        }
      }
    }

    // Remove buildings that are no longer visible
    for (const [key, building] of this.buildings) {
      if (!visibleKeys.has(key)) {
        this.removeBuilding(key, building);
      }
    }
  }

  /**
   * Determine if a building should exist at this grid coordinate
   * Buildings at even coordinates, streets at odd
   */
  private shouldHaveBuilding(gridX: number, gridZ: number): boolean {
    // Checkerboard pattern: both coordinates must be even
    return (gridX % 2 === 0) && (gridZ % 2 === 0);
  }

  /**
   * Create a building at the given grid coordinate
   */
  private createBuilding(gridX: number, gridZ: number): void {
    const key = `${gridX},${gridZ}`;

    // Calculate world position from grid coordinate
    const worldX = gridX * this.cellWidth;
    const worldZ = gridZ * this.cellDepth;

    const height = CITY_CONFIG.BUILDING_HEIGHT;

    // Create box geometry
    const geometry = new THREE.BoxGeometry(
      CITY_CONFIG.BUILDING_WIDTH,
      height,
      CITY_CONFIG.BUILDING_DEPTH
    );

    // Different texture per face: [right, left, top, bottom, front, back]
    // Use shared materials for performance
    const materials = [
      this.sideMaterial!,    // Right side (X+)
      this.sideMaterial!,    // Left side (X-)
      this.roofMaterial!,    // Top (Y+)
      this.bottomMaterial!,  // Bottom (Y-)
      this.facadeMaterial!,  // Front (Z+)
      this.sideMaterial!     // Back (Z-)
    ];

    const mesh = new THREE.Mesh(geometry, materials);
    mesh.position.set(worldX, height / 2, worldZ);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    // Create peaked roof (rectangular pyramid matching building footprint)
    const roofHeight = 2.0;

    // Create custom rectangular pyramid geometry
    const roofGeometry = new THREE.BufferGeometry();
    const w = CITY_CONFIG.BUILDING_WIDTH / 2;
    const d = CITY_CONFIG.BUILDING_DEPTH / 2;

    // 5 vertices: 4 corners at base + 1 peak at top
    const vertices = new Float32Array([
      // Base corners (at building top)
      -w, 0, -d,  // 0: back-left
       w, 0, -d,  // 1: back-right
       w, 0,  d,  // 2: front-right
      -w, 0,  d,  // 3: front-left
      // Peak
       0, roofHeight, 0   // 4: top center
    ]);

    // 4 triangular faces + 1 square base (6 triangles total)
    const indices = new Uint16Array([
      // 4 sloped faces (triangles)
      0, 1, 4,  // Back face
      1, 2, 4,  // Right face
      2, 3, 4,  // Front face
      3, 0, 4,  // Left face
      // Base (2 triangles to close bottom)
      0, 2, 1,
      0, 3, 2
    ]);

    roofGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    roofGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
    roofGeometry.computeVertexNormals();

    // Use shared dark brown roof material
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B4513,
      roughness: 0.9,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(worldX, height, worldZ); // Position at building top
    roof.castShadow = true;
    roof.receiveShadow = true;
    this.scene.add(roof);

    // Create physics collider (static) with collision groups
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(worldX, height / 2, worldZ);
    const body = this.world.createRigidBody(bodyDesc);

    // Building collision groups:
    // Membership: 0x0040 (BUILDING group)
    // Filter: 0x009E (PLAYER=0x0002, PEDESTRIAN=0x0004, COP=0x0008, DEBRIS=0x0010, VEHICLE=0x0080)
    // Format: (filter << 16) | membership
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      CITY_CONFIG.BUILDING_WIDTH / 2,
      height / 2,
      CITY_CONFIG.BUILDING_DEPTH / 2
    )
      .setCollisionGroups(0x009E0040); // Filter=0x009E (includes VEHICLE), Membership=0x0040

    this.world.createCollider(colliderDesc, body);

    // Store building with roof
    this.buildings.set(key, { mesh, roof, body });
  }

  /**
   * Remove a building
   */
  private removeBuilding(key: string, building: { mesh: THREE.Mesh; roof: THREE.Mesh; body: RAPIER.RigidBody }): void {
    // Remove from scene
    this.scene.remove(building.mesh);
    this.scene.remove(building.roof);

    // Only dispose geometries (materials are shared, don't dispose them!)
    building.mesh.geometry.dispose();
    building.roof.geometry.dispose();
    (building.roof.material as THREE.Material).dispose(); // Roof material is unique per building

    // Remove physics body
    this.world.removeRigidBody(building.body);

    // Remove from tracking
    this.buildings.delete(key);
  }

  /**
   * Clear all buildings
   */
  clear(): void {
    for (const [key, building] of this.buildings) {
      this.removeBuilding(key, building);
    }
    console.log('[BuildingManager] Cleared all buildings');
  }

  /**
   * Get building count (for debugging)
   */
  getBuildingCount(): number {
    return this.buildings.size;
  }
}
