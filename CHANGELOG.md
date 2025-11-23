# Rampage Rider - Changelog

All notable changes and completed implementations are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Phase 1.4 - Type System Fixes
- Pending: Fix GameStats interface and 8bitcn component types

---

## [2024-11-23]

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
