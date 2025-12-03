## Asset Compression Plan (Awaiting Per-Asset Approval)

### Goals
- Reduce download and preload times for GLB + texture payloads without perceptible quality loss.
- Keep runtime decoding costs manageable (meshopt/Draco decode on web workers, KTX2 GPU upload).
- Provide a gated rollout so you can review each asset before it ships.

### Current Heavy Assets (top-level samples)
- `public/assets/boxman.glb` – 2.0 MB (primary player rig used everywhere).
- `public/assets/vehicles/*.glb` – 0.6–1.4 MB each (bike, motorbike, sedan, truck).
- `public/assets/pedestrians/**/*.glb` – ~300–500 KB each but loaded in batches (pooling benefits from compression).
- `public/assets/props/**/*.glb` – varied; some >400 KB (e.g., barricades, trees) repeated many times.
- Texture atlases under `public/assets/textures` (PNG, up to ~1 MB) currently uncompressed.

### Proposed Pipeline
1. **Inventory & Backup**
   - Mirror the original GLBs/textures into `public/assets/original/` before touching anything.
   - Record file size + checksum so we can revert instantly per asset.
2. **Geometry Compression**
   - Use [meshoptimizer](https://github.com/zeux/meshoptimizer) `gltfpack` first (fast decode, minimal runtime changes).
   - Fall back to Draco only if meshopt gains <20% (Draco decode is slower; would need WASM decoder confirmation).
   - Enable quantization + animation compression, but keep normals tangent quality high for characters.
3. **Texture Compression**
   - Convert large PNGs/JPEGs to KTX2 via `toktx --bcmp` (Basis Universal) for GPU-friendly uploads.
   - Maintain original color space (sRGB vs linear) per texture; verify with viewer before shipping.
4. **Validation Checklist per Asset** *(performed before you approve merge)*
   - Load GLB in `npm run dev` + Sketchfab viewer to compare shading, rigging, animation loops.
   - Verify collider dimensions unchanged (compression should not alter node hierarchy).
   - Measure preload timing difference with Chrome DevTools/Network throttling.
   - For textures: confirm there is no banding/pixel crawl on emissive effects.
5. **Staged Rollout**
   - Stage A: Characters (`boxman.glb`, cop/pedestrian riders).
   - Stage B: Vehicles + props.
   - Stage C: Remaining pedestrians/weapons + texture atlases.
   - After each stage, pause for your QA sign-off before progressing.

### Tooling Needed
- Add `meshoptimizer-cli` + `gltf-transform` as devDependencies for deterministic scripts.
- Install `@google/ktx2df` or `toktx` binaries for generating KTX2 files.
- Create `scripts/compress-assets.ts` to wrap the commands and log before/after stats (dry-run capable).

### Next Action (Pending Your Go-Ahead)
- Kick off Stage A by compressing `boxman.glb` via meshopt (target ~40% reduction) and present side-by-side captures for review.
- Hold off on any binary replacement until you approve each candidate binary.
