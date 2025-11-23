# Character Integration Guide

This guide documents how to integrate the complete character model with animations, weapons, and texture modifications into the game.

## Overview

The `boxman.glb` file is created by combining:
1. Rogue_Hooded character model with texture modifications
2. Animation sets (General, MovementBasic, CombatMelee)
3. Weapon (dagger) parented to hand bone
4. Single armature with all animations merged

## Complete Integration Script

This script performs all steps to create the final `boxman.glb`:

```python
import bpy
import math
from mathutils import Matrix
import numpy as np

# ====================
# 1. CLEAR AND IMPORT
# ====================

# Clear everything
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for mesh in list(bpy.data.meshes):
    bpy.data.meshes.remove(mesh)
for arm in list(bpy.data.armatures):
    bpy.data.armatures.remove(arm)
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
for img in list(bpy.data.images):
    bpy.data.images.remove(img)

print("✓ Scene cleared")

# Import character and animations
bpy.ops.import_scene.gltf(filepath='/path/to/Rogue_Hooded.glb')
bpy.ops.import_scene.gltf(filepath='/path/to/Rig_Medium_General.glb')
bpy.ops.import_scene.gltf(filepath='/path/to/Rig_Medium_MovementBasic.glb')
bpy.ops.import_scene.gltf(filepath='/path/to/Rig_Medium_CombatMelee.glb')
bpy.ops.import_scene.gltf(filepath='/path/to/dagger.gltf')

print("✓ Imported character, animations, and dagger")

# ====================
# 2. CLEANUP DUPLICATES
# ====================

# Remove duplicate armatures and unwanted objects
to_delete_names = []
kept_armature = None

for obj in bpy.data.objects:
    # Remove mannequin meshes and other unwanted objects
    if 'Icosphere' in obj.name or 'Mannequin' in obj.name or 'Cape' in obj.name:
        to_delete_names.append(obj.name)
    # Keep only first armature, delete duplicates
    elif obj.type == 'ARMATURE':
        if kept_armature is None:
            kept_armature = obj.name
        else:
            to_delete_names.append(obj.name)

for name in to_delete_names:
    obj = bpy.data.objects.get(name)
    if obj:
        bpy.data.objects.remove(obj, do_unlink=True)

print(f"✓ Cleaned up scene, kept armature: {kept_armature}")

# ====================
# 3. TEXTURE MODIFICATIONS
# ====================

img = bpy.data.images.get('rogue_texture')

if img:
    width, height = img.size
    pixels = np.array(img.pixels[:]).reshape((height, width, 4))

    hood_count = 0
    green_count = 0
    skin_count = 0
    dark_hair_count = 0
    light_brown_count = 0

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[y, x]

            r_int = int(r * 255)
            g_int = int(g * 255)
            b_int = int(b * 255)

            # 1. Hood/cape: dark green → 25% grey
            if g > r and g > b and g_int > 50 and g_int < 110:
                pixels[y, x] = [0.25, 0.25, 0.25, a]
                hood_count += 1

            # 2. Tunic/mask: teal green → black
            elif (g_int > r_int and g_int > b_int and g_int > 110) or \
                 (g_int > 100 and b_int > 100 and g_int > r_int):
                pixels[y, x] = [0.0, 0.0, 0.0, a]
                green_count += 1

            # 3. Skin: peachy/beige → 40% darker
            elif r_int > 180 and g_int > 150 and b_int > 100:
                pixels[y, x] = [r * 0.6, g * 0.6, b * 0.6, a]
                skin_count += 1

            # 4. Hair/eyebrows: dark browns → black
            elif r > g and r > b and r > 0.3 and r < 0.65 and b < 0.4:
                pixels[y, x] = [0.0, 0.0, 0.0, a]
                dark_hair_count += 1

            # 5. Brown clothes: light browns → dark brown
            elif r >= 0.65 and r > g and r > b and b < 0.4:
                pixels[y, x] = [r * 0.5, g * 0.5, b * 0.5, a]
                light_brown_count += 1

    # Apply changes
    img.pixels[:] = pixels.flatten()
    img.update()
    img.pack()

    print(f"✓ Texture modified:")
    print(f"  Hood: {hood_count} pixels → grey")
    print(f"  Green clothes: {green_count} pixels → black")
    print(f"  Skin: {skin_count} pixels → darker")
    print(f"  Hair: {dark_hair_count} pixels → black")
    print(f"  Brown clothes: {light_brown_count} pixels → dark brown")

# ====================
# 4. ATTACH WEAPON
# ====================

dagger = bpy.data.objects.get('dagger')
armature = bpy.data.objects.get('Rig_Medium')

if dagger and armature:
    # Rotate dagger to correct orientation
    rotation_matrix = Matrix.Rotation(-math.pi / 2, 4, 'X')
    mesh = dagger.data
    for vertex in mesh.vertices:
        vertex.co = (rotation_matrix @ vertex.co.to_4d()).to_3d()

    # Parent dagger to right hand bone
    dagger.parent = armature
    dagger.parent_type = 'BONE'
    dagger.parent_bone = 'handslot.r'
    dagger.location = (0, 0, 0)
    dagger.rotation_euler = (0, 0, 0)

    print("✓ Dagger attached to right hand (handslot.r)")

    # Ensure animation data exists
    if not armature.animation_data:
        armature.animation_data_create()

# ====================
# 5. EXPORT
# ====================

output_path = '/path/to/boxman.glb'

bpy.ops.object.select_all(action='SELECT')

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    use_selection=False,
    export_animations=True
)

print(f"✓✓✓ COMPLETE export to {output_path}")
print("Includes:")
print("  - Recolored Rogue character")
print("  - All animations (General, Movement, Combat)")
print("  - Dagger attached to right hand")
```

## File Paths Used

Update these paths to match your file structure:

```python
# Character
'/Users/gorkolas/Documents/www/rampage/public/assets/characters/Rogue_Hooded.glb'

# Animations
'/Users/gorkolas/Documents/www/rampage/public/assets/animations/Rig_Medium_General.glb'
'/Users/gorkolas/Documents/www/rampage/public/assets/animations/Rig_Medium_MovementBasic.glb'
'/Users/gorkolas/Documents/www/rampage/public/assets/animations/Rig_Medium_CombatMelee.glb'

# Weapon
'/Users/gorkolas/Documents/www/rampage/public/assets/weapons/dagger.gltf'

# Output
'/Users/gorkolas/Documents/www/rampage/public/assets/boxman.glb'
```

## Animation Sets Included

### General Animations (Rig_Medium_General.glb)
- Idle_A, Idle_B
- Reset
- Various interaction animations

### Movement Animations (Rig_Medium_MovementBasic.glb)
- Walking_A, Walking_B, Walking_C
- Running_A, Running_B, Running_C
- Jump_Full_Short, Jump_Full_Long
- Jump_Idle, Jump_Running

### Combat Melee Animations (Rig_Medium_CombatMelee.glb)
- Melee_1H_Attack_Chop
- Melee_1H_Attack_Slice_Diagonal
- Melee_1H_Attack_Slice_Horizontal
- Melee_1H_Attack_Stab
- Melee_1H_Attack_Jump_Chop

## Armature Structure

The character uses a humanoid armature with these key bones:

- **handslot.r** - Right hand weapon attachment point
- **handslot.l** - Left hand weapon attachment point
- **root** - Root bone for character movement
- **hips** - Hip bone for body animations

All animations target this armature structure, so they work automatically when imported together.

## Texture Modifications Summary

All modifications are applied to `rogue_texture` (1024x1024):

1. **Hood/Cape**: Dark green (#003427-#00422A) → Dark grey 25% (#404040)
2. **Tunic/Mask**: Teal green (#228993, #00FFFF) → Black (#000000)
3. **Skin**: Peachy (#F8CCAB) → 40% darker (#967A66)
4. **Hair/Eyebrows**: Dark brown (#7D3D2C) → Black (#000000)
5. **Clothes**: Light brown (#B27052) → Dark brown 50% (#593829)

## Troubleshooting

### Animations don't play
- Ensure `export_animations=True` in export settings
- Verify armature has animation_data created
- Check that all actions are assigned to the same armature

### Weapon not visible
- Verify bone name is exactly `handslot.r` (case-sensitive)
- Check weapon is parented with `parent_type='BONE'`
- Ensure weapon mesh was rotated before parenting

### Texture not updated
- Always call `img.pack()` before exporting
- Verify pixel modifications were applied with `img.update()`
- Check that modifications occur before export

### File size too large
- Consider using lower resolution animations if needed
- Ensure duplicate armatures were deleted
- Remove unused animation sets if not needed

## Integration with Game Code

The game loads this file in `Player.ts`:

```typescript
const gltf = await loader.loadAsync('/assets/boxman.glb');
this.mixer = new THREE.AnimationMixer(gltf.scene);
this.animations = gltf.animations;
```

Animations are played by name:
```typescript
this.playAnimation('Running_A', 0.1);
this.playAnimation('Melee_1H_Attack_Stab', 0.05);
```
