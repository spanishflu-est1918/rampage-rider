# Gameplay Tuning Reference

Master reference for all tunable game parameters. All values in `src/constants.ts` unless noted.

---

## Quick Reference: Key Numbers

| System | Parameter | Value | Effect |
|--------|-----------|-------|--------|
| Combo | Threshold | 10 | Unlimited kills at 10+ combo |
| Combo | Duration | 5.0s | Time to get next kill |
| Heat | Max | 100 | Controls cop spawn intensity |
| Heat | Decay | 0.5/s | Passive heat reduction |
| Stars | 1 star | 1 cop kill | Cops use tasers |
| Stars | 2 stars | 3 cop kills | Cops shoot |

---

## 1. Score & Progression

### Tier Unlock Thresholds

| Tier | Score Required | Vehicle |
|------|---------------|---------|
| FOOT | 0 | - |
| BIKE | 150 | Bicycle |
| MOTO | 1200 | Motorbike |
| SEDAN | 4000 | Monster Truck |
| TRUCK | 10000 | 18-Wheeler |

**Location**: `TIER_CONFIGS` (lines 10-56)

### Points Per Kill

| Target | Base | During Pursuit (2x) | Panic + Pursuit (4x) |
|--------|------|---------------------|---------------------|
| Pedestrian (foot) | 10 | 20 | 40 |
| Pedestrian (bike) | 12 | 24 | 48 |
| Pedestrian (moto) | 15 | 30 | 60 |
| Pedestrian (roadkill) | 15 | 30 | 60 |
| Foot Cop | 50 | 100 | - |
| Motorbike Cop | 75 | 150 | - |
| Cop Car | 100 | 200 | - |

**Location**: `SCORING_CONFIG` (lines 506-530)

### Multipliers

| Multiplier | Value | Trigger |
|------------|-------|---------|
| Pursuit | 2x | Any cops active |
| Panic | 2x | Kill fleeing pedestrian |
| Combo (UI) | 1.0-6.0x | Visual only (not score) |

---

## 2. Combo System

| Parameter | Value | Effect |
|-----------|-------|--------|
| `COMBO_DURATION` | 5.0 | Seconds to maintain combo |
| `COMBO_THRESHOLD_UNLIMITED` | 10 | Unlocks unlimited kills |

### Combo → Max Kills

| Combo Level | Knife | Bicycle | Motorbike | Vehicle |
|-------------|-------|---------|-----------|---------|
| 0-9 | 1 | 2 | 5 | ∞ |
| 10-14 | **∞** | **∞** | 8 | ∞ |
| 15+ | **∞** | **∞** | **∞** | ∞ |

**Note**: Motorbike blast now scales with combo (5 base → 8 at 10+ → ∞ at 15+).

---

## 3. Heat System

### Heat Generation

| Action | Heat Gain |
|--------|-----------|
| Pedestrian kill (foot) | +10 |
| Pedestrian kill (moto) | +15 |
| Cop kill | +25 |
| Motorbike cop kill | +30 |
| Building destruction | +50 |

### Heat Decay

- Rate: **0.5 per second** (passive in combat)
- **Idle decay**: **1.5 per second** (3x) after 10+ seconds without kills
- Location: `Engine.ts:1776-1780`

### Heat → Cop Spawns

| Heat Level | Foot Cops | Bike Cops | Moto Cops | Cop Cars |
|------------|-----------|-----------|-----------|----------|
| 0-24% | 0 | 0 | 0 | 0 |
| 25-49% | 1 | 1 | Scouts (2) | 0 |
| 50-74% | 2 | 2 | +Swarm (6) | 3 |
| 75-100% | 3 | 2 | +Boss (1) | 3 |

**Note**: Cop types depend on player vehicle tier.

---

## 4. Wanted Stars

### Star Thresholds

| Stars | Cop Kills Required | Cop Behavior |
|-------|-------------------|--------------|
| 0 | 0 | Punch (1.5 range, 10 dmg) |
| 1 | 1+ | Taser (6.0 range, stun) |
| 2 | 3+ | Shoot (8.0 range, 20 dmg) |

**Star Decay**: Stars decrease by 1 every 45 seconds without cop kills.

**Location**: `WANTED_STARS` (lines 543-546)

---

## 5. Attack Parameters

### Knife (Foot)

| Parameter | Value |
|-----------|-------|
| Ped radius | 2.5 |
| Cop radius | 4.5 |
| Cone angle | 180° |
| Max kills | 1 (∞ at 10+ combo) |
| Panic radius | 10 |
| Panic freeze | 0.6s (deer-in-headlights) |

### Bicycle Melee

| Parameter | Value |
|-----------|-------|
| Radius | 3.0 |
| Cone angle | 270° |
| Max kills | 2 (∞ at 10+ combo) |
| Panic radius | 12 |

### Motorbike Blast

| Parameter | Value |
|-----------|-------|
| Blast radius | 6.0 |
| Blast force | 12 |
| Max kills | 5 base (8 at 10+, ∞ at 15+) |
| Panic radius | 15 |

### Vehicle Roadkill

| Vehicle | Kill Radius | Min Speed |
|---------|-------------|-----------|
| Bicycle | 1.5 | 1 |
| Motorbike | 2.0 | 1 |
| Sedan | 3.5 | 1 |
| Truck | 5.0 (box) | 0 (kills stationary) |

---

## 6. Cop Configuration

### Foot Cops

| Parameter | Value |
|-----------|-------|
| Health | 3 hits |
| Speed | 7.2 u/s |
| Max count | 3 |
| Spawn radius | 15-20 units |

### Bike Cops

| Parameter | Value |
|-----------|-------|
| Health | 4 hits |
| Speed | 11 u/s |
| Max count | 2 |
| Ram damage | 10 |
| Spawn cooldown | 3.0s |

### Motorbike Cops

| Variant | Health | Speed | Ram Damage | Points | Heat Threshold |
|---------|--------|-------|------------|--------|----------------|
| Scout | 2 | 12 | 15 | 40 | 25% |
| Swarm | 2 | 14 | 20 | 50 | 50% |
| Boss | 5 | 16 | 35 | 150 | 75% |

**Max total**: 8 (2 scouts + 6 swarm + 1 boss)

### Cop Cars

| Parameter | Value |
|-----------|-------|
| Health | 3 hits |
| Speed | 20 u/s |
| Max count | 3 |
| Ram damage | 25 |
| Heat threshold | 50% |
| Spawn cooldown | 5.0s |

---

## 7. Vehicle Stats

| Vehicle | Speed | Health | Kill Radius | Special |
|---------|-------|--------|-------------|---------|
| Bicycle | 14 | 50 | 1.5 | - |
| Motorbike | 18 | 100 | 2.0 | Blast attack |
| Sedan | 15 | 150 | 3.5 | Ragdoll |
| Truck | 24 | 300 | 5.0 | Destroys buildings |

### Truck Special

- **Directional shielding**: Front 90° immune, sides/back vulnerable
- **Tramples cop cars**: 6 unit radius instant kill
- **Building destruction**: Collides and destroys buildings

---

## 8. Player Stats

| Tier | Max Health | Speed Multiplier |
|------|------------|------------------|
| FOOT | 50 | 1.0x (8 u/s) |
| BIKE | 75 | 1.5x |
| MOTO | 100 | 2.2x |
| SEDAN | 150 | 3.0x |
| TRUCK | 300 | 2.5x |

---

## 9. Timing & Cooldowns

| Action | Duration/Cooldown |
|--------|-------------------|
| Combo timer | 5.0s |
| Knife attack | ~0.5s animation |
| Taser stun | Until escape (mash space) |
| Cop hit stun | 0.6s |
| Motorbike cop stun | 0.8s |
| Cop car stun | 1.0s |
| Ram cooldown (bike cop) | 1.5s |
| Ram cooldown (moto/car) | 2.0s |
| Wave respite (moto cops) | 20s after all killed |

---

## 10. Tuning Recommendations

### Make Game Easier

- Lower `COMBO_THRESHOLD_UNLIMITED` from 10 → 5
- Increase `COMBO_DURATION` from 5.0 → 7.0
- Increase attack radii by 25-50%
- Reduce cop spawn thresholds

### Make Game Harder

- Raise `COMBO_THRESHOLD_UNLIMITED` to 15
- Reduce `COMBO_DURATION` to 3.0
- Increase cop health values
- Reduce heat decay rate

### More Kills During Rampage

- Add combo scaling to motorbike blast
- Increase pedestrian spawn density (max 60 → 100)
- Add explicit "rampage mode" at 20+ combo with bonus effects
- Increase attack radii during high combo

### Balance Cop Difficulty

- Adjust heat generation per kill type
- Tune cop spawn cooldowns
- Modify ram damage values
- Change wanted star thresholds

---

## File Locations Summary

| System | File | Lines |
|--------|------|-------|
| Tier configs | `constants.ts` | 10-56 |
| Attack configs | `constants.ts` | 462-500 |
| Scoring | `constants.ts` | 506-530 |
| Wanted stars | `constants.ts` | 543-546 |
| Cop configs | `constants.ts` | 163-441 |
| Vehicle configs | `constants.ts` | 236-316 |
| Collision groups | `constants.ts` | 570-580 |
| Combo decay | `Engine.ts` | 1760-1764 |
| Heat decay | `Engine.ts` | 1689-1691 |
| Tier progression | `Engine.ts` | 820-867 |

---

## Related Documentation

- [COP_ESCALATION.md](./COP_ESCALATION.md) - Detailed cop system reference
- [RAMPAGE_ESCALATION.md](./RAMPAGE_ESCALATION.md) - Combo and character state details
