# KNIFE ATTACHMENT SPECIFICATION FOR GEMINI

## Problem
I have successfully created a knife mesh in Blender, but I cannot get it to attach properly to the character's hand. The knife keeps appearing on the ground instead of in the character's grip.

## Current Situation

### Character Bone Structure (14 bones)
```
root (ROOT)
  └── butt_bone
      └── body_IK
          ├── arm_upper.L
          │   └── arm_lower.L
          ├── arm_upper.R (right shoulder/upper arm)
          │   └── arm_lower.R (right forearm/hand)
          ├── body_lower
          │   └── body_upper
          │       └── head
          ├── leg_upper.L
          │   └── leg_lower.L
          └── leg_upper.R
              └── leg_lower.R
```

### Right Arm Bone Details (from Blender)
```
arm_lower.R (forearm/hand bone):
  Head (world space): (-0.2991, -0.0633, 0.5781)
  Tail (world space): (-0.5598, 0.2842, 0.6167)
  Length: 1.147612 Blender units
```

### Character Scale Reference (MEASURED FROM ACTUAL MODEL)
```
Character mesh dimensions:
  Width (X): 0.515 units
  Depth (Y): 0.449 units
  Height (Z): 0.845 units (actual character height)

Bone measurements (local space):
  arm_upper.R (upper arm):
    Head: (-0.521, -0.000, 1.824)
    Tail: (-0.521, 0.058, 0.678)
    Length: 1.148 units

  arm_lower.R (forearm/hand):
    Head: (-0.521, 0.022, 1.388)
    Tail: (-0.521, -0.035, 0.242)
    Length: 1.148 units

Character style: Chunky/blocky low-poly style (voxel-like)

Recommended knife size (proportional to ~0.85 unit tall character):
  - Total length: 0.15-0.20 units (proportional to hand size)
  - Blade length: 0.10-0.15 units
  - Handle length: 0.04-0.06 units
  - Blade width: 0.015-0.025 units
```

### Knife Mesh (FAILED ATTEMPTS)
- I tried creating a knife with 14 vertices but it **doesn't look like a knife at all**
- It's just a deformed blob/shape
- I need you to create proper knife geometry from scratch

### What I've Tried (ALL FAILED)
1. Created bad knife geometry that doesn't look like a knife
2. Set `parent_type = 'BONE'` with `parent_bone = 'arm_lower.R'`
3. Added Armature modifier with vertex groups
4. Used Child Of constraint
5. Set various location offsets and rotations

**Result:** The shape doesn't look like a knife AND it appears on the ground, not in hand.

---

## What I Need From You

Provide a **complete step-by-step Blender Python script** that will:

1. Load the existing GLB: `/Users/gorkolas/Documents/www/rampage/public/assets/boxman.glb`
2. **CREATE PROPER KNIFE GEOMETRY** - I failed at this, you need to make vertices/faces that actually look like a combat knife
3. **CORRECTLY** attach it to the right hand so it appears gripped in the fist
4. Export the updated GLB

**IMPORTANT:** I need you to design the knife mesh geometry. Make it look like an actual knife with:
- A recognizable blade shape (pointed tip, sharp edge)
- A handle/grip
- Proper proportions (~0.3-0.5 units total length)

### Critical Requirements:

#### 1. Which Bone to Use?
- Should I use `arm_lower.R` (forearm) or does the rig have a separate hand bone I'm missing?
- If there's no hand bone, what's the correct approach?

#### 2. Exact Attachment Method
Provide the EXACT code including:
- How to parent the knife object
- Whether to use bone parenting, vertex groups, or constraints
- The exact matrix transformations needed

#### 3. Position and Rotation Offsets
Given the bone head/tail positions above, calculate:
- **Local position offset** from bone origin (x, y, z)
- **Local rotation** (Euler or quaternion)
- Should the knife point along bone's +Y axis, +Z axis, or other?

#### 4. Orientation
The knife should:
- Point **forward** from the fist (in the direction of a punch/stab)
- Blade tip ahead of the grip
- Handle inside the closed fist
- Be visible from an isometric camera at (2.5, 6.25, 2.5) looking at origin

---

## Expected Output Format

Please provide a complete Python script that I can run via Blender MCP:

```python
import bpy

# 1. Load existing GLB
bpy.ops.wm.read_homefile(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/Users/gorkolas/Documents/www/rampage/public/assets/boxman.glb')

# 2. Get armature
armature = bpy.data.objects.get('Armature')

# 3. Create knife mesh
# [YOUR KNIFE GEOMETRY HERE]

# 4. Attach to hand bone
# [YOUR EXACT ATTACHMENT CODE HERE]
# Include:
# - Parenting method
# - Position offset
# - Rotation offset
# - Any modifiers/constraints needed

# 5. Export
bpy.ops.export_scene.gltf(
    filepath='/Users/gorkolas/Documents/www/rampage/public/assets/boxman.glb',
    export_format='GLB'
)

print("Success: Knife attached to right hand")
```

### Notes:
- The knife should be **visible and large** (scale 5x is fine for testing)
- Use **bright red material** so I can see it clearly
- The attachment must survive GLB export/import (Three.js will load it)
- The knife must move with the hand during animations

---

## Why This is Difficult

The issue seems to be that bone-parented objects in Blender don't export correctly to GLB, or I'm using the wrong bone space coordinates. I need someone who understands:
- Blender's bone coordinate systems (local vs. world)
- GLB export requirements for rigged accessories
- How to properly weight/skin an object to a bone for export

Please provide a working solution with exact code.
