Loaded cached credentials.
Error executing tool default_api:replace: Tool "default_api:replace" not found in registry. Tools must use the exact names that are registered. Did you mean one of: "read_file", "list_directory", "web_fetch"?
I have analyzed `src/entities/Pedestrian.ts` and identified 3 key areas where object allocations occur every frame, causing garbage collection pressure.

### 1. `desiredMovement` Object Allocation
In the `update` loop, a new object literal `{x, y, z}` is created every frame to calculate the desired movement vector.

### 2. Physics Synchronization in `isDead` State
When a pedestrian is dead, the ragdoll physics update creates a new object literal `{x, y, z}` every frame when calling `setNextKinematicTranslation`.

### 3. Movement Vector Reuse
The calculation of the movement difference can be optimized by using a pre-allocated `Vector3`.

Here are the recommended fixes:

#### Fix 1: Add `_tempDesiredMovement` to Class Properties
Add this new private property to the class (around line 64) to reuse for movement calculations.

```typescript
  // Pre-allocated vectors (reused every frame to avoid GC pressure)
  private readonly _tempPosition: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempKnockback: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempCarDir: THREE.Vector3 = new THREE.Vector3();
  // ADD THIS LINE:
  private readonly _tempDesiredMovement: THREE.Vector3 = new THREE.Vector3();
```

#### Fix 2: Optimize `isDead` Physics Sync (lines 415-417)
Reuse the existing `_tempPosition` vector instead of creating a new object literal.

```typescript
        // Air friction (less than ground)
        this.deadVelocity.x *= 0.98;
        this.deadVelocity.z *= 0.98;

        // Sync physics body
        // OLD CODE: this.rigidBody.setNextKinematicTranslation({ x: currentPos.x, y: currentPos.y + 0.5, z: currentPos.z });
        
        // FIXED CODE:
        this._tempPosition.set(currentPos.x, currentPos.y + 0.5, currentPos.z);
        this.rigidBody.setNextKinematicTranslation(this._tempPosition);

        // Update instanced shadow (stays on ground even when body is airborne)
```

#### Fix 3: Optimize `update` Movement Calculation (lines 437-455)
Use the new `_tempDesiredMovement` vector instead of creating a new object literal for `desiredMovement`.

```typescript
    // Get desired movement from Yuka AI
    const yukaPos = this.yukaVehicle.position;
    const currentPos = this.rigidBody.translation();

    // Calculate desired movement vector
    // OLD CODE:
    /*
    const desiredMovement = {
      x: yukaPos.x - currentPos.x,
      y: 0,
      z: yukaPos.z - currentPos.z
    };
    */

    // FIXED CODE:
    this._tempDesiredMovement.set(
      yukaPos.x - currentPos.x,
      0,
      yukaPos.z - currentPos.z
    );

    // Use character controller for collision-aware movement
    // This prevents pedestrians from walking through vehicles
    const collisionFilter = KinematicCharacterHelper.getPedestrianCollisionFilter();
    this.characterController.computeColliderMovement(
      this.collider,
      this._tempDesiredMovement, // Pass the vector directly
      undefined, // filterFlags
      collisionFilter
    );
```
