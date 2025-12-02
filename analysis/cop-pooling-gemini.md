Loaded cached credentials.
Here are the code updates to implement object pooling for the `Cop` entity.

### 1. Cop.ts: Add `reset()` and `deactivate()` methods

Add these methods to the `Cop` class (e.g., before `dispose()`) to handle state resetting and safe cleanup when pooling.

```typescript
  /**
   * Reset cop state for pooling
   * Re-initializes position, physics, AI, and health for reuse
   */
  reset(position: THREE.Vector3): void {
    // Reset Stats
    this.health = COP_CONFIG.HEALTH;
    this.isDead = false;
    this.isHitStunned = false;
    this.hitStunTimer = 0;
    this.isRagdolling = false;
    this.ragdollTimer = 0;
    this.ragdollVelocity.set(0, 0, 0);
    this.currentWantedStars = 0;
    this.isCurrentlyAttacking = false;
    this.attackCooldown = 0;
    this.taserBeamUpdateCounter = 0;

    // Clear any active visual effects
    this.removeTaserBeam();
    this.removeBulletProjectile();

    // Reset Physics Body
    // Teleport to new position and kill any existing momentum
    this.rigidBody.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
    this.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);

    // Reset Yuka AI
    this.yukaVehicle.position.copy(position);
    this.yukaVehicle.velocity.set(0, 0, 0);
    this.seekBehavior.target.set(position.x, 0, position.z);
    
    // Re-add to AI manager if it was removed during deactivation
    if (!this.yukaEntityManager.entities.includes(this.yukaVehicle)) {
      this.yukaEntityManager.add(this.yukaVehicle);
    }

    // Reset Visuals
    (this as THREE.Group).visible = true;
    (this as THREE.Group).position.copy(position);
    (this as THREE.Group).rotation.set(0, 0, 0);
    
    // Reset blob shadow position
    this.blobShadow.position.set(position.x, 0.01, position.z);
    
    // Reset Animation
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.playAnimation('Run', 0.3); // Start running immediately as they usually spawn chasing
    }
  }

  /**
   * Deactivate cop when returned to pool
   * Removes from AI and moves physics body out of the way
   */
  deactivate(): void {
    // Remove from AI manager to stop processing
    this.yukaEntityManager.remove(this.yukaVehicle);
    
    // Clear effects
    this.removeTaserBeam();
    this.removeBulletProjectile();
    
    // Move physics body far away to prevent collisions while pooled
    this.rigidBody.setTranslation({ x: 0, y: -500, z: 0 }, true);
    this.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }
```

### 2. CopManager.ts: Implement Pooling Logic

Replace the existing `CopManager` properties and `updateSpawns`/`spawnCop` methods with this pooled implementation.

```typescript
export class CopManager {
  private cops: Cop[] = [];
  // Pool for inactive cops
  private copPool: Cop[] = []; 
  
  private scene: THREE.Scene;
  private world: RAPIER.World;
  private aiManager: AIManager;

  private maxCops: number = 3;
  private spawnRadius: number = 15;
  private damageCallback: ((damage: number) => void) | null = null;

  // ... (keep existing properties)

  /**
   * Update cop spawns based on heat level
   */
  updateSpawns(heat: number, playerPosition: THREE.Vector3): void {
    // Recycle dead cops
    // Iterate backwards to safely splice from the array
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const cop = this.cops[i];
      
      // If cop is dead and finished death animation (invisible)
      if (cop.isDeadState() && !(cop as THREE.Group).visible) {
        // Remove from active list
        this.cops.splice(i, 1);
        
        // Remove from scene graph (keeps scene clean)
        this.scene.remove(cop);
        this.scene.remove(cop.getBlobShadow());
        
        // Deactivate and add to pool
        cop.deactivate();
        this.copPool.push(cop);
      }
    }

    // Calculate desired cop count based on heat
    let desiredCops = 0;
    if (heat >= 75) desiredCops = 3;
    else if (heat >= 50) desiredCops = 2;
    else if (heat >= 25) desiredCops = 1;

    // Spawn more cops if below desired count
    // We count active cops (this.cops) not total allocated
    const activeCops = this.cops.length;
    const copsToSpawn = Math.min(desiredCops - activeCops, this.maxCops - activeCops);

    for (let i = 0; i < copsToSpawn; i++) {
      this.spawnCop(playerPosition);
    }
  }

  /**
   * Spawn a cop near the player (using pool if available)
   */
  private spawnCop(playerPosition: THREE.Vector3): void {
    // Spawn at random angle around player, outside spawn radius
    const angle = Math.random() * Math.PI * 2;
    const distance = this.spawnRadius + Math.random() * 5;

    this._tempSpawnPos.set(
      playerPosition.x + Math.cos(angle) * distance,
      0,
      playerPosition.z + Math.sin(angle) * distance
    );

    let cop: Cop;

    // Try to reuse from pool first
    if (this.copPool.length > 0) {
      cop = this.copPool.pop()!;
      cop.reset(this._tempSpawnPos);
    } else {
      // Create new instance if pool is empty
      cop = new Cop(this._tempSpawnPos, this.world, this.aiManager.getEntityManager());
    }

    cop.setParentScene(this.scene); // Enable visual effects
    if (this.damageCallback) {
      cop.setDamageCallback(this.damageCallback);
    }
    
    this.cops.push(cop);
    this.scene.add(cop);
    this.scene.add(cop.getBlobShadow());
  }

  // ... (rest of class)
}
```
