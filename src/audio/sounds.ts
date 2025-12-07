/**
 * Sound Registry - All audio IDs and configurations for Rampage Rider
 *
 * This file defines:
 * - All sound IDs used throughout the game
 * - Default configurations (volume, pitch variation, pooling)
 * - Sound categories for routing to correct gain nodes
 *
 * Actual audio files will be loaded at runtime from /public/audio/
 */

export type SoundCategory = 'sfx' | 'music' | 'ui' | 'ambient';

export interface SoundConfig {
  volume: number; // Base volume (0-1)
  pitch: number; // Base pitch (playback rate)
  pitchVariation?: number; // Random pitch variation (+/-)
  pooled?: boolean; // Use sound pool for frequent plays
  category: SoundCategory;
}

// ============================================
// SOUND IDS - All sounds in the game
// ============================================

export enum SoundId {
  // ========== PLAYER MOVEMENT ==========
  PLAYER_SPAWN = 'player_spawn',
  PLAYER_RUN_LOOP = 'player_run_loop',
  FOOTSTEP_RUN = 'footstep_run',
  FOOTSTEP_WALK = 'footstep_walk',
  JUMP = 'jump',
  LAND = 'land',
  LAND_HARD = 'land_hard',

  // ========== PLAYER ATTACKS ==========
  KNIFE_WHOOSH = 'knife_whoosh',
  KNIFE_HIT = 'knife_hit',
  KNIFE_HIT_COP = 'knife_hit_cop',
  // Knife stab variations (for cop kills with variety)
  KNIFE_STAB_1 = 'knife_stab_1',
  KNIFE_STAB_2 = 'knife_stab_2',
  KNIFE_STAB_3 = 'knife_stab_3',
  KNIFE_STAB_4 = 'knife_stab_4',
  KNIFE_STAB_5 = 'knife_stab_5',
  KNIFE_STAB_6 = 'knife_stab_6',
  KNIFE_STAB_7 = 'knife_stab_7',
  KNIFE_STAB_8 = 'knife_stab_8',
  PUNCH_WHOOSH = 'punch_whoosh',
  PUNCH_HIT = 'punch_hit',

  // ========== BICYCLE ==========
  BICYCLE_PEDAL = 'bicycle_pedal', // Loop
  BICYCLE_BELL = 'bicycle_bell',
  BICYCLE_SLASH = 'bicycle_slash',
  BICYCLE_HIT = 'bicycle_hit',

  // ========== MOTORBIKE ==========
  MOTORBIKE_ENGINE = 'motorbike_engine', // Loop
  MOTORBIKE_REV = 'motorbike_rev',
  MOTORBIKE_SHOOT = 'motorbike_shoot',
  MOTORBIKE_BLAST = 'motorbike_blast',

  // ========== SEDAN ==========
  SEDAN_ENGINE = 'sedan_engine', // Loop
  SEDAN_HORN = 'sedan_horn',
  SEDAN_SKID = 'sedan_skid',
  SEDAN_IMPACT = 'sedan_impact',

  // ========== TRUCK ==========
  TRUCK_ENGINE = 'truck_engine', // Loop
  TRUCK_HORN = 'truck_horn',
  TRUCK_IMPACT = 'truck_impact',
  BUILDING_DESTROY = 'building_destroy',

  // ========== VEHICLE GENERAL ==========
  VEHICLE_ENTER = 'vehicle_enter',
  VEHICLE_EXIT = 'vehicle_exit',
  VEHICLE_DAMAGE = 'vehicle_damage',
  VEHICLE_DESTROY = 'vehicle_destroy',
  TIER_UNLOCK = 'tier_unlock',
  TIER_UNLOCK_FANFARE = 'tier_unlock_fanfare',

  // ========== KILLS & IMPACTS ==========
  KILL_SPLAT = 'kill_splat',
  KILL_CRUNCH = 'kill_crunch',
  KILL_SQUISH = 'kill_squish',
  ROADKILL = 'roadkill',
  MULTI_KILL = 'multi_kill',
  BODY_THUD = 'body_thud',
  BLOOD_SPLATTER = 'blood_splatter',

  // ========== COP ENEMIES ==========
  COP_SPAWN = 'cop_spawn',
  COP_FREEZE = 'cop_freeze', // "Freeze!" voice line on spawn (legacy)
  COP_FREEZE_MALE = 'cop_freeze_male',
  COP_FREEZE_FEMALE = 'cop_freeze_female',
  COP_ALERT = 'cop_alert',
  COP_PUNCH = 'cop_punch',
  COP_PUNCH_1 = 'cop_punch_1',
  COP_PUNCH_2 = 'cop_punch_2',
  COP_PUNCH_3 = 'cop_punch_3',
  COP_PUNCH_4 = 'cop_punch_4',
  COP_PUNCH_5 = 'cop_punch_5',
  COP_DEATH = 'cop_death',
  TASER_FIRE = 'taser_fire',
  TASER_HIT = 'taser_hit',
  TASER_LOOP = 'taser_loop', // Loop while being tased
  TASER_ESCAPE = 'taser_escape',
  GUNSHOT = 'gunshot',
  BULLET_WHIZ = 'bullet_whiz',

  // ========== COP VEHICLES ==========
  SIREN_LOOP = 'siren_loop', // Loop
  SIREN_WAIL = 'siren_wail', // Short burst
  COP_CAR_ENGINE = 'cop_car_engine', // Loop
  COP_CAR_RAM = 'cop_car_ram',
  COP_CAR_DESTROY = 'cop_car_destroy',
  MOTORBIKE_COP_ENGINE = 'motorbike_cop_engine', // Loop
  MOTORBIKE_COP_RAM = 'motorbike_cop_ram',
  BIKE_COP_PEDAL = 'bike_cop_pedal', // Loop

  // ========== PEDESTRIANS ==========
  PEDESTRIAN_SCREAM = 'pedestrian_scream',
  PEDESTRIAN_PANIC = 'pedestrian_panic',
  CROWD_AMBIENT = 'crowd_ambient', // Loop
  // Scream variations (for pedestrians and cops)
  SCREAM_1 = 'scream_1',
  SCREAM_2 = 'scream_2',
  SCREAM_3 = 'scream_3',
  SCREAM_4 = 'scream_4',
  SCREAM_5 = 'scream_5',
  SCREAM_6 = 'scream_6',
  SCREAM_7 = 'scream_7',
  SCREAM_8 = 'scream_8',
  SCREAM_9 = 'scream_9',
  SCREAM_10 = 'scream_10',
  SCREAM_11 = 'scream_11',
  SCREAM_12 = 'scream_12',
  SCREAM_13 = 'scream_13',
  SCREAM_14 = 'scream_14',
  SCREAM_15 = 'scream_15',
  SCREAM_16 = 'scream_16',
  SCREAM_17 = 'scream_17',
  SCREAM_18 = 'scream_18',
  SCREAM_19 = 'scream_19',
  SCREAM_20 = 'scream_20',

  // ========== COMBO & SCORING ==========
  COMBO_INCREMENT = 'combo_increment',
  COMBO_MILESTONE_5 = 'combo_milestone_5', // Killing Spree
  COMBO_MILESTONE_10 = 'combo_milestone_10', // Rampage
  COMBO_MILESTONE_15 = 'combo_milestone_15', // Unstoppable
  COMBO_MILESTONE_20 = 'combo_milestone_20', // Godlike
  COMBO_MILESTONE_30 = 'combo_milestone_30', // Massacre
  COMBO_MILESTONE_50 = 'combo_milestone_50', // Legendary
  COMBO_LOST = 'combo_lost',
  SCORE_TICK = 'score_tick',
  POINTS_POPUP = 'points_popup',

  // ========== RAMPAGE MODE ==========
  RAMPAGE_ENTER = 'rampage_enter',
  RAMPAGE_LOOP = 'rampage_loop', // Ambient rampage sound
  RAMPAGE_EXIT = 'rampage_exit',
  RAMPAGE_HEARTBEAT = 'rampage_heartbeat', // Loop
  ANCESTOR_WHISPER = 'ancestor_whisper',

  // ========== HEAT & WANTED ==========
  HEAT_INCREASE = 'heat_increase',
  WANTED_STAR_UP = 'wanted_star_up',
  WANTED_STAR_DOWN = 'wanted_star_down',
  PURSUIT_START = 'pursuit_start',
  PURSUIT_END = 'pursuit_end',

  // ========== DAMAGE & DEATH ==========
  PLAYER_HIT = 'player_hit',
  PLAYER_HURT = 'player_hurt',
  PLAYER_DEATH = 'player_death',
  GAME_OVER = 'game_over',

  // ========== UI ==========
  UI_CLICK = 'ui_click',
  UI_HOVER = 'ui_hover',
  UI_CONFIRM = 'ui_confirm',
  UI_CANCEL = 'ui_cancel',
  UI_NOTIFICATION = 'ui_notification',
  UI_ALERT = 'ui_alert',
  MENU_OPEN = 'menu_open',
  MENU_CLOSE = 'menu_close',
  GAME_START = 'game_start', // Epic game start sound effect

  // ========== MUSIC ==========
  MUSIC_MENU = 'music_menu', // Fireside (loading screen)
  MUSIC_MENU_2 = 'music_menu_2', // December Evening (loading screen)
  MUSIC_GAMEPLAY = 'music_gameplay', // Christmas dubstep
  MUSIC_GAMEPLAY_2 = 'music_gameplay_2', // Outrun Christmas Mayhem
  MUSIC_GAMEPLAY_3 = 'music_gameplay_3', // Outrun Christmas Mayhem 2
  MUSIC_GAMEPLAY_4 = 'music_gameplay_4', // Berghain Christmas Mayhem
  MUSIC_GAMEPLAY_5 = 'music_gameplay_5', // Berghain Christmas Mayhem 2
  MUSIC_GAMEPLAY_6 = 'music_gameplay_6', // HU God Is Great
  MUSIC_GAMEPLAY_7 = 'music_gameplay_7', // HU Bunker Edit
  MUSIC_RAMPAGE = 'music_rampage',
  MUSIC_GAME_OVER = 'music_game_over',
  MUSIC_ENDING_1 = 'music_ending_1', // Snow on the Windowsill
  MUSIC_ENDING_2 = 'music_ending_2', // Postcard from 1954

  // ========== AMBIENT ==========
  AMBIENT_CITY = 'ambient_city',
  WIND_LOOP = 'wind_loop',
  CHRISTMAS_MARKET = 'christmas_market',
  TABLE_CROWD = 'table_crowd', // Positional crowd near tables
  DEATH_AMBIENT = 'death_ambient', // Dark purgatory loop for game over

  // ========== VOICE ANNOUNCER ==========
  VOICE_SPLAT = 'voice_splat',
  VOICE_CRUSHED = 'voice_crushed',
  VOICE_DEMOLISHED = 'voice_demolished',
  VOICE_OBLITERATED = 'voice_obliterated',
  VOICE_TERMINATED = 'voice_terminated',
  VOICE_COWARD = 'voice_coward',
  VOICE_NO_ESCAPE = 'voice_no_escape',
  VOICE_RUN_FASTER = 'voice_run_faster',
  VOICE_BACKSTAB = 'voice_backstab',
  VOICE_EASY_PREY = 'voice_easy_prey',
  VOICE_ROADKILL = 'voice_roadkill',
  VOICE_PANCAKED = 'voice_pancaked',
  VOICE_FLATTENED = 'voice_flattened',
  VOICE_SPLATTER = 'voice_splatter',
  VOICE_SPEED_BUMP = 'voice_speed_bump',
  VOICE_BADGE_DOWN = 'voice_badge_down',
  VOICE_OFFICER_DOWN = 'voice_officer_down',
  VOICE_COP_DROPPED = 'voice_cop_dropped',
  VOICE_BLUE_DOWN = 'voice_blue_down',
  VOICE_KILLING_SPREE = 'voice_killing_spree',
  VOICE_RAMPAGE = 'voice_rampage',
  VOICE_UNSTOPPABLE = 'voice_unstoppable',
  VOICE_GODLIKE = 'voice_godlike',
  VOICE_MASSACRE = 'voice_massacre',
  VOICE_LEGENDARY = 'voice_legendary',
  VOICE_HEAT_KILL = 'voice_heat_kill',
  VOICE_WANTED_BONUS = 'voice_wanted_bonus',
  VOICE_PURSUIT_FRENZY = 'voice_pursuit_frenzy',
  VOICE_HOT_STREAK = 'voice_hot_streak',
  VOICE_BLAST_KILL = 'voice_blast_kill',
  VOICE_COP_KILLER = 'voice_cop_killer',
  VOICE_BIKER_DOWN = 'voice_biker_down',
  VOICE_WRECKED = 'voice_wrecked',
  VOICE_LEVELED = 'voice_leveled',
  VOICE_RAMPAGE_MODE = 'voice_rampage_mode',
}

// ============================================
// SOUND CONFIGURATIONS
// ============================================

export const SOUND_CONFIG: Record<SoundId, SoundConfig> = {
  // ========== PLAYER MOVEMENT ==========
  [SoundId.PLAYER_SPAWN]: {
    volume: 0.7,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.PLAYER_RUN_LOOP]: {
    volume: 0.175,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.FOOTSTEP_RUN]: {
    volume: 0.4,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.FOOTSTEP_WALK]: {
    volume: 0.3,
    pitch: 0.9,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.JUMP]: {
    volume: 0.5,
    pitch: 1.0,
    pitchVariation: 0.05,
    category: 'sfx',
  },
  [SoundId.LAND]: {
    volume: 0.4,
    pitch: 1.0,
    pitchVariation: 0.1,
    category: 'sfx',
  },
  [SoundId.LAND_HARD]: {
    volume: 0.6,
    pitch: 0.8,
    category: 'sfx',
  },

  // ========== PLAYER ATTACKS ==========
  [SoundId.KNIFE_WHOOSH]: {
    volume: 0.5,
    pitch: 1.0,
    pitchVariation: 0.15,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.KNIFE_HIT]: {
    volume: 0.7,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.KNIFE_HIT_COP]: {
    volume: 0.8,
    pitch: 0.9,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },
  // Knife stab variations
  [SoundId.KNIFE_STAB_1]: { volume: 0.75, pitch: 1.0, pitchVariation: 0.1, pooled: true, category: 'sfx' },
  [SoundId.KNIFE_STAB_2]: { volume: 0.75, pitch: 1.0, pitchVariation: 0.1, pooled: true, category: 'sfx' },
  [SoundId.KNIFE_STAB_3]: { volume: 0.75, pitch: 1.0, pitchVariation: 0.1, pooled: true, category: 'sfx' },
  [SoundId.KNIFE_STAB_4]: { volume: 0.75, pitch: 1.0, pitchVariation: 0.1, pooled: true, category: 'sfx' },
  [SoundId.KNIFE_STAB_5]: { volume: 0.75, pitch: 1.0, pitchVariation: 0.1, pooled: true, category: 'sfx' },
  [SoundId.KNIFE_STAB_6]: { volume: 0.75, pitch: 1.0, pitchVariation: 0.1, pooled: true, category: 'sfx' },
  [SoundId.KNIFE_STAB_7]: { volume: 0.75, pitch: 1.0, pitchVariation: 0.1, pooled: true, category: 'sfx' },
  [SoundId.KNIFE_STAB_8]: { volume: 0.75, pitch: 1.0, pitchVariation: 0.1, pooled: true, category: 'sfx' },
  [SoundId.PUNCH_WHOOSH]: {
    volume: 0.4,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.PUNCH_HIT]: {
    volume: 0.6,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },

  // ========== BICYCLE ==========
  [SoundId.BICYCLE_PEDAL]: {
    volume: 0.3,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.BICYCLE_BELL]: {
    volume: 0.6,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.BICYCLE_SLASH]: {
    volume: 0.6,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.BICYCLE_HIT]: {
    volume: 0.7,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },

  // ========== MOTORBIKE ==========
  [SoundId.MOTORBIKE_ENGINE]: {
    volume: 0.5,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.MOTORBIKE_REV]: {
    volume: 0.6,
    pitch: 1.0,
    pitchVariation: 0.1,
    category: 'sfx',
  },
  [SoundId.MOTORBIKE_SHOOT]: {
    volume: 0.7,
    pitch: 1.0,
    pitchVariation: 0.15,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.MOTORBIKE_BLAST]: {
    volume: 1.0,
    pitch: 1.0,
    category: 'sfx',
  },

  // ========== SEDAN ==========
  [SoundId.SEDAN_ENGINE]: {
    volume: 0.4,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.SEDAN_HORN]: {
    volume: 0.7,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.SEDAN_SKID]: {
    volume: 0.5,
    pitch: 1.0,
    pitchVariation: 0.1,
    category: 'sfx',
  },
  [SoundId.SEDAN_IMPACT]: {
    volume: 0.8,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },

  // ========== TRUCK ==========
  [SoundId.TRUCK_ENGINE]: {
    volume: 0.5,
    pitch: 0.8,
    category: 'sfx',
  },
  [SoundId.TRUCK_HORN]: {
    volume: 0.9,
    pitch: 0.7,
    category: 'sfx',
  },
  [SoundId.TRUCK_IMPACT]: {
    volume: 1.0,
    pitch: 0.8,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.BUILDING_DESTROY]: {
    volume: 1.0,
    pitch: 0.7,
    pitchVariation: 0.1,
    category: 'sfx',
  },

  // ========== VEHICLE GENERAL ==========
  [SoundId.VEHICLE_ENTER]: {
    volume: 0.6,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.VEHICLE_EXIT]: {
    volume: 0.5,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.VEHICLE_DAMAGE]: {
    volume: 0.7,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.VEHICLE_DESTROY]: {
    volume: 1.0,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.TIER_UNLOCK]: {
    volume: 0.5,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.TIER_UNLOCK_FANFARE]: {
    volume: 0.55,
    pitch: 1.0,
    category: 'sfx',
  },

  // ========== KILLS & IMPACTS ==========
  [SoundId.KILL_SPLAT]: {
    volume: 0.7,
    pitch: 1.0,
    pitchVariation: 0.2,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.KILL_CRUNCH]: {
    volume: 0.7,
    pitch: 1.0,
    pitchVariation: 0.15,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.KILL_SQUISH]: {
    volume: 0.6,
    pitch: 1.0,
    pitchVariation: 0.2,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.ROADKILL]: {
    volume: 0.8,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.MULTI_KILL]: {
    volume: 0.9,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.BODY_THUD]: {
    volume: 0.5,
    pitch: 1.0,
    pitchVariation: 0.2,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.BLOOD_SPLATTER]: {
    volume: 0.4,
    pitch: 1.0,
    pitchVariation: 0.2,
    pooled: true,
    category: 'sfx',
  },

  // ========== COP ENEMIES ==========
  [SoundId.COP_SPAWN]: {
    volume: 0.5,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.COP_FREEZE]: {
    volume: 0.8,
    pitch: 1.0,
    pitchVariation: 0.1,
    category: 'sfx',
  },
  [SoundId.COP_FREEZE_MALE]: {
    volume: 0.8,
    pitch: 1.0,
    pitchVariation: 0.1,
    category: 'sfx',
  },
  [SoundId.COP_FREEZE_FEMALE]: {
    volume: 0.8,
    pitch: 1.0,
    pitchVariation: 0.1,
    category: 'sfx',
  },
  [SoundId.COP_ALERT]: {
    volume: 0.6,
    pitch: 1.0,
    pitchVariation: 0.1,
    category: 'sfx',
  },
  [SoundId.COP_PUNCH]: {
    volume: 0.6,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.COP_PUNCH_1]: {
    volume: 0.6,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.COP_PUNCH_2]: {
    volume: 0.6,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.COP_PUNCH_3]: {
    volume: 0.6,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.COP_PUNCH_4]: {
    volume: 0.6,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.COP_PUNCH_5]: {
    volume: 0.6,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.COP_DEATH]: {
    volume: 0.7,
    pitch: 1.0,
    pitchVariation: 0.15,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.TASER_FIRE]: {
    volume: 0.7,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.TASER_HIT]: {
    volume: 0.8,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.TASER_LOOP]: {
    volume: 0.5,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.TASER_ESCAPE]: {
    volume: 0.9,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.GUNSHOT]: {
    volume: 0.8,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.BULLET_WHIZ]: {
    volume: 0.4,
    pitch: 1.0,
    pitchVariation: 0.2,
    pooled: true,
    category: 'sfx',
  },

  // ========== COP VEHICLES ==========
  [SoundId.SIREN_LOOP]: {
    volume: 0.6,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.SIREN_WAIL]: {
    volume: 0.7,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.COP_CAR_ENGINE]: {
    volume: 0.4,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.COP_CAR_RAM]: {
    volume: 0.8,
    pitch: 1.0,
    pitchVariation: 0.1,
    category: 'sfx',
  },
  [SoundId.COP_CAR_DESTROY]: {
    volume: 0.9,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.MOTORBIKE_COP_ENGINE]: {
    volume: 0.5,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.MOTORBIKE_COP_RAM]: {
    volume: 0.7,
    pitch: 1.0,
    pitchVariation: 0.1,
    category: 'sfx',
  },
  [SoundId.BIKE_COP_PEDAL]: {
    volume: 0.3,
    pitch: 1.0,
    category: 'sfx',
  },

  // ========== PEDESTRIANS ==========
  [SoundId.PEDESTRIAN_SCREAM]: {
    volume: 0.5,
    pitch: 1.0,
    pitchVariation: 0.3,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.PEDESTRIAN_PANIC]: {
    volume: 0.4,
    pitch: 1.0,
    pitchVariation: 0.2,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.CROWD_AMBIENT]: {
    volume: 0.1,
    pitch: 1.0,
    category: 'ambient',
  },
  // Scream variations (for pedestrians and cops)
  [SoundId.SCREAM_1]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_2]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_3]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_4]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_5]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_6]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_7]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_8]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_9]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_10]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_11]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_12]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_13]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_14]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_15]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_16]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_17]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_18]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_19]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },
  [SoundId.SCREAM_20]: { volume: 0.55, pitch: 1.0, pitchVariation: 0.15, pooled: true, category: 'sfx' },

  // ========== COMBO & SCORING ==========
  [SoundId.COMBO_INCREMENT]: {
    volume: 0.4,
    pitch: 1.0,
    pitchVariation: 0.05,
    pooled: true,
    category: 'ui',
  },
  [SoundId.COMBO_MILESTONE_5]: {
    volume: 0.5,
    pitch: 1.0,
    category: 'ui',
  },
  [SoundId.COMBO_MILESTONE_10]: {
    volume: 0.55,
    pitch: 1.0,
    category: 'ui',
  },
  [SoundId.COMBO_MILESTONE_15]: {
    volume: 0.55,
    pitch: 1.0,
    category: 'ui',
  },
  [SoundId.COMBO_MILESTONE_20]: {
    volume: 0.6,
    pitch: 1.0,
    category: 'ui',
  },
  [SoundId.COMBO_MILESTONE_30]: {
    volume: 0.6,
    pitch: 1.0,
    category: 'ui',
  },
  [SoundId.COMBO_MILESTONE_50]: {
    volume: 0.65,
    pitch: 1.0,
    category: 'ui',
  },
  [SoundId.COMBO_LOST]: {
    volume: 0.6,
    pitch: 0.8,
    category: 'ui',
  },
  [SoundId.SCORE_TICK]: {
    volume: 0.2,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'ui',
  },
  [SoundId.POINTS_POPUP]: {
    volume: 0.3,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'ui',
  },

  // ========== RAMPAGE MODE ==========
  [SoundId.RAMPAGE_ENTER]: {
    volume: 1.0,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.RAMPAGE_LOOP]: {
    volume: 0.4,
    pitch: 1.0,
    category: 'ambient',
  },
  [SoundId.RAMPAGE_EXIT]: {
    volume: 0.7,
    pitch: 0.8,
    category: 'sfx',
  },
  [SoundId.RAMPAGE_HEARTBEAT]: {
    volume: 0.5,
    pitch: 1.0,
    category: 'ambient',
  },
  [SoundId.ANCESTOR_WHISPER]: {
    volume: 0.3,
    pitch: 1.0,
    pitchVariation: 0.2,
    pooled: true,
    category: 'ambient',
  },

  // ========== HEAT & WANTED ==========
  [SoundId.HEAT_INCREASE]: {
    volume: 0.4,
    pitch: 1.0,
    category: 'ui',
  },
  [SoundId.WANTED_STAR_UP]: {
    volume: 0.7,
    pitch: 1.0,
    category: 'ui',
  },
  [SoundId.WANTED_STAR_DOWN]: {
    volume: 0.5,
    pitch: 0.8,
    category: 'ui',
  },
  [SoundId.PURSUIT_START]: {
    volume: 0.6,
    pitch: 1.0,
    category: 'ui',
  },
  [SoundId.PURSUIT_END]: {
    volume: 0.5,
    pitch: 0.9,
    category: 'ui',
  },

  // ========== DAMAGE & DEATH ==========
  [SoundId.PLAYER_HIT]: {
    volume: 0.7,
    pitch: 1.0,
    pitchVariation: 0.1,
    pooled: true,
    category: 'sfx',
  },
  [SoundId.PLAYER_HURT]: {
    volume: 0.8,
    pitch: 1.0,
    pitchVariation: 0.1,
    category: 'sfx',
  },
  [SoundId.PLAYER_DEATH]: {
    volume: 0.9,
    pitch: 1.0,
    category: 'sfx',
  },
  [SoundId.GAME_OVER]: {
    volume: 1.0,
    pitch: 1.0,
    category: 'sfx',
  },

  // ========== UI ==========
  [SoundId.UI_CLICK]: {
    volume: 0.5,
    pitch: 1.0,
    category: 'ui',
  },
  [SoundId.UI_HOVER]: {
    volume: 0.2,
    pitch: 1.2,
    category: 'ui',
  },
  [SoundId.UI_CONFIRM]: {
    volume: 0.6,
    pitch: 1.0,
    category: 'ui',
  },
  [SoundId.UI_CANCEL]: {
    volume: 0.5,
    pitch: 0.8,
    category: 'ui',
  },
  [SoundId.UI_NOTIFICATION]: {
    volume: 0.5,
    pitch: 1.0,
    category: 'ui',
  },
  [SoundId.UI_ALERT]: {
    volume: 0.7,
    pitch: 1.0,
    category: 'ui',
  },
  [SoundId.MENU_OPEN]: {
    volume: 0.5,
    pitch: 1.0,
    category: 'ui',
  },
  [SoundId.MENU_CLOSE]: {
    volume: 0.4,
    pitch: 0.9,
    category: 'ui',
  },
  [SoundId.GAME_START]: {
    volume: 0.8,
    pitch: 1.0,
    category: 'sfx',
  },

  // ========== MUSIC ==========
  [SoundId.MUSIC_MENU]: {
    volume: 0.7,
    pitch: 1.0,
    category: 'music',
  },
  [SoundId.MUSIC_MENU_2]: {
    volume: 0.7,
    pitch: 1.0,
    category: 'music',
  },
  [SoundId.MUSIC_GAMEPLAY]: {
    volume: 0.85,
    pitch: 1.0,
    category: 'music',
  },
  [SoundId.MUSIC_GAMEPLAY_2]: {
    volume: 0.85,
    pitch: 1.0,
    category: 'music',
  },
  [SoundId.MUSIC_GAMEPLAY_3]: {
    volume: 0.85,
    pitch: 1.0,
    category: 'music',
  },
  [SoundId.MUSIC_GAMEPLAY_4]: {
    volume: 0.85,
    pitch: 1.0,
    category: 'music',
  },
  [SoundId.MUSIC_GAMEPLAY_5]: {
    volume: 0.85,
    pitch: 1.0,
    category: 'music',
  },
  [SoundId.MUSIC_GAMEPLAY_6]: {
    volume: 0.85,
    pitch: 1.0,
    category: 'music',
  },
  [SoundId.MUSIC_GAMEPLAY_7]: {
    volume: 0.85,
    pitch: 1.0,
    category: 'music',
  },
  [SoundId.MUSIC_RAMPAGE]: {
    volume: 1.5,
    pitch: 1.0,
    category: 'music',
  },
  [SoundId.MUSIC_GAME_OVER]: {
    volume: 0.7,
    pitch: 1.0,
    category: 'music',
  },
  [SoundId.MUSIC_ENDING_1]: {
    volume: 0.85,
    pitch: 1.0,
    category: 'music',
  },
  [SoundId.MUSIC_ENDING_2]: {
    volume: 0.85,
    pitch: 1.0,
    category: 'music',
  },

  // ========== AMBIENT ==========
  [SoundId.AMBIENT_CITY]: {
    volume: 0.2,
    pitch: 1.0,
    category: 'ambient',
  },
  [SoundId.WIND_LOOP]: {
    volume: 0.1125, // 75% of 0.15
    pitch: 1.0,
    category: 'ambient',
  },
  [SoundId.CHRISTMAS_MARKET]: {
    volume: 0.075,
    pitch: 1.0,
    category: 'ambient',
  },
  [SoundId.TABLE_CROWD]: {
    volume: 0.3, // Base volume (actual level controlled by positional system)
    pitch: 1.0,
    category: 'ambient',
  },
  [SoundId.DEATH_AMBIENT]: {
    volume: 0.4,
    pitch: 1.0,
    category: 'ambient',
  },

  // ========== VOICE ANNOUNCER ==========
  [SoundId.VOICE_SPLAT]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_CRUSHED]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_DEMOLISHED]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_OBLITERATED]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_TERMINATED]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_COWARD]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_NO_ESCAPE]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_RUN_FASTER]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_BACKSTAB]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_EASY_PREY]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_ROADKILL]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_PANCAKED]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_FLATTENED]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_SPLATTER]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_SPEED_BUMP]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_BADGE_DOWN]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_OFFICER_DOWN]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_COP_DROPPED]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_BLUE_DOWN]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_KILLING_SPREE]: { volume: 0.4, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_RAMPAGE]: { volume: 0.4, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_UNSTOPPABLE]: { volume: 0.4, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_GODLIKE]: { volume: 0.42, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_MASSACRE]: { volume: 0.4, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_LEGENDARY]: { volume: 0.45, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_HEAT_KILL]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_WANTED_BONUS]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_PURSUIT_FRENZY]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_HOT_STREAK]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_BLAST_KILL]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_COP_KILLER]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_BIKER_DOWN]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_WRECKED]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_LEVELED]: { volume: 0.35, pitch: 1.0, category: 'ui' },
  [SoundId.VOICE_RAMPAGE_MODE]: { volume: 0.42, pitch: 1.0, category: 'ui' },
};

// ============================================
// HELPER: Get all sounds that need to be loaded
// ============================================

export function getAllSoundIds(): SoundId[] {
  return Object.values(SoundId);
}

// ============================================
// NOTIFICATION MESSAGES (single source of truth)
// ============================================

// Kill messages
export const KILL_MESSAGES = ['SPLAT!', 'CRUSHED!', 'DEMOLISHED!', 'OBLITERATED!', 'TERMINATED!'] as const;

// Panic kill messages
export const PANIC_KILL_MESSAGES = ['COWARD!', 'NO ESCAPE!', 'RUN FASTER!', 'BACKSTAB!', 'EASY PREY!'] as const;

// Roadkill messages
export const ROADKILL_MESSAGES = ['ROADKILL!', 'PANCAKED!', 'FLATTENED!', 'SPLATTER!', 'SPEED BUMP!'] as const;

// Cop kill messages
export const COP_KILL_MESSAGES = ['BADGE DOWN!', 'OFFICER DOWN!', 'COP DROPPED!', 'BLUE DOWN!'] as const;

// Pursuit kill messages
export const PURSUIT_KILL_MESSAGES = ['HEAT KILL!', 'WANTED BONUS!', 'PURSUIT FRENZY!', 'HOT STREAK!', 'RAMPAGE!'] as const;

// Building destroy messages
export const BUILDING_DESTROY_MESSAGES = ['DEMOLISHED!', 'WRECKED!', 'CRUSHED!', 'LEVELED!', 'OBLITERATED!'] as const;

// Combo milestones
export const COMBO_MILESTONES = [
  { threshold: 5, message: 'KILLING SPREE!' },
  { threshold: 10, message: 'RAMPAGE!' },
  { threshold: 15, message: 'UNSTOPPABLE!' },
  { threshold: 20, message: 'GODLIKE!' },
  { threshold: 30, message: 'MASSACRE!' },
  { threshold: 50, message: 'LEGENDARY!' },
] as const;

// ============================================
// MESSAGE TO VOICE MAPPING
// ============================================

export const MESSAGE_TO_VOICE: Record<string, SoundId> = {
  // Kill messages
  'SPLAT!': SoundId.VOICE_SPLAT,
  'CRUSHED!': SoundId.VOICE_CRUSHED,
  'DEMOLISHED!': SoundId.VOICE_DEMOLISHED,
  'OBLITERATED!': SoundId.VOICE_OBLITERATED,
  'TERMINATED!': SoundId.VOICE_TERMINATED,

  // Panic kill messages
  'COWARD!': SoundId.VOICE_COWARD,
  'NO ESCAPE!': SoundId.VOICE_NO_ESCAPE,
  'RUN FASTER!': SoundId.VOICE_RUN_FASTER,
  'BACKSTAB!': SoundId.VOICE_BACKSTAB,
  'EASY PREY!': SoundId.VOICE_EASY_PREY,

  // Roadkill messages
  'ROADKILL!': SoundId.VOICE_ROADKILL,
  'PANCAKED!': SoundId.VOICE_PANCAKED,
  'FLATTENED!': SoundId.VOICE_FLATTENED,
  'SPLATTER!': SoundId.VOICE_SPLATTER,
  'SPEED BUMP!': SoundId.VOICE_SPEED_BUMP,

  // Cop kill messages
  'BADGE DOWN!': SoundId.VOICE_BADGE_DOWN,
  'OFFICER DOWN!': SoundId.VOICE_OFFICER_DOWN,
  'COP DROPPED!': SoundId.VOICE_COP_DROPPED,
  'BLUE DOWN!': SoundId.VOICE_BLUE_DOWN,

  // Combo milestones
  'KILLING SPREE!': SoundId.VOICE_KILLING_SPREE,
  'RAMPAGE!': SoundId.VOICE_RAMPAGE,
  'UNSTOPPABLE!': SoundId.VOICE_UNSTOPPABLE,
  'GODLIKE!': SoundId.VOICE_GODLIKE,
  'MASSACRE!': SoundId.VOICE_MASSACRE,
  'LEGENDARY!': SoundId.VOICE_LEGENDARY,

  // Pursuit messages
  'HEAT KILL!': SoundId.VOICE_HEAT_KILL,
  'WANTED BONUS!': SoundId.VOICE_WANTED_BONUS,
  'PURSUIT FRENZY!': SoundId.VOICE_PURSUIT_FRENZY,
  'HOT STREAK!': SoundId.VOICE_HOT_STREAK,

  // Special kills
  'BLAST KILL!': SoundId.VOICE_BLAST_KILL,
  'COP KILLER!': SoundId.VOICE_COP_KILLER,
  'BIKER DOWN!': SoundId.VOICE_BIKER_DOWN,
  'WRECKED!': SoundId.VOICE_WRECKED,
  'LEVELED!': SoundId.VOICE_LEVELED,

  // Rampage mode
  'RAMPAGE MODE!': SoundId.VOICE_RAMPAGE_MODE,
};

// ============================================
// FILE PATHS
// ============================================

export const SOUND_PATHS: Partial<Record<SoundId, string>> = {
  // ========== PLAYER MOVEMENT ==========
  [SoundId.PLAYER_SPAWN]: '/audio/sfx/player/player_spawn.mp3',
  [SoundId.PLAYER_RUN_LOOP]: '/audio/sfx/player/player_run_loop.mp3',
  [SoundId.FOOTSTEP_RUN]: '/audio/sfx/player/footstep_run.mp3',
  [SoundId.FOOTSTEP_WALK]: '/audio/sfx/player/footstep_walk.mp3',
  [SoundId.JUMP]: '/audio/sfx/player/jump.mp3',
  [SoundId.LAND]: '/audio/sfx/player/land.mp3',
  [SoundId.LAND_HARD]: '/audio/sfx/player/land_hard.mp3',

  // ========== PLAYER ATTACKS ==========
  [SoundId.KNIFE_WHOOSH]: '/audio/sfx/attacks/knife_whoosh.mp3',
  [SoundId.KNIFE_HIT]: '/audio/sfx/attacks/knife_hit.mp3',
  [SoundId.KNIFE_HIT_COP]: '/audio/sfx/attacks/knife_hit_cop.mp3',
  // Knife stab variations
  [SoundId.KNIFE_STAB_1]: '/audio/sfx/attacks/knife_stab_1.mp3',
  [SoundId.KNIFE_STAB_2]: '/audio/sfx/attacks/knife_stab_2.mp3',
  [SoundId.KNIFE_STAB_3]: '/audio/sfx/attacks/knife_stab_3.mp3',
  [SoundId.KNIFE_STAB_4]: '/audio/sfx/attacks/knife_stab_4.mp3',
  [SoundId.KNIFE_STAB_5]: '/audio/sfx/attacks/knife_stab_5.mp3',
  [SoundId.KNIFE_STAB_6]: '/audio/sfx/attacks/knife_stab_6.mp3',
  [SoundId.KNIFE_STAB_7]: '/audio/sfx/attacks/knife_stab_7.mp3',
  [SoundId.KNIFE_STAB_8]: '/audio/sfx/attacks/knife_stab_8.mp3',
  [SoundId.PUNCH_WHOOSH]: '/audio/sfx/attacks/punch_whoosh.mp3',
  [SoundId.PUNCH_HIT]: '/audio/sfx/attacks/punch_hit.mp3',

  // ========== BICYCLE ==========
  [SoundId.BICYCLE_PEDAL]: '/audio/sfx/vehicles/bicycle_pedal.mp3',
  [SoundId.BICYCLE_BELL]: '/audio/sfx/vehicles/bicycle_bell.mp3',
  [SoundId.BICYCLE_SLASH]: '/audio/sfx/attacks/bicycle_slash.mp3',
  [SoundId.BICYCLE_HIT]: '/audio/sfx/attacks/bicycle_hit.mp3',

  // ========== MOTORBIKE ==========
  [SoundId.MOTORBIKE_ENGINE]: '/audio/sfx/vehicles/motorbike_engine.mp3',
  [SoundId.MOTORBIKE_REV]: '/audio/sfx/vehicles/motorbike_rev.mp3',
  [SoundId.MOTORBIKE_SHOOT]: '/audio/sfx/attacks/motorbike_shoot.mp3',
  [SoundId.MOTORBIKE_BLAST]: '/audio/sfx/attacks/motorbike_blast.mp3',

  // ========== SEDAN ==========
  [SoundId.SEDAN_ENGINE]: '/audio/sfx/vehicles/sedan_engine.mp3',
  [SoundId.SEDAN_HORN]: '/audio/sfx/vehicles/sedan_horn.mp3',
  [SoundId.SEDAN_SKID]: '/audio/sfx/vehicles/sedan_skid.mp3',
  [SoundId.SEDAN_IMPACT]: '/audio/sfx/vehicles/sedan_impact.mp3',

  // ========== TRUCK ==========
  [SoundId.TRUCK_ENGINE]: '/audio/sfx/vehicles/truck_engine.mp3',
  [SoundId.TRUCK_HORN]: '/audio/sfx/vehicles/truck_horn.mp3',
  [SoundId.TRUCK_IMPACT]: '/audio/sfx/vehicles/truck_impact.mp3',
  [SoundId.BUILDING_DESTROY]: '/audio/sfx/vehicles/building_destroy.mp3',

  // ========== VEHICLE GENERAL ==========
  [SoundId.VEHICLE_ENTER]: '/audio/sfx/vehicles/vehicle_enter.mp3',
  [SoundId.VEHICLE_EXIT]: '/audio/sfx/vehicles/vehicle_exit.mp3',
  [SoundId.VEHICLE_DAMAGE]: '/audio/sfx/vehicles/vehicle_damage.mp3',
  [SoundId.VEHICLE_DESTROY]: '/audio/sfx/vehicles/vehicle_destroy.mp3',
  [SoundId.TIER_UNLOCK]: '/audio/sfx/vehicles/tier_unlock.mp3',
  [SoundId.TIER_UNLOCK_FANFARE]: '/audio/sfx/vehicles/tier_unlock_fanfare.mp3',

  // ========== KILLS & IMPACTS ==========
  [SoundId.KILL_SPLAT]: '/audio/sfx/kills/kill_splat.mp3',
  [SoundId.KILL_CRUNCH]: '/audio/sfx/kills/kill_crunch.mp3',
  [SoundId.KILL_SQUISH]: '/audio/sfx/kills/kill_squish.mp3',
  [SoundId.ROADKILL]: '/audio/sfx/kills/roadkill.mp3',
  [SoundId.MULTI_KILL]: '/audio/sfx/kills/multi_kill.mp3',
  [SoundId.BODY_THUD]: '/audio/sfx/kills/body_thud.mp3',
  [SoundId.BLOOD_SPLATTER]: '/audio/sfx/kills/blood_splatter.mp3',

  // ========== COP ENEMIES ==========
  [SoundId.COP_SPAWN]: '/audio/sfx/cops/cop_spawn.mp3',
  [SoundId.COP_FREEZE]: '/audio/sfx/cops/cop_freeze.mp3',
  [SoundId.COP_FREEZE_MALE]: '/audio/sfx/cops/cop_freeze_male.mp3',
  [SoundId.COP_FREEZE_FEMALE]: '/audio/sfx/cops/cop_freeze_female.mp3',
  [SoundId.COP_ALERT]: '/audio/sfx/cops/cop_alert.mp3',
  [SoundId.COP_PUNCH]: '/audio/sfx/cops/cop_punch.mp3',
  [SoundId.COP_PUNCH_1]: '/audio/sfx/cops/cop_punch_1.mp3',
  [SoundId.COP_PUNCH_2]: '/audio/sfx/cops/cop_punch_2.mp3',
  [SoundId.COP_PUNCH_3]: '/audio/sfx/cops/cop_punch_3.mp3',
  [SoundId.COP_PUNCH_4]: '/audio/sfx/cops/cop_punch_4.mp3',
  [SoundId.COP_PUNCH_5]: '/audio/sfx/cops/cop_punch_5.mp3',
  [SoundId.COP_DEATH]: '/audio/sfx/cops/cop_death.mp3',
  [SoundId.TASER_FIRE]: '/audio/sfx/cops/taser_fire.mp3',
  [SoundId.TASER_HIT]: '/audio/sfx/cops/taser_hit.mp3',
  [SoundId.TASER_LOOP]: '/audio/sfx/cops/taser_loop.mp3',
  [SoundId.TASER_ESCAPE]: '/audio/sfx/cops/taser_escape.mp3',
  [SoundId.GUNSHOT]: '/audio/sfx/cops/gunshot.mp3',
  [SoundId.BULLET_WHIZ]: '/audio/sfx/cops/bullet_whiz.mp3',

  // ========== COP VEHICLES ==========
  [SoundId.SIREN_LOOP]: '/audio/sfx/cops/siren_loop.mp3',
  [SoundId.SIREN_WAIL]: '/audio/sfx/cops/siren_wail.mp3',
  [SoundId.COP_CAR_ENGINE]: '/audio/sfx/cops/cop_car_engine.mp3',
  [SoundId.COP_CAR_RAM]: '/audio/sfx/cops/cop_car_ram.mp3',
  [SoundId.COP_CAR_DESTROY]: '/audio/sfx/cops/cop_car_destroy.mp3',
  [SoundId.MOTORBIKE_COP_ENGINE]: '/audio/sfx/cops/motorbike_cop_engine.mp3',
  [SoundId.MOTORBIKE_COP_RAM]: '/audio/sfx/cops/motorbike_cop_ram.mp3',
  [SoundId.BIKE_COP_PEDAL]: '/audio/sfx/cops/bike_cop_pedal.mp3',

  // ========== PEDESTRIANS ==========
  [SoundId.PEDESTRIAN_SCREAM]: '/audio/sfx/pedestrians/pedestrian_scream.mp3',
  [SoundId.PEDESTRIAN_PANIC]: '/audio/sfx/pedestrians/pedestrian_panic.mp3',
  [SoundId.CROWD_AMBIENT]: '/audio/sfx/pedestrians/crowd_ambient.mp3',
  // Scream variations
  [SoundId.SCREAM_1]: '/audio/sfx/screams/scream_1.mp3',
  [SoundId.SCREAM_2]: '/audio/sfx/screams/scream_2.mp3',
  [SoundId.SCREAM_3]: '/audio/sfx/screams/scream_3.mp3',
  [SoundId.SCREAM_4]: '/audio/sfx/screams/scream_4.mp3',
  [SoundId.SCREAM_5]: '/audio/sfx/screams/scream_5.mp3',
  [SoundId.SCREAM_6]: '/audio/sfx/screams/scream_6.mp3',
  [SoundId.SCREAM_7]: '/audio/sfx/screams/scream_7.mp3',
  [SoundId.SCREAM_8]: '/audio/sfx/screams/scream_8.mp3',
  [SoundId.SCREAM_9]: '/audio/sfx/screams/scream_9.mp3',
  [SoundId.SCREAM_10]: '/audio/sfx/screams/scream_10.mp3',
  [SoundId.SCREAM_11]: '/audio/sfx/screams/scream_11.mp3',
  [SoundId.SCREAM_12]: '/audio/sfx/screams/scream_12.mp3',
  [SoundId.SCREAM_13]: '/audio/sfx/screams/scream_13.mp3',
  [SoundId.SCREAM_14]: '/audio/sfx/screams/scream_14.mp3',
  [SoundId.SCREAM_15]: '/audio/sfx/screams/scream_15.mp3',
  [SoundId.SCREAM_16]: '/audio/sfx/screams/scream_16.mp3',
  [SoundId.SCREAM_17]: '/audio/sfx/screams/scream_17.mp3',
  [SoundId.SCREAM_18]: '/audio/sfx/screams/scream_18.mp3',
  [SoundId.SCREAM_19]: '/audio/sfx/screams/scream_19.mp3',
  [SoundId.SCREAM_20]: '/audio/sfx/screams/scream_20.mp3',

  // ========== COMBO & SCORING ==========
  [SoundId.COMBO_INCREMENT]: '/audio/sfx/combo/combo_increment.mp3',
  [SoundId.COMBO_MILESTONE_5]: '/audio/sfx/combo/combo_milestone_5.mp3',
  [SoundId.COMBO_MILESTONE_10]: '/audio/sfx/combo/combo_milestone_10.mp3',
  [SoundId.COMBO_MILESTONE_15]: '/audio/sfx/combo/combo_milestone_15.mp3',
  [SoundId.COMBO_MILESTONE_20]: '/audio/sfx/combo/combo_milestone_20.mp3',
  [SoundId.COMBO_MILESTONE_30]: '/audio/sfx/combo/combo_milestone_30.mp3',
  [SoundId.COMBO_MILESTONE_50]: '/audio/sfx/combo/combo_milestone_50.mp3',
  [SoundId.COMBO_LOST]: '/audio/sfx/combo/combo_lost.mp3',
  [SoundId.SCORE_TICK]: '/audio/sfx/combo/score_tick.mp3',
  [SoundId.POINTS_POPUP]: '/audio/sfx/combo/points_popup.mp3',

  // ========== RAMPAGE MODE ==========
  [SoundId.RAMPAGE_ENTER]: '/audio/sfx/rampage/rampage_enter.mp3',
  [SoundId.RAMPAGE_LOOP]: '/audio/sfx/rampage/rampage_loop.mp3',
  [SoundId.RAMPAGE_EXIT]: '/audio/sfx/rampage/rampage_exit.mp3',
  [SoundId.RAMPAGE_HEARTBEAT]: '/audio/sfx/rampage/rampage_heartbeat.mp3',
  [SoundId.ANCESTOR_WHISPER]: '/audio/sfx/rampage/ancestor_whisper.mp3',

  // ========== HEAT & WANTED ==========
  [SoundId.HEAT_INCREASE]: '/audio/sfx/combo/heat_increase.mp3',
  [SoundId.WANTED_STAR_UP]: '/audio/sfx/combo/wanted_star_up.mp3',
  [SoundId.WANTED_STAR_DOWN]: '/audio/sfx/combo/wanted_star_down.mp3',
  [SoundId.PURSUIT_START]: '/audio/sfx/combo/pursuit_start.mp3',
  [SoundId.PURSUIT_END]: '/audio/sfx/combo/pursuit_end.mp3',

  // ========== DAMAGE & DEATH ==========
  [SoundId.PLAYER_HIT]: '/audio/sfx/damage/player_hit.mp3',
  [SoundId.PLAYER_HURT]: '/audio/sfx/damage/player_hurt.mp3',
  [SoundId.PLAYER_DEATH]: '/audio/sfx/damage/player_death.mp3',
  [SoundId.GAME_OVER]: '/audio/sfx/damage/game_over.mp3',

  // ========== UI ==========
  [SoundId.UI_CLICK]: '/audio/sfx/ui/ui_click.mp3',
  [SoundId.UI_HOVER]: '/audio/sfx/ui/ui_hover.mp3',
  [SoundId.UI_CONFIRM]: '/audio/sfx/ui/ui_confirm.mp3',
  [SoundId.UI_CANCEL]: '/audio/sfx/ui/ui_cancel.mp3',
  [SoundId.UI_NOTIFICATION]: '/audio/sfx/ui/ui_notification.mp3',
  [SoundId.UI_ALERT]: '/audio/sfx/ui/ui_alert.mp3',
  [SoundId.MENU_OPEN]: '/audio/sfx/ui/menu_open.mp3',
  [SoundId.MENU_CLOSE]: '/audio/sfx/ui/menu_close.mp3',
  [SoundId.GAME_START]: '/audio/sfx/ui/game_start.mp3',

  // ========== AMBIENT ==========
  [SoundId.AMBIENT_CITY]: '/audio/ambient/ambient_city.mp3',
  [SoundId.WIND_LOOP]: '/audio/ambient/wind_loop.mp3',
  [SoundId.CHRISTMAS_MARKET]: '/audio/ambient/christmas_market.mp3',
  [SoundId.TABLE_CROWD]: '/audio/ambient/table_crowd.mp3',
  [SoundId.DEATH_AMBIENT]: '/audio/ambient/death_ambient.mp3',

  // ========== VOICE ANNOUNCER ==========
  [SoundId.VOICE_SPLAT]: '/audio/sfx/voice_arabic/voice_splat.mp3',
  [SoundId.VOICE_CRUSHED]: '/audio/sfx/voice_arabic/voice_crushed.mp3',
  [SoundId.VOICE_DEMOLISHED]: '/audio/sfx/voice_arabic/voice_demolished.mp3',
  [SoundId.VOICE_OBLITERATED]: '/audio/sfx/voice_arabic/voice_obliterated.mp3',
  [SoundId.VOICE_TERMINATED]: '/audio/sfx/voice_arabic/voice_terminated.mp3',
  [SoundId.VOICE_COWARD]: '/audio/sfx/voice_arabic/voice_coward.mp3',
  [SoundId.VOICE_NO_ESCAPE]: '/audio/sfx/voice_arabic/voice_no_escape.mp3',
  [SoundId.VOICE_RUN_FASTER]: '/audio/sfx/voice_arabic/voice_run_faster.mp3',
  [SoundId.VOICE_BACKSTAB]: '/audio/sfx/voice_arabic/voice_backstab.mp3',
  [SoundId.VOICE_EASY_PREY]: '/audio/sfx/voice_arabic/voice_easy_prey.mp3',
  [SoundId.VOICE_ROADKILL]: '/audio/sfx/voice_arabic/voice_roadkill.mp3',
  [SoundId.VOICE_PANCAKED]: '/audio/sfx/voice_arabic/voice_pancaked.mp3',
  [SoundId.VOICE_FLATTENED]: '/audio/sfx/voice_arabic/voice_flattened.mp3',
  [SoundId.VOICE_SPLATTER]: '/audio/sfx/voice_arabic/voice_splatter.mp3',
  [SoundId.VOICE_SPEED_BUMP]: '/audio/sfx/voice_arabic/voice_speed_bump.mp3',
  [SoundId.VOICE_BADGE_DOWN]: '/audio/sfx/voice_arabic/voice_badge_down.mp3',
  [SoundId.VOICE_OFFICER_DOWN]: '/audio/sfx/voice_arabic/voice_officer_down.mp3',
  [SoundId.VOICE_COP_DROPPED]: '/audio/sfx/voice_arabic/voice_cop_dropped.mp3',
  [SoundId.VOICE_BLUE_DOWN]: '/audio/sfx/voice_arabic/voice_blue_down.mp3',
  [SoundId.VOICE_KILLING_SPREE]: '/audio/sfx/voice_arabic/voice_killing_spree.mp3',
  [SoundId.VOICE_RAMPAGE]: '/audio/sfx/voice_arabic/voice_rampage.mp3',
  [SoundId.VOICE_UNSTOPPABLE]: '/audio/sfx/voice_arabic/voice_unstoppable.mp3',
  [SoundId.VOICE_GODLIKE]: '/audio/sfx/voice_arabic/voice_godlike.mp3',
  [SoundId.VOICE_MASSACRE]: '/audio/sfx/voice_arabic/voice_massacre.mp3',
  [SoundId.VOICE_LEGENDARY]: '/audio/sfx/voice_arabic/voice_legendary.mp3',
  [SoundId.VOICE_HEAT_KILL]: '/audio/sfx/voice_arabic/voice_heat_kill.mp3',
  [SoundId.VOICE_WANTED_BONUS]: '/audio/sfx/voice_arabic/voice_wanted_bonus.mp3',
  [SoundId.VOICE_PURSUIT_FRENZY]: '/audio/sfx/voice_arabic/voice_pursuit_frenzy.mp3',
  [SoundId.VOICE_HOT_STREAK]: '/audio/sfx/voice_arabic/voice_hot_streak.mp3',
  [SoundId.VOICE_BLAST_KILL]: '/audio/sfx/voice_arabic/voice_blast_kill.mp3',
  [SoundId.VOICE_COP_KILLER]: '/audio/sfx/voice_arabic/voice_cop_killer.mp3',
  [SoundId.VOICE_BIKER_DOWN]: '/audio/sfx/voice_arabic/voice_biker_down.mp3',
  [SoundId.VOICE_WRECKED]: '/audio/sfx/voice_arabic/voice_wrecked.mp3',
  [SoundId.VOICE_LEVELED]: '/audio/sfx/voice_arabic/voice_leveled.mp3',
  [SoundId.VOICE_RAMPAGE_MODE]: '/audio/sfx/voice_arabic/voice_rampage_mode.mp3',

  // ========== MUSIC ==========
  [SoundId.MUSIC_MENU]: '/audio/music/gameplay_1.mp3', // Fireside
  [SoundId.MUSIC_MENU_2]: '/audio/music/gameplay_2.mp3', // December Evening
  [SoundId.MUSIC_GAMEPLAY]: '/audio/music/game christmas dubstep.mp3',
  [SoundId.MUSIC_GAMEPLAY_2]: '/audio/music/outrun_christmas_mayhem.mp3',
  [SoundId.MUSIC_GAMEPLAY_3]: '/audio/music/outrun_christmas_mayhem_2.mp3',
  [SoundId.MUSIC_GAMEPLAY_4]: '/audio/music/berghain_christmas_mayhem.mp3',
  [SoundId.MUSIC_GAMEPLAY_5]: '/audio/music/berghain_christmas_mayhem_2.mp3',
  [SoundId.MUSIC_GAMEPLAY_6]: '/audio/music/hu_god_is_great.mp3',
  [SoundId.MUSIC_GAMEPLAY_7]: '/audio/music/hu_bunker_edit.mp3',
  [SoundId.MUSIC_RAMPAGE]: '/audio/music/rampage.mp3',
  [SoundId.MUSIC_ENDING_1]: '/audio/music/ending_1.mp3', // Snow on the Windowsill
  [SoundId.MUSIC_ENDING_2]: '/audio/music/ending_2.mp3', // Postcard from 1954
};
