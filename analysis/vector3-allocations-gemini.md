Here are the detected `Vector3` allocations in hot paths and the recommended fixes.

### **1. @src/managers/BikeCopManager.ts**

**Method:** `damageInRadius` (Attack detection loop)
**Line 131:** `const tempDir = new THREE.Vector3().subVectors(this._tempCopPos, position).normalize();`

*   **Pre-allocated Vector:** `private readonly _tempDirection = new THREE.Vector3();`
*   **Fixed Code:**
    ```typescript
    // Use pre-allocated vector
    this._tempDirection.subVectors(this._tempCopPos, position).normalize();
    const dotProduct = direction.dot(this._tempDirection);
    ```

### **2. @src/entities/Player.ts**

**Method:** `getFacingDirection` (Called frequently for targeting/camera)
**Line 580:** `const direction = new THREE.Vector3(0, 0, 1);`
**Line 581:** `new THREE.Vector3(0, 1, 0)` (Inside `applyAxisAngle`)

*   **Pre-allocated Vector:** (Reuse existing) `_tempDirection`
*   **Fixed Code:**
    ```typescript
    // Reuse existing _tempDirection and global UP constant
    this._tempDirection.set(0, 0, 1);
    this._tempDirection.applyAxisAngle(THREE.Object3D.DefaultUp, (this as THREE.Group).rotation.y);
    return this._tempDirection;
    ```

### **3. @src/managers/MotorbikeCopManager.ts**

**Method:** `spawnCop` (Spawn logic, can happen in waves)
**Line 155:** `const aheadDir = playerVelocity.clone();`
**Line 161:** `spawnPos = playerPosition.clone().add(...)`
**Line 169:** `spawnPos = new THREE.Vector3(...)`
**Line 180:** `new THREE.Vector3(lateralOffset, 0, 0)`

*   **Pre-allocated Vector:** `private readonly _tempSpawnDir = new THREE.Vector3();` (Add new, `_tempDirection` already exists but used safely?)
*   **Fixed Code:**
    ```typescript
    // Case BOSS
    this._tempDirection.copy(playerVelocity); // Replaces aheadDir
    if (this._tempDirection.lengthSq() < 0.01) this._tempDirection.set(0, 0, -1);
    else this._tempDirection.normalize();
    
    // Reuse _tempCopPos for spawn position to avoid 'spawnPos' allocation
    this._tempCopPos.copy(playerPosition).add(
      this._tempDirection.multiplyScalar(config.SPAWN_AHEAD_DISTANCE)
    );

    // Case SWARM
    this._tempCopPos.set(..., 0, ...);

    // Case SCOUT
    this._tempDirection.copy(playerVelocity).negate(); // Replaces behindDir
    // ...
    this._tempCopPos.copy(playerPosition)
      .add(this._tempDirection.multiplyScalar(config.SPAWN_BEHIND_DISTANCE));
    this._tempCopPos.x += lateralOffset; // Apply offset directly
    ```

### **4. @src/managers/CopCarManager.ts**

**Method:** `spawnCar` (Spawn logic)
**Line 89:** `spawnDir = playerVelocity.clone().normalize().multiplyScalar(-1);`
**Line 93:** `spawnDir = new THREE.Vector3(...)`
**Line 98:** `const perpDir = new THREE.Vector3(...)`

*   **Pre-allocated Vector:** `private readonly _tempDirection = new THREE.Vector3();`
*   **Fixed Code:**
    ```typescript
    // Use class member _tempDirection for spawnDir
    if (velLen > 0.1) {
      this._tempDirection.copy(playerVelocity).normalize().multiplyScalar(-1);
    } else {
      const angle = Math.random() * Math.PI * 2;
      this._tempDirection.set(Math.cos(angle), 0, Math.sin(angle));
    }

    // Reuse _tempCarPos for perpDir (it's available)
    this._tempCarPos.set(-this._tempDirection.z, 0, this._tempDirection.x);

    this._tempSpawnPos.set(
      playerPosition.x + this._tempDirection.x * COP_CAR_CONFIG.SPAWN_BEHIND_DISTANCE + this._tempCarPos.x * lateralOffset,
      0,
      playerPosition.z + this._tempDirection.z * COP_CAR_CONFIG.SPAWN_BEHIND_DISTANCE + this._tempCarPos.z * lateralOffset
    );
    ```

### **5. @src/rendering/ParticleSystem.ts**

**Methods:** `emitBlood`, `emitBloodSpray`, `emitDebris`, `emitSparks`
**Issue:** `velocity` is stored as `new THREE.Vector3` per particle.
**Line 170, 214, 331, 398:** `const velocity = new THREE.Vector3(...)`

*   **Refactor Required:** Flatten vector to scalars to remove allocation entirely.
*   **Fixed Code (Structure Change):**
    ```typescript
    // 1. Change particle interface
    interface Particle {
      vx: number; vy: number; vz: number; // Instead of velocity: THREE.Vector3
      // ...
    }
    
    // 2. In emit functions
    const vx = Math.cos(angle) * speed;
    const vy = 1 + Math.random() * 2;
    const vz = Math.sin(angle) * speed;
    this.particles.push({ ..., vx, vy, vz, ... });

    // 3. In update()
    particle.vy += gravity * deltaTime;
    this.positions[baseIdx] += particle.vx * deltaTime;
    this.positions[baseIdx + 1] += particle.vy * deltaTime;
    this.positions[baseIdx + 2] += particle.vz * deltaTime;
    ```
