# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Rampage Rider** is an isometric top-down endless runner video game built with Three.js, React, and Rapier physics. Players start on foot and progressively unlock vehicles (bicycle → motorbike → sedan) by reaching kill milestones while being pursued by police.

## Code Quality Principles

**The user hates duplication.** Always:
- Consolidate duplicate documentation into single sources of truth
- Refactor repeated code patterns into reusable functions/classes
- Remove redundant guides, specs, or files
- Keep documentation DRY (Don't Repeat Yourself)

## Development Workflow

### Implementation Plan & Changelog System

This project uses a two-file documentation system to track progress:

**IMPLEMENTATION_PLAN.md** - The master roadmap
- Contains all planned features organized by phase
- Tasks use checkboxes `[ ]` for pending, `[x]` for completed
- Updated when new features are planned or scope changes
- Acts as the single source of truth for what needs to be built

**CHANGELOG.md** - The completion log
- Documents completed work with technical details
- Updated immediately when tasks from the implementation plan are finished
- Follows Keep a Changelog format with dates
- Includes code examples, file changes, and implementation notes

### Workflow Rules

**CRITICAL - NEVER DO THESE:**
- ❌ **NEVER commit without user testing and approval first**
- ❌ **NEVER run `npm run dev` - user manages the dev server**

**When completing tasks:**
1. Mark the task as complete in IMPLEMENTATION_PLAN.md (`[x]`)
2. Add a detailed entry to CHANGELOG.md with:
   - Date of completion
   - Technical implementation details
   - Files created/modified
   - Code examples where relevant
   - Any breaking changes or migration notes
3. **WAIT FOR USER TO TEST**
4. Only commit after user approves

**When planning new work:**
1. Add tasks to IMPLEMENTATION_PLAN.md under appropriate phase
2. Use descriptive task names with clear acceptance criteria
3. Organize by logical implementation order

**Before committing:**
- Run `npx tsc --noEmit` to check for type errors
- Fix any blocking type errors (non-blocking 8bitcn library errors are acceptable)
- Update both IMPLEMENTATION_PLAN.md and CHANGELOG.md
- **WAIT FOR USER TO TEST**
- Commit with descriptive message only after user approval

## Development Commands

```bash
# Start development server (runs on port 8080, auto-fallback to 8081 if busy)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Architecture

### Core Engine Structure

The game uses a **dual-layer architecture** separating 3D game logic from React UI:

**Layer 1: 3D Game Engine** (`src/core/`)
- `Engine.ts` - Main orchestrator that manages Three.js scene, Rapier physics, Yuka AI, and game loop
- `PhysicsWorld.ts` - Rapier wrapper providing collision detection, rigid bodies, and raycasting

**Layer 2: React UI** (`src/`)
- `App.tsx` - Root component managing game state (MENU, PLAYING, GAME_OVER)
- `components/GameCanvas.tsx` - Bridge between React and Engine, handles async initialization and input
- `components/UI/` - Menu overlays and HUD components

### Critical Integration Points

1. **Engine Initialization Flow**:
   ```typescript
   // GameCanvas.tsx creates Engine instance
   const engine = new Engine(canvas, width, height);
   await engine.init(); // MUST await - Rapier WASM loads async
   engine.setCallbacks(onStatsUpdate, onGameOver);
   engine.start(); // Begins game loop
   ```

2. **Physics-Rendering Sync**:
   - Engine owns both Three.js scene AND Rapier world
   - Entities must sync mesh positions with physics bodies every frame
   - Pattern: Update Rapier → Copy transforms to Three.js meshes in `update()`

3. **Input Flow**:
   - React captures keyboard/touch events in `GameCanvas.tsx`
   - Converts to `InputState` object
   - Passes to `Engine.handleInput()`
   - Engine reads input in `update()` loop

### Camera System

**Orthographic camera** positioned at `(10, 25, 10)` looking at origin creates isometric view:
- `frustumSize = 25` (reduced from 35 for closer, more intimate feel)
- Camera follows player with smooth lerp (implemented in future entity system)
- Shake effects applied by temporarily offsetting camera position

### Physics Configuration

Rapier collision groups (bit flags in `PhysicsWorld.COLLISION_GROUPS`):
- `GROUND` (0x0001)
- `PLAYER` (0x0002)
- `PEDESTRIAN` (0x0004)
- `COP` (0x0008)
- `DEBRIS` (0x0010)
- `PROJECTILE` (0x0020)

Use for selective collision detection and raycasting filters.

### Planned Entity System (Not Yet Implemented)

Future implementation will add:
- `src/entities/Entity.ts` - Base class with `rigidBody`, `mesh`, `yukaVehicle`
- `src/entities/Player.ts` - Player-specific logic with tier switching
- `src/entities/Pedestrian.ts` - Yuka flocking behavior
- `src/entities/Cop.ts` - Yuka seek/pursuit AI

Each entity synchronizes Three.js mesh position with Rapier body position in Engine's update loop.

## UI Component System

### Tailwind CSS v4 + shadcn/ui

**Important**: This project uses **Tailwind CSS v4** (NOT v3):
- Configuration via `@import "tailwindcss"` in CSS (no tailwind.config.js)
- Vite plugin: `@tailwindcss/vite`
- CSS variables defined inline in `src/index.css` using `@theme` directive

### 8bitcn Component Registry

Custom shadcn registry at `https://www.8bitcn.com/r/{name}.json` provides retro/8-bit styled components:

```bash
# Install components from @8bitcn registry
npx shadcn@latest add @8bitcn/health-bar
npx shadcn@latest add @8bitcn/mana-bar
npx shadcn@latest add @8bitcn/button
```

See `docs/8bitcn-components.md` for complete component list prioritized for game UI.

**Key gaming components**:
- `health-bar` - Player HP display
- `mana-bar` - Heat meter visualization
- `progress` - Combo/tier unlock progress
- `badge` - Kill count, tier indicators
- `dialog` - Tier unlock popups
- `kbd` - Control hints (WASD, Space)

### Path Aliases

Configured in `vite.config.ts` and `tsconfig.json`:
```typescript
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
```

## Game State Management

**Centralized in Engine.ts `stats` object**:
```typescript
{
  kills: number,
  score: number,
  tier: Tier, // FOOT | BIKE | MOTO | SEDAN
  combo: number,
  comboTimer: number, // Seconds remaining
  gameTime: number,
  health: number,
  killHistory: Array<{time, kills}>
}
```

Stats flow: `Engine.update()` → `callbacks.onStatsUpdate()` → React state → UI re-render

## Development Patterns

### Adding New Game Entities

1. Create class extending base Entity (future)
2. Create Three.js mesh for rendering
3. Create Rapier rigid body + collider
4. Create Yuka vehicle for AI (if needed)
5. Add to Engine's entity array
6. Update in Engine.update() loop
7. Sync physics → mesh transforms

### Adding UI Components

1. Install from @8bitcn registry first (retro aesthetic)
2. If not available, use standard shadcn: `npx shadcn@latest add component-name`
3. Import with @ alias: `import { Component } from "@/components/ui/component"`
4. Components auto-support light/dark themes

### Physics Debugging

```typescript
// Access Rapier world directly if needed
const world = engine.physics.getWorld();

// Raycast for attack hitboxes
const hit = engine.physics.castRay(
  origin,      // THREE.Vector3
  direction,   // THREE.Vector3
  maxDistance, // number
  filterMask   // optional collision group filter
);
```

### Player Animations (boxman.glb)

Available animations in the player model:
- **Movement**: `Running_A`, `Running_B`, `Walking_A`, `Walking_B`, `Walking_C`, `Idle_A`, `Idle_B`
- **Jump**: `Jump_Full_Long`, `Jump_Full_Short`, `Jump_Idle`, `Jump_Land`, `Jump_Start`
- **Death**: `Death_A`, `Death_B`, `Death_A_Pose`, `Death_B_Pose`
- **Hit**: `Hit_A`, `Hit_B`
- **Melee 1H**: `Melee_1H_Attack_Chop`, `Melee_1H_Attack_Jump_Chop`, `Melee_1H_Attack_Slice_Diagonal`, `Melee_1H_Attack_Slice_Horizontal`, `Melee_1H_Attack_Stab`
- **Melee 2H**: `Melee_2H_Attack_Chop`, `Melee_2H_Attack_Slice`, `Melee_2H_Attack_Spin`, `Melee_2H_Attack_Spinning`, `Melee_2H_Attack_Stab`, `Melee_2H_Idle`
- **Melee Unarmed**: `Melee_Unarmed_Attack_Kick`, `Melee_Unarmed_Attack_Punch_A`, `Melee_Unarmed_Idle`
- **Melee Dualwield**: `Melee_Dualwield_Attack_Chop`, `Melee_Dualwield_Attack_Slice`, `Melee_Dualwield_Attack_Stab`
- **Block**: `Melee_Block`, `Melee_Block_Attack`, `Melee_Block_Hit`, `Melee_Blocking`
- **Vehicle**: `Seated_Bike` (single-frame seated pose with arms forward for handlebars)
- **Other**: `Interact`, `PickUp`, `Spawn_Air`, `Spawn_Ground`, `Throw`, `Use_Item`, `T-Pose`

## Critical Implementation Notes

1. **Always await Engine.init()** - Rapier WASM must load before physics operations
2. **Delta time is clamped to 0.1s** in physics step to prevent explosions on frame drops
3. **Orthographic camera requires manual aspect ratio updates** on window resize
4. **React Strict Mode causes double initialization** - Engine handles this with state checks
5. **Input state persists between frames** - must explicitly reset or use event-based logic

## Tier Progression System (Planned)

Milestones: `[0, 10, 40, 110]` kills unlock tiers
- **Tier 1 (FOOT)**: Kinematic character controller
- **Tier 2 (BIKE)**: 2-wheel Rapier raycast vehicle
- **Tier 3 (MOTO)**: 3-wheel raycast vehicle
- **Tier 4 (SEDAN)**: 4-wheel raycast vehicle

Each tier switch destroys old physics body and creates new vehicle controller with different wheel configurations.

## File Organization

```
src/
├── core/               # Game engine (Three.js + Rapier + Yuka)
│   ├── Engine.ts       # Main orchestrator, owns scene + physics + AI
│   └── PhysicsWorld.ts # Rapier wrapper
├── entities/           # Future: Player, Pedestrian, Cop classes
├── systems/            # Future: TierSystem, CombatSystem, SpawnSystem
├── rendering/          # Future: MeshFactory, ParticleSystem, CameraController
├── components/         # React UI layer
│   ├── GameCanvas.tsx  # Engine bridge
│   └── UI/             # Menu overlays
├── types.ts            # Shared TypeScript types
├── constants.ts        # Game balance constants
└── index.css           # Tailwind v4 config + theme vars
```

## External Dependencies

- **Three.js** (0.181.2) - 3D rendering
- **Rapier** (@dimforge/rapier3d-compat 0.11.2) - Physics simulation
- **Yuka** (0.7.1) - AI/steering behaviors (not yet integrated)
- **React** (19.2.0) - UI layer
- **Tailwind CSS** (4.1.17) - Styling (v4 - note the version!)
- **recharts** (3.5.0) - Stats visualizations

## Performance Considerations

**CRITICAL: All effects must be super performant.** This is a hard requirement for any visual effect, particle system, or shader added to the game.

- Target: 60fps desktop, 30fps mobile
- Physics step runs at display refresh rate (not fixed timestep currently)
- **Any new effect must reuse existing patterns** - check what's already implemented before adding new effects
- Prefer simple additive blending, emissive materials, and animated uniforms over complex particle systems
- Future: Implement object pooling for entities and particles
- Future: LOD system for distant entities (>20u: reduce polys, >40u: cull)
- Future: InstancedMesh for repeated objects (debris, trash cans)
