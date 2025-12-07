# Audio System Architecture

## Overview

The audio system uses Web Audio API with a clean separation between low-level management and high-level game semantics.

## File Structure

```
src/audio/
├── index.ts          # Module exports
├── sounds.ts         # SoundId enum + SOUND_PATHS (~1,350 lines, 222 sounds)
├── AudioManager.ts   # Low-level Web Audio API engine (~865 lines)
└── GameAudio.ts      # High-level game API (~902 lines)

public/audio/
├── sfx/              # Sound effects by category
├── music/            # Background music tracks
└── ambient/          # Environmental loops
```

## Volume Routing

```
Master Gain (1.0)
├── SFX Gain (1.0)      → game sounds, impacts, kills
├── Music Gain (0.7)    → background tracks (can be ducked)
├── UI Gain (1.0)       → clicks, voice announcer with reverb
└── Ambient Gain (1.0)  → environmental loops
```

## Sound Categories (222 total)

| Category | Count | Examples |
|----------|-------|----------|
| Player Movement | 7 | footsteps, jump, land |
| Player Attacks | 10 | knife whoosh, stabs (8 variations) |
| Vehicles | 35+ | bicycle, motorbike, sedan, truck engines |
| Kills & Impacts | 7 | splat, crunch, squish, roadkill |
| Cop Enemies | 17 | spawn, alert, punch (5 var), death, taser |
| Pedestrians | 21 | screams (20 variations), panic |
| Combo & Scoring | 10 | milestone sounds (5,10,15,20,30,50) |
| Rampage Mode | 5 | enter, heartbeat, wind loop, exit |
| Music | 12 | menu (2), gameplay (7), rampage, ending (2) |
| Voice Announcer | 32 | Arabic callouts with reverb |

## Key Features

### Sound Pooling
8 instances per frequently-used sound type to avoid GC pauses:
- Footsteps, knife hits, stabs, kills, screams

### Random Pools for Variety
```typescript
const KILL_SOUNDS = [KILL_SPLAT, KILL_CRUNCH, KILL_SQUISH];
const KNIFE_STAB_SOUNDS = [KNIFE_STAB_1...KNIFE_STAB_8];
const SCREAM_SOUNDS = [SCREAM_1...SCREAM_20];
```

### Combo-Scaled Volume
```typescript
function comboVolume(base: number, combo: number): number {
  const scale = 1 + Math.min(combo / 50, 1) * 0.5; // Up to 1.5x
  return Math.min(base * scale, 1.0);
}
```

### Music Ducking
Big impacts temporarily reduce music volume:
```typescript
audioManager.duck(0.2, 1.0); // Duck to 20% for 1 second
```

### Rampage Mode
Cop voice lines auto-muted during rampage via `gameAudio._inRampage` flag.

## API Usage

### GameAudio (High-Level)
```typescript
// Movement
gameAudio.playFootstep(isRunning);
gameAudio.playJump();

// Attacks - all melee uses playStab()
gameAudio.playStab(combo);  // Random from 8 variations

// Kills
gameAudio.playKill('cop', combo);  // Random sound + scream + blood
gameAudio.playRoadkill(combo);

// Vehicles
gameAudio.startVehicleEngine(entityId, tier);
gameAudio.updateVehicleEngine(entityId, speed, maxSpeed);
gameAudio.stopVehicleEngine(entityId);

// Music (random from pools)
gameAudio.playMenuMusic();      // 2 tracks
gameAudio.playGameplayMusic();  // 7 tracks
gameAudio.playRampageMusic();
gameAudio.playEndingMusic();    // 2 tracks
```

### AudioManager (Low-Level)
```typescript
audioManager.play(SoundId.KILL_SPLAT, {
  volume: 0.8,
  pitch: 1.1,        // Playback rate
  loop: false,
  instanceId: 'unique_id',  // For stopping later
  useReverb: true,   // Voice announcer effect
  maxDuration: 1.2,  // Auto-stop after duration
});

audioManager.stop('instance_id', fadeTime);
audioManager.startEngineLoop(entityId, soundId);
audioManager.updateEngineLoop(entityId, speed, maxSpeed);
```

## Adding New Sounds

1. Add to `SoundId` enum in `sounds.ts`
2. Add path to `SOUND_PATHS` object
3. Add to appropriate pool in `GameAudio.ts` if needed
4. Create semantic method in `GameAudio.ts`

## Known Gaps

- Some SoundIds missing file paths (COP_PUNCH_1-5, SCREAM_19-20, etc.)
- 3D spatial audio only used for crowd sounds
- No loading progress indicator (10s timeout prevents hang)

## Performance Notes

- Pool size: 8 instances per pooled sound
- Music crossfade: 1 second
- Ducking decay: 4.0 units/second
- Loading timeout: 10 seconds
