# Cop Attack System Improvements

## Current Issues

1. **Cops not dealing damage** - Punching animation plays but no damage is applied to player
2. **Cops too weak** - Die in 1 hit, should require 2-3 hits minimum
3. **Heat level not visible** - Player can't see current heat level in UI
4. **No taser effect** - Medium heat (50-75%) should have electric visual effect when tasing
5. **No taser stun mechanic** - Player should be immobilized when tased
6. **No escape mechanic** - Player should be able to button-mash Space to escape taser

## Implementation Plan

### 1. Fix Cop Damage System
**Problem:** Cops stop at attack range and play animation, but `handlePlayerCollisions()` only checks 1.0 unit radius. Punch range is 1.5 units, so punching cops never touch player.

**Solution:**
- Modify `handlePlayerCollisions()` to check against cop's current attack range based on heat
- OR: Keep collision at 1.0 but make cops move closer when attacking

**File:** `src/managers/CopManager.ts`

---

### 2. Increase Cop Health
**Current:** Cops have 1 HP (one-shot kill)

**Change:**
- Increase cop health to 2-3 HP
- This means knife (1 damage) requires 2-3 hits

**File:** `src/entities/Cop.ts` - line ~31

---

### 3. Add Heat Display to UI
**Add heat meter to HUD showing current heat level**

**Implementation:**
- Add heat bar/indicator to Overlay component
- Show heat percentage with visual indicator
- Use 8bitcn styling to match retro aesthetic

**File:** `src/components/UI/Overlay.tsx`

---

### 4. Add Taser Electric Effect
**When cop tases (50-75% heat), show electric particle effect**

**Implementation:**
- Create electric particle effect in ParticleEmitter
- Trigger effect when cop is in taser range and attacking
- Blue/white crackling electricity visual

**Files:**
- `src/rendering/ParticleSystem.ts` - add electric effect
- `src/entities/Cop.ts` - trigger effect during taser attack

---

### 5. Implement Taser Stun Mechanic
**Player should be immobilized when tased**

**Implementation:**
- Add `isTased` state to Player
- When cop tases at medium heat, set player stunned
- Disable player movement input while stunned
- Show visual indicator (screen shake, electric overlay)

**Files:**
- `src/entities/Player.ts` - add stun state
- `src/core/Engine.ts` - handle taser stun application

---

### 6. Add Button-Mash Escape Mechanic
**Player mashes Space to build escape meter and break free from taser**

**Implementation:**
- Add escape meter (0-100%)
- Each Space press adds 10-15% to meter
- Meter decays slowly over time
- When meter hits 100%, player breaks free
- Show escape progress bar on screen
- Visual feedback for each button press

**Files:**
- `src/entities/Player.ts` - escape meter logic
- `src/components/UI/Overlay.tsx` - escape meter UI
- `src/core/Engine.ts` - handle Space key mashing

---

## Implementation Order

1. Fix cop damage (immediate - cops should damage player)
2. Increase cop health (quick fix)
3. Add heat display to UI (player needs to see heat level)
4. Implement taser stun mechanic (core gameplay)
5. Add button-mash escape (polish on stun mechanic)
6. Add electric visual effect (visual polish)
