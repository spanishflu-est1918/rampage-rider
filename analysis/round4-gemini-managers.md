Loaded cached credentials.
Error executing tool default_api:run_shell_command: Tool "default_api:run_shell_command" not found in registry. Tools must use the exact names that are registered. Did you mean one of: "search_file_content", "list_directory", "google_web_search"?
I have analyzed the `src/managers` directory and identified several per-frame allocations in the update loops. Since I currently do not have file editing capabilities in this session, I am providing the exact locations and fixes for you to apply.

### 1. `src/managers/BikeCopManager.ts`

**Issue:** `getCopData` allocates a new array and new objects on every call (likely per-frame for UI).
**Location:** Line 190

**Fix:** Add a private property to reuse the array.

```typescript
// Add to class properties
private _copDataResult: Array<{ position: THREE.Vector3; health: number; maxHealth: number }> = [];

// Replace getCopData method
getCopData(): Array<{ position: THREE.Vector3; health: number; maxHealth: number }> {
  this._copDataResult.length = 0;
  for (const cop of this.cops) {
    if (!cop.isDeadState()) {
      this._copDataResult.push({
        position: cop.getPosition(),
        health: cop.getHealth(),
        maxHealth: cop.getMaxHealth(),
      });
    }
  }
  return this._copDataResult;
}
```

### 2. `src/managers/CopCarManager.ts`

**Issue A:** `updateSpawns` uses `.filter()` to remove dead cars, allocating a new array every frame.
**Location:** Line 51

**Fix:** Use a reverse loop with `splice`.

```typescript
// Replace the filter block with:
for (let i = this.cars.length - 1; i >= 0; i--) {
  const car = this.cars[i];
  if (car.isDeadState() && !(car as THREE.Group).visible) {
    this.scene.remove(car);
    this.scene.remove(car.getBlobShadow());
    car.dispose();
    this.cars.splice(i, 1);
  }
}
```

**Issue B:** `getActiveCopCount` uses `.filter()` just to count elements, allocating a new array every call.
**Location:** Line 186

**Fix:** Use a loop to count.

```typescript
getActiveCopCount(): number {
  let count = 0;
  for (const car of this.cars) {
    if (!car.isDeadState()) count++;
  }
  return count;
}
```

**Issue C:** `getCopData` allocates a new array and objects every call.
**Location:** Line 193

**Fix:** Same as `BikeCopManager`, reuse a class property.

```typescript
// Add to class properties
private _copDataResult: Array<{ position: THREE.Vector3; health: number; maxHealth: number }> = [];

// Replace getCopData method
getCopData(): Array<{ position: THREE.Vector3; health: number; maxHealth: number }> {
  this._copDataResult.length = 0;
  for (const car of this.cars) {
    if (!car.isDeadState()) {
      this._copDataResult.push({
        position: car.getPosition(),
        health: car.getHealth(),
        maxHealth: car.getMaxHealth(),
      });
    }
  }
  return this._copDataResult;
}
```

### 3. `src/managers/CrowdManager.ts`

**Issue:** `cleanup` allocates a new array `[]` for `this.pedestriansToRemove` every frame.
**Location:** Line 612

**Fix:** Clear the array length instead of assigning a new one.

```typescript
// Replace: this.pedestriansToRemove = [];
this.pedestriansToRemove.length = 0;
```

### 4. `src/managers/LampPostManager.ts`

**Issue:** `update` uses `.find(...)` inside a loop, creating a closure function allocation for every lamp post every frame.
**Location:** Line 220

**Fix:** Use a for-loop or direct check to avoid the closure.

```typescript
// Replace the .find() block with:
let light: THREE.Object3D | undefined;
for (const child of lampPost.mesh.children) {
  if (child.type === 'PointLight') {
    light = child;
    break;
  }
}
if (light) {
  light.visible = distanceSq < this.LIGHT_CULL_DISTANCE_SQ;
}
```

### 5. `src/managers/MotorbikeCopManager.ts`

**Issue:** `spawnCop` uses `.clone()` on `playerVelocity` and `playerPosition`, creating unnecessary Vector3 allocations.
**Location:** Lines 108-116

**Fix:** Reuse the existing `_tempDirection` and `_tempSpawnPos` vectors.

```typescript
// Replace lines 108-116 with:
const aheadDir = this._tempDirection.copy(playerVelocity);
if (aheadDir.lengthSq() < 0.01) {
  aheadDir.set(0, 0, -1);
} else {
  aheadDir.normalize();
}
spawnPos = this._tempSpawnPos.copy(playerPosition).add(
  aheadDir.multiplyScalar(config.SPAWN_AHEAD_DISTANCE)
);
```
