# Animation Implementation Plan

## Overview
This document outlines planned animation improvements for the boxman character.

---

## 1. Game Start Animation
- **Animation:** `Spawn_Air`
- **When:** Beginning of game on scene load
- **Notes:** Player spawns with dramatic air landing

---

## 2. Vehicle Entry Animations

### Bicycle & Motorbike
- **Entry Animation:** `Jump_Full_Short` (hop onto seat)
- **Transition to:** Seated pose (see below)

### Car/Truck
- **Entry Animation:** `Interact` (open door motion)
- **Then:** Hide player (enclosed vehicle)

### Implementation Notes:
- Block player movement during entry animation
- Attach player to vehicle after animation completes
- Need `playAnimationWithCallback` method in Player.ts

---

## 3. Seated Pose (Bicycle & Motorbike)

### Pose
- **Animation:** `Melee_Blocking` (NOT the Seated_Bike we created)
- **Position:** Character positioned slightly lower (adjust Y offset down)
- **Notes:** This gives the correct handlebar grip pose

### Attack While Seated
- **Animation:** `Melee_Block_Attack`
- **Question:** Is attacking while seated currently built? (Need to verify)

---

## 4. Bicycle Gameplay
- **Speed:** Faster than on foot (but slower than motorbike)
- **Combat:** Must stab enemies (cannot trample with bicycle)
- **Kill method:** Melee only, no collision kills

---

## 5. Melee Attack Animations

### Primary Attacks (On Foot)
| Animation | Use Case |
|-----------|----------|
| `Melee_1H_Attack_Chop` | Stabbing motions (current attack) |
| `Melee_2H_Attack_Chop` | Heavy attack variant |
| `Melee_2H_Attack_Slice` | Slice attack variant |

### Notes:
- All look great, consider rotation/variety system

---

## 6. Implementation Checklist

- [ ] Add `playAnimationWithCallback` to Player.ts
- [ ] Add animation lock during vehicle entry
- [ ] Implement `Spawn_Air` on game start
- [ ] Change seated pose from `Seated_Bike` to `Melee_Blocking`
- [ ] Adjust rider Y offset for `Melee_Blocking` pose
- [ ] Implement `Jump_Full_Short` entry for bikes
- [ ] Implement `Interact` entry for cars
- [ ] Add `Melee_Block_Attack` for seated combat
- [ ] Verify/implement attacking while seated on bike
- [ ] Set bicycle speed (faster than foot, no trample kills)

---

## Files to Modify
- `src/entities/Player.ts` - Animation methods, callbacks
- `src/core/Engine.ts` - Vehicle entry flow, game start
- `src/constants.ts` - Bicycle speed values
- `public/assets/boxman.glb` - May not need Seated_Bike anymore (using Melee_Blocking)
