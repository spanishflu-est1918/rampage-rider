Loaded cached credentials.
Error executing tool default_api:replace: Tool "default_api:replace" not found in registry. Tools must use the exact names that are registered. Did you mean one of: "read_file", "list_directory", "web_fetch"?
I have analyzed `MotorbikeCop.ts` and `Vehicle.ts` and identified several optimizations to reduce garbage collection pressure and improve performance, specifically regarding vector allocations and object creation in the render loop.

**Note:** I am currently unable to apply file changes directly (tools unavailable). Please apply the following fixes to your codebase.

### 1. Optimizations for `src/entities/MotorbikeCop.ts`

**Changes:**
*   Added reusable objects `_rapierMovement` and `_rapierPosition` to avoid creating new objects every frame for RAPIER updates.
*   Refactored `fireTaser` and `fireBullet` to reuse `THREE.Line` and `THREE.Mesh` objects instead of creating new ones on every attack.
*   Updated `dispose` to clean up properly without disposing shared assets aggressively.

**Apply these changes to `src/entities/MotorbikeCop.ts`:**

```typescript
// 1. Add these properties to the class (near other private readonly properties)
  private readonly _rapierMovement = { x: 0, y: 0, z: 0 };
  private readonly _rapierPosition = { x: 0, y: 0, z: 0 };

// 2. Replace the fireTaser method
  fireTaser(targetPos: THREE.Vector3): void {
    if (!this.parentScene || this.attackCooldown > 0) return;

    // Create taser beam if it doesn't exist
    if (!this.taserBeam) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(this._taserPositions, 3));
      
      const material = new THREE.LineBasicMaterial({
        color: 0xffff00,
        linewidth: 3,
        transparent: true,
        opacity: 0.9,
      });

      this.taserBeam = new THREE.Line(geometry, material);
      this.taserBeam.frustumCulled = false;
    }

    // Add to scene if not already added
    if (this.taserBeam.parent !== this.parentScene) {
      this.parentScene.add(this.taserBeam);
    }
    
    this.taserBeam.visible = true;
    this.taserBeamActive = true;
    this.updateTaserBeam(targetPos);

    this.attackCooldown = MOTORBIKE_COP_CONFIG.TASER_COOLDOWN;

    if (this.onDealDamage) {
      this.onDealDamage(MOTORBIKE_COP_CONFIG.TASER_DAMAGE, false);
    }
  }

// 3. Replace the removeTaserBeam method
  removeTaserBeam(): void {
    if (this.taserBeam) {
      this.taserBeam.visible = false;
      if (this.taserBeam.parent) {
        this.taserBeam.parent.remove(this.taserBeam);
      }
    }
    this.taserBeamActive = false;
  }

// 4. Replace the fireBullet method
  fireBullet(targetPos: THREE.Vector3): void {
    if (!this.parentScene || this.attackCooldown > 0) return;

    if (this.bulletProjectile && this.bulletProjectile.parent) {
      this.bulletProjectile.parent.remove(this.bulletProjectile);
    }

    const copPos = this.getPosition();
    copPos.y += 0.8;

    if (!MotorbikeCop.sharedBulletGeometry) {
      MotorbikeCop.sharedBulletGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    }
    if (!MotorbikeCop.sharedBulletMaterial) {
      MotorbikeCop.sharedBulletMaterial = new THREE.MeshBasicMaterial({
        color: 0xffcc00,
      });
    }

    if (!this.bulletProjectile) {
      this.bulletProjectile = new THREE.Mesh(MotorbikeCop.sharedBulletGeometry, MotorbikeCop.sharedBulletMaterial);
    }

    this.bulletProjectile.position.copy(copPos);
    this.bulletProjectile.visible = true;
    
    if (!this.bulletTarget) {
      this.bulletTarget = new THREE.Vector3();
    }
    this.bulletTarget.copy(targetPos).setY(targetPos.y + 0.5);
    
    if (this.bulletProjectile.parent !== this.parentScene) {
      this.parentScene.add(this.bulletProjectile);
    }

    this.attackCooldown = MOTORBIKE_COP_CONFIG.SHOOT_COOLDOWN;
  }

// 5. Replace the removeBulletProjectile method
  private removeBulletProjectile(): void {
    if (this.bulletProjectile) {
      this.bulletProjectile.visible = false;
      if (this.bulletProjectile.parent) {
        this.bulletProjectile.parent.remove(this.bulletProjectile);
      }
    }
    this.bulletTarget = null;
  }

// 6. In update(), replace the movement block (approx line 620-640)
    // ... inside update() ...
    const desiredMovement = this._rapierMovement;
    desiredMovement.x = moveX;
    desiredMovement.y = -0.1 * deltaTime;
    desiredMovement.z = moveZ;

    // Use character controller for collision
    this.characterController.computeColliderMovement(
      this.collider,
      desiredMovement
    );

    const correctedMovement = this.characterController.computedMovement();
    const newPosition = this._rapierPosition;
    newPosition.x = currentPos.x + correctedMovement.x;
    newPosition.y = Math.max(0.3, currentPos.y + correctedMovement.y);
    newPosition.z = currentPos.z + correctedMovement.z;

    this.rigidBody.setNextKinematicTranslation(newPosition);
    (this as THREE.Group).position.set(newPosition.x, newPosition.y, newPosition.z);
    // ...

// 7. Replace dispose method
  dispose(): void {
    this.yukaEntityManager.remove(this.yukaVehicle);
    
    if (this.taserBeam) {
      if (this.taserBeam.parent) this.taserBeam.parent.remove(this.taserBeam);
      this.taserBeam.geometry.dispose();
      if (this.taserBeam.material instanceof THREE.Material) {
        this.taserBeam.material.dispose();
      }
      this.taserBeam = null;
    }
    
    if (this.bulletProjectile) {
      if (this.bulletProjectile.parent) this.bulletProjectile.parent.remove(this.bulletProjectile);
      this.bulletProjectile = null;
    }

    if (this.rigidBody && this.world) {
      this.world.removeRigidBody(this.rigidBody);
    }

    if (this.sirenLight) {
      (this as THREE.Group).remove(this.sirenLight);
      this.sirenLight.dispose();
    }

    if (this.riderMixer) {
      this.riderMixer.stopAllAction();
      this.riderMixer = null;
    }

    this.modelContainer.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else if (child.material) {
          child.material.dispose();
        }
      }
    });
  }
```

### 2. Optimizations for `src/entities/Vehicle.ts`

**Changes:**
*   Added `_damageDir` and `_forwardDir` to avoid `new THREE.Vector3()` calls during damage calculations.
*   Added `_rapierMovement` and `_rapierPosition` for the update loop.
*   Fixed `getVelocity()` to avoid returning a modified reference to the internal directional vector.

**Apply these changes to `src/entities/Vehicle.ts`:**

```typescript
// 1. Add these properties (near other private readonly properties)
  private readonly _damageDir: THREE.Vector3 = new THREE.Vector3();
  private readonly _forwardDir: THREE.Vector3 = new THREE.Vector3();
  private readonly _rapierMovement = { x: 0, y: 0, z: 0 };
  private readonly _rapierPosition = { x: 0, y: 0, z: 0 };

// 2. Replace getVelocity method
  getVelocity(): THREE.Vector3 {
    return this._tempVelocity.copy(this.getMovementDirection()).multiplyScalar(this.currentSpeed);
  }

// 3. Replace takeDamageFromPosition method
  takeDamageFromPosition(amount: number, attackerPosition: THREE.Vector3): boolean {
    if (this.isDestroyed) return false;

    if (this.config.canCrushBuildings) {
      const vehiclePos = this.getPosition();
      const toAttacker = this._damageDir
        .subVectors(attackerPosition, vehiclePos)
        .normalize();

      const forward = this._forwardDir.set(0, 0, -1);
      forward.applyQuaternion((this as THREE.Group).quaternion);

      const dot = forward.dot(toAttacker);
      const isFrontalAttack = dot > 0.7;

      if (isFrontalAttack) {
        return false;
      }
    }

    this.takeDamage(amount);
    return true;
  }

// 4. In update(), replace the movement block (approx line 300-320)
    // ... inside update() ...
    if (this.characterController && this.collider) {
      const desiredMovement = this._rapierMovement;
      desiredMovement.x = velocity.x * deltaTime;
      desiredMovement.y = -0.1 * deltaTime;
      desiredMovement.z = velocity.z * deltaTime;

      this.characterController.computeColliderMovement(
        this.collider,
        desiredMovement,
        undefined,
        this.movementCollisionFilter
      );

      const correctedMovement = this.characterController.computedMovement();

      const newPosition = this._rapierPosition;
      newPosition.x = translation.x + correctedMovement.x;
      newPosition.y = Math.max(0.5, translation.y + correctedMovement.y);
      newPosition.z = translation.z + correctedMovement.z;

      this.rigidBody.setNextKinematicTranslation(newPosition);
      (this as THREE.Group).position.set(newPosition.x, newPosition.y, newPosition.z);
    }
    // ...
```
