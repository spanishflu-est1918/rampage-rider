Loaded cached credentials.
Error executing tool list_directory: Error listing directory: ENOENT: no such file or directory, stat '/Users/gorkolas/Documents/www/rampage/src/effects'
# Performance Analysis Report

## 1. `src/rendering/InstancedBlobShadows.ts`

### Issue: Per-Frame Allocation in Hot Path
In `updateShadow`, a new `THREE.Quaternion` is allocated every time a shadow is updated. This method is called every frame for every dynamic entity using shadows, generating significant garbage collection pressure.

*   **Location:** Line 126
*   **Code:**
    ```typescript
    this.tempMatrix.compose(
      this.tempPosition,
      new THREE.Quaternion(), // <--- Allocates new object every call
      this.tempScale
    );
    ```
*   **Fix:** Add a reusable quaternion member to the class (e.g., `private readonly _identityQuat = new THREE.Quaternion();`) and pass that instead.

## 2. `src/rendering/ChristmasLights.ts`

### Issue: Excessive Draw Calls & Material Duplication
The `ChristmasLights` system creates a separate `THREE.Mesh` for every single bulb.
*   **Draw Calls:** A default strand has 12 bulbs = 12 draw calls. A scene with 10 strands = 120+ draw calls just for decoration.
*   **Memory:** Each bulb creates a *unique* clone of `MeshBasicMaterial` (Line 131) to handle the "twinkle" effect (changing color intensity).

*   **Location:** Lines 131-139 (Bulb creation loop)
*   **Fix:**
    *   Replace individual meshes with **`THREE.InstancedMesh`**.
    *   Store "twinkle phase" and "speed" in a `InstancedBufferAttribute` or just update `instanceColor` per frame.
    *   This reduces N draw calls per strand to 1 draw call per strand type.

## 3. `src/rendering/ParticleSystem.ts`

### Issue: O(N) Array Operations (`splice`)
The `update` loop uses `Array.prototype.splice()` to remove dead particles. This shifts all subsequent elements in the array, which is an O(N) operation inside a loop, potentially leading to O(N^2) behavior if many particles die at once.

*   **Location:** Lines 406 (`this.particles.splice(i, 1)`) and 420.
*   **Fix:** Use "Swap and Pop". Since order doesn't strictly matter for rendering (depth sorting happens elsewhere or not at all for additive particles), copy the last active particle into the slot of the dead particle and decrement the length/active count.

### Issue: Per-Particle Object Allocation
When emitting particles (`emitBlood`, `emitBloodSpray`, `emitDebris`), a new JavaScript object literal and a `new THREE.Vector3` (for velocity) are allocated for every single particle.

*   **Location:** Lines 330-340, 371-380, 483-490.
*   **Fix:**
    *   Convert `particles` and `debrisParticles` to use TypedArrays (e.g., `velocities = new Float32Array(MAX * 3)`).
    *   Eliminate the JS object wrapper per particle.

## 4. `src/rendering/BloodDecalSystem.ts`

### Issue: O(N) Shift Operation
`removeOldestDecal` uses `this.decals.shift()`. While `maxDecals` is capped at 100, `shift()` is still O(N) and unnecessary.

*   **Location:** Line 209 (`const oldest = this.decals.shift()!;`)
*   **Fix:** Use a ring buffer approach or simply overwrite the oldest index using a pointer (`nextIndex = (currentIndex + 1) % maxDecals`).

## 5. `src/rendering/BlobShadow.ts`

### Issue: Unbatched Building Shadows
`createBuildingShadow` creates a new `THREE.Shape`, `THREE.ShapeGeometry`, and `THREE.Mesh` for every call. If this is called for every building in a city generation step, it results in unbatched draw calls and high memory fragmentation.

*   **Location:** Lines 100-135
*   **Fix:** If buildings are static, merge these shadow geometries into a single `BufferGeometry` after generation, or use `InstancedMesh` if shadow shapes are identical.
