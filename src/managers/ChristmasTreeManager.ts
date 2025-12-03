import * as THREE from 'three';
import { CITY_CONFIG } from '../constants';

interface TreeInstance {
  mesh: THREE.Group;
  gridX: number;
  gridZ: number;
  cornerIndex: number; // 0-3 for which corner of building
}

/**
 * ChristmasTreeManager
 *
 * Manages low-poly Christmas trees placed at building corners.
 * Uses a pool of reusable trees that reposition as player moves.
 *
 * Performance optimizations:
 * - Shared geometry and materials (all trees reuse same resources)
 * - Low-poly cone geometry (6-8 segments)
 * - No point lights (relies on scene lighting)
 * - Pool-based repositioning (no create/destroy)
 * - Lazy initialization
 */
export class ChristmasTreeManager {
  private scene: THREE.Scene;

  // Pool of reusable trees (16 trees - 4 per building in 2x2 grid)
  private trees: TreeInstance[] = [];
  private initialized = false;

  // Grid cell size (same as BuildingManager)
  private cellWidth: number;
  private cellDepth: number;

  // Track current base position
  private currentBaseX = Infinity;
  private currentBaseZ = Infinity;

  // Shared geometry and materials
  private trunkGeometry: THREE.CylinderGeometry | null = null;
  private trunkMaterial: THREE.MeshStandardMaterial | null = null;
  private foliageGeometry: THREE.ConeGeometry[] = [];
  private foliageMaterial: THREE.MeshStandardMaterial | null = null;
  private starGeometry: THREE.OctahedronGeometry | null = null;
  private starMaterial: THREE.MeshStandardMaterial | null = null;
  private ornamentGeometry: THREE.SphereGeometry | null = null;
  private ornamentMaterials: THREE.MeshStandardMaterial[] = [];

  // Tree dimensions
  private readonly TREE_HEIGHT = 2.5;
  private readonly TRUNK_HEIGHT = 0.4;
  private readonly TRUNK_RADIUS = 0.15;
  private readonly BASE_RADIUS = 1.0;

  // Ornament colors
  private readonly ORNAMENT_COLORS = [
    0xff0000, // Red
    0xffd700, // Gold
    0x0066ff, // Blue
    0xff69b4, // Pink
    0x00ff00, // Green
    0xffffff, // White/Silver
  ];

  // Placement offsets from building corners
  private readonly CORNER_OFFSETS = [
    { x: -0.5, z: -0.5 }, // Near corner 0
    { x: 0.5, z: -0.5 },  // Near corner 1
    { x: -0.5, z: 0.5 },  // Near corner 2
    { x: 0.5, z: 0.5 },   // Near corner 3
  ];

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.cellWidth = CITY_CONFIG.BUILDING_WIDTH + CITY_CONFIG.STREET_WIDTH;
    this.cellDepth = CITY_CONFIG.BUILDING_DEPTH + CITY_CONFIG.STREET_WIDTH;

    this.createSharedGeometry();
  }

  /**
   * Create shared geometry and materials (reused by all trees)
   */
  private createSharedGeometry(): void {
    // Trunk - dark brown
    this.trunkGeometry = new THREE.CylinderGeometry(
      this.TRUNK_RADIUS * 0.7, // Top
      this.TRUNK_RADIUS,       // Bottom
      this.TRUNK_HEIGHT,
      6 // Low poly
    );
    this.trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3728,
      roughness: 0.9,
      metalness: 0.0,
    });

    // Foliage layers - 3 stacked cones, decreasing in size
    const layerHeights = [0.8, 0.7, 0.6];
    const layerRadii = [1.0, 0.7, 0.45];
    for (let i = 0; i < 3; i++) {
      this.foliageGeometry.push(
        new THREE.ConeGeometry(
          this.BASE_RADIUS * layerRadii[i],
          this.TREE_HEIGHT * layerHeights[i] / 2,
          8, // Low poly - 8 sides looks good for trees
          1
        )
      );
    }

    this.foliageMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a5f1a, // Dark Christmas green
      roughness: 0.8,
      metalness: 0.0,
    });

    // Star on top - octahedron looks like a star
    this.starGeometry = new THREE.OctahedronGeometry(0.15, 0);
    this.starMaterial = new THREE.MeshStandardMaterial({
      color: 0xffdd00,
      emissive: 0xffaa00,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.5,
    });

    // Ornament balls - tiny spheres
    this.ornamentGeometry = new THREE.SphereGeometry(0.06, 6, 4);
    for (const color of this.ORNAMENT_COLORS) {
      this.ornamentMaterials.push(
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.2,
          metalness: 0.3,
          emissive: color,
          emissiveIntensity: 0.15,
        })
      );
    }
  }

  /**
   * Create a single Christmas tree mesh
   */
  private createTreeMesh(scale: number = 1.0): THREE.Group {
    const group = new THREE.Group();

    // Trunk
    const trunk = new THREE.Mesh(this.trunkGeometry!, this.trunkMaterial!);
    trunk.position.y = this.TRUNK_HEIGHT / 2;
    trunk.castShadow = false;
    trunk.receiveShadow = false;
    group.add(trunk);

    // Foliage layers - stacked cones
    const layerYPositions = [0.5, 1.0, 1.5];
    for (let i = 0; i < 3; i++) {
      const foliage = new THREE.Mesh(this.foliageGeometry[i]!, this.foliageMaterial!);
      foliage.position.y = this.TRUNK_HEIGHT + layerYPositions[i];
      foliage.castShadow = false;
      foliage.receiveShadow = false;
      group.add(foliage);
    }

    // Star on top
    const star = new THREE.Mesh(this.starGeometry!, this.starMaterial!);
    star.position.y = this.TREE_HEIGHT + 0.1;
    star.rotation.y = Math.PI / 4; // Rotate for better visibility
    group.add(star);

    // Add ornaments (6-8 per tree, randomly positioned on the cone surface)
    this.addOrnaments(group);

    group.scale.setScalar(scale);
    return group;
  }

  /**
   * Add ornaments to a tree (positions on cone surface)
   */
  private addOrnaments(group: THREE.Group): void {
    const ornamentCount = 6 + Math.floor(Math.random() * 3); // 6-8 ornaments

    for (let i = 0; i < ornamentCount; i++) {
      // Random layer (0-2)
      const layer = Math.floor(Math.random() * 3);
      const layerY = this.TRUNK_HEIGHT + [0.5, 1.0, 1.5][layer];
      const layerRadius = this.BASE_RADIUS * [0.9, 0.6, 0.35][layer];

      // Random angle around the tree
      const angle = Math.random() * Math.PI * 2;
      const radiusOffset = 0.85 + Math.random() * 0.1; // Slightly inside the cone surface

      const x = Math.cos(angle) * layerRadius * radiusOffset;
      const z = Math.sin(angle) * layerRadius * radiusOffset;
      const y = layerY - 0.1 + Math.random() * 0.2; // Slight Y variation

      // Random color
      const colorIndex = Math.floor(Math.random() * this.ornamentMaterials.length);

      const ornament = new THREE.Mesh(this.ornamentGeometry!, this.ornamentMaterials[colorIndex]);
      ornament.position.set(x, y, z);
      group.add(ornament);
    }
  }

  /**
   * Initialize the pool of trees
   * 16 trees total: 4 corners × 4 buildings (2×2 grid)
   */
  private initializeTrees(): void {
    if (this.initialized) return;

    // Create 16 trees for 2x2 building grid with 4 corners each
    // But we don't need 4 per building - just 1-2 per building looks better
    // So: 8 trees (2 per building in 2x2 grid)
    const treesPerBuilding = 2;
    const buildingGridSize = 2;
    const totalTrees = treesPerBuilding * buildingGridSize * buildingGridSize;

    for (let i = 0; i < totalTrees; i++) {
      // Vary tree sizes slightly for natural look
      const scale = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
      const mesh = this.createTreeMesh(scale);
      mesh.position.set(0, 0, 0);
      // Random rotation for variety
      mesh.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(mesh);

      this.trees.push({
        mesh,
        gridX: 0,
        gridZ: 0,
        cornerIndex: i % treesPerBuilding,
      });
    }

    this.initialized = true;
  }

  /**
   * Calculate world position for a tree at a building corner
   */
  private getTreeWorldPosition(gridX: number, gridZ: number, cornerIndex: number): { x: number; z: number } {
    // Building center in world space
    const buildingCenterX = gridX * this.cellWidth;
    const buildingCenterZ = gridZ * this.cellDepth;

    // Building half dimensions
    const halfWidth = CITY_CONFIG.BUILDING_WIDTH / 2;
    const halfDepth = CITY_CONFIG.BUILDING_DEPTH / 2;

    // Street offset (trees are on the street, not inside building)
    const streetOffset = 1.5; // Distance from building edge

    // Corner positions (on the street near each corner)
    // cornerIndex 0: front-left, 1: front-right
    const positions = [
      { x: -halfWidth - streetOffset, z: -halfDepth - streetOffset },
      { x: halfWidth + streetOffset, z: -halfDepth - streetOffset },
      { x: -halfWidth - streetOffset, z: halfDepth + streetOffset },
      { x: halfWidth + streetOffset, z: halfDepth + streetOffset },
    ];

    const corner = positions[cornerIndex % positions.length];
    return {
      x: buildingCenterX + corner.x,
      z: buildingCenterZ + corner.z,
    };
  }

  /**
   * Reposition a tree to a new grid position
   */
  private repositionTree(tree: TreeInstance, newGridX: number, newGridZ: number, cornerIndex: number): void {
    const pos = this.getTreeWorldPosition(newGridX, newGridZ, cornerIndex);
    tree.mesh.position.set(pos.x, 0, pos.z);
    tree.gridX = newGridX;
    tree.gridZ = newGridZ;
    tree.cornerIndex = cornerIndex;

    // Randomize rotation when repositioning for variety
    tree.mesh.rotation.y = Math.random() * Math.PI * 2;
  }

  /**
   * Update trees based on player position
   */
  update(playerPosition: THREE.Vector3): void {
    if (!this.initialized) {
      this.initializeTrees();
    }

    // Calculate player's grid cell
    const playerGridX = Math.floor(playerPosition.x / this.cellWidth);
    const playerGridZ = Math.floor(playerPosition.z / this.cellDepth);

    // Base position for 2x2 building grid centered on player
    const baseX = playerGridX - 1;
    const baseZ = playerGridZ - 1;

    // Only reposition if base has changed
    if (baseX === this.currentBaseX && baseZ === this.currentBaseZ) {
      return;
    }

    // Calculate target positions for all trees
    // 2 trees per building, 4 buildings = 8 trees
    const targetPositions: { gridX: number; gridZ: number; cornerIndex: number }[] = [];
    for (let bx = 0; bx < 2; bx++) {
      for (let bz = 0; bz < 2; bz++) {
        // 2 trees per building (diagonal corners for visual balance)
        const corners = [0, 3]; // Front-left and back-right
        for (const cornerIndex of corners) {
          targetPositions.push({
            gridX: baseX + bx,
            gridZ: baseZ + bz,
            cornerIndex,
          });
        }
      }
    }

    // Keep trees that are already on a target
    const remainingTargets = [...targetPositions];
    const needsRepositioning: TreeInstance[] = [];

    for (const tree of this.trees) {
      const idx = remainingTargets.findIndex(
        t => t.gridX === tree.gridX && t.gridZ === tree.gridZ && t.cornerIndex === tree.cornerIndex
      );
      if (idx !== -1) {
        remainingTargets.splice(idx, 1);
      } else {
        needsRepositioning.push(tree);
      }
    }

    // Reposition only the trees that need it
    for (let i = 0; i < needsRepositioning.length; i++) {
      const target = remainingTargets[i];
      if (target) {
        this.repositionTree(needsRepositioning[i], target.gridX, target.gridZ, target.cornerIndex);
      }
    }

    this.currentBaseX = baseX;
    this.currentBaseZ = baseZ;
  }

  /**
   * Clear all trees
   */
  clear(): void {
    for (const tree of this.trees) {
      this.scene.remove(tree.mesh);
    }
    this.trees = [];

    this.initialized = false;
    this.currentBaseX = Infinity;
    this.currentBaseZ = Infinity;
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.clear();
    this.trunkGeometry?.dispose();
    this.trunkMaterial?.dispose();
    for (const geo of this.foliageGeometry) {
      geo.dispose();
    }
    this.foliageMaterial?.dispose();
    this.starGeometry?.dispose();
    this.starMaterial?.dispose();
    this.ornamentGeometry?.dispose();
    for (const mat of this.ornamentMaterials) {
      mat.dispose();
    }
  }

  /**
   * Get tree count (for debugging)
   */
  getTreeCount(): number {
    return this.trees.length;
  }

  /**
   * Set visibility of all trees (for Rampage Dimension effect)
   */
  setAllVisible(visible: boolean): void {
    for (const tree of this.trees) {
      // Traverse all children to ensure complete visibility toggle
      tree.mesh.traverse((child) => {
        child.visible = visible;
      });
    }
  }
}
