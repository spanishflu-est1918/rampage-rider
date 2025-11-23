export enum GameState {
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
  action: boolean; // Space or Attack
  mount: boolean; // E key
}

export interface GameStats {
  kills: number;
  score: number;
  tier: Tier;
  health: number;
  combo: number;
  comboTimer: number;
  gameTime: number;
  killHistory: { time: number; kills: number }[];
}

export interface HighScore {
  score: number;
  date: string;
  tierReached: string;
}