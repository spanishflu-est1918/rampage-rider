Loaded cached credentials.
### @src/entities/Player.ts

**Lines 633-634:**
```typescript
    const direction = new THREE.Vector3(0, 0, 1);
    direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), (this as THREE.Group).rotation.y);
```

**Fix:**
Use class-level pre-allocated vectors to avoid per-call allocation.

```typescript
  // Add to class properties
  private readonly _tempFacing: THREE.Vector3 = new THREE.Vector3();
  private readonly _upAxis: THREE.Vector3 = new THREE.Vector3(0, 1, 0);

  // ...

  getFacingDirection(): THREE.Vector3 {
    this._tempFacing.set(0, 0, 1);
    this._tempFacing.applyAxisAngle(this._upAxis, (this as THREE.Group).rotation.y);
    return this._tempFacing; // Returns shared instance
  }
```

### @src/rendering/ParticleSystem.ts

**Line 302:**
```typescript
      const velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        1 + Math.random() * 2,
        Math.sin(angle) * speed
      );
```

**Line 348:**
```typescript
      const velocity = new THREE.Vector3(
        (direction.x / dirLen) * speedMult + (Math.random() - 0.5) * spread,
        0.5 + Math.random() * 1.5,
        (direction.z / dirLen) * speedMult + (Math.random() - 0.5) * spread
      );
```

**Fix:**
Refactor `particles` array to store primitive numbers (`vx, vy, vz`) instead of `Vector3` objects to prevent allocation, then reuse the existing `_tempVelocity` for calculation.

```typescript
  // 1. Change storage in ParticleEmitter
  // private particles: Array<{ ..., vx: number, vy: number, vz: number }> = [];

  // 2. Use pre-allocated _tempVelocity for calculation
  this._tempVelocity.set(
    Math.cos(angle) * speed,
    1 + Math.random() * 2,
    Math.sin(angle) * speed
  );

  // 3. Store as primitives
  this.particles.push({
    index,
    vx: this._tempVelocity.x,
    vy: this._tempVelocity.y,
    vz: this._tempVelocity.z,
    // ...
  });
```
