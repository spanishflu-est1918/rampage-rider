Loaded cached credentials.
GrepLogic: ripgrep failed: ripgrep exited with code 2: regex parse error:
    const actionContext = {|const taserState = this.player\?\.getTaserState\(\) \|\| {|const allKillPositions: THREE\.Vector3\[\] = \[\];|this\.performanceStats\.counts = {|new RAPIER\.Ray
                           ^
error: repetition quantifier expects a valid decimal

Error during GrepLogic execution: Error: ripgrep exited with code 2: regex parse error:
    const actionContext = {|const taserState = this.player\?\.getTaserState\(\) \|\| {|const allKillPositions: THREE\.Vector3\[\] = \[\];|this\.performanceStats\.counts = {|new RAPIER\.Ray
                           ^
error: repetition quantifier expects a valid decimal

1. src/core/PhysicsWorld.ts:94
   `private readonly _ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });` (Add class property, reuse in castRay)

2. src/core/Engine.ts:1203
   `private readonly _killPositions: THREE.Vector3[] = [];` (Add class property, reuse by clearing length)

3. src/core/Engine.ts:1367
   `this._killPositions.length = 0;` (Reuse _killPositions instead of new array)

4. src/core/Engine.ts:1501
   `this._killPositions.length = 0;` (Reuse _killPositions instead of new array)

5. src/core/Engine.ts:1588
   `this._killPositions.length = 0;` (Reuse _killPositions instead of new array)

6. src/core/Engine.ts:1811
   `const rendererStats = this.performanceStats.renderer; rendererStats.drawCalls = info.render.calls; ...` (Update existing object properties instead of new object)

7. src/core/Engine.ts:1820
   `const counts = this.performanceStats.counts; counts.cops = ...` (Update existing object properties instead of new object)

8. src/core/Engine.ts:1943
   `private readonly _defaultTaserState = { isTased: false, escapeProgress: 0 };` (Add class property, use as fallback)

9. src/core/Engine.ts:1946
   `private readonly _actionContext = { isTased: false, isNearCar: false, isNearAwaitingVehicle: false, isInVehicle: false };` (Add class property, update properties in update loop)
