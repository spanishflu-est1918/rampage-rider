# Rampage Rider - Changelog

All notable changes and completed implementations are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [2024-11-25]

### Performance Optimizations

**Fixed:**
- **Building shadow geometry leak** - Shadows now properly dispose geometry on reposition
  - Previously: Shadow geometries accumulated as player moved (49→90 geometry count)
  - Now: Old shadow geometry disposed before creating new one
  - Location: `BuildingManager.repositionBuilding()` (line 206-212)

**Added:**
- **InstancedMesh for pedestrian blob shadows** - Reduced 40+ draw calls to 1
  - Created `InstancedBlobShadows.ts` - Manages all shadows in single InstancedMesh
  - Index pool system reserves/releases shadow slots efficiently
  - Each pedestrian updates its shadow index position per frame
  - Impact: **-40 draw calls** for typical pedestrian count

**Performance Impact:**
```
Before:
- Draw calls: 60-100 (1 per pedestrian shadow)
- Geometry count: Growing from 49→90 over time
- FPS: 115-125

After:
- Draw calls: ~20-60 (all pedestrian shadows batched)
- Geometry count: Stable (no leak)
- Expected FPS: 120-135
```

**Future Optimizations:**
- Extend instanced shadows to Player/Cop entities (-2 draw calls)
- InstancedMesh for pedestrian models (requires animation batching, -40 draw calls)
- Share pedestrian geometries instead of SkeletonUtils.clone (-150k triangles)

**Files Created:**
- `src/rendering/InstancedBlobShadows.ts`

**Files Modified:**
- `src/managers/BuildingManager.ts` - Fixed shadow geometry disposal
- `src/entities/Pedestrian.ts` - Uses instanced shadows instead of individual meshes
- `src/managers/CrowdManager.ts` - Creates InstancedBlobShadows manager

---

### Christmas Market World Theme

**Added:**
- **Christmas market stalls** replace procedural buildings
  - Imported German Christmas Market GLB model (optimized from 54MB to 11MB)
  - 512x512 texture compression for web performance
  - Stalls arranged in grid pattern with 90° rotation to face streets
  - Physics colliders adjusted for rotated model dimensions

- **Roof transparency effect** - Roofs fade as player approaches
  - Fade from opaque at 12 units to transparent at 5 units
  - Targets `lambert1` mesh (snow on roof) by name
  - Cloned materials for independent opacity per building
  - Proper disposal of cloned materials on building removal

- **Cobblestone ground texture** (Polyhaven `cobblestone_floor_04`)
  - Color, normal, roughness, and AO maps
  - Tiled 50x50 across the ground plane

- **Christmas lights rendering system** (`ChristmasLights.ts`)
- **Lamp post decorations** (`LampPostManager.ts`)

- **Camera tilt** - Z-axis rotation (-0.15 rad) for better building visibility

**Fixed:**
- Roof mesh detection - uses name matching instead of bounding box height
- Building collider dimensions swapped to match 90° rotation
- Uniform grid spacing (both axes same) for consistent layout
- Google Fonts @import moved to top of CSS (PostCSS error fix)

**Files Created:**
- `src/rendering/ChristmasLights.ts`
- `src/managers/LampPostManager.ts`
- `public/assets/props/christmas-market.glb`
- `public/assets/textures/cobblestone/` (color, normal, roughness, ao)

**Files Modified:**
- `src/managers/BuildingManager.ts` - Complete rewrite for GLB models
- `src/core/Engine.ts` - Camera tilt, lighting adjustments
- `src/index.css` - Font import order fix

---

### Vehicle Attack System

**Added:**
- **Bicycle melee attack** (`handleBicycleAttack()`)
  - 270° wide attack arc (hits both sides)
  - 3.0 unit radius, can hit 2 targets (unlimited at 10+ combo)
  - Custom messages: "BIKE SLASH!", "CYCLE SLAUGHTER!"
  - 12 base points per kill
  - Uses horizontal slice animation, returns to seated pose

- **Motorbike drive-by shooting** (`handleMotorbikeShoot()`)
  - Hitscan attack with 10 unit range, 60° forward cone
  - 15 base points per kill (+ pursuit bonus)
  - 75 points for cop kills (COP KILLER!)
  - Custom messages: "DRIVE-BY!", "DRIVE-BY TERROR!"
  - Larger panic radius (15 units) for gunshots
  - Screen shake feedback on all shots
  - Uses Throw animation

- **Sedan** has no attack - just running over pedestrians

**Fixed:**
- **Space bar not working in vehicles** - ActionController was returning NONE when `isInVehicle=true`, blocking all vehicle attacks. Now returns ATTACK regardless of vehicle state.
- **Bicycle excluded from collision kills** - Only melee attack works for bicycle
- **Bicycle speed increased** from 10 to 14 (2x sprint speed)

**Files Modified:**
- `src/core/Engine.ts` - Added vehicle attack handlers, routing logic
- `src/core/ActionController.ts` - Fixed ATTACK routing for vehicles
- `src/entities/Player.ts` - Added `playBicycleAttack()`, `playMotorbikeShoot()`
- `src/entities/Vehicle.ts` - Added `getRotationY()` method
- `src/constants.ts` - Increased bicycle speed

---

### Vehicle Physics Improvements

**Added:**
- **Acceleration/deceleration physics**
  - Vehicles gradually accelerate to max speed (15 units/s²)
  - Decelerate with friction when not accelerating (20 units/s²)
  - Renamed `speed` → `maxSpeed` for clarity
  - `getVelocity()` returns actual current velocity

- **Wheel rotation animation** for bicycle
  - Finds wheel parts (tire, spokes) when loading model
  - Rotates wheels around Y axis based on velocity
  - Rotation speed calculated from distance/wheelRadius

- **Model optimizations**
  - Bicycle compressed from 3.8MB to 2.1MB with quantization
  - Auto-centering based on bounding box

**Files Modified:**
- `src/entities/Vehicle.ts` - Acceleration physics, wheel rotation, velocity tracking

---

### Player Animation System

**Added:**
- **Spawn_Air animation** on game start
  - Player drops from sky (Y=12) with gravity physics
  - `playSpawnAnimation()` with physics-based drop
  - `playAnimationWithCallback()` for one-shot animations

- **Seated pose for bikes/motorbikes**
  - Uses `Melee_Blocking` animation (arms forward like handlebars)
  - `updateAnimations()` method updates mixer while in vehicle
  - Adjusted rider offsets: bicycle Z=-0.6, motorbike Z=-0.5

**Fixed:**
- Animation not playing in vehicle (mixer wasn't updating)
- Restored working boxman.glb from commit 662dbb2 after Blender export corrupted animation data

**Files Modified:**
- `src/entities/Player.ts` - Spawn animation, seated pose, vehicle animation updates

---

### Multi-Vehicle System

**Added:**
- **Three vehicle tiers**: Bicycle (0 kills) → Motorbike (10 kills) → Sedan (25 kills)
- **Vehicle spawning** at configurable kill milestones
- **Notification system** unified for vehicle unlocks
- **SHIFT to enter vehicles** (prevents accidental entry)
- **Vehicle selector** for testing different vehicles

**Fixed:**
- Vehicle entry now works correctly
- Prevent spawn while already driving
- Car spawns at correct position relative to player

**Files Modified:**
- `src/core/Engine.ts` - Multi-vehicle support, spawn logic
- `src/constants.ts` - Vehicle configurations and milestones
- `src/components/UI/VehicleSelector.tsx` - Debug UI

---

## [2024-11-24]

### Combat System Overhaul

**Added:**
- **Directional cone-based attacks** - 90° forward arc, must face victims
- **Attack movement lock** - Player stops during attack animations
- **Maxed-out combo system** - One kill at a time normally, unlimited at 10+ combo
- **Particle-to-decal blood system** - Ultrakill-inspired blood splatter
  - 30 burst + 20 directional spray particles per kill
  - DecalGeometry for persistent floor blood
  - 5 procedural blood texture variations
  - Dark blood aesthetic (almost black)

**Fixed:**
- Player attack lock bug - Timer-based completion instead of event listener
- Pedestrians sinking through floor - Y-axis constrained to 0
- Dead body collision - Colliders disabled on death

**Files Created:**
- `src/rendering/ParticleSystem.ts`
- `src/rendering/BloodDecalSystem.ts`

---

### Police & Heat System

**Added:**
- **Police chase system** with Yuka pursuit AI
- **Heat mechanics** - Escalating police response
- **Cop attacks**: Taser stun + bullet damage
- **Taser escape mechanic** - Mash SPACE to break free (flashing UI)
- **Taser beam visual effect** - Bright yellow line to player
- **Bullet projectile visuals**

**Files Created:**
- `src/entities/Cop.ts`
- `src/managers/CopManager.ts`
- `src/rendering/TaserBeam.ts`

---

### Driveable Car System

**Added:**
- **Car unlocked at 10 kills** (later changed to multi-vehicle)
- **Monster truck model** replaced sedan
- **Car kills pedestrians on contact** then knocks bodies flying
- **Ragdoll physics** for dead pedestrians
- **SPACE as universal action button** (attack/enter vehicle/escape taser)

**Fixed:**
- Car direction and facing
- Building collision with vehicles
- Knockback physics for hit pedestrians

**Files Modified:**
- `src/core/Engine.ts` - Car system integration
- `src/entities/Vehicle.ts` - Created vehicle class

---

### UI & Visual Polish

**Added:**
- **2D snow overlay** effect
- **Dead body cleanup** system (despawn after time)
- **Panic kill bonus** - Extra points for killing panicked pedestrians
- **Neon glow** on kill notifications
- **Full-screen backgrounds** on menu and game over
- **Wider BUSTED card** for game over

**Fixed:**
- Font flash (FOUT) by preloading Google Font
- Loading overlay removed from GameCanvas

**Performance:**
- Optimized particle and blood decal systems
- Optimized KillNotifications component
- Fixed pedestrian memory leaks with AssetLoader and shared textures

---

### Code Quality & Refactoring

**Added:**
- `src/utils/AnimationHelper.ts` - Shared animation utilities
- `src/core/ActionController.ts` - Context-based input routing
- `src/core/Preloader.ts` - Asset and physics preloading

**Changed:**
- **AssetLoader standardization** - All entities use cache, not fresh GLTFLoader
- **Constants consolidation** - All magic numbers moved to `constants.ts`:
  - `SKIN_TONES`, `ENTITY_SPEEDS`, `PHYSICS_CONFIG`
  - `ATTACK_CONFIG`, `HIT_STUN`, `COP_CONFIG`
  - `PEDESTRIAN_CONFIG`, `TASER_CONFIG`
- **Animation DRY** - All entities use AnimationHelper

**Files Modified:**
- `src/entities/Cop.ts` - Uses AssetLoader, constants, AnimationHelper
- `src/entities/Player.ts` - Uses AssetLoader, constants
- `src/entities/Pedestrian.ts` - Uses constants, AnimationHelper

---

## [2024-11-23]

### Phase 2.2 - Jump, Sprint, Attack Mechanics

**Added:**
- Jump with gravity physics (force: 5, gravity: -15)
- Inverted sprint (sprint default, Shift to walk)
- Attack input system (F key → later SPACE)

**Animation State Machine:**
1. Attack (highest)
2. Jump
3. Sprint (default movement)
4. Run/Walk (Shift held)
5. Idle (lowest)

---

### Phase 2.1 - Basic Player Movement

**Added:**
- `src/entities/Player.ts` with Sketchbook movement system
- Camera-relative WASD movement for isometric view
- Boxman.glb character with animations
- Smooth camera follow with lerp
- Ground grid for reference

---

### Phase 1 - Core Engine Foundation

**Added:**
- `src/core/Engine.ts` - Three.js + Rapier integration
- `src/core/PhysicsWorld.ts` - Rapier wrapper
- `src/core/AIManager.ts` - Yuka AI wrapper
- Orthographic camera at (10, 25, 10)
- Collision groups system
- 8bitcn retro UI components

---

## Project Setup - [2024-11-23]

- Vite + React + TypeScript
- Three.js v0.181.2
- Rapier v0.11.2
- Yuka v0.7.1
- Tailwind CSS v4
- shadcn/ui + 8bitcn registry

---

## Notes

- This changelog tracks all implementation details
- Each feature includes files created/modified
- Breaking changes noted when applicable
