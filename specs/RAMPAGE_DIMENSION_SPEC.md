# Rampage Dimension - Visual Effect Spec

## Overview

When the player reaches a high combo threshold and enters "Rampage Mode", the game world transforms into an abstract anime-style battle dimension. The environment fades away, replaced by a stark void with dramatic visual effects. Only the player, enemies, and victims remain visible.

This is a **sustained effect** that lasts for the entire duration of Rampage Mode.

---

## The Vision

Think Mob Psycho 100's ???% mode or Dragon Ball Z Super Saiyan transformations - reality itself bends to reflect the player's power. The Christmas market dissolves. Buildings vanish. What remains is pure, stylized violence in an abstract space.

---

## Visual Components

### 1. Environment Dissolution
- All environment objects (buildings, stalls, floor, decorations, lamp posts) fade out or snap to invisible
- Background changes to stark **white** (or configurable - could be black for different feel)
- Player, enemies, pedestrians, and blood effects remain fully visible and unchanged

### 2. Radial Rays
- Red rays emanate outward from the player's position
- Rays should pulse/animate - not static
- Screen-space effect (follows camera, not world position)

### 3. Speed Lines  
- Classic anime speed lines radiating from center of screen
- Varying lengths, slight animation
- Semi-transparent, shouldn't obscure gameplay

### 4. Lightning/Electricity (Optional)
- Occasional lightning crackles across the screen
- Or: small electrical arcs around the player character
- Should feel like raw power, not a storm

### 5. Bloom/Glow
- Increased bloom effect during Rampage Mode
- Player and kills should feel "hot" and glowing

---

## Transition

### Entering Rampage Mode
- Quick transition (~500ms)
- Environment dissolves/fades out
- Effects ramp up from 0 to full intensity
- Should feel like a dramatic "snap" into the dimension

### Exiting Rampage Mode  
- Reverse transition (~500ms)
- Effects fade out
- Environment fades back in
- Return to normal gameplay seamlessly

---

## Triggers

- **Entry**: When combo count reaches Rampage threshold (currently 10+ kills)
- **Exit**: When Rampage Mode ends (combo timer expires)
- Should integrate with existing Rampage Mode state in the combo system

---

## Constraints

- Must maintain **60fps** - this is sustained for 10-30+ seconds
- Player models stay as-is (low-poly look preserved)
- Blood effects and combat feedback should remain visible
- UI/HUD remains visible and unchanged
- Don't break existing gameplay - this is purely visual

---

## Implementation Hints

- Use Three.js render layers to selectively hide environment
- Screen-space shaders for rays/speed lines (very performant)
- `pmndrs/postprocessing` library for bloom (merges passes, better than vanilla)
- GPU-instanced particles if adding energy aura
- Shadertoy has reference implementations for speed lines and lightning

---

## Reference Material

- **Mob Psycho 100** - ???% mode (exact effect we want)
- **Dragon Ball Z** - SSJ2 Gohan transformation  
- **Kill la Kill** - Berserker Ryuko (Episode 12)
- **Shadertoy** - "Anime Speed Lines" (shadertoy.com/view/DldfWj)

---

## Priority

Effects in order of importance:
1. Environment fade to void (core effect - required)
2. Radial red rays (high impact, cheap to render)
3. Speed lines (classic anime feel)
4. Bloom increase (polish)
5. Lightning (nice to have)

---

## Success Criteria

- [ ] Environment completely hidden during Rampage Mode
- [ ] Player and enemies clearly visible against void
- [ ] At least rays OR speed lines implemented
- [ ] Smooth transitions in/out
- [ ] No frame drops below 60fps
- [ ] Feels fucking amazing
