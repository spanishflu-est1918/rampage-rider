# Performance Bottlenecks Analysis

This document identifies all performance bottlenecks in the Rampage Rider codebase, prioritized by impact.

## CRITICAL - High Impact

### 1. Pedestrian Character Controller (PARTIALLY FIXED)
**Location**: `src/entities/Pedestrian.ts:559-585`
- **Issue**: Uses expensive `characterController.computeColliderMovement()` every frame
- **Status**: Already switched to simple position sync at line 335
- **Remaining Work**: Remove unused character controller code
- **Impact**: High - affects 40+ entities per frame

### 2. Cop Character Controller
**Location**: `src/entities/Cop.ts:431-436`
- **Issue**: Full collision resolution for 3-8 cops every frame
- **Fix**: Use simpler collision or direct position sync like pedestrians
- **Impact**: High - expensive Rapier calculations

### 3. Duplicate Yuka AI Updates
**Location**:
- `src/core/Engine.ts:287` (entityManager.update)
- `src/managers/CrowdManager.ts:287` (entityManager.update)
- `src/managers/CopManager.ts:100` (entityManager.update)
- **Issue**: Separate EntityManagers for crowd and cops - each iterates ALL entities
- **Fix**: Use single shared EntityManager in Engine
- **Impact**: Critical - doubles steering calculations

### 4. Taser Beam Frame-by-Frame Updates
**Location**: `src/entities/Cop.ts:609-641`
- **Issue**:
  - Updates geometry buffer attributes every frame
  - Math.random() called 3x per tasing cop per frame
  - Triggers GPU upload with `needsUpdate = true`
- **Fix**: Update every 2-3 frames or remove jitter entirely
- **Impact**: High when multiple cops are tasing

### 5. Blood Particle Material Clones
**Location**: `src/rendering/ParticleSystem.ts:79`
- **Issue**: `this.sharedMaterial.clone()` creates NEW material per particle
- **Impact**: 30-50 material clones per kill
- **Fix**: Use THREE.Points with single material or instanced attributes
- **Impact**: Critical - memory churn + GC pressure

---

## HIGH IMPACT - Medium Priority

### 6. Shadow Updates Every Frame
**Location**:
- `src/entities/Pedestrian.ts:338-340`
- `src/entities/Cop.ts:441-442`
- **Issue**: 48+ shadow position updates per frame (40 peds + 8 cops)
- **Fix**: Skip updates for stationary entities or batch updates
- **Impact**: Moderate - instanced shadows already help

### 7. Animation Mixer Updates for All Entities
**Location**:
- `src/entities/Player.ts:595-597`
- `src/entities/Pedestrian.ts:255-257`
- `src/entities/Cop.ts:324-326`
- **Issue**: Skeleton calculations every frame even when idle
- **Fix**: Skip mixer.update() for distant entities or frozen animations
- **Impact**: High - expensive bone transformations

### 8. Redundant Flocking Behaviors
**Location**: `src/managers/CrowdManager.ts:147-167`
- **Issue**: Creates Alignment/Cohesion/Separation behaviors for each pedestrian
- **Impact**: N² behavior calculations (each checks all others)
- **Fix**: Remove redundant flocking setup (separation already in constructor)
- **Impact**: High - quadratic complexity

### 9. Camera LookAt Every Frame
**Location**: `src/core/Engine.ts:820`
- **Issue**: Recalculates quaternion from target every frame
- **Fix**: Cache quaternion, only update on significant movement
- **Impact**: Moderate - unnecessary matrix math

### 10. Cop Health Bar Screen Projection
**Location**: `src/core/Engine.ts:829-849`
- **Issue**: Projects every cop's 3D position to screen space every frame
- **Fix**: Update only when camera moves or every N frames
- **Impact**: Moderate - matrix multiplications per cop

---

## MEDIUM IMPACT - Optimization Targets

### 11. Physics Step Variable Timestep
**Location**: `src/core/PhysicsWorld.ts:44-50`
- **Issue**: Rapier `world.step()` without fixed timestep accumulator
- **Status**: Already clamped to 0.1s
- **Fix**: Implement fixed timestep accumulator pattern
- **Impact**: Moderate - physics stability

### 12. Player Attack Duration Recalculation
**Location**: `src/entities/Player.ts:505-518`
- **Issue**: Calculates `clip.duration / timeScale` every frame
- **Fix**: Calculate once and cache
- **Impact**: Low-Medium

### 13. Rotation Angle Calculations
**Location**:
- `src/entities/Player.ts:547-555`
- `src/entities/Pedestrian.ts:346-348`
- `src/entities/Cop.ts:448-457`
- **Issue**: `Math.atan2()` for every moving entity every frame
- **Fix**: Skip when velocity is minimal
- **Impact**: Moderate when many entities moving

### 14. Dead Pedestrian Raycasts
**Location**: `src/entities/Pedestrian.ts:269-288`
- **Issue**: Dead bodies raycast for building collisions while bouncing
- **Fix**: Limit to first 2 seconds after death
- **Impact**: Low-Medium depending on kill count

### 15. Bullet Distance Checks with sqrt
**Location**: `src/entities/Cop.ts:686-702`
- **Issue**: Vector distance (with sqrt) calculated every frame per bullet
- **Fix**: Use squared distance comparison
- **Impact**: Low-Medium

### 16. Blood Decal Age Checking
**Location**: `src/rendering/BloodDecalSystem.ts:183-191`
- **Issue**: `Date.now()` and array shifts every frame
- **Fix**: Check every 60 frames instead
- **Impact**: Low

### 17. Entity Removal Array Operations
**Location**: `src/managers/CrowdManager.ts:326-338`
- **Status**: ✅ Already using deferred removal queue
- **Impact**: Optimized

---

## LOW IMPACT - Polish

### 18. Scene Traversal for Taser Flash
**Location**: `src/entities/Player.ts:414-424, 429-435`
- **Issue**: Traverses entire scene graph every frame when tased
- **Fix**: Cache mesh references on model load
- **Impact**: Low

### 19. Weighted Character Selection
**Location**: `src/managers/CrowdManager.ts:85-96`
- **Issue**: Loops through weighted pool every spawn
- **Fix**: Pre-build lookup table
- **Impact**: Very Low - only on spawn

### 20. Performance Stats History Arrays
**Location**: `src/core/Engine.ts:617-644`
- **Issue**: Array push/shift operations every frame
- **Fix**: Use circular buffer
- **Impact**: Low

### 21. SkeletonUtils.clone() Cost
**Location**: `src/entities/Pedestrian.ts:121`
- **Issue**: Deep clone skeleton for each pedestrian
- **Fix**: Consider instancing if geometry is frozen
- **Impact**: Low - only on spawn, already preloaded

---

## POTENTIAL MEMORY LEAKS

### 22. Death Timers Map
**Location**: `src/managers/CrowdManager.ts:27, 296-308`
- **Status**: ✅ Already deleting on cleanup (line 307)
- **Impact**: Safe

### 23. Particle Pool with Material Clones
**Location**: `src/rendering/ParticleSystem.ts:86-95`
- **Status**: Pool capped at 200, but materials still cloned (see #5)
- **Impact**: Memory churn - related to issue #5

### 24. Taser Beam Disposal
**Location**: `src/entities/Cop.ts:646-655`
- **Issue**: If `parentScene` is null, beam may leak
- **Fix**: Always dispose geometry/material even if not in scene
- **Impact**: Low - edge case

---

## Quick Wins (Priority Order)

1. **Merge Yuka EntityManagers** (#3) - Single shared manager in Engine
2. **Stop cloning particle materials** (#5) - Use THREE.Points or shared material
3. **Reduce taser beam update frequency** (#4) - Every 3 frames
4. **Skip animation updates for distant entities** (#7) - Distance-based LOD
5. **Cache camera quaternion** (#9) - Only update on movement threshold
6. **Use squared distance for bullets** (#15) - Remove sqrt
7. **Remove redundant flocking setup** (#8) - Already in constructor

---

## Performance Testing

Use the built-in performance dump system:
- Press **P** during gameplay to dump performance snapshot to console
- Monitor `engine.getPerformanceStats()` for:
  - Frame time breakdown (physics, entities, rendering)
  - Entity counts (cops, pedestrians, particles, decals)
  - Bottleneck identification (worst frame analysis)

## Measurement Baseline

Current performance characteristics (from performance monitoring):
- Target: 60fps (16.67ms per frame)
- Physics: ~2-4ms
- Entities: ~4-8ms (spikes with many cops/pedestrians)
- Rendering: ~3-5ms
- Bottleneck: Usually **entities** (AI + animation updates)

After implementing Quick Wins, expect:
- Entities: ~2-4ms (50% reduction)
- Overall frame time: ~10-12ms (30% improvement)
