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