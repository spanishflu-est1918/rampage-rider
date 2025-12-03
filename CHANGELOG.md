# Rampage Rider - Changelog

All notable changes and completed implementations are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [2024-12-03]

### Vehicle Cops Dismount on Tier Change

**Added:**
- **Cop dismounting system**: When player's vehicle is destroyed or tier changes, all vehicle cops (bike, moto, car) dismount and pursue on foot
- `despawnCopsFromTier()` method in `Engine.ts` to handle cop tier transitions
- `spawnCopAt()` method in `CopManager.ts` to spawn foot cops at specific positions

**Implementation:**
- When vehicle destroyed: All vehicle cops collect positions, clear from scene, spawn as foot cops at those positions
- Uses existing object pool system to avoid memory leaks
- No limit on dismounted cops (allows pressure to build when vehicle destroyed)
- Vehicle cops properly transition to foot pursuit

**Files Modified:**
- `src/core/Engine.ts` - Added dismount logic in `exitVehicle()` and `switchToAwaitingVehicle()`
- `src/managers/CopManager.ts` - Added `spawnCopAt()` for positional spawning

**Behavior:**
- Destroy bike → bike cops dismount and chase on foot
- Destroy moto → all vehicle cops (moto, bike) dismount
- Destroy car → all vehicle cops (car, moto, bike) dismount
- Upgrade tiers → cops from previous tier dismount

---

## [2024-12-03]

### Motorbike Model Fix

**Fixed:**
- **Motorbike Y-axis positioning bug**: Model was unresponsive to `modelOffsetY` changes due to nested Sketchfab transforms with -90° X rotation baked into child nodes
- **Root cause**: GLTF had `Sketchfab_model` child node with `translation: [0, 0.3, 0]` and `-90° X rotation` that transformed Y offsets into Z movement
- **Solution**: Re-exported model in Blender with flattened hierarchy and applied transforms
  - Cleared parent relationships (Alt+P → Keep Transform)
  - Applied all transforms (Ctrl+A → All Transforms)
  - Positioned wheels at Y=0, centered on X/Z
  - Rotated to face correct direction (-Z forward)

**Changed:**
- `modelScale`: 0.0045 → 1.0 (model now game-scale, ~2m tall)
- `modelOffsetY`: 0.6 → -0.01 (wheels at ground level)
- `modelRotationY`: 0 (rotation baked into model)
- `riderOffsetY`: 0.5 → 1.0 (adjusted for new bike scale)
- `COP_BIKE_CONFIG`: Same scale/offset updates
- `MotorbikeCop.ts` rider scale: 0.0035 → 0.9 (proportional to new bike)

**Files Modified:**
- `public/assets/vehicles/motorbike.glb` - Clean re-export from Blender
- `public/assets/vehicles/motorbike.meshopt.glb` - Regenerated with draco compression
- `src/constants.ts` - MOTORBIKE and COP_BIKE_CONFIG values
- `src/entities/MotorbikeCop.ts` - Rider scale and position

---

## [2024-12-02]

### Cop Escalation Balance & Code Quality

**Changed:**
- **Foot cop speed**: 7.2 → 6.5 (slightly slower than player sprint 7.0)
- **Motorbike cop shoot range**: 15 → 12 (gives player more reaction time)
- **Heat cliff staggered**: Previously everything unlocked at 50% heat
  - 45%: 2 swarm bikes start appearing
  - 50%: Cop cars unlock
  - 55%: Full 6-bike swarm unlocks

**Added:**
- **Bike cop sprint burst**: When within 10 units of player, bike cops boost to speed 15 (faster than player bike at 14), making them threatening in close range
- **Sedan chip damage vs cop cars**: Sedan now deals 1 damage per second to cop cars within 4m radius
  - Full kill feedback: large camera shake, blood particles, "COP CAR WRECKED!" notification
  - Non-lethal hit feedback: small camera shake + metal spark particles
- **Metal spark particle effect**: Yellow/orange/white-hot sparks for sedan vs cop car collisions
  - Short-lived (0.3-0.6s), fast-moving particles
  - Helps players see progress on cop car HP

**Fixed:**
- **Import path casing**: All `components/UI/` imports normalized to lowercase `components/ui/`
- **TypeScript literal type error**: `blastMaxKills` now typed as `number` to allow Infinity assignment

**Files Modified:**
- `src/constants.ts` - Speed values, heat thresholds, sedan chip damage config
- `src/entities/BikeCop.ts` - Sprint burst mechanic
- `src/managers/MotorbikeCopManager.ts` - Staggered swarm spawning
- `src/managers/CopCarManager.ts` - damageInRadius returns hit count
- `src/core/Engine.ts` - Sedan chip damage logic, spark effect call
- `src/rendering/ParticleSystem.ts` - `emitSparks()` method
- `src/App.tsx`, `src/index.css`, `src/components/ui/*` - Import casing fixes

### ESLint Setup

**Added:**
- **ESLint flat config** with TypeScript and React hooks support
- Rules: `no-explicit-any: error`, `no-unused-vars` with underscore ignore, `no-console` warn, `exhaustive-deps: error`

**Fixed:**
- 27+ lint errors across 16 files (unused vars, missing dependencies, console statements)

**Files Created:**
- `eslint.config.js`

**Files Modified:**
- `package.json` - Added lint scripts and ESLint dependencies

### Designer Feedback Tuning Pass (PR #3)

**Changed:**
- **Bike→Moto threshold**: 2000 → 1200 score (faster progression)
- **Motorbike blast scaling**: 5 base kills → 8 at 10+ combo → unlimited at 15+ combo
- **Heat decay**: 3x faster after 10s of no kills (rewards aggression, forgives breaks)
- **Wanted stars decay**: -1 star every 45s (escapable if patient)

**Added:**
- **Panic freeze**: 0.6s freeze before pedestrians flee (gives player reaction time)
- **Combo milestone announcer**: "5X COMBO!", "10X RAMPAGE!", etc.
- **Slow-mo on tier unlock**: 0.3s time dilation effect
- **Scaled score popups**: Size increases with combo multiplier
- **Crowd surge**: Extra pedestrians spawn after tier unlock (more targets to celebrate)

**Files Created:**
- `docs/COP_ESCALATION.md` - Police system design doc
- `docs/GAMEPLAY_TUNING.md` - Balance values reference
- `docs/GAME_OVERVIEW.md` - Game mechanics overview
- `docs/RAMPAGE_ESCALATION.md` - Progression system design

**Files Modified:**
- `src/constants.ts` - Threshold and timing tweaks
- `src/core/Engine.ts` - Slow-mo, announcer, decay logic
- `src/entities/Pedestrian.ts` - Panic freeze behavior
- `src/managers/CrowdManager.ts` - Crowd surge spawning
- `src/components/UI/NotificationSystem.tsx` - Scaled popups

---

## [2024-11-28]

### UI & Pedestrian Improvements

**Added:**
- **Screenshot mode toggle**: Button in top-right corner (📷/👁) hides/shows entire UI for clean screenshots
- **Idle pedestrians at building corners**: 5% of pedestrians stand idle near building corners instead of wandering
  - Uses Victory or Jump animations randomly
  - Positioned at building corners accounting for 90° rotation
  - Face away from buildings (into the street)

**Changed:**
- `setIdleBehavior()` now accepts optional animation parameter

**Files Modified:**
- `src/components/UI/Overlay.tsx` - Added screenshot mode toggle button
- `src/managers/CrowdManager.ts` - Added idle pedestrian spawning at building corners
- `src/entities/Pedestrian.ts` - Updated setIdleBehavior signature

---

### German Biergarten Tables - Festive Overhaul

**Added:**
- **Festive table decorations**: center lantern with candle, beer mugs with handles, pretzel plates, Christmas string lights with poles
- **Table pedestrian rocking animation**: forward/backward swaying motion (rotation.x), 50% play Victory animation, 50% play Idle
- **Physics colliders for tables**: player/vehicles can no longer pass through tables
- **Table pedestrian tracking**: separate Set tracks which pedestrians belong to tables (not respawned as wanderers when killed)

**Fixed:**
- **Double-spawn bug**: Table pedestrians were spawning twice when player walked near tables
- **Table respawn timing**: Tables now use BuildingManager-style pooling system instead of destroy/recreate
  - 2 table instances are created once and repositioned as player moves
  - Same hysteresis logic as buildings: `playerGridX > baseX + 2` or `playerGridX < baseX`
  - Only tables that leave the 2x2 area are repositioned (others stay put)
  - Pedestrians are properly removed from scene before new ones spawn

**Technical Details:**
- `tableInstances` array stores mesh, physics body, grid position, and associated pedestrians
- `createTableInstance()` creates new table with mesh, physics, and pedestrians
- `repositionTable()` moves existing table (reuses mesh/body, respawns pedestrians)
- `repositionTablesToBase()` uses BuildingManager pattern - only moves out-of-bounds tables
- `spawnTablePedestriansForInstance()` returns pedestrian array for instance tracking

**Files Modified:**
- `src/managers/CrowdManager.ts` - Complete table system rewrite with pooling
- `src/entities/Pedestrian.ts` - Added festive behavior (setFestiveBehavior, updateFestiveSway)

---

## [2024-11-27]

### ESC to Pause

**Added:**
- ESC key toggles pause state
- Pause overlay shows "PAUSED" with "Press ESC to resume"
- Game loop stops when paused (no physics/entity updates)

**Files Modified:**
- `src/components/GameCanvas.tsx` - Added `onPauseToggle` prop, ESC key handler
- `src/App.tsx` - Added `togglePause` callback, PAUSED state UI overlay

### Vehicle Switching Fix

**Fixed:**
- Player can now switch from current vehicle to awaiting vehicle while riding
- Added `SWITCH_VEHICLE` action type (separate from `ENTER_CAR`)
- ActionController now checks `isNearAwaitingVehicle` context

**Files Modified:**
- `src/core/ActionController.ts` - Added `SWITCH_VEHICLE` action, `isNearAwaitingVehicle` context
- `src/core/Engine.ts` - Updated action handling to use new SWITCH_VEHICLE action

### 18-Wheeler Truck Tier

**Added:**
- **New Tier: TRUCK (Tier 5)** - "Road Destroyer"
  - Unlocks at 10,000 score
  - Speed: 12 (slow but unstoppable)
  - Turn speed: 2.5 (very wide turns - it's an 18-wheeler!)
  - Health: 300 (tank-level)
  - Kill radius: 5.0 (massive)
  - **DESTROYS BUILDINGS!**

- **VehicleType.TRUCK** - New vehicle type with config
  - Model path: `/assets/vehicles/truck.glb` (needs model file)
  - Large collider: 1.5 × 1.2 × 4.0 (long boi)

- **Building destruction mechanic**
  - Truck collisions check against buildings
  - Destroyed buildings hide for 5 seconds, then respawn
  - 500 base points per building destroyed
  - Big camera shake (5.0 intensity)
  - Massive particle explosion (200 particles)
  - +50 heat per building
  - Messages: "DEMOLISHED!", "WRECKED!", "CRUSHED!", "LEVELED!", "OBLITERATED!"

- **Debug selector updated** - Truck icon (🚛) added

**Score Thresholds (Updated):**
- BIKE: 150 score
- MOTO: 1000 score
- SEDAN: 4000 score
- TRUCK: 10000 score

**Files Modified:**
- `src/types.ts` - Added `Tier.TRUCK`
- `src/constants.ts` - Added `VehicleType.TRUCK`, `TIER_CONFIGS[Tier.TRUCK]`, `VEHICLE_CONFIGS[VehicleType.TRUCK]`, `TIER_VEHICLE_MAP[Tier.TRUCK]`
- `src/core/Engine.ts` - Added SEDAN→TRUCK progression check, `handleBuildingDestruction()`, truck collision detection
- `src/core/AssetLoader.ts` - Added truck.glb to preload list
- `src/managers/BuildingManager.ts` - Added `getBuildingAtPosition()`, `destroyBuilding()`, `checkTruckCollision()`
- `src/components/UI/VehicleSelector.tsx` - Added truck to debug selector

**TODO:**
- Download 18-wheeler GLB model from Sketchfab (Free Low Poly Vehicles Pack has "Truck with trailer")
- Place at `/public/assets/vehicles/truck.glb`
- Adjust `modelScale` and `modelOffsetY` based on actual model dimensions

---

## [2024-11-26]

### Vehicle Upgrade System

**Added:**
- **Awaiting vehicle system** - Next tier vehicles now spawn separately when milestone is reached
  - When player is in a vehicle and reaches next tier milestone, upgrade spawns nearby
  - Player approaches the glowing vehicle and presses Space to switch
  - Old vehicle remains for 3 seconds before cleanup (performance optimization)

- **Vehicle glow effect** - Awaiting vehicles pulse with cyan-green glow
  - Uses emissive material properties (performant, no extra lights)
  - Pulsing animation: 0.5-1.5 intensity at 3Hz
  - Glow clears when player enters the vehicle
  - Reuses existing damage flash pattern from `Vehicle.flashDamage()`

- **Vehicle switching mechanic**
  - Space key now switches to awaiting vehicle when near (priority over attack)
  - Works for all tier upgrades: BIKE→MOTO, MOTO→SEDAN
  - Smooth transition: exit current vehicle → enter new vehicle
  - Camera shake on vehicle switch

- **Tier progression logic refactor**
  - `checkTierProgression()` - Determines next tier based on current tier (not just kills)
  - First vehicle (BIKE at 10 kills) spawns directly for player to enter
  - Subsequent upgrades spawn as "awaiting" vehicles
  - Prevents double-spawning (checks for existing awaiting vehicle)

**Files Modified:**
- `src/core/Engine.ts` - Added awaiting vehicle system, glow effects, vehicle switching
  - New properties: `awaitingVehicle`, `awaitingVehicleTier`, `awaitingVehicleGlowTime`, `vehiclesToCleanup`
  - New methods: `checkTierProgression()`, `spawnAwaitingVehicle()`, `setVehicleGlow()`, `updateAwaitingVehicleGlow()`, `switchToAwaitingVehicle()`, `updateVehicleCleanup()`, `isPlayerNearAwaitingVehicle()`

- `CLAUDE.md` - Added performance requirement for effects
  - "CRITICAL: All effects must be super performant"
  - "Any new effect must reuse existing patterns"

### Score-Based Tier Progression

**Changed:**
- **Tier unlocks now based on SCORE instead of kills**
  - Score incorporates combo multipliers, pursuit bonuses, kill types
  - Rewards skilled play: maintaining combos, pursuit kills (2x), cop kills (50-75 pts)
  - UI updated to show "pts" remaining instead of "Kills"

**Score Thresholds:**
- BIKE: 150 score (~10 kills with basic combo)
- MOTO: 1000 score (~40 kills with pursuit/combo bonuses)
- SEDAN: 4000 score (~110 kills with high multipliers)

**Files Modified:**
- `src/types.ts` - Changed `TierConfig.minKills` to `TierConfig.minScore`
- `src/constants.ts` - Updated TIER_CONFIGS with score thresholds
- `src/core/Engine.ts` - Updated `checkTierProgression()` to use score
- `src/components/UI/Overlay.tsx` - Updated progress bar and "NEXT UNLOCK" display

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
