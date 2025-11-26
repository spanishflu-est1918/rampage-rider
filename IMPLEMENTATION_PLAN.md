# Rampage Rider - Implementation Plan

This document outlines the complete implementation roadmap for Rampage Rider. When tasks are completed, they are moved to CHANGELOG.md with implementation details.

---

## Phase 1: Core Engine & Foundation ✅

### 1.1 Core Engine with Rapier Physics ✅
- [x] Create Engine.ts with Three.js + Rapier integration
- [x] Implement async WASM initialization for Rapier
- [x] Set up orthographic camera for isometric view (10, 25, 10)
- [x] Configure lighting and shadows
- [x] Create test ground for physics validation

### 1.2 Yuka AI Manager Integration ✅
- [x] Create AIManager.ts wrapper around Yuka
- [x] Integrate EntityManager and Time systems
- [x] Add AI update to main game loop
- [x] Set up entity management methods

### 1.3 UI System with 8bitcn Components ✅
- [x] Install and configure shadcn/ui with Tailwind v4
- [x] Install 8bitcn retro component library
- [x] Configure @/ path aliases
- [x] Convert all UI to use 8bitcn components
- [x] Set up retro "Press Start 2P" font

### 1.4 Type System Fixes ✅
- [x] Fix GameStats interface (add combo, comboTimer, gameTime, health)
- [x] Resolve PhysicsWorld type errors (commented out unused method)
- [x] Migrate 8bitcn components to modern React type imports
- [x] Fix all component prop interfaces (children, onClick, value)
- [x] Zero TypeScript errors

---

## Phase 2: Entity System ✅

### 2.1 Basic Player Movement System ✅
- [x] Create Player class with Sketchbook movement system
- [x] Load boxman.glb character model
- [x] Implement camera-relative WASD movement
- [x] Add idle and run animation system
- [x] Implement smooth camera follow
- [x] Add ground grid for reference
- [x] Fix shadow positioning at feet

### 2.2 Jump, Sprint, and Attack Mechanics ✅
- [x] Implement jump with gravity physics
- [x] Add sprint with Shift key (1.75x speed)
- [x] Add attack input system (F key / Space context)
- [x] Create animation priority system
- [x] Implement vertical velocity tracking
- [x] Add ground detection

### 2.3 Pedestrian Entities ✅
- [x] Create Pedestrian class with physics
- [x] Implement wandering AI behavior (Yuka)
- [x] Add flee behavior when player nearby (panic system)
- [x] Load humanoid models from pedestrian asset library
- [x] Add ragdoll physics on death (knockback velocity)
- [x] Implement object pooling for pedestrians

### 2.4 Police Entities ✅
- [x] Create Cop class with chase behavior
- [x] Implement pursuit AI with Yuka steering
- [x] Add melee combat (punch at 0 stars)
- [x] Add taser mechanics (1 star)
- [x] Add shooting mechanics (2+ stars)
- [x] Create MotorbikeCop entity with variants (Scout, Swarm, Boss)
- [x] Implement cop spawning based on heat level

---

## Phase 3: World & Rendering ✅

### 3.1 Camera System ✅
- [x] Create smooth camera follow with lerp
- [x] Implement camera shake effects
- [x] Add camera optimization (skip updates when player stationary)

### 3.2 Procedural World Generation ✅
- [x] Implement BuildingManager with procedural buildings
- [x] Create road layout system
- [x] Add LampPostManager for street lighting
- [x] Add Christmas lights decoration system
- [x] Implement chunk-based building loading/unloading

### 3.3 Visual Enhancements ✅
- [x] Create BlobShadow system (performance-optimized fake shadows)
- [x] Implement InstancedBlobShadows for pedestrians
- [x] Add ParticleSystem for blood effects
- [x] Implement BloodDecalSystem with ground decals
- [x] Add Christmas string lights across streets

---

## Phase 4: Vehicle System ✅

### 4.1 Vehicle Base Class ✅
- [x] Create Vehicle entity base with physics
- [x] Implement vehicle physics (kinematic character controller)
- [x] Add acceleration/braking/steering
- [x] Create damage system (vehicle health)
- [x] Implement vehicle-specific collision handling
- [x] Add wheel rotation animation

### 4.2 Vehicle Tiers ✅
- [x] Bicycle (Tier BIKE) - Speed 14, agile handling
- [x] Motorbike (Tier MOTO) - Speed 18, good handling
- [x] Monster Truck/Sedan (Tier SEDAN) - Speed 15, causes ragdoll

### 4.3 Vehicle Integration ✅
- [x] Implement vehicle spawning system
- [x] Add tier unlock mechanics (kill milestones: 10, 40, 110)
- [x] Create mount/dismount system (Enter car action)
- [x] Implement rider positioning per vehicle
- [x] Add vehicle-specific attacks (bicycle swing, motorbike shoot)

---

## Phase 5: Combat & Progression ✅

### 5.1 Combat Mechanics ✅
- [x] Implement melee combat (foot) - Attack locks movement during animation
- [x] Add vehicle ramming mechanics (kill radius per vehicle)
- [x] Create projectile system (cop bullets, player motorbike shooting)
- [x] Add combo system with timer (5s timer, unlimited at 10+ combo)
- [x] Implement taser escape mechanic (mash Space to escape)

### 5.2 Heat System ✅
- [x] Implement heat level calculation (increases with kills)
- [x] Create police escalation tiers (foot cops → motorbike cops)
- [x] Add visual heat indicators (wanted stars)
- [x] Implement cop attack escalation (punch → taser → shoot)
- [x] Configure motorbike cop spawn thresholds

### 5.3 Progression System (Partial)
- [x] Create tier unlock conditions (kill milestones)
- [ ] Implement modifier system (3 choices per tier)
- [ ] Add score multiplier calculation
- [ ] Create persistent modifiers
- [ ] Implement meta-progression (if time)

---

## Phase 6: Audio & Polish

### 6.1 Audio System
- [ ] Integrate audio library (Howler.js)
- [ ] Add engine sounds per vehicle
- [ ] Implement environmental audio
- [ ] Create combat sound effects
- [ ] Add music system with intensity scaling

### 6.2 UI/UX Polish
- [x] HUD with health, heat, combo, score
- [x] Cop health bars (projected to screen space)
- [ ] Add tier unlock animations
- [ ] Create settings menu
- [ ] Implement pause system
- [ ] Add game over screen with stats

### 6.3 Performance Optimization ✅
- [x] Profile and optimize physics
- [x] Implement animation LOD (skip distant entity animations)
- [x] Optimize particle effects (Points instead of Sprites)
- [x] Add blob shadows (cheaper than shadow maps)
- [x] Implement object pooling (pedestrians)
- [x] Fix per-frame allocations across all entities
- [x] Optimize taser beam updates

---

## Phase 7: Testing & Balance

### 7.1 Gameplay Testing
- [ ] Balance vehicle stats
- [ ] Tune AI difficulty
- [ ] Adjust tier unlock progression
- [ ] Balance modifier effects
- [ ] Test combat feel

### 7.2 Bug Fixes
- [ ] Fix collision edge cases
- [ ] Resolve physics glitches
- [ ] Fix AI pathfinding issues
- [ ] Address performance bottlenecks

---

## Phase 8: Deployment

### 8.1 Build & Deploy
- [ ] Optimize production build
- [ ] Set up deployment pipeline
- [ ] Create game page/marketing
- [ ] Add analytics (optional)
- [ ] Deploy to hosting platform

---

## Current Status

**Last Updated:** November 26, 2024

**Current Phase:** Phase 6 - Audio & Polish

**Completed:**
- Phase 1: Core engine, AI manager, UI system ✅
- Phase 2: Complete entity system (Player, Pedestrians, Cops, MotorbikeCops) ✅
- Phase 3: World generation and rendering systems ✅
- Phase 4: Full vehicle system with 3 tiers ✅
- Phase 5: Combat, heat system, tier progression ✅
- Phase 6.3: Performance optimization ✅

**Gameplay Features Implemented:**
- Camera-relative WASD movement for isometric view
- Multiple vehicle tiers (Foot → Bicycle → Motorbike → Monster Truck)
- Kill-based tier progression
- Heat/wanted system with escalating police response
- Foot cops (punch/taser/shoot based on wanted level)
- Motorbike cops (Scout, Swarm, Boss variants)
- Combo system with timer
- Taser escape mechanic
- Blood particles and ground decals
- Festive Christmas lights

**Next Up:**
- Audio system (sounds, music)
- UI polish (tier animations, settings, pause)
- Game balance tuning
