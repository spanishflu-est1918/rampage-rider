# Cop Escalation Mechanics

Complete reference for the cop spawning, heat system, wanted levels, and AI behaviors.

---

## Quick Reference: Tunable Parameters

All values are in `src/constants.ts` unless otherwise noted.

### Heat System

| Parameter | Value | Location | Description |
|-----------|-------|----------|-------------|
| `HEAT_MAX` | 100 | `SCORING_CONFIG` | Maximum heat level |
| `HEAT_PER_PED_KILL` | 10 | `SCORING_CONFIG` | Heat gained per pedestrian kill (on foot) |
| `HEAT_PER_COP_KILL` | 25 | `SCORING_CONFIG` | Heat gained per cop kill |
| `HEAT_PER_MOTORBIKE_COP_KILL` | 30 | `SCORING_CONFIG` | Heat gained per motorbike cop kill |
| `HEAT_PER_MOTORBIKE_PED_KILL` | 15 | `SCORING_CONFIG` | Heat gained per pedestrian kill (on motorbike) |
| Heat decay rate | 0.5/sec | `Engine.ts:1690` | Passive heat reduction per second |

### Wanted Stars (Controls Attack Type)

| Stars | Cop Kills Required | Attack Type |
|-------|-------------------|-------------|
| 0 | 0 | Punch only |
| 1 | 1+ | Taser enabled |
| 2 | 3+ | Shooting enabled |

**Location**: `WANTED_STARS` in constants.ts

### Foot Cop Config

| Parameter | Value | Description |
|-----------|-------|-------------|
| Health | 3 | Knife hits to kill |
| Speed | 6.5 | Units/sec (player sprint: 7.0) |
| Max count | 3 | Maximum simultaneous foot cops |
| Spawn at 25% heat | 1 cop | First spawn threshold |
| Spawn at 50% heat | 2 cops | Second spawn threshold |
| Spawn at 75% heat | 3 cops | Maximum spawn threshold |
| Spawn radius | 15-20 | Units from player |

**Location**: `COP_CONFIG`, `CopManager.ts`

### Foot Cop Attacks

| Attack | Range | Damage | Cooldown | Stars Required |
|--------|-------|--------|----------|----------------|
| Punch | 1.5 | 10 | 1.5s | 0 |
| Taser | 6.0 | 15 (stun) | 2.0s | 1 |
| Shoot | 8.0 | 20 | 1.0s | 2 |

**Location**: `ATTACK_CONFIG`

### Bike Cop Config

| Parameter | Value | Description |
|-----------|-------|-------------|
| Health | 4 | Hits to kill |
| Speed | 11 | Units/sec (player bike: 14) |
| Max count | 2 | Maximum simultaneous bike cops |
| Spawn at 25% heat | 1 cop | First threshold |
| Spawn at 50% heat | 2 cops | Maximum |
| Spawn cooldown | 3.0s | Time between spawns |
| Ram range | 2.0 | Attack distance |
| Ram damage | 10 | Damage per ram |
| Ram cooldown | 1.5s | Time between rams |

**Location**: `BikeCopManager.ts`, `BikeCop.ts`

### Motorbike Cop Config

#### Variants

| Variant | Health | Speed | Ram Damage | Points | Max Count | Heat Threshold |
|---------|--------|-------|------------|--------|-----------|----------------|
| Scout | 2 | 12 | 15 | 40 | 2 | 25% |
| Swarm | 2 | 14 | 20 | 50 | 6 | 50% |
| Boss | 5 | 16 | 35 | 150 | 1 | 75% |

**Total max**: 8 motorbike cops (2 scouts + 6 swarm + 1 boss)

#### AI Distances

| Parameter | Value | Description |
|-----------|-------|-------------|
| `PATROL_DISTANCE` | 100 | Beyond this: zig-zag patrol |
| `CHASE_DISTANCE` | 20 | Within this: aggressive pursuit |
| `RAM_DISTANCE` | 8 | Within this: ram attack |
| `RAM_HIT_DISTANCE` | 2.5 | Actual damage range |

#### Attacks

| Attack | Range | Damage | Cooldown | Stars Required |
|--------|-------|--------|----------|----------------|
| Ram | 2.5 | 15-35 | 2.0s | Any |
| Taser | 8.0 | 0 (stun) | 3.0s | 1 |
| Shoot | 12.0 | 15 | 1.5s | 2 |

#### Spawn Patterns

| Variant | Spawn Position |
|---------|---------------|
| Scout | 40 units **behind** player |
| Swarm | Flanking positions (sides) |
| Boss | 25 units **ahead** of player |

**Location**: `MOTORBIKE_COP_CONFIG`

### Cop Car Config

| Parameter | Value | Description |
|-----------|-------|-------------|
| Health | 3 | Hits to destroy |
| Speed | 20 | Units/sec (sedan: 15, truck: 24) |
| Max count | 3 | Maximum cop cars |
| Heat threshold | 50% | Minimum heat to spawn |
| Spawn cooldown | 5.0s | Time between spawns |
| Spawn distance | 50 | Units behind player |
| Ram range | 5.0 | Attack distance |
| Ram damage | 25 | Heavy damage |
| Ram cooldown | 2.0s | Time between rams |
| Points | 100 | Score per kill |

**Special**: Truck can **trample** cop cars instantly (6 unit radius)

**Location**: `COP_CAR_CONFIG`

---

## Cop Types by Player Tier

| Player Tier | Active Cop Types | Notes |
|-------------|-----------------|-------|
| FOOT | Foot cops only | Max 3 |
| BIKE | Bike cops only | Max 2 |
| MOTO | Motorbike cops | Max 8 (scouts + swarm + boss) |
| SEDAN | Motorbike cops + Cop cars | Max 8 + 3 |
| TRUCK | Motorbike cops + Cop cars | Truck tramples cop cars |

---

## Escalation Flow

```
KILLS
  │
  ├──► HEAT (0-100)
  │      │
  │      ├── 25% ──► Tier 1 cops spawn (1 foot/bike/scout)
  │      ├── 45% ──► 2 swarm bikes start appearing
  │      ├── 50% ──► Cop cars unlock (SEDAN/TRUCK tier only)
  │      ├── 55% ──► Full 6-bike swarm unlocks
  │      └── 75% ──► Boss level cops spawn (3 foot, boss motorbike)
  │
  └──► COP KILLS ──► WANTED STARS (0-2)
                        │
                        ├── 0 stars ──► Punch attacks
                        ├── 1 star  ──► Taser attacks (stun + QTE)
                        └── 2 stars ──► Shooting attacks
```

### Heat: Controls QUANTITY (how many cops)
### Stars: Controls QUALITY (how cops attack)

---

## AI Behaviors

### Foot Cops
- **AI**: Yuka seek behavior (direct path to player)
- **Movement**: Kinematic position sync, instant rotation
- **Attack pattern**: Stop → face player → animate → deal damage
- **Hit stun**: 0.6s freeze when damaged

### Bike Cops
- **AI**: Yuka seek with ram focus
- **Movement**: 11 units/sec (slower than player bike)
- **Attack pattern**: Close to 2.0 units → ram with punch animation
- **Hit stun**: 0.6s

### Motorbike Cops
- **AI**: State machine with 4 states

| State | Distance | Behavior |
|-------|----------|----------|
| PATROL | >100 units | Zig-zag pattern, sine wave offset |
| CHASE | 8-100 units | Aggressive weaving, flanking attempts |
| RAM | <8 units | Direct approach, 50% speed boost |
| STUNNED | - | Velocity = 0, 0.8s duration |

- **Special**: Wave clear mechanic - 20 second respite when all killed

### Cop Cars
- **AI**: Simple seek behavior
- **Movement**: 20 units/sec (fast but catchable)
- **Attack pattern**: Ram at 5 unit range
- **Hit stun**: 1.0s (longest)

---

## Special Mechanics

### Bike Cop Sprint Burst
- **Trigger**: When within 10 units of player
- **Effect**: Boost speed to 15 units/sec (faster than player bike at 14)
- **Purpose**: Creates catch-up mechanic for close-range engagements

### Sedan Chip Damage vs Cop Cars
- **Damage**: 1 damage per second to cop cars within 4m radius
- **Effect**: Non-lethal hits show metal spark particles
- **Purpose**: Sedan can gradually weaken pursuing cop cars

### Bicycle Attack Behavior
- **Movement requirement**: Can attack while stationary or moving
- **Attack range**: Same as on-foot melee (4.5 unit radius, 180° cone)

---

## Pursuit System

When `totalCops > 0`:
- `stats.inPursuit = true`
- **Points doubled** via `PURSUIT_MULTIPLIER: 2`
- Pursuit UI indicators activate

---

## Damage System

### Player → Cops

| Method | Target | Damage | Notes |
|--------|--------|--------|-------|
| Knife attack | Foot cops | 1 | 4.5 unit radius, 180° cone |
| Vehicle collision | Pedestrians | 1 | Radius varies by vehicle |
| Motorbike shoot | All | 1 | 10 unit radius, 60° cone |
| Truck trample | Cop cars | Instant kill | 6 unit radius |

### Cops → Player

| Attack | On Foot | In Vehicle |
|--------|---------|------------|
| Punch | 10 damage | Vehicle takes damage |
| Taser | Stun + QTE | No effect (immunity) |
| Shoot | 20 damage | Vehicle takes damage |
| Ram | - | Vehicle damage (2x for motorbike ram) |

### Truck Directional Shielding
- **Front**: Immune to damage
- **Sides/Back**: Takes normal damage
- Calculated via dot product of truck forward vector vs attack direction

---

## Visual Effects

### Attack Effects
- **Taser beam**: 3-point line with jitter, yellow emissive, 20fps update
- **Bullet projectile**: Shared geometry, 40-50 units/sec travel speed

### Death Effects
- **Foot cops**: Flash white → death animation → 2s fade
- **Vehicle cops**: Flash white → flip animation → fade
  - Bike: 400ms flip, 1.5 unit height
  - Motorbike: 500ms flip, 2 unit height
  - Cop car: 600ms double-flip, 3 unit height

---

## Performance Notes

- **Separation behavior**: Disabled for foot cops (O(n²) cost), enabled for motorbike cops (fewer units)
- **Object pooling**: Pre-allocated vectors reused every frame
- **Shared resources**: Bullet geometry/material shared across all cops
- **LOD**: Taser beam updates at 20fps instead of 60fps

---

## File Locations

| System | File | Key Lines |
|--------|------|-----------|
| Heat/Scoring config | `src/constants.ts` | 523-530 |
| Attack config | `src/constants.ts` | 131-152 |
| Wanted stars | `src/constants.ts` | 543-546 |
| Motorbike cop config | `src/constants.ts` | 344-405 |
| Cop car config | `src/constants.ts` | 410-441 |
| Foot cop manager | `src/managers/CopManager.ts` | 51-76 (spawn logic) |
| Bike cop manager | `src/managers/BikeCopManager.ts` | 44-76 |
| Motorbike cop manager | `src/managers/MotorbikeCopManager.ts` | 82-188 |
| Cop car manager | `src/managers/CopCarManager.ts` | 42-73 |
| Engine cop orchestration | `src/core/Engine.ts` | 1855-1912 |
| Wanted stars calculation | `src/core/Engine.ts` | 1112-1120 |
| Heat decay | `src/core/Engine.ts` | 1689-1691 |
