/**
 * GameAudio - High-level game audio API for Rampage Rider
 *
 * Provides semantic methods for triggering game audio events.
 * Wraps AudioManager with game-specific logic like:
 * - Random sound selection from pools
 * - Pitch variation based on game state
 * - Combo-scaled volume
 * - Automatic music transitions
 *
 * Usage: Import and call methods directly from game code
 * Example: gameAudio.playKill('pedestrian', 3); // 3 combo
 */

import { audioManager } from "./AudioManager";
import { SoundId, SOUND_PATHS, MESSAGE_TO_VOICE } from "./sounds";
import { Tier } from "../types";

// Random sound pools for variety
const KILL_SOUNDS = [
  SoundId.KILL_SPLAT,
  SoundId.KILL_CRUNCH,
  SoundId.KILL_SQUISH,
];
const COP_KILL_SOUNDS = [SoundId.COP_DEATH, SoundId.KILL_CRUNCH];

// Knife stab pool (8 variations for fleshy cop kills)
const KNIFE_STAB_SOUNDS = [
  SoundId.KNIFE_STAB_1,
  SoundId.KNIFE_STAB_2,
  SoundId.KNIFE_STAB_3,
  SoundId.KNIFE_STAB_4,
  SoundId.KNIFE_STAB_5,
  SoundId.KNIFE_STAB_6,
  SoundId.KNIFE_STAB_7,
  SoundId.KNIFE_STAB_8,
];

// Scream pool (20 variations for pedestrians and cops)
const SCREAM_SOUNDS = [
  SoundId.SCREAM_1,
  SoundId.SCREAM_2,
  SoundId.SCREAM_3,
  SoundId.SCREAM_4,
  SoundId.SCREAM_5,
  SoundId.SCREAM_6,
  SoundId.SCREAM_7,
  SoundId.SCREAM_8,
  SoundId.SCREAM_9,
  SoundId.SCREAM_10,
  SoundId.SCREAM_11,
  SoundId.SCREAM_12,
  SoundId.SCREAM_13,
  SoundId.SCREAM_14,
  SoundId.SCREAM_15,
  SoundId.SCREAM_16,
  SoundId.SCREAM_17,
  SoundId.SCREAM_18,
  SoundId.SCREAM_19,
  SoundId.SCREAM_20,
];

// Helper to pick random from array
function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Helper to add pitch variation
function variedPitch(base: number, variation: number): number {
  return base + (Math.random() - 0.5) * 2 * variation;
}

// Helper to scale volume by combo
function comboVolume(base: number, combo: number, maxCombo = 50): number {
  const scale = 1 + Math.min(combo / maxCombo, 1) * 0.5; // Up to 1.5x at max combo
  return Math.min(base * scale, 1.0);
}

export const gameAudio = {
  // Rampage mode mutes cop voice lines
  _inRampage: false,
  // Track if game has started (prevents menu music from playing during gameplay)
  _gameStarted: false,

  setRampageMode(active: boolean): void {
    this._inRampage = active;
  },

  setGameStarted(started: boolean): void {
    this._gameStarted = started;
  },

  // ============================================
  // INITIALIZATION
  // ============================================

  async init(): Promise<void> {
    try {
      await audioManager.init();
      // Load all sounds in parallel with timeout
      await this.loadAllSounds();
    } catch (err) {
      console.warn('[GameAudio] Init failed, continuing without audio:', err);
    }
  },

  async loadAllSounds(): Promise<void> {
    const LOAD_TIMEOUT = 10000; // 10 second timeout for all sounds

    const loadPromises: Promise<void>[] = [];
    for (const [id, path] of Object.entries(SOUND_PATHS)) {
      if (path) {
        // Wrap each load in try/catch so one failure doesn't break all
        loadPromises.push(
          audioManager.loadSound(id as SoundId, path).catch((err) => {
            console.warn(`[GameAudio] Failed to load ${id}:`, err);
          })
        );
      }
    }

    // Race against timeout to prevent hanging forever
    await Promise.race([
      Promise.all(loadPromises),
      new Promise<void>((resolve) => setTimeout(() => {
        console.warn('[GameAudio] Sound loading timed out, continuing anyway');
        resolve();
      }, LOAD_TIMEOUT))
    ]);
  },

  resume(): Promise<void> {
    return audioManager.resume();
  },

  // ============================================
  // PLAYER MOVEMENT
  // ============================================

  playPlayerSpawn(): void {
    audioManager.play(SoundId.PLAYER_SPAWN);
  },

  startPlayerRunLoop(): string | null {
    return audioManager.play(SoundId.PLAYER_RUN_LOOP, { loop: true, instanceId: 'player_run_loop' });
  },

  stopPlayerRunLoop(): void {
    audioManager.stop('player_run_loop', 0.15);
  },

  playFootstep(isRunning: boolean): void {
    const id = isRunning ? SoundId.FOOTSTEP_RUN : SoundId.FOOTSTEP_WALK;
    audioManager.play(id, { pitch: variedPitch(1.0, 0.1) });
  },

  playJump(): void {
    audioManager.play(SoundId.JUMP);
  },

  playLand(isHard = false): void {
    audioManager.play(isHard ? SoundId.LAND_HARD : SoundId.LAND);
  },

  // ============================================
  // PLAYER ATTACKS
  // ============================================

  playKnifeAttack(): void {
    audioManager.play(SoundId.KNIFE_WHOOSH, { pitch: variedPitch(1.0, 0.15) });
  },

  // Universal stab sound - used for all melee attacks (walking, bike, motorbike)
  playStab(combo = 0): void {
    audioManager.play(randomFrom(KNIFE_STAB_SOUNDS), {
      volume: comboVolume(0.7, combo),
      pitch: variedPitch(1.0, 0.1),
    });
  },

  // Legacy aliases - all redirect to playStab
  playKnifeHit(_isCop: boolean, combo = 0): void {
    this.playStab(combo);
  },

  playBicycleSlash(): void {
    this.playStab();
  },

  playBicycleHit(combo = 0): void {
    this.playStab(combo);
  },

  playMotorbikeStab(): void {
    this.playStab();
  },

  playMotorbikeBlast(): void {
    audioManager.play(SoundId.MOTORBIKE_BLAST);
    audioManager.duck(0.3, 0.5); // Duck music for impact
  },

  // ============================================
  // KILLS
  // ============================================

  playKill(
    type: "pedestrian" | "cop" | "copCar" | "bikeCop" | "motorbikeCop",
    combo = 0,
  ): void {
    const isCop = type !== "pedestrian";
    const sounds = isCop ? COP_KILL_SOUNDS : KILL_SOUNDS;
    const id = randomFrom(sounds);

    audioManager.play(id, {
      volume: comboVolume(0.7, combo),
      pitch: variedPitch(1.0, 0.15),
    });

    // Scream from pool (for both pedestrians and cops)
    audioManager.play(randomFrom(SCREAM_SOUNDS), {
      volume: 0.55,
      pitch: variedPitch(1.0, 0.15),
    });

    // Blood splatter
    audioManager.play(SoundId.BLOOD_SPLATTER, {
      volume: 0.4,
      pitch: variedPitch(1.0, 0.2),
    });
  },

  playRoadkill(combo = 0): void {
    audioManager.play(SoundId.ROADKILL, {
      volume: comboVolume(0.8, combo),
      pitch: variedPitch(1.0, 0.1),
    });
  },

  playMultiKill(killCount: number): void {
    if (killCount >= 3) {
      audioManager.play(SoundId.MULTI_KILL, {
        volume: Math.min(0.9 + killCount * 0.02, 1.0),
      });
    }
  },

  playBodyThud(): void {
    audioManager.play(SoundId.BODY_THUD, { pitch: variedPitch(1.0, 0.2) });
  },

  // ============================================
  // PEDESTRIANS & SCREAMS
  // ============================================

  playPedestrianScream(): void {
    // Use the 20-variation scream pool
    audioManager.play(randomFrom(SCREAM_SOUNDS), {
      volume: 0.55,
      pitch: variedPitch(1.0, 0.15),
    });
  },

  playPedestrianPanic(): void {
    // Also use scream pool for panic
    audioManager.play(randomFrom(SCREAM_SOUNDS), {
      volume: 0.4,
      pitch: variedPitch(1.0, 0.2),
    });
  },

  // Generic scream (used for both pedestrians and cops)
  playScream(): void {
    audioManager.play(randomFrom(SCREAM_SOUNDS), {
      volume: 0.55,
      pitch: variedPitch(1.0, 0.15),
    });
  },

  // ============================================
  // VEHICLES
  // ============================================

  playVehicleEnter(): void {
    audioManager.play(SoundId.VEHICLE_ENTER);
  },

  playVehicleExit(): void {
    audioManager.play(SoundId.VEHICLE_EXIT);
  },

  playVehicleDamage(): void {
    audioManager.play(SoundId.VEHICLE_DAMAGE, { pitch: variedPitch(1.0, 0.1) });
  },

  playVehicleDestroy(): void {
    audioManager.play(SoundId.VEHICLE_DESTROY);
    audioManager.duck(0.2, 0.8); // Heavy duck for explosion
  },

  startVehicleEngine(entityId: string, tier: Tier): void {
    let soundId: SoundId;
    switch (tier) {
      case Tier.BIKE:
        soundId = SoundId.BICYCLE_PEDAL;
        break;
      case Tier.MOTO:
        soundId = SoundId.MOTORBIKE_ENGINE;
        break;
      case Tier.SEDAN:
        soundId = SoundId.SEDAN_ENGINE;
        break;
      case Tier.TRUCK:
        soundId = SoundId.TRUCK_ENGINE;
        break;
      default:
        return;
    }
    audioManager.startEngineLoop(entityId, soundId);
  },

  updateVehicleEngine(entityId: string, speed: number, maxSpeed: number): void {
    audioManager.updateEngineLoop(entityId, speed, maxSpeed);
  },

  stopVehicleEngine(entityId: string): void {
    audioManager.stopEngineLoop(entityId);
  },

  playVehicleImpact(tier: Tier): void {
    const soundId =
      tier === Tier.TRUCK
        ? SoundId.TRUCK_IMPACT
        : tier === Tier.SEDAN
          ? SoundId.SEDAN_IMPACT
          : SoundId.BICYCLE_HIT;
    audioManager.play(soundId, { pitch: variedPitch(1.0, 0.1) });
  },

  playBuildingDestroy(): void {
    audioManager.play(SoundId.BUILDING_DESTROY);
    audioManager.duck(0.2, 1.0); // Heavy duck for building destruction
  },

  playHorn(tier: Tier): void {
    const soundId =
      tier === Tier.TRUCK ? SoundId.TRUCK_HORN : SoundId.SEDAN_HORN;
    audioManager.play(soundId);
  },

  // ============================================
  // TIER UNLOCKS
  // ============================================

  playTierUnlock(): void {
    if (this._inRampage) return; // Silent during rampage
    audioManager.play(SoundId.TIER_UNLOCK);
    audioManager.play(SoundId.TIER_UNLOCK_FANFARE);
    audioManager.duck(0.3, 1.0); // Duck for fanfare
  },

  // ============================================
  // COPS
  // ============================================

  playCopSpawn(): void {
    if (this._inRampage) return; // Mute during rampage
    audioManager.play(SoundId.COP_SPAWN);
    audioManager.play(SoundId.COP_FREEZE, { pitch: variedPitch(1.0, 0.1) });
  },

  playCopAlert(): void {
    if (this._inRampage) return; // Mute during rampage
    audioManager.play(SoundId.COP_ALERT, { pitch: variedPitch(1.0, 0.1) });
  },

  playCopPunch(): void {
    if (this._inRampage) return; // Mute during rampage
    // Randomly select from 5 punch variations
    const punchSounds = [
      SoundId.COP_PUNCH_1,
      SoundId.COP_PUNCH_2,
      SoundId.COP_PUNCH_3,
      SoundId.COP_PUNCH_4,
      SoundId.COP_PUNCH_5,
    ];
    audioManager.play(randomFrom(punchSounds), { pitch: variedPitch(1.0, 0.1) });
  },

  playCopDeath(): void {
    audioManager.play(SoundId.COP_DEATH, { pitch: variedPitch(1.0, 0.15) });
    // Also play a scream from the pool
    audioManager.play(randomFrom(SCREAM_SOUNDS), {
      volume: 0.5,
      pitch: variedPitch(1.0, 0.15),
    });
  },

  // ============================================
  // TASER
  // ============================================

  playTaserFire(): void {
    audioManager.play(SoundId.TASER_FIRE);
  },

  playTaserHit(): void {
    audioManager.play(SoundId.TASER_HIT);
  },

  startTaserLoop(): string | null {
    return audioManager.play(SoundId.TASER_LOOP, {
      loop: true,
      instanceId: "taser_loop",
    });
  },

  stopTaserLoop(): void {
    audioManager.stop("taser_loop", 0.2);
  },

  playTaserEscapePress(): void {
    // Rising pitch based on escape progress would be nice
    audioManager.play(SoundId.COMBO_INCREMENT, {
      pitch: variedPitch(1.2, 0.1),
    });
  },

  playTaserEscape(): void {
    audioManager.play(SoundId.TASER_ESCAPE);
    audioManager.duck(0.3, 0.5);
  },

  // ============================================
  // GUNFIRE
  // ============================================

  playGunshot(): void {
    audioManager.play(SoundId.GUNSHOT, { pitch: variedPitch(1.0, 0.1) });
  },

  playBulletWhiz(): void {
    audioManager.play(SoundId.BULLET_WHIZ, { pitch: variedPitch(1.0, 0.2) });
  },

  // ============================================
  // COP VEHICLES
  // ============================================

  startSiren(entityId: string): void {
    audioManager.startEngineLoop(`siren_${entityId}`, SoundId.SIREN_LOOP, 0.6);
  },

  stopSiren(entityId: string): void {
    audioManager.stopEngineLoop(`siren_${entityId}`);
  },

  playSirenWail(): void {
    audioManager.play(SoundId.SIREN_WAIL);
  },

  startCopCarEngine(entityId: string): void {
    audioManager.startEngineLoop(entityId, SoundId.COP_CAR_ENGINE);
  },

  stopCopCarEngine(entityId: string): void {
    audioManager.stopEngineLoop(entityId);
  },

  playCopCarRam(): void {
    audioManager.play(SoundId.COP_CAR_RAM, { pitch: variedPitch(1.0, 0.1) });
  },

  playCopCarDestroy(): void {
    audioManager.play(SoundId.COP_CAR_DESTROY);
    audioManager.duck(0.3, 0.6);
  },

  startMotorbikeCopEngine(entityId: string): void {
    audioManager.startEngineLoop(entityId, SoundId.MOTORBIKE_COP_ENGINE);
  },

  stopMotorbikeCopEngine(entityId: string): void {
    audioManager.stopEngineLoop(entityId);
  },

  playMotorbikeCopRam(): void {
    audioManager.play(SoundId.MOTORBIKE_COP_RAM, {
      pitch: variedPitch(1.0, 0.1),
    });
  },

  startBikeCopPedal(entityId: string): void {
    audioManager.startEngineLoop(entityId, SoundId.BIKE_COP_PEDAL, 0.3);
  },

  stopBikeCopPedal(entityId: string): void {
    audioManager.stopEngineLoop(entityId);
  },

  // ============================================
  // COMBO & SCORING
  // ============================================

  playComboIncrement(combo: number): void {
    if (this._inRampage) return; // Silent during rampage
    // Pitch rises with combo
    const pitch = 1.0 + Math.min(combo / 50, 1) * 0.5;
    audioManager.play(SoundId.COMBO_INCREMENT, { pitch, volume: 0.4 });
  },

  playComboMilestone(combo: number): void {
    if (this._inRampage) return; // Silent during rampage
    let soundId: SoundId;
    switch (combo) {
      case 5:
        soundId = SoundId.COMBO_MILESTONE_5;
        break;
      case 10:
        soundId = SoundId.COMBO_MILESTONE_10;
        break;
      case 15:
        soundId = SoundId.COMBO_MILESTONE_15;
        break;
      case 20:
        soundId = SoundId.COMBO_MILESTONE_20;
        break;
      case 30:
        soundId = SoundId.COMBO_MILESTONE_30;
        break;
      case 50:
        soundId = SoundId.COMBO_MILESTONE_50;
        break;
      default:
        return;
    }
    audioManager.play(soundId);
    audioManager.duck(0.4, 0.8);
  },

  playComboLost(): void {
    if (this._inRampage) return; // Silent during rampage
    audioManager.play(SoundId.COMBO_LOST);
  },

  playScoreTick(): void {
    if (this._inRampage) return; // Silent during rampage
    audioManager.play(SoundId.SCORE_TICK, { pitch: variedPitch(1.0, 0.1) });
  },

  playPointsPopup(): void {
    if (this._inRampage) return; // Silent during rampage
    audioManager.play(SoundId.POINTS_POPUP, { pitch: variedPitch(1.0, 0.1) });
  },

  // ============================================
  // RAMPAGE MODE
  // ============================================

  playRampageEnter(): void {
    audioManager.play(SoundId.RAMPAGE_ENTER);
    audioManager.duck(0.2, 0.8);
  },

  startRampageLoop(): void {
    // Use wind sound for rampage atmosphere
    audioManager.play(SoundId.WIND_LOOP, {
      loop: true,
      instanceId: "rampage_wind",
      volume: 0.75,
    });
    audioManager.play(SoundId.RAMPAGE_HEARTBEAT, {
      loop: true,
      instanceId: "rampage_heartbeat",
    });
  },

  stopRampageLoop(): void {
    audioManager.stop("rampage_wind", 0.5);
    audioManager.stop("rampage_heartbeat", 0.5);
  },

  /**
   * Stop all looping SFX (for game over / restart)
   */
  stopAllLoops(): void {
    audioManager.stop("taser_loop", 0.1);
    audioManager.stop("rampage_wind", 0.1);
    audioManager.stop("rampage_heartbeat", 0.1);
    audioManager.stop("player_run_loop", 0.1);
    audioManager.stop("bike_pedal_loop", 0.1);
    audioManager.stop("motorbike_engine_loop", 0.1);
    audioManager.stop("car_engine_loop", 0.1);
    audioManager.stop("truck_engine_loop", 0.1);
    audioManager.stop("crowd_ambient_loop", 0.1);
  },

  playRampageExit(): void {
    audioManager.play(SoundId.RAMPAGE_EXIT);
  },

  playAncestorWhisper(): void {
    audioManager.play(SoundId.ANCESTOR_WHISPER, {
      pitch: variedPitch(1.0, 0.2),
    });
  },

  // ============================================
  // HEAT & WANTED
  // ============================================

  playHeatIncrease(): void {
    audioManager.play(SoundId.HEAT_INCREASE);
  },

  playWantedStarUp(): void {
    audioManager.play(SoundId.WANTED_STAR_UP);
  },

  playWantedStarDown(): void {
    audioManager.play(SoundId.WANTED_STAR_DOWN);
  },

  playPursuitStart(): void {
    audioManager.play(SoundId.PURSUIT_START);
  },

  playPursuitEnd(): void {
    audioManager.play(SoundId.PURSUIT_END);
  },

  // ============================================
  // PLAYER DAMAGE & DEATH
  // ============================================

  playPlayerHit(): void {
    audioManager.play(SoundId.PLAYER_HIT, { pitch: variedPitch(1.0, 0.1) });
  },

  playPlayerHurt(): void {
    audioManager.play(SoundId.PLAYER_HURT, { pitch: variedPitch(1.0, 0.1) });
  },

  playPlayerDeath(): void {
    audioManager.play(SoundId.PLAYER_DEATH);
    audioManager.duck(0.1, 1.5);
  },

  playGameOver(): void {
    audioManager.play(SoundId.GAME_OVER);
  },

  // ============================================
  // UI SOUNDS
  // ============================================

  playUIClick(): void {
    audioManager.play(SoundId.UI_CLICK);
  },

  playUIHover(): void {
    audioManager.play(SoundId.UI_HOVER);
  },

  playUIConfirm(): void {
    audioManager.play(SoundId.UI_CONFIRM);
  },

  playUICancel(): void {
    audioManager.play(SoundId.UI_CANCEL);
  },

  playUINotification(): void {
    if (this._inRampage) return; // Silent during rampage
    audioManager.play(SoundId.UI_NOTIFICATION);
  },

  playUIAlert(): void {
    if (this._inRampage) return; // Silent during rampage
    audioManager.play(SoundId.UI_ALERT);
  },

  playGameStart(): void {
    audioManager.play(SoundId.GAME_START);
  },

  // Play voice announcer for a notification message (with heavy reverb)
  playVoiceForMessage(message: string): void {
    if (this._inRampage) return; // Silent during rampage
    const voiceId = MESSAGE_TO_VOICE[message];
    if (voiceId) {
      audioManager.play(voiceId, { maxDuration: 1.2, useReverb: true });
    }
  },

  playMenuOpen(): void {
    audioManager.play(SoundId.MENU_OPEN);
  },

  playMenuClose(): void {
    audioManager.play(SoundId.MENU_CLOSE);
  },

  // ============================================
  // MUSIC
  // ============================================

  // Menu tracks pool (for loading screen)
  _menuTracks: [
    SoundId.MUSIC_MENU,   // Fireside
    SoundId.MUSIC_MENU_2, // December Evening
  ] as const,

  // Gameplay tracks pool
  _gameplayTracks: [
    SoundId.MUSIC_GAMEPLAY,   // Christmas dubstep
    SoundId.MUSIC_GAMEPLAY_2, // Outrun Christmas Mayhem
    SoundId.MUSIC_GAMEPLAY_3, // Outrun Christmas Mayhem 2
    SoundId.MUSIC_GAMEPLAY_4, // Berghain Christmas Mayhem
    SoundId.MUSIC_GAMEPLAY_5, // Berghain Christmas Mayhem 2
    SoundId.MUSIC_GAMEPLAY_6, // HU God Is Great
    SoundId.MUSIC_GAMEPLAY_7, // HU Bunker Edit
  ] as const,

  // Per-track start offsets (to skip intros)
  _trackStartOffsets: {
    [SoundId.MUSIC_GAMEPLAY_4]: 30, // Berghain Christmas Mayhem - skip intro
    [SoundId.MUSIC_GAMEPLAY_5]: 45, // Berghain Christmas Mayhem 2 - skip intro
  } as Record<SoundId, number>,

  /**
   * Play menu/loading screen music (random from 2 tracks)
   * Only plays if game hasn't started yet
   */
  playMenuMusic(): void {
    if (this._gameStarted) {
      console.warn('[GameAudio] Blocked menu music - game already started');
      return;
    }
    const track = randomFrom([...this._menuTracks]);
    audioManager.playMusic(track);
  },

  /**
   * Stop menu music immediately (no crossfade)
   */
  stopMenuMusic(): void {
    audioManager.stopMusicImmediate();
  },

  /**
   * Play gameplay music (random track)
   * @param startOffset - Start from this second (to skip intros), overrides per-track config
   */
  playGameplayMusic(startOffset?: number): void {
    // Stop menu music immediately (no crossfade) to prevent bleed
    audioManager.stopMusicImmediate();
    const track = randomFrom([...this._gameplayTracks]);
    const offset = startOffset ?? this._trackStartOffsets[track] ?? 0;
    audioManager.playMusic(track, false, offset);
  },

  /**
   * Play rampage mode music
   * @param startOffset - Start from this second (to skip intros)
   */
  playRampageMusic(startOffset = 0): void {
    audioManager.playMusic(SoundId.MUSIC_RAMPAGE, true, startOffset);
  },

  /**
   * Switch back to gameplay music from rampage (picks random track)
   * @param startOffset - Start from this second (to skip intros)
   */
  exitRampageMusic(startOffset = 0): void {
    this.playGameplayMusic(startOffset);
  },

  playGameOverMusic(): void {
    audioManager.playMusic(SoundId.MUSIC_GAME_OVER);
  },

  // Ending tracks pool (for BUSTED screen)
  _endingTracks: [
    SoundId.MUSIC_ENDING_1, // Snow on the Windowsill
    SoundId.MUSIC_ENDING_2, // Postcard from 1954
  ] as const,

  /**
   * Play ending music when player is busted (random from 2 tracks)
   */
  playEndingMusic(): void {
    const track = randomFrom([...this._endingTracks]);
    audioManager.playMusic(track, true);
  },

  stopMusic(fadeTime = 1.0): void {
    audioManager.stopMusic(fadeTime);
  },

  // ============================================
  // AMBIENT
  // ============================================

  startAmbient(): void {
    // Christmas market ambience as main background
    audioManager.play(SoundId.CHRISTMAS_MARKET, {
      loop: true,
      instanceId: "christmas_market",
    });
  },

  stopAmbient(): void {
    audioManager.stop("christmas_market", 1.0);
  },

  // ============================================
  // POSITIONAL CROWD AUDIO (near tables)
  // ============================================

  /**
   * Start table crowd sound (call once when game starts)
   */
  startTableCrowd(): void {
    audioManager.startPositionalSound("table_crowd", SoundId.TABLE_CROWD);
  },

  /**
   * Update table crowd volume based on distance to nearest table
   * @param distance - Distance to nearest table in world units
   */
  updateTableCrowdDistance(distance: number): void {
    // Max volume 2.0 when very close, audible within 12 units
    audioManager.updatePositionalVolume("table_crowd", distance, 12, 2.0);
  },

  /**
   * Stop table crowd sound
   */
  stopTableCrowd(): void {
    audioManager.stopPositionalSound("table_crowd");
  },

  // ============================================
  // DEATH AMBIENT (purgatory loop)
  // ============================================

  /**
   * Start dark purgatory ambient loop (for game over screen)
   */
  startDeathAmbient(): void {
    audioManager.play(SoundId.DEATH_AMBIENT, {
      loop: true,
      instanceId: "death_ambient",
      volume: 0.4,
    });
  },

  /**
   * Stop death ambient
   */
  stopDeathAmbient(): void {
    audioManager.stop("death_ambient", 1.5);
  },

  // ============================================
  // VOLUME CONTROLS
  // ============================================

  setMasterVolume(volume: number): void {
    audioManager.setMasterVolume(volume);
  },

  setSfxVolume(volume: number): void {
    audioManager.setSfxVolume(volume);
  },

  setMusicVolume(volume: number): void {
    audioManager.setMusicVolume(volume);
  },

  toggleMute(): boolean {
    return audioManager.toggleMute();
  },

  // ============================================
  // UPDATE
  // ============================================

  update(dt: number): void {
    audioManager.update(dt);
  },

  // ============================================
  // CLEANUP
  // ============================================

  dispose(): void {
    audioManager.dispose();
  },
};
