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

## Phase 2: Entity System

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
- [x] Add attack input system (F key)
- [x] Create animation priority system
- [x] Implement vertical velocity tracking
- [x] Add ground detection

### 2.3 Base Entity Class
- [ ] Create Entity base class with physics + AI + mesh sync
- [ ] Implement position/rotation synchronization
- [ ] Set up collision group management
- [ ] Add entity lifecycle methods (spawn, update, destroy)

### 2.4 Player Entity Enhancement
- [ ] Refactor Player to extend Entity base class
- [ ] Add mount/dismount system
- [ ] Implement combat system (damage, hitboxes)
- [ ] Create player state machine
- [ ] Add health system

### 2.5 Pedestrian Entities
- [ ] Create Pedestrian base class
- [ ] Implement wandering AI behavior
- [ ] Add flee behavior when player nearby
- [ ] Create procedural humanoid mesh generation
- [ ] Add ragdoll physics on death

### 2.6 Police Entities
- [ ] Create Cop base class with chase behavior
- [ ] Implement pursuit AI with Yuka steering
- [ ] Add shooting mechanics
- [ ] Create police vehicle entities (cop cars, helicopters)
- [ ] Implement escalation system

---

## Phase 3: World & Rendering

### 3.1 Camera System
- [ ] Create CameraController with smooth follow
- [ ] Implement zoom based on vehicle tier
- [ ] Add camera shake effects
- [ ] Optimize frustum for performance

### 3.2 Procedural World Generation
- [ ] Implement infinite chunk system
- [ ] Create road/building generation
- [ ] Add procedural decoration (trees, props)
- [ ] Implement chunk loading/unloading
- [ ] Optimize mesh instancing

### 3.3 Visual Enhancements
- [ ] Enhance procedural humanoid materials
- [ ] Add particle effects (explosions, debris)
- [x] Implement blood/damage effects (particle-to-decal system with DecalGeometry)
- [ ] Create vehicle damage visualization
- [ ] Add environmental effects (fire, smoke)

---

## Phase 4: Vehicle System

### 4.1 Vehicle Base Class
- [ ] Create Vehicle entity base
- [ ] Implement vehicle physics (different from foot)
- [ ] Add acceleration/braking/steering
- [ ] Create damage system
- [ ] Implement vehicle-specific collision handling

### 4.2 Vehicle Tiers
- [ ] Motorcycle (Tier 1)
- [ ] Sports Car (Tier 2)
- [ ] SUV (Tier 3)
- [ ] Pickup Truck (Tier 4)
- [ ] Taxi (Tier 5)
- [ ] Bus (Tier 6)
- [ ] Fire Truck (Tier 7)
- [ ] Ambulance (Tier 8)
- [ ] Ice Cream Truck (Tier 9)
- [ ] Tank (Tier 10)

### 4.3 Vehicle Integration
- [ ] Implement vehicle spawning system
- [ ] Add tier unlock mechanics
- [ ] Create tier selection dialog
- [ ] Implement modifier selection system

---

## Phase 5: Combat & Progression

### 5.1 Combat Mechanics
- [ ] Implement melee combat (foot)
- [ ] Add vehicle ramming mechanics
- [ ] Create projectile system
- [ ] Add combo system with timer
- [ ] Implement kill streak tracking

### 5.2 Progression System
- [ ] Create tier unlock conditions
- [ ] Implement modifier system (3 choices per tier)
- [ ] Add score multiplier calculation
- [ ] Create persistent modifiers
- [ ] Implement meta-progression (if time)

### 5.3 Heat System
- [ ] Implement heat level calculation
- [ ] Create police escalation tiers
- [ ] Add visual heat indicators
- [ ] Implement heat decay over time

---

## Phase 6: Audio & Polish

### 6.1 Audio System
- [ ] Integrate audio library (Howler.js)
- [ ] Add engine sounds per vehicle
- [ ] Implement environmental audio
- [ ] Create combat sound effects
- [ ] Add music system with intensity scaling

### 6.2 UI/UX Polish
- [ ] Complete HUD with all stats
- [ ] Add tier unlock animations
- [ ] Create settings menu
- [ ] Implement pause system
- [ ] Add game over screen with stats

### 6.3 Performance Optimization
- [ ] Profile and optimize physics
- [ ] Implement LOD system for meshes
- [ ] Optimize particle effects
- [ ] Add quality settings
- [ ] Implement object pooling

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

**Last Updated:** November 23, 2024

**Current Phase:** Phase 2 - Player Movement Complete (2.1, 2.2 ✅) → Next: Entity Base Class (2.3)

**Completed:**
- Phase 1: Core engine, AI manager, UI system, type fixes ✅
- Phase 2.1: Basic player movement with Sketchbook system ✅
- Phase 2.2: Jump, sprint, and attack mechanics ✅

**Player Features Implemented:**
- Camera-relative WASD movement for isometric view
- Kinematic Rapier physics with capsule collider
- Boxman character model with animations (idle, run, sprint, jump_running)
- Jump mechanic with gravity physics (Space key)
- Sprint mechanic with 1.75x speed (Shift key)
- Attack input system placeholder (F key)
- Smooth camera follow with lerp
- Animation priority system

**Next Up:**
- Phase 2.3: Entity base class for all game objects
- Phase 2.4: Refactor Player to use Entity base
