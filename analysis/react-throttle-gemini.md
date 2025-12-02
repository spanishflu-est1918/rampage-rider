Loaded cached credentials.
Attempt 1 failed: You have exhausted your capacity on this model. Your quota will reset after 0s.. Retrying after 337.302347ms...
GrepLogic: ripgrep failed: ripgrep exited with code 2: regex parse error:
    update(dt: number
          ^
error: unclosed group

Error during GrepLogic execution: Error: ripgrep exited with code 2: regex parse error:
    update(dt: number
          ^
error: unclosed group

Error executing tool default_api:run_shell_command: Tool "default_api:run_shell_command" not found in registry. Tools must use the exact names that are registered. Did you mean one of: "search_file_content", "list_directory", "google_web_search"?
Here is the exact code change needed to throttle the `onStatsUpdate` callback to every 3 frames.

```diff
diff --git a/src/core/Engine.ts b/src/core/Engine.ts
index 1234567..abcdef8 100644
--- a/src/core/Engine.ts
+++ b/src/core/Engine.ts
@@ -181,6 +181,7 @@ export class Engine {
   private lastPlayerPosition: THREE.Vector3 = new THREE.Vector3();
   private cameraMoveThreshold: number = 0; // Update every frame (0.1 caused jerk)
   private healthBarUpdateCounter: number = 0; // Throttle health bar projection
+  private frameCounter: number = 0;
 
   // Pre-allocated vectors for update loop (avoid GC pressure)
   private readonly _tempCameraPos: THREE.Vector3 = new THREE.Vector3();
@@ -1831,6 +1832,7 @@ export class Engine {
   };
 
   private update(dt: number): void {
+    this.frameCounter++;
     const physicsStart = DEBUG_PERFORMANCE_PANEL ? performance.now() : 0;
     if (this.physics.isReady()) {
       this.physics.step(dt);
@@ -2238,7 +2240,7 @@ export class Engine {
     }
 
     // Send stats update (including performance data and vehicle state)
-    if (this.callbacks.onStatsUpdate) {
+    if (this.callbacks.onStatsUpdate && this.frameCounter % 3 === 0) {
       const isNearCar = this.vehicleSpawned && !this.isInVehicle && this.isPlayerNearVehicle();
       const vehicleStats = this.isInVehicle && this.vehicle ? {
         vehicleHealth: this.vehicle.getHealth(),
```
