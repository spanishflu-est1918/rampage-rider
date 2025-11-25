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
}

export interface TierConfig {
  name: string;
  minKills: number;
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
    rendering: number;
    avgFrameTime: number;
    avgPhysics: number;
    avgEntities: number;
    avgRendering: number;
    counts: {
      cops: number;
      pedestrians: number;
      particles: number;
      bloodDecals: number;
      buildings: number;
    };
    worstFrame: {
      frameTime: number;
      physics: number;
      entities: number;
      rendering: number;
      bottleneck: 'physics' | 'entities' | 'rendering' | 'none';
      counts: {
        cops: number;
        pedestrians: number;
        particles: number;
        bloodDecals: number;
        buildings: number;
      };
    };
  };
}

export interface HighScore {
  score: number;
  date: string;
  tierReached: string;
}