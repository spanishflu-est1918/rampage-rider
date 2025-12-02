# Rampage & Escalation States

Complete reference for the combo system, character states, and kill mechanics.

---

## Quick Reference: Kill Potential

| Tier | Attack | Base Max Kills | At 10+ Combo | Kill Radius |
|------|--------|---------------|--------------|-------------|
| FOOT | Knife | 1 | **Infinity** | 2.5 (peds), 4.5 (cops) |
| BIKE | Melee | 2 | **Infinity** | 3.0 |
| MOTO | Blast | 5 | 8 at 10+, **∞** at 15+ | 6.0 |
| SEDAN | Roadkill | Infinity | N/A | 3.5 |
| TRUCK | Roadkill | Infinity | N/A | 5.0 (box) |

---

## Combo System

### Core Mechanics

| Parameter | Value | Location |
|-----------|-------|----------|
| `COMBO_DURATION` | 5.0 seconds | `SCORING_CONFIG` |
| `COMBO_THRESHOLD_UNLIMITED` | 10 | `SCORING_CONFIG` |

### How Combo Works

1. Each kill increments combo counter
2. Timer resets to 5 seconds on each kill
3. Timer counts down every frame
4. When timer hits 0, combo resets to 0
5. **At 10+ combo**: Knife and Bicycle attacks get unlimited kills

### Combo Effects

```
Combo 0-9:   Knife = 1 kill max, Bicycle = 2 kills max
Combo 10+:  Knife = UNLIMITED, Bicycle = UNLIMITED
```

**Code location**: `Engine.ts:1151`
```typescript
const maxKills = this.stats.combo >= cfg.comboThreshold ? Infinity : 1;
```

### Score Multiplier (UI Display)

```
Multiplier = 1 + (min(combo, 50) * 0.1)

Combo 0:  x1.0
Combo 10: x2.0
Combo 50: x6.0 (capped)
```

---

## Tier Progression

### Score Thresholds

| Tier | Name | Min Score | Speed Mult | Max Health |
|------|------|-----------|------------|------------|
| FOOT | Foot Fiend | 0 (start) | 1.0x | 50 HP |
| BIKE | Bike Butcher | 150 | 1.5x | 75 HP |
| MOTO | Moto Maniac | 1200 | 2.2x | 100 HP |
| SEDAN | Sedan Sovereign | 4000 | 3.0x | 150 HP |
| TRUCK | Road Destroyer | 10000 | 2.5x | 300 HP |

**Note**: Progression is **score-based**, not kill-based. Combos and multipliers accelerate progression.

### Tier Unlock Flow

1. Score threshold reached → Vehicle spawns nearby (glowing effect)
2. Player approaches vehicle → "Press SPACE to enter" prompt
3. Player presses SPACE → Enters vehicle, tier changes
4. If already in vehicle → New vehicle becomes "awaiting vehicle"

---

## Attack Configurations

### Knife Attack (FOOT)

| Parameter | Value |
|-----------|-------|
| `pedRadius` | 2.5 units |
| `copRadius` | 4.5 units |
| `damage` | 1 |
| `coneAngle` | 180° (half circle) |
| `maxKills` | 1 (Infinity at 10+ combo) |

### Bicycle Attack (BIKE)

| Parameter | Value |
|-----------|-------|
| `attackRadius` | 3.0 units |
| `damage` | 1 |
| `coneAngle` | 270° (wide arc) |
| `maxKills` | 2 (Infinity at 10+ combo) |

### Motorbike Blast (MOTO)

| Parameter | Value |
|-----------|-------|
| `blastRadius` | 6.0 units |
| `blastForce` | 12 |
| `blastDamage` | 1 |
| `blastMaxKills` | 5 base → 8 at 10+ combo → ∞ at 15+ combo |

### Vehicle Roadkill (SEDAN/TRUCK)

| Parameter | Sedan | Truck |
|-----------|-------|-------|
| Kill radius | 3.5 units | 5.0 units (box) |
| Damage | 999 (instant) | 999 (instant) |
| Max kills | Infinity | Infinity |
| Min speed | 1 unit/s | 0 (kills stationary) |
| Ragdoll | Yes | Yes |
| Building destruction | No | **Yes** |

---

## "Rampage State"

### There Is No Explicit Rampage State

The game does **NOT** have a traditional rampage/berserk mode variable. Instead, "rampage" is an **emergent behavior** when combo reaches 10+.

### Implicit Rampage Indicators

1. **Combo ≥ 10**: Unlimited knife/bicycle kills
2. **inPursuit flag**: 2x score multiplier active
3. **Heat ≥ 75%**: Boss cops spawning

### "RAMPAGE!" Message

The word "RAMPAGE!" appears randomly in kill messages during pursuit - it's just flavor text, not a state trigger.

---

## What Limits Kill Potential

### Current Limiters

1. **maxKills parameter** (combo-dependent for foot/bicycle)
2. **Combo timer** (5 seconds between kills)
3. **Attack radius** (2.5-6.0 units depending on attack)
4. **Cone angle** (directional attacks require facing target)
5. **Entity density** (max 60 pedestrians spawned)
6. **Attack cooldown** (animation duration)

### Per-Tier Limitations

| Tier | Primary Limitation |
|------|-------------------|
| FOOT | Small radius (2.5), single target until 10+ combo |
| BIKE | Must be moving to attack, medium radius |
| MOTO | 5 → 8 at 10+ combo → ∞ at 15+ combo |
| SEDAN | Must be moving (speed > 1) |
| TRUCK | Slow turn speed, large hitbox blocks view |

---

## Proposals: Maximize Kill Potential

### Option 1: Add Combo Scaling to Motorbike ✅ **IMPLEMENTED**

**Current**: Motorbike blast is fixed at 5 max kills regardless of combo.

**Proposal**: Scale motorbike blast with combo:
```typescript
const maxKills = this.stats.combo >= 10 ? Infinity : cfg.blastMaxKills;
```

**Impact**: High combo would allow motorbike to clear entire crowds.

**Status**: Implemented with tiered scaling:
- Base: 5 max kills
- 10+ combo: 8 max kills
- 15+ combo: Unlimited kills

### Option 2: Reduce Combo Threshold

**Current**: 10 kills to reach unlimited mode.

**Proposal**: Lower to 5 or 7.

**Impact**: Easier to maintain rampage state, more forgiving gameplay.

### Option 3: Increase Attack Radii

**Current radii**:
- Knife: 2.5/4.5
- Bicycle: 3.0
- Motorbike blast: 6.0

**Proposal**: Increase by 50%:
- Knife: 3.75/6.75
- Bicycle: 4.5
- Motorbike blast: 9.0

**Impact**: More targets in range per attack.

### Option 4: Add "True Rampage Mode"

**Proposal**: At combo 20+, enter explicit rampage state:
- Visual effect (red glow, screen shake)
- All attacks get +50% radius
- Attack cooldown reduced by 50%
- Duration: 10 seconds, refreshed by kills

**Impact**: Creates distinct power spike above the 10+ combo baseline.

### Option 5: Increase Pedestrian Density ✅ **IMPLEMENTED** (Crowd Surge)

**Current**: Max 60 pedestrians.

**Proposal**: Increase to 100 during high combo/heat.

**Impact**: More targets available, higher potential kill counts.

**Status**: Implemented as tier unlock crowd surge:
- Base pedestrian count: 60
- On tier unlock: Surges to 100 for 15 seconds
- Triggered by BIKE/MOTO/SEDAN/TRUCK unlocks
- Creates dramatic spike in kill opportunities

### Option 6: Add AOE Attacks to Foot/Bike

**Current**: Knife and bicycle are single-target focused.

**Proposal**: Add ground slam attack (separate key) with 360° radius.

**Impact**: Provides crowd-clear option at all tiers.

---

## Score Efficiency Analysis

### Path to Truck (10,000 score)

**Low-skill** (no combos):
- 1000 pedestrians × 10 points = 10,000

**Medium-skill** (some combos + pursuit):
- 500 kills × 20 points (pursuit) = 10,000

**High-skill** (max multipliers):
- 100 cops during pursuit × 100 points = 10,000
- OR: 250 pedestrians × 40 points (panic + pursuit)

### Optimal Strategy

1. Build combo to 10+ early (knife attacks)
2. Maintain combo during vehicle transition
3. Enter pursuit state for 2x multiplier
4. Target panicking pedestrians for 4x total
5. Kill cops when possible (50-100 points each)

---

## Implemented Juice Features

### Combo Milestone Announcements

**Description**: Screen-centered announcements appear at specific combo milestones.

**Thresholds**: 5, 10, 15, 20, 30, 50 combo

**Implementation**:
- Displayed in `ScoreOverlay.tsx`
- Fade-in animation with scaling
- Lasts 2 seconds
- Stacks if multiple milestones reached quickly

### Tier Unlock Slow-Mo Effect

**Description**: Brief time dilation effect when unlocking new tier.

**Parameters**:
- Duration: 0.3 seconds
- Time scale: 0.3x (70% slow-down)
- Triggered on BIKE/MOTO/SEDAN/TRUCK unlock

**Implementation**: Physics time step scaled in `Engine.ts`

### Crowd Surge on Tier Unlock

**Description**: Pedestrian count temporarily increases when unlocking new vehicle.

**Parameters**:
- Base count: 60 pedestrians
- Surge count: 100 pedestrians
- Duration: 15 seconds
- Triggers: BIKE/MOTO/SEDAN/TRUCK unlocks

**Impact**: Creates immediate spike in kill opportunities after tier progression.

### Panic Freeze Mechanic

**Description**: Pedestrians freeze briefly before fleeing when player approaches.

**Parameters**:
- Freeze duration: 0.6 seconds
- Trigger: Player enters detection radius
- Effect: "Deer in headlights" behavior
- State transition: IDLE → FLEE_FREEZE → FLEE_RUN

**Impact**: Makes low-speed attacks easier to land, creates more realistic panic response.

---

## File Locations

| System | File | Key Lines |
|--------|------|-----------|
| Combo config | `src/constants.ts` | 520-521 |
| Attack configs | `src/constants.ts` | 462-500 |
| Tier configs | `src/constants.ts` | 10-56 |
| Combo decay | `src/core/Engine.ts` | 1760-1764 |
| maxKills logic | `src/core/Engine.ts` | 1151 |
| Tier progression | `src/core/Engine.ts` | 820-867 |
| Vehicle collision | `src/core/Engine.ts` | 1873-1923 |
| Score calculation | `src/core/Engine.ts` | 1183-1200 |
