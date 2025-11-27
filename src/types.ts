export enum GameState {
  LOADING = 'LOADING',
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
  PAUSED = 'PAUSED',
}

export enum EntityType {
  PLAYER = 'PLAYER',
  PEDESTRIAN = 'PEDESTRIAN',
  COP = 'COP',
  DEBRIS = 'DEBRIS',
  PROJECTILE = 'PROJECTILE',
}

export enum Tier {
  FOOT = 1,
  BIKE = 2,
  MOTO = 3,
  SEDAN = 4,
  TRUCK = 5, // 18-wheeler - destroys buildings!
}

export interface TierConfig {
  name: string;
  minScore: number; // Score threshold to unlock this tier
  speedMultiplier: number;
  maxHealth: number;
  color: number;
  scale: number;
  description: string;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  action: boolean; // Space - Jump
  mount: boolean; // Shift - Walk (slows down from default sprint)
  attack?: boolean; // F - Attack
}

export interface KillNotification {
  message: string;
  isPursuit: boolean;
  points: number;
}

export interface GameStats {
  kills: number;
  copKills: number; // Track cop kills separately for wanted stars
  score: number;
  tier: Tier;
  health: number;
  combo: number;
  comboTimer: number;
  gameTime: number;
  heat: number; // Controls cop spawning rate
  wantedStars: number; // Controls cop attack type (0=punch, 1=taser, 2+=shoot)
  inPursuit: boolean; // Cops are actively chasing
  killHistory: { time: number; kills: number }[];
  copHealthBars: Array<{ x: number; y: number; health: number; maxHealth: number }>; // Screen-space positions for cop health bars
  isTased: boolean; // Player is being tased
  taseEscapeProgress: number; // 0-100, escape progress
  vehicleHealth?: number; // Car health when in vehicle
  vehicleMaxHealth?: number; // Car max health
  isInVehicle?: boolean; // True when player is in a car
  isNearCar?: boolean; // True when player is near car (can enter)
  performance?: {
    fps: number;
    frameTime: number;
    physics: number;
    entities: number;
    player: number;
    cops: number;
    pedestrians: number;
    world: number;
    particles: number;
    bloodDecals: number;
    rendering: number;
    avgFrameTime: number;
    avgPhysics: number;
    avgEntities: number;
    avgPlayer: number;
    avgCops: number;
    avgPedestrians: number;
    avgWorld: number;
    avgParticles: number;
    avgBloodDecals: number;
    avgRendering: number;
    avgDrawCalls: number;
    counts: {
      cops: number;
      pedestrians: number;
      particles: number;
      bloodDecals: number;
      buildings: number;
    };
    // Three.js renderer stats
    renderer: {
      drawCalls: number;
      triangles: number;
      points: number;
      lines: number;
      geometries: number;
      textures: number;
    };
    worstFrame: {
      frameTime: number;
      physics: number;
      entities: number;
      player: number;
      cops: number;
      pedestrians: number;
      world: number;
      particles: number;
      bloodDecals: number;
      rendering: number;
      bottleneck: 'physics' | 'entities' | 'rendering' | 'none' | 'player' | 'cops' | 'pedestrians' | 'world' | 'particles' | 'bloodDecals';
      counts: {
        cops: number;
        pedestrians: number;
        particles: number;
        bloodDecals: number;
        buildings: number;
      };
      renderer: {
        drawCalls: number;
        triangles: number;
      };
    };
  };
}

export interface HighScore {
  score: number;
  date: string;
  tierReached: string;
}