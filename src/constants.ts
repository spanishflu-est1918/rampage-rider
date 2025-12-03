import { Tier, TierConfig } from "./types";

// Debug flag for performance panel - set to true to show performance metrics
export const DEBUG_PERFORMANCE_PANEL = false;

export const WORLD_WIDTH = 40;
export const WORLD_DEPTH = 60; // Visible depth
export const CHUNK_SIZE = 40;

export const TIER_CONFIGS: Record<Tier, TierConfig> = {
  [Tier.FOOT]: {
    name: "Foot Fiend",
    minScore: 0, // Starting tier
    speedMultiplier: 1.0, // Base speed approx 8 units/s
    maxHealth: 50,
    color: 0xffaa00, // Psycho Orange
    scale: 0.8,
    description: "Knife-wielding maniac. Running is cardio.",
  },
  [Tier.BIKE]: {
    name: "Bike Butcher",
    minScore: 150, // ~10 kills with basic combo
    speedMultiplier: 1.5,
    maxHealth: 75,
    color: 0x00aaff, // Cyan
    scale: 1.0,
    description: "Eco-friendly violence. Pedal to the medal.",
  },
  [Tier.MOTO]: {
    name: "Moto Maniac",
    minScore: 1200, // ~50 kills - smoother Bike→Moto progression
    speedMultiplier: 2.2,
    maxHealth: 100,
    color: 0xff3333, // Aggressive Red
    scale: 1.2,
    description: "Two wheels, one engine, zero mercy.",
  },
  [Tier.SEDAN]: {
    name: "Sedan Sovereign",
    minScore: 4000, // ~110 kills with high multipliers
    speedMultiplier: 3.0,
    maxHealth: 150,
    color: 0x333333, // Tank Black
    scale: 1.8,
    description: "Armored destruction. King of the road.",
  },
  [Tier.TRUCK]: {
    name: "Road Destroyer",
    minScore: 10000, // ~250 kills with insane multipliers
    speedMultiplier: 2.5, // Slower than sedan but unstoppable
    maxHealth: 300, // Tank-level health
    color: 0x880000, // Blood red
    scale: 2.5,
    description: "18 wheels of destruction. Crushes EVERYTHING.",
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
  0xf5d0b8, // Very light peachy
  0xe8b196, // Light peachy tan
  0xdda886, // Medium peachy
  0xd5a27a, // Light tan
  0xcca070, // Medium tan
] as const;

/**
 * Movement speeds for all entity types
 */
export const ENTITY_SPEEDS = {
  // Player
  PLAYER_WALK: 4, // Shift-held slow movement
  PLAYER_SPRINT: 7, // Default movement speed

  // Pedestrian
  PEDESTRIAN_WALK: 1.5,
  PEDESTRIAN_RUN: 6.0, // Panic flee speed

  // Cop
  COP_CHASE: 6.5, // Slightly slower than player sprint (7.0) - creates tension without guaranteed death
} as const;

/**
 * Physics configuration
 */
export const PHYSICS_CONFIG = {
  GRAVITY: -15,
  JUMP_FORCE: 5,
  GROUND_CHECK_Y: 0.57, // Y position for ground detection
  MODEL_CONTAINER_Y: -0.57, // Model container offset to ground character
} as const;

/**
 * Attack configuration for cops based on wanted stars
 */
export const ATTACK_CONFIG = {
  PUNCH: {
    range: 1.5,
    damage: 10,
    cooldown: 1.5,
    animation: "Punch",
  },
  TASER: {
    range: 6.0,
    damage: 15, // Taser doesn't do direct damage - stuns instead
    cooldown: 2.0,
    animation: "Punch", // Using punch animation for taser
  },
  SHOOT: {
    range: 8.0,
    damage: 20,
    cooldown: 1.0,
    animation: "Shoot_OneHanded",
  },
} as const;

/**
 * Hit stun durations
 */
export const HIT_STUN = {
  PLAYER: 0.3, // 300ms - player recovers quickly
  COP: 0.6, // 600ms - cops stagger longer
} as const;

/**
 * Cop entity configuration
 */
export const COP_CONFIG = {
  HEALTH: 3, // Requires 3 knife hits to kill
  MAX_FORCE: 20.0, // Yuka steering force for instant direction changes
  UNIFORM_COLOR: 0x0066ff, // Bright police blue
  GEAR_COLOR: 0x001a4d, // Dark navy for helmets/gear
} as const;

/**
 * Pedestrian entity configuration
 */
export const PEDESTRIAN_CONFIG = {
  HEALTH: 1, // One-shot kill
  PANIC_DISTANCE: 15, // Distance at which they flee from danger
  STUMBLE_DURATION: 0.8, // How long they stumble after being hit
} as const;

/**
 * Taser escape configuration (player)
 */
export const TASER_CONFIG = {
  ESCAPE_DECAY: 15, // Progress decays 15% per second (was 20 - more forgiving)
  ESCAPE_PER_PRESS: 15, // Each Space press adds 15% (was 12 - easier to escape)
  IMMUNITY_DURATION: 10, // 10 seconds of immunity after escaping
  CRAWL_SPEED: 1.5, // Slow movement speed while tased (about 20% of sprint)
  ESCAPE_KNOCKBACK: 8, // Knockback radius when escaping taser
  ESCAPE_FORCE: 15, // Force applied to nearby cops when escaping
} as const;

/**
 * Vehicle type enum
 */
export enum VehicleType {
  BICYCLE = "bicycle",
  MOTORBIKE = "motorbike",
  SEDAN = "sedan",
  TRUCK = "truck", // 18-wheeler that destroys buildings
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
  modelRotationY: number; // Radians to rotate model to face forward
  modelRotationX?: number;
  modelRotationZ?: number;
  modelOffsetY: number; // Y offset to sit on ground
  // Rider position (relative to vehicle position)
  riderOffsetY: number; // Y offset for seated player
  riderOffsetZ: number; // Z offset (forward/back on vehicle)
  hideRider: boolean; // Whether to hide rider (for enclosed vehicles like cars)
  // Kill mechanics
  killRadius: number;
  causesRagdoll: boolean; // Whether kills send bodies flying (heavy vehicles only)
  // Special abilities
  canCrushBuildings?: boolean; // Truck can drive through buildings
  // Sedan vs cop car chip damage
  copCarChipDamage?: number; // Damage dealt to cop cars on collision
  copCarChipRadius?: number; // Range for chip damage
  copCarChipCooldown?: number; // Cooldown between chip damage hits
}

/**
 * Vehicle configurations for each type
 */
export const VEHICLE_CONFIGS: Record<VehicleType, VehicleConfig> = {
  [VehicleType.BICYCLE]: {
    type: VehicleType.BICYCLE,
    name: "Bicycle",
    modelPath: "/assets/vehicles/bicycle.glb",
    speed: 14, // Noticeably faster than sprint (7)
    turnSpeed: 8, // Very agile
    maxHealth: 50, // Fragile
    colliderWidth: 0.3,
    colliderHeight: 0.5,
    colliderLength: 0.8,
    modelScale: 0.18, // 80% of 0.224
    modelRotationY: -Math.PI / 2, // Rotate 90 degrees left
    modelOffsetY: 0.05,
    riderOffsetY: 0.5,
    riderOffsetZ: -0.6, // Move back to sit on seat
    hideRider: false, // Show rider on bicycle
    killRadius: 1.5, // Small kill zone
    causesRagdoll: false, // Too light to send bodies flying
  },
  [VehicleType.MOTORBIKE]: {
    type: VehicleType.MOTORBIKE,
    name: "Motorbike",
    modelPath: "/assets/vehicles/motorbike.glb",
    speed: 18, // Fast!
    turnSpeed: 6, // Good handling
    maxHealth: 75,
    colliderWidth: 0.4,
    colliderHeight: 0.6,
    colliderLength: 1.2,
    modelScale: 1.0, // Model is already game-scale (~2m tall)
    modelRotationY: 0, // Model already faces correct direction
    modelRotationX: 0,
    modelOffsetY: -0.01, // Wheels at Y=0, slight adjustment to touch ground
    riderOffsetY: 1.0, // Height for motorbike seat (bike is ~2m tall)
    riderOffsetZ: 0, // Centered on seat
    hideRider: false, // Show rider on motorbike
    killRadius: 2.0,
    causesRagdoll: false, // Too light to send bodies flying
  },
  [VehicleType.SEDAN]: {
    type: VehicleType.SEDAN,
    name: "Monster Truck",
    modelPath: "/assets/vehicles/car.glb",
    speed: 15, // Current car speed
    turnSpeed: 5,
    maxHealth: 100,
    colliderWidth: 0.9,
    colliderHeight: 0.6,
    colliderLength: 1.7,
    modelScale: 0.012, // Monster truck needs heavy scaling
    modelRotationY: -Math.PI / 2, // Rotate to face forward
    modelOffsetY: 0.2,
    riderOffsetY: 0, // Not used - rider hidden
    riderOffsetZ: 0, // Not used - rider hidden
    hideRider: true, // Hide rider in enclosed vehicle
    killRadius: 3.5,
    causesRagdoll: true, // Heavy enough to send bodies flying!
    // Sedan vs cop car chip damage (sedan can fight back!)
    copCarChipDamage: 1, // Damage per collision
    copCarChipRadius: 4.0, // Collision range
    copCarChipCooldown: 1.0, // Seconds between chip damage
  },
  [VehicleType.TRUCK]: {
    type: VehicleType.TRUCK,
    name: "18-Wheeler",
    modelPath: "/assets/vehicles/truck.glb",
    speed: 24, // 2x faster - unstoppable!
    turnSpeed: 3.5, // Slightly faster turning
    maxHealth: 300, // Tank-level
    // Adjusted based on actual gameplay testing - need to match visual model
    // Pedestrians at dx=2.71 should be hit, so halfWidth needs to be > 2.71
    colliderWidth: 3.0,    // Half-width (side to side) - covers ~6 unit wide truck
    colliderHeight: 2.83,  // Height
    colliderLength: 9.40,  // Half-length (front to back) - covers ~18.8 unit long truck
    modelScale: 1.4,
    modelRotationY: 0,
    modelOffsetY: 0,
    riderOffsetY: 0,
    riderOffsetZ: 0,
    hideRider: true,
    killRadius: 5.0, // Not used for truck (uses box collision)
    causesRagdoll: true,
    canCrushBuildings: true,
  },
};

/**
 * Map tiers to vehicle types (FOOT tier has no vehicle)
 */
export const TIER_VEHICLE_MAP: Partial<Record<Tier, VehicleType>> = {
  [Tier.BIKE]: VehicleType.BICYCLE,
  [Tier.MOTO]: VehicleType.MOTORBIKE,
  [Tier.SEDAN]: VehicleType.SEDAN,
  [Tier.TRUCK]: VehicleType.TRUCK,
};

/**
 * Cop bike configuration (reuses player motorbike model with police colors)
 */
export const COP_BIKE_CONFIG = {
  modelPath: '/assets/vehicles/motorbike.glb',
  modelScale: 1.0, // Model is already game-scale
  modelRotationY: 0, // Model already faces correct direction
  modelOffsetY: -0.01, // Wheels at ground level
  colliderWidth: 0.35,
  colliderHeight: 0.5,
  colliderLength: 1.0,
} as const;

/**
 * Motorbike cop AI and combat configuration
 */
export const MOTORBIKE_COP_CONFIG = {
  // AI behavior thresholds
  PATROL_DISTANCE: 100,
  CHASE_DISTANCE: 20,
  RAM_DISTANCE: 8,

  // Movement
  MAX_FORCE: 25.0,
  ACCELERATION: 20,
  DECELERATION: 30,

  // Combat
  HIT_STUN_DURATION: 0.8,
  RAM_HIT_DISTANCE: 2.5,
  RAM_COOLDOWN: 2.0,
  TASER_COOLDOWN: 3.0,
  SHOOT_COOLDOWN: 1.5,
  TASER_DAMAGE: 0,
  SHOOT_DAMAGE: 15,
  TASER_RANGE: 8.0,
  SHOOT_RANGE: 12.0, // Reduced from 15 - less snipe feeling, more fair engagement range

  // Variant-specific stats
  VARIANTS: {
    SCOUT: {
      health: 2,
      speed: 12,
      ramDamage: 15,
      pointValue: 40,
    },
    SWARM: {
      health: 2,
      speed: 14,
      ramDamage: 20,
      pointValue: 50,
    },
    BOSS: {
      health: 5,
      speed: 16,
      ramDamage: 35,
      pointValue: 150,
    },
  },

  // Heat thresholds for spawning (staggered to avoid 50% cliff)
  HEAT_THRESHOLDS: {
    SCOUT: 25,
    SWARM_INITIAL: 45, // 2 swarm bikes start appearing
    SWARM_FULL: 55, // Full 6-bike swarm unlocks
    BOSS: 75,
  },

  // Spawn limits
  MAX_SCOUTS: 2,
  MAX_SWARM: 6,
  MAX_BOSSES: 1,
  MAX_TOTAL: 8,

  // Spawn parameters
  SPAWN_BEHIND_DISTANCE: 40,
  SPAWN_FLANK_OFFSET: 20,
  SPAWN_AHEAD_DISTANCE: 25,
} as const;

/**
 * Cop car configuration (uses player's car model with police colors)
 * TODO: Find proper police car model to replace car.glb
 */
export const COP_CAR_CONFIG = {
  modelPath: '/assets/vehicles/police_muscle.glb',
  modelScale: 1.0,
  modelRotationY: Math.PI,
  modelOffsetY: 0,
  colliderWidth: 0.8,
  colliderHeight: 0.5,
  colliderLength: 1.5,

  // AI behavior
  CHASE_DISTANCE: 30,
  RAM_DISTANCE: 5,

  // Movement
  MAX_SPEED: 20, // Fast but not as fast as truck (24)
  ACCELERATION: 25,
  DECELERATION: 35,
  MAX_FORCE: 30.0,

  // Combat
  HEALTH: 3,
  RAM_DAMAGE: 25, // Heavy ram damage
  RAM_COOLDOWN: 2.0,
  HIT_STUN_DURATION: 1.0,
  POINT_VALUE: 100,

  // Spawning (only when player is in sedan or truck) - staggered to avoid 50% cliff
  MAX_CARS_INITIAL: 1, // 50-54% heat: only 1 cop car
  MAX_CARS: 3, // 55%+ heat: full 3 cop cars
  SPAWN_HEAT_THRESHOLD: 50, // Cop cars start appearing
  SPAWN_HEAT_THRESHOLD_FULL: 55, // Full cop car complement unlocks
  SPAWN_BEHIND_DISTANCE: 50,
  SPAWN_COOLDOWN: 5.0,
} as const;

// ============================================================================
// Gameplay Tuning Constants (Phase 2.5 - Code Quality)
// Centralized magic numbers for easy balance tweaking
// ============================================================================

/**
 * Camera configuration
 */
export const CAMERA_CONFIG = {
  FRUSTUM_SIZE: 15, // Orthographic camera frustum (controls zoom level)
  POSITION_X: 10, // Camera X offset from player
  POSITION_Y: 25, // Camera Y offset (height)
  POSITION_Z: 10, // Camera Z offset from player
  SHAKE_DECAY: 5, // How fast camera shake diminishes
} as const;

/**
 * Combat attack configurations per weapon type
 */
export const PLAYER_ATTACK_CONFIG = {
  KNIFE: {
    pedRadius: 2.5, // Radius for hitting pedestrians
    copRadius: 4.5, // Larger radius for cops (easier to hit)
    damage: 1,
    coneAngle: Math.PI, // 180 degrees - half circle in front
    comboThreshold: 10, // Combo level for unlimited kills
    panicRadius: 10, // Radius to panic nearby pedestrians
    particleCount: 30,
    decalCount: 20,
    cameraShakeMultiplier: 0.5,
  },
  BICYCLE: {
    attackRadius: 3.0,
    damage: 1,
    coneAngle: Math.PI * 1.5, // 270 degrees - wider arc
    comboThreshold: 10,
    maxKills: 2, // Can hit 2 at once
    panicRadius: 12,
    particleCount: 30,
    decalCount: 20,
    cameraShakeMultiplier: 0.5,
  },
  MOTORBIKE: {
    attackRadius: 10.0, // Drive-by shooting range
    damage: 1,
    coneAngle: Math.PI / 3, // 60 degrees - narrow forward cone
    maxKills: 1, // One shot at a time
    panicRadius: 15,
    particleCount: 40,
    decalCount: 30,
    cameraShakeHit: 0.8,
    cameraShakeMiss: 0.3,
    // Blast attack (360° knockback around player)
    blastRadius: 6.0, // Knockback radius
    blastForce: 12, // Force applied to entities
    blastDamage: 1, // Damage to entities in blast
    blastMaxKills: 5, // Max kills per blast
  },
  VEHICLE_HIT: {
    particleCount: 40,
    panicRadius: 15,
    cameraShake: 0.3,
  },
} as const;

/**
 * Score and combo system
 */
export const SCORING_CONFIG = {
  // Base points per kill type
  PEDESTRIAN_BASE: 10,
  PEDESTRIAN_BICYCLE: 12,
  PEDESTRIAN_MOTORBIKE: 15,
  PEDESTRIAN_ROADKILL: 15,
  COP_BASE: 50,
  COP_MOTORBIKE: 75,

  // Multipliers
  PURSUIT_MULTIPLIER: 2, // Points doubled during pursuit
  PANIC_MULTIPLIER: 2, // Points doubled for panicking pedestrians (stacks with pursuit)

  // Combo system
  COMBO_DURATION: 5.0, // Seconds before combo expires
  COMBO_THRESHOLD_UNLIMITED: 10, // Combo level for unlimited kills
  COMBO_MULTIPLIER_MAX: 2.5, // Max combo multiplier (x1.0 → x3.5 at 50 combo, half visual rate)
  COMBO_MULTIPLIER_SCALE: 50, // Combo count at which max multiplier is reached
  COP_KILL_COMBO_BONUS: 2.0, // Extra seconds added to combo timer on cop kill

  // Heat system
  HEAT_MAX: 100,
  HEAT_PER_PED_KILL: 10,
  HEAT_PER_COP_KILL: 25,
  HEAT_PER_MOTORBIKE_COP_KILL: 30,
  HEAT_PER_MOTORBIKE_PED_KILL: 15,
  HEAT_DEBUG_BOOST: 25,
  HEAT_FLOOR_THRESHOLD: 50, // Once heat hits this, floor kicks in
  HEAT_FLOOR_MIN: 25, // Heat can't drop below this after hitting threshold
} as const;

/**
 * Vehicle interaction distances
 */
export const VEHICLE_INTERACTION = {
  ENTER_DISTANCE: 15.0, // How close player must be to enter vehicle
  EXIT_SPAWN_DISTANCE: 2.0, // How far player spawns from vehicle on exit
} as const;

/**
 * Wanted stars thresholds (based on cop kills)
 */
export const WANTED_STARS = {
  STAR_1: 1, // 1+ cop kills = 1 star
  STAR_2: 3, // 3+ cop kills = 2 stars
} as const;

/**
 * Rendering configuration
 */
export const RENDERING_CONFIG = {
  GROUND_SIZE: 1000,
  SHADOW_MAP_SIZE: 2048,
  SHADOW_CAMERA_SIZE: 50,
  SHADOW_CAMERA_NEAR: 0.5,
  SHADOW_CAMERA_FAR: 200,
} as const;

// ============================================================================
// Physics Collision Groups (Phase 2.5 - Code Quality)
// Centralized bit flags for Rapier collision filtering
// ============================================================================

/**
 * Collision group bit flags for Rapier physics
 * Usage: colliderDesc.setCollisionGroups((membershipMask << 16) | filterMask)
 * - Membership (high 16 bits): What group this collider belongs to
 * - Filter (low 16 bits): What groups this collider can collide with
 */
export const COLLISION_GROUPS = {
  GROUND: 0x0001,
  PLAYER: 0x0002,
  PEDESTRIAN: 0x0004,
  COP: 0x0008,
  DEBRIS: 0x0010,
  PROJECTILE: 0x0020,
  BUILDING: 0x0040,
  VEHICLE: 0x0080,
  COP_BIKE: 0x0100, // Motorbike cops
} as const;

/**
 * Helper to create Rapier collision group value
 * @param membership - What group this collider belongs to (COLLISION_GROUPS value)
 * @param filter - What groups this collider can collide with (OR'd COLLISION_GROUPS values)
 * @returns Combined 32-bit collision group value for setCollisionGroups()
 */
export function makeCollisionGroups(membership: number, filter: number): number {
  return (filter << 16) | membership;
}
