# Rampage Rider - Changelog

All notable changes and completed implementations are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [2024-11-24]

### Blood Effects System - Particle-to-Decal Implementation

**Added:**
- Particle-to-decal blood system inspired by Ultrakill
- Three.js DecalGeometry for persistent floor blood splatters
- Physics-driven blood particle simulation with gravity
- Ground collision detection for particles
- Dark blood aesthetic (very dark red/almost black)

**Particle System (`src/rendering/ParticleSystem.ts`):**
- Blood particles spray from character torso height (0.8-1.2 units)
- 30 burst particles + 20 directional spray particles per kill
- Real physics: initial velocity + gravity (-9.8 m/s²)
- Ground collision detection at y <= 0.05
- Particles removed after spawning decal
- Normal blending (not additive) for dark appearance
- 3 second lifetime to allow particles to fall

**Decal System (`src/rendering/BloodDecalSystem.ts`):**
- Procedurally generated blood textures (5 variations)
- Organic splatter shapes with droplets and streaks
- Dark color palette: rgba(50-80, 0-15, 0-15)
- DecalGeometry projects onto ground mesh
- Proper z-fighting prevention (polygonOffsetFactor: -4)
- Random rotation and sizing for variation
- Max 100 decals for performance (oldest removed when limit reached)

**Integration:**
- Particle ground hit callback triggers decal creation
- Decal size based on particle size
- Blood accumulates on floor as kills increase
- Screen shake (0.5 intensity per kill)
- Pedestrian panic and stumble system

**Visual Flow:**
```
Character → Blood Spray → Particles Fall with Physics → Hit Ground → Decal Spawned → Blood Stays Forever
```

**Files Added:**
- `src/rendering/ParticleSystem.ts` - Particle emitter with collision detection
- `src/rendering/BloodDecalSystem.ts` - DecalGeometry blood splatters

**Files Modified:**
- `src/core/Engine.ts` - Integrated particle and decal systems
- `src/managers/CrowdManager.ts` - Returns kill positions for blood spawning

---

## [2024-11-23]

### Phase 2.2 - Jump, Sprint, and Attack Mechanics

**Added:**
- Jump mechanic with gravity physics
- Inverted sprint system (sprint by default, Shift to walk slowly)
- Attack input system (placeholder implementation)
- Full input key bindings for all movement actions

**Jump System:**
- Jump force: 5 units/second
- Gravity: -15 units/second²
- Ground detection at Y <= 0.57
- Prevents mid-air jumps with grounded check
- Jump animation: `jump_running` with 0.1s fade

**Movement System (Inverted Sprint):**
- Default sprint speed: 7 units/second (character naturally sprints)
- Walk speed: 4 units/second (activated by holding Shift)
- Shift key slows down instead of speeding up
- Sprint animation plays by default when moving
- Walk/run animation plays when Shift held
- Debug logging shows walk state

**Attack System:**
- F key binding for attack input
- Placeholder console logging
- Animation priority: highest (attack > jump > sprint > run > idle)
- Ready for future combat implementation

**Input Bindings:**
- WASD / Arrow Keys: Movement (default = sprint)
- Space: Jump
- Shift (Left/Right): Walk (slows down from sprint)
- F: Attack

**Animation State Machine:**
Priority-based animation system ensures correct animation plays:
1. Attack (highest priority)
2. Jump (jump_running)
3. Sprint (default movement, no Shift)
4. Run/Walk (Shift held)
5. Idle (lowest priority)

**Vertical Physics:**
```typescript
// Jump trigger
if (this.input.jump && this.isGrounded && !this.prevInput.jump) {
  this.verticalVelocity = this.jumpForce;
  this.isGrounded = false;
}

// Gravity application
if (!this.isGrounded) {
  this.verticalVelocity += this.gravity * deltaTime;
}

// Ground check
if (translation.y <= 0.57 && this.verticalVelocity <= 0) {
  this.isGrounded = true;
  this.verticalVelocity = 0;
}

// Apply to rigid body
this.rigidBody.setLinvel(
  { x: velocity.x, y: this.verticalVelocity, z: velocity.z },
  true
);
```

**Files Modified:**
- `src/entities/Player.ts` - Added jump, sprint, attack mechanics
- `src/core/Engine.ts` - Updated input forwarding for all actions
- `src/components/GameCanvas.tsx` - Added attack key binding (F key)
- `src/types.ts` - Added `attack?: boolean` to InputState

**Technical Details:**
- Vertical velocity tracked independently from horizontal movement
- Ground check uses Y position threshold
- Previous input state prevents repeated jump triggers
- Inverted sprint: character naturally fast, Shift slows down to walk speed
- Walk mode only activates when moving (prevents standing walk state)
- Change detection for debug logging (only logs on input changes)

---

## [2024-11-23]

### Phase 2.1 - Basic Player Movement System

**Added:**
- Created `src/entities/Player.ts` - Complete character controller with Sketchbook movement system
- Loaded boxman.glb character model from Sketchbook
- Implemented camera-relative WASD movement for isometric view
- Added idle and run animation system with smooth blending
- Implemented smooth camera follow with lerp
- Added ground grid for spatial reference
- Fixed character shadow positioning

**Player Movement Features:**
- Camera-relative controls (WASD moves relative to camera angle, not world axes)
- Ported Sketchbook movement functions:
  - `getLocalMovementDirection()` - Converts WASD to local vector
  - `getCameraRelativeMovementVector()` - Transforms to camera space
  - `applyVectorMatrixXZ()` - Rotation matrix for XZ plane
- Kinematic Rapier physics body at Y=0 for proper ground contact
- Move speed: 4 units/second

**Animation System:**
- THREE.AnimationMixer integration
- Idle animation when standing still
- Run animation when moving (any direction)
- Smooth 0.1s fade transitions between animations
- Animations update every frame via mixer.update(deltaTime)

**Camera System:**
- Isometric position: (2.5, 6.25, 2.5) - close view
- Frustum size: 7.5 for tight framing
- Smooth follow with 0.1 lerp factor
- Maintains isometric offset while following player
- Always looks at player position

**Visual Improvements:**
- Character spawns at Y=0 for shadow at feet
- Model container offset: Y=-0.57 (Sketchbook structure)
- Ground grid: 50x50 with gray lines (0x444444, 0x333333)
- Grid positioned at Y=0.01 to prevent z-fighting

**Input System:**
- Persistent input state prevents diagonal movement bug
- Per-key state tracking (not replaced on each event)
- Debug logging on input state changes only

**Files Created:**
- `src/entities/Player.ts` - Complete player class with animations
- `public/assets/boxman.glb` - Character model from Sketchbook

**Files Modified:**
- `src/core/Engine.ts` - Added camera follow, closer camera, ground grid
- `src/components/GameCanvas.tsx` - Fixed input handling for diagonals
- `tsconfig.json` - Excluded sketchbook-ref from type checking
- `src/components/ui/8bit/badge.tsx` - Fixed className prop type
- `src/components/ui/8bit/card.tsx` - Fixed className prop type

**Technical Implementation:**
```typescript
// Camera-relative movement (Player.ts:178-202)
private getCameraRelativeMovementVector(): THREE.Vector3 {
  const localDirection = this.getLocalMovementDirection();
  const flatViewVector = new THREE.Vector3(
    this.cameraDirection.x,
    0,
    this.cameraDirection.z
  ).normalize();
  return this.applyVectorMatrixXZ(flatViewVector, localDirection);
}

// Animation switching (Player.ts:227-232)
if (isMoving && this.currentAnimation !== 'run') {
  this.playAnimation('run', 0.1);
} else if (!isMoving && this.currentAnimation !== 'idle') {
  this.playAnimation('idle', 0.1);
}

// Camera follow (Engine.ts:343-357)
const targetCameraPos = new THREE.Vector3(
  playerPos.x + 2.5,
  playerPos.y + 6.25,
  playerPos.z + 2.5
);
this.camera.position.lerp(targetCameraPos, 0.1);
this.camera.lookAt(playerPos.x, playerPos.y, playerPos.z);
```

**Bug Fixes:**
- Fixed diagonal movement - input state now persistent per key
- Fixed shadow gap - character spawns at Y=0, not Y=2
- Fixed TypeScript errors with THREE.Group inheritance using type assertions

---

## [2024-11-23]

### Phase 1.4 - Type System Fixes

**Fixed:**
- GameStats interface - Added missing properties:
  - `health: number` - Player health tracking
  - `combo: number` - Kill combo counter
  - `comboTimer: number` - Combo timeout tracking
  - `gameTime: number` - Total elapsed game time
- PhysicsWorld type errors - Commented out `getContactPairs()` method that used non-existent `forEachContactPair()` in Rapier 0.11.2
- 8bitcn component type definitions - Migrated to modern React type imports

**Changed:**
- All 8bitcn components now use modern `import type { ... } from "react"` pattern instead of `import * as React`
- button.tsx - Added explicit `onClick?: () => void` and used `Omit<ButtonHTMLAttributes, 'ref'>` to avoid conflicts
- badge.tsx - Added modern type imports and `children?: ReactNode` prop
- card.tsx - Added modern type imports and `children?: ReactNode` prop
- progress.tsx - Changed from `React.ComponentProps` to `import type { ComponentProps }`
- health-bar.tsx - Fixed import path and added modern type imports
- mana-bar.tsx - Added modern type imports

**Files Modified:**
- `src/types.ts` - Extended GameStats interface
- `src/core/PhysicsWorld.ts` - Commented out unsupported method
- `src/components/ui/8bit/button.tsx` - Modern type imports + explicit onClick
- `src/components/ui/8bit/badge.tsx` - Modern type imports
- `src/components/ui/8bit/card.tsx` - Modern type imports
- `src/components/ui/8bit/progress.tsx` - Modern type imports
- `src/components/ui/8bit/health-bar.tsx` - Modern type imports + import path fix
- `src/components/ui/8bit/mana-bar.tsx` - Modern type imports

**Technical Details:**
- Using React 19.2.0 with automatic JSX transform (no need to import React namespace)
- All 8bitcn components now properly typed with TypeScript strict mode
- ButtonHTMLAttributes properly inherited with explicit onClick for clarity
- ComponentProps imported directly from "react" instead of React.ComponentProps
- Zero TypeScript errors after fixes

---

### Phase 1.3 - UI System with 8bitcn Components

**Added:**
- Installed and configured shadcn/ui component system
- Installed 8bitcn retro pixel-art component library from custom registry
- Configured `@/` path aliases in tsconfig.json and vite.config.ts
- Imported "Press Start 2P" retro font via retro.css

**Changed:**
- Converted `src/components/ui/Menus.tsx` to use 8bitcn Button, Card, and Badge components
- Converted `src/components/ui/Overlay.tsx` to use 8bitcn HealthBar, Progress, and Badge components
- Updated `src/index.css` to import retro.css globally
- Renamed components directory from `UI/` to `ui/` (lowercase) for consistency

**Components Installed:**
- `@8bitcn/button` - Pixelated buttons with press animation
- `@8bitcn/card` - Retro bordered cards
- `@8bitcn/badge` - Pixel-art badges
- `@8bitcn/health-bar` - Red health display bar
- `@8bitcn/mana-bar` - Customizable stat bar (for heat meter)
- `@8bitcn/progress` - 8-bit progress bars

**Files Modified:**
- `components.json` - Added @8bitcn registry, configured aliases
- `tsconfig.json` - Set `@/*` path alias to `./src/*`
- `src/index.css` - Imported retro.css
- `src/components/ui/Menus.tsx` - Converted to 8bitcn components
- `src/components/ui/Overlay.tsx` - Converted to 8bitcn components
- `src/App.tsx` - Updated imports to lowercase `ui/`

**Technical Details:**
- Path aliases using `@/` work throughout codebase
- Tailwind CSS v4 integration with Vite plugin
- 8bitcn components wrap base shadcn components with retro styling
- Created `src/lib/utils.ts` for `cn()` utility function

---

### Phase 1.2 - Yuka AI Manager Integration

**Added:**
- Created `src/core/AIManager.ts` - Clean wrapper around Yuka AI library
- Integrated EntityManager for AI entity management
- Integrated Time system for delta time tracking
- Added AI update loop to main game engine

**Implementation Details:**
```typescript
// AIManager methods:
- init(): Initialize AI system
- update(deltaTime): Update all AI entities
- addEntity(entity): Register entity with AI system
- removeEntity(entity): Unregister entity
- clear(): Remove all entities
- getEntityCount(): Get active entity count
```

**Integration:**
- Added `ai: AIManager` property to Engine
- Initialize in Engine.init()
- Update in Engine.update() game loop
- Dispose in Engine.dispose()

**Files Created:**
- `src/core/AIManager.ts`

**Files Modified:**
- `src/core/Engine.ts` - Added AI manager integration

---

### Phase 1.1 - Core Engine with Rapier Physics

**Added:**
- Created `src/core/PhysicsWorld.ts` - Wrapper around Rapier physics engine
- Created `src/core/Engine.ts` - Main game orchestrator
- Integrated Three.js for 3D rendering
- Integrated Rapier physics with async WASM initialization
- Set up orthographic camera for isometric view

**Camera Configuration:**
- Position: `(10, 25, 10)` - Closer isometric view than initial attempt
- Frustum size: `25` (reduced from 35 for better perspective)
- Orthographic projection for consistent isometric feel

**Physics Configuration:**
- Gravity: `(0, -9.81, 0)`
- Collision groups using bit flags for selective interactions
- Delta time clamping to prevent physics explosions
- Raycasting support for attack hitboxes

**Rendering:**
- Scene background: `#1a1a1a` (dark gray)
- Fog for depth: `(30, 80)` range
- Ambient light: `0.6` intensity
- Directional light with shadows: `0.8` intensity
- Shadow map size: `2048x2048`

**Test Ground:**
- 50x50 plane geometry
- Lambert material with color `#2a2a2a`
- Receives shadows
- Fixed physics body with cuboid collider

**Files Created:**
- `src/core/PhysicsWorld.ts`
- `src/core/Engine.ts`

**Files Modified:**
- `src/components/GameCanvas.tsx` - Integrated new Engine

**Technical Details:**
- Async initialization required for Rapier WASM loading
- Physics-rendering synchronization
- Proper cleanup in dispose()
- Collision group system for selective interactions

---

## Project Setup - [2024-11-23]

**Added:**
- Initialized fresh Vite + React + TypeScript project
- Installed Three.js v0.181.2 for 3D rendering
- Installed Rapier v0.11.2 for physics simulation
- Installed Yuka v0.7.1 for AI steering behaviors
- Installed Tailwind CSS v4 (no config file approach)
- Configured Git repository
- Created project documentation

**Configuration Files:**
- `vite.config.ts` - Vite configuration with Tailwind v4 plugin
- `tsconfig.json` - TypeScript configuration
- `components.json` - shadcn/ui configuration
- `.gitignore` - Proper exclusions
- `CLAUDE.md` - Project context documentation
- `docs/8bitcn-components.md` - Component library reference

**Dependencies Installed:**
```json
{
  "@dimforge/rapier3d-compat": "^0.11.2",
  "@tailwindcss/vite": "^4.1.17",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "lucide-react": "^0.554.0",
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "tailwind-merge": "^3.4.0",
  "tailwindcss": "^4.1.17",
  "three": "^0.181.2",
  "yuka": "^0.7.1"
}
```

**Architecture:**
- Dual-layer architecture: 3D Engine (Three.js) + React UI overlay
- Tailwind CSS v4 with Vite plugin integration
- Custom 8bitcn component registry for retro UI
- Path aliases using `@/` for clean imports

---

## Notes

- This changelog follows the implementation plan (IMPLEMENTATION_PLAN.md)
- Each phase completion is documented with technical details
- Breaking changes and migration notes are included when applicable
- All file modifications are tracked for transparency
