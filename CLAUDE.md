# Christmas Market Mayhem

Isometric top-down endless runner set in a German Christmas market. Three.js + React + Rapier physics. Players start on foot, unlock vehicles (bike → moto → sedan) via kill milestones.

## Critical Rules

- **NEVER commit without user testing and approval**
- **NEVER run `npm run dev`** - user manages dev server
- **All effects must be performant** - 60fps desktop, 30fps mobile
- Run `npx tsc --noEmit` before commits

## Workflow

1. Mark task complete in `IMPLEMENTATION_PLAN.md`
2. Add entry to `CHANGELOG.md`
3. **Wait for user to test**
4. Commit only after approval

## Quick Reference

| Topic | Doc |
|-------|-----|
| Architecture, engine, physics | `docs/claude/architecture.md` |
| Tailwind v4, 8bitcn, shadcn | `docs/claude/ui-system.md` |
| boxman.glb animation names | `docs/claude/animations.md` |

## Tech Stack

- Three.js 0.181.2, Rapier 0.11.2, Yuka 0.7.1
- React 19, Tailwind v4, Vite
- 8bitcn components (retro UI)

## Performance

- Reuse existing effect patterns before adding new ones
- Prefer additive blending, emissive materials, animated uniforms
- Avoid complex particle systems
- Meshes in rampage mode may get destroyed

## Tiers

`[0, 10, 40, 110]` kills → FOOT | BIKE | MOTO | SEDAN
