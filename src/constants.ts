import { Tier, TierConfig } from './types';

export const WORLD_WIDTH = 40;
export const WORLD_DEPTH = 60; // Visible depth
export const CHUNK_SIZE = 40;

export const TIER_CONFIGS: Record<Tier, TierConfig> = {
  [Tier.FOOT]: {
    name: 'Foot Fiend',
    minKills: 0,
    speedMultiplier: 1.0, // Base speed approx 8 units/s
    maxHealth: 50,
    color: 0xffaa00, // Psycho Orange
    scale: 0.8,
    description: "Knife-wielding maniac. Running is cardio.",
  },
  [Tier.BIKE]: {
    name: 'Bike Butcher',
    minKills: 10,
    speedMultiplier: 1.5,
    maxHealth: 75,
    color: 0x00aaff, // Cyan
    scale: 1.0,
    description: "Eco-friendly violence. Pedal to the medal.",
  },
  [Tier.MOTO]: {
    name: 'Moto Maniac',
    minKills: 40,
    speedMultiplier: 2.2,
    maxHealth: 100,
    color: 0xff3333, // Aggressive Red
    scale: 1.2,
    description: "Two wheels, one engine, zero mercy.",
  },
  [Tier.SEDAN]: {
    name: 'Sedan Sovereign',
    minKills: 110,
    speedMultiplier: 3.0,
    maxHealth: 150,
    color: 0x333333, // Tank Black
    scale: 1.8,
    description: "Armored destruction. King of the road.",
  },
};

export const COLORS = {
  GROUND: 0x2a2a2a,
  PEDESTRIAN: 0xaaaaaa,
  PED_DEAD: 0x550000,
  COP: 0x0000ff,
  DEBRIS: 0x555555,
  ACCENT: 0xff0044,
};

export const SCORE_VALUES = {
  KILL_BASE: 10,
  COP_KILL: 50,
  COMBO_MULTIPLIER: 0.1,
  MAX_COMBO_THRESHOLD: 10, // Combo threshold for unlimited knife kills
};

export const SPAWN_RATES = {
  PEDESTRIAN: 0.05, // Chance per frame
  COP_BASE: 0.005,
};

export const CITY_CONFIG = {
  BUILDING_WIDTH: 8, // Width of each building (x-axis)
  BUILDING_DEPTH: 15, // Depth of each building (z-axis)
  BUILDING_HEIGHT: 5, // All buildings same height
  STREET_WIDTH: 5, // Gap between buildings (same on all sides)
  RENDER_DISTANCE: 8, // Number of grid cells to render around player (reduced from 10 for performance)
  BUILDING_COLOR: 0x4a4a4a, // Dark gray for buildings
};

// ============================================================================
// Entity Configuration (Phase 2.5 - Code Quality Refactoring)
// ============================================================================

/**
 * Skin tone palette for humanoid entities (pedestrians, cops)
 * European skin tone range from light to medium-tan
 */
export const SKIN_TONES = [
  0xF5D0B8, // Very light peachy
  0xE8B196, // Light peachy tan
  0xDDA886, // Medium peachy
  0xD5A27A, // Light tan
  0xCCA070, // Medium tan
] as const;

/**
 * Movement speeds for all entity types
 */
export const ENTITY_SPEEDS = {
  // Player
  PLAYER_WALK: 4,      // Shift-held slow movement
  PLAYER_SPRINT: 7,    // Default movement speed

  // Pedestrian
  PEDESTRIAN_WALK: 1.5,
  PEDESTRIAN_RUN: 6.0, // Panic flee speed

  // Cop
  COP_CHASE: 7.2,      // 80% of original 9.0 - player should be able to outrun
} as const;

/**
 * Physics configuration
 */
export const PHYSICS_CONFIG = {
  GRAVITY: -15,
  JUMP_FORCE: 5,
  GROUND_CHECK_Y: 0.57,       // Y position for ground detection
  MODEL_CONTAINER_Y: -0.57,   // Model container offset to ground character
} as const;

/**
 * Attack configuration for cops based on wanted stars
 */
export const ATTACK_CONFIG = {
  PUNCH: {
    range: 1.5,
    damage: 10,
    cooldown: 1.5,
    animation: 'Punch',
  },
  TASER: {
    range: 6.0,
    damage: 15,     // Taser doesn't do direct damage - stuns instead
    cooldown: 2.0,
    animation: 'Punch', // Using punch animation for taser
  },
  SHOOT: {
    range: 8.0,
    damage: 20,
    cooldown: 1.0,
    animation: 'Shoot_OneHanded',
  },
} as const;

/**
 * Hit stun durations
 */
export const HIT_STUN = {
  PLAYER: 0.3,  // 300ms - player recovers quickly
  COP: 0.6,     // 600ms - cops stagger longer
} as const;

/**
 * Cop entity configuration
 */
export const COP_CONFIG = {
  HEALTH: 3,              // Requires 3 knife hits to kill
  MAX_FORCE: 20.0,        // Yuka steering force for instant direction changes
  UNIFORM_COLOR: 0x0066ff, // Bright police blue
  GEAR_COLOR: 0x001a4d,   // Dark navy for helmets/gear
} as const;

/**
 * Pedestrian entity configuration
 */
export const PEDESTRIAN_CONFIG = {
  HEALTH: 1,              // One-shot kill
  PANIC_DISTANCE: 15,     // Distance at which they flee from danger
  STUMBLE_DURATION: 0.8,  // How long they stumble after being hit
} as const;

/**
 * Taser escape configuration (player)
 */
export const TASER_CONFIG = {
  ESCAPE_DECAY: 15,       // Progress decays 15% per second (was 20 - more forgiving)
  ESCAPE_PER_PRESS: 15,   // Each Space press adds 15% (was 12 - easier to escape)
  IMMUNITY_DURATION: 10,  // 10 seconds of immunity after escaping
  CRAWL_SPEED: 1.5,       // Slow movement speed while tased (about 20% of sprint)
  ESCAPE_KNOCKBACK: 8,    // Knockback radius when escaping taser
  ESCAPE_FORCE: 15,       // Force applied to nearby cops when escaping
} as const;

/**
 * Vehicle type enum
 */
export enum VehicleType {
  BICYCLE = 'bicycle',
  MOTORBIKE = 'motorbike',
  SEDAN = 'sedan',
}

/**
 * Vehicle configuration interface
 */
export interface VehicleConfig {
  type: VehicleType;
  name: string;
  modelPath: string;
  // Physics
  speed: number;
  turnSpeed: number;
  maxHealth: number;
  // Collider dimensions (half-extents)
  colliderWidth: number;
  colliderHeight: number;
  colliderLength: number;
  // Model transform
  modelScale: number;
  modelRotationY: number;  // Radians to rotate model to face forward
  modelOffsetY: number;    // Y offset to sit on ground
  // Rider position (relative to vehicle position)
  riderOffsetY: number;    // Y offset for seated player
  riderOffsetZ: number;    // Z offset (forward/back on vehicle)
  hideRider: boolean;      // Whether to hide rider (for enclosed vehicles like cars)
  // Kill mechanics
  killRadius: number;
  causesRagdoll: boolean;  // Whether kills send bodies flying (heavy vehicles only)
}

/**
 * Vehicle configurations for each type
 */
export const VEHICLE_CONFIGS: Record<VehicleType, VehicleConfig> = {
  [VehicleType.BICYCLE]: {
    type: VehicleType.BICYCLE,
    name: 'Bicycle',
    modelPath: '/assets/vehicles/bicycle.glb',
    speed: 10,           // Faster than sprint (7) but slower than car
    turnSpeed: 8,        // Very agile
    maxHealth: 50,       // Fragile
    colliderWidth: 0.3,
    colliderHeight: 0.5,
    colliderLength: 0.8,
    modelScale: 0.018,   // Model is ~98 units tall, need ~1.8 units (1.5x larger)
    modelRotationY: 0,   // GLTF Y-forward becomes Three.js -Z (default forward)
    modelOffsetY: 0,
    riderOffsetY: 0.0,   // Low position for Melee_Blocking seated pose
    riderOffsetZ: -0.6,  // Move back to sit on seat
    hideRider: false,    // Show rider on bicycle
    killRadius: 1.5,     // Small kill zone
    causesRagdoll: false, // Too light to send bodies flying
  },
  [VehicleType.MOTORBIKE]: {
    type: VehicleType.MOTORBIKE,
    name: 'Motorbike',
    modelPath: '/assets/vehicles/motorbike.glb',
    speed: 18,           // Fast!
    turnSpeed: 6,        // Good handling
    maxHealth: 75,
    colliderWidth: 0.4,
    colliderHeight: 0.6,
    colliderLength: 1.2,
    modelScale: 0.0045,  // Model is ~462 units tall, need ~2.1 units (1.5x larger)
    modelRotationY: 0,   // GLTF Y-forward becomes Three.js -Z (default forward)
    modelOffsetY: 0.3,   // Raise model to sit on ground properly
    riderOffsetY: 0.2,   // Height for motorbike seat
    riderOffsetZ: -0.5,  // Move back to sit on seat
    hideRider: false,    // Show rider on motorbike
    killRadius: 2.0,
    causesRagdoll: false, // Too light to send bodies flying
  },
  [VehicleType.SEDAN]: {
    type: VehicleType.SEDAN,
    name: 'Monster Truck',
    modelPath: '/assets/vehicles/car.glb',
    speed: 15,           // Current car speed
    turnSpeed: 5,
    maxHealth: 100,
    colliderWidth: 0.9,
    colliderHeight: 0.6,
    colliderLength: 1.7,
    modelScale: 0.012,   // Monster truck needs heavy scaling
    modelRotationY: -Math.PI / 2,  // Rotate to face forward
    modelOffsetY: -0.2,
    riderOffsetY: 0,     // Not used - rider hidden
    riderOffsetZ: 0,     // Not used - rider hidden
    hideRider: true,     // Hide rider in enclosed vehicle
    killRadius: 3.5,
    causesRagdoll: true,  // Heavy enough to send bodies flying!
  },
};

/**
 * Map tiers to vehicle types (FOOT tier has no vehicle)
 */
export const TIER_VEHICLE_MAP: Partial<Record<Tier, VehicleType>> = {
  [Tier.BIKE]: VehicleType.BICYCLE,
  [Tier.MOTO]: VehicleType.MOTORBIKE,
  [Tier.SEDAN]: VehicleType.SEDAN,
};