# Character Recolor Guide

This guide documents how to recolor the Rogue character model using Blender's Python API.

## Overview

The character uses a single texture file (`rogue_texture`, 1024x1024 pixels) that contains all colors for the model. We modify specific color ranges in this texture to achieve the desired appearance.

## Color Changes

### 1. Hood/Cape: Dark Green → Dark Grey (25%)

**Original Colors:**
- Dark green range with RGB values around (0, 50-110, 40-80)
- Hex examples: `#003427`, `#003627`, `#00422A`

**Target Color:**
- Dark grey at 25% brightness
- RGB: (64, 64, 64) or `#404040`

**Logic:**
```python
# Identify: green channel dominant, between 50-110
if g > r and g > b and g_int > 50 and g_int < 110:
    pixels[y, x] = [0.25, 0.25, 0.25, a]  # 25% grey
```

### 2. Tunic/Mask/Sleeves: Teal Green → Black

**Original Colors:**
- Bright teal/cyan greens with high green AND blue values
- Hex examples: `#228993`, `#00FFFF`, `#2B918C`, `#319687`

**Target Color:**
- Pure black
- RGB: (0, 0, 0) or `#000000`

**Logic:**
```python
# Identify: high green (>110) OR high green+blue (teal)
if (g_int > r_int and g_int > b_int and g_int > 110) or
   (g_int > 100 and b_int > 100 and g_int > r_int):
    pixels[y, x] = [0.0, 0.0, 0.0, a]  # Black
```

### 3. Skin: Peachy/Beige → Darker (40% reduction)

**Original Colors:**
- Light peachy/beige skin tones with high RGB values
- Hex examples: `#F8CCAB`, `#F2A87E`, `#F7C4A1`, `#F7C7A5`

**Target Color:**
- 40% darker (multiply by 0.6)
- Example: `#F8CCAB` (248, 204, 171) → `#967A66` (149, 122, 102)

**Logic:**
```python
# Identify: peachy/beige with all high values
if r_int > 180 and g_int > 150 and b_int > 100:
    pixels[y, x] = [r * 0.6, g * 0.6, b * 0.6, a]  # 40% darker
```

### 4. Hair/Eyebrows: Dark Brown → Black

**Original Colors:**
- Dark brown range (darker than clothing browns)
- Hex examples: `#7D3D2C`, `#9B5A45`, `#837265`, `#534741`

**Target Color:**
- Pure black
- RGB: (0, 0, 0) or `#000000`

**Logic:**
```python
# Identify: dark browns only (r < 0.65), keep light browns (clothing)
if r > g and r > b and r > 0.3 and r < 0.65 and b < 0.4:
    pixels[y, x] = [0.0, 0.0, 0.0, a]  # Black
```

**Note:** This preserves light brown clothing while changing only hair/eyebrows.

### 5. Brown Clothes: Light Brown → Dark Brown (50% darker)

**Original Colors:**
- Light brown clothing (belt, boots, straps)
- Hex examples: `#B27052`, `#C8855F`, `#B06E51`, `#AE6C50`

**Target Color:**
- 50% darker (multiply by 0.5)
- Example: `#B27052` (178, 112, 82) → `#593829` (89, 56, 41)

**Logic:**
```python
# Identify: light browns (r >= 0.65), make them darker
if r >= 0.65 and r > g and r > b and b < 0.4:
    pixels[y, x] = [r * 0.5, g * 0.5, b * 0.5, a]  # 50% darker
```

## Full Implementation Script

```python
import bpy
import numpy as np

# Clear scene and load model
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

for img in list(bpy.data.images):
    bpy.data.images.remove(img)

# Import Rogue_Hooded model
bpy.ops.import_scene.gltf(
    filepath='/Users/gorkolas/Documents/www/rampage/public/assets/characters/Rogue_Hooded.glb'
)

# Get texture
img = bpy.data.images.get('rogue_texture')

if img:
    width, height = img.size
    pixels = np.array(img.pixels[:]).reshape((height, width, 4))

    hood_count = 0
    green_count = 0
    skin_count = 0
    hair_count = 0
    light_brown_count = 0

    # Process each pixel
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[y, x]

            # Convert to 0-255 range for easier comparison
            r_int = int(r * 255)
            g_int = int(g * 255)
            b_int = int(b * 255)

            # 1. Hood/cape: dark green → 25% grey
            if g > r and g > b and g_int > 50 and g_int < 110:
                pixels[y, x] = [0.25, 0.25, 0.25, a]
                hood_count += 1

            # 2. Tunic/mask/sleeves: teal greens → black
            elif (g_int > r_int and g_int > b_int and g_int > 110) or \
                 (g_int > 100 and b_int > 100 and g_int > r_int):
                pixels[y, x] = [0.0, 0.0, 0.0, a]
                green_count += 1

            # 3. Skin: peachy/beige → 40% darker
            elif r_int > 180 and g_int > 150 and b_int > 100:
                pixels[y, x] = [r * 0.6, g * 0.6, b * 0.6, a]
                skin_count += 1

            # 4. Hair/eyebrows: dark browns only → black
            elif r > g and r > b and r > 0.3 and r < 0.65 and b < 0.4:
                pixels[y, x] = [0.0, 0.0, 0.0, a]
                hair_count += 1

            # 5. Brown clothes: light browns → dark brown (50% darker)
            elif r >= 0.65 and r > g and r > b and b < 0.4:
                pixels[y, x] = [r * 0.5, g * 0.5, b * 0.5, a]
                light_brown_count += 1

    # Write pixels back to texture
    img.pixels[:] = pixels.flatten()
    img.update()

    # IMPORTANT: Pack texture into blend file
    img.pack()

    print(f"Hood → grey: {hood_count} pixels")
    print(f"Green clothing/mask → black: {green_count} pixels")
    print(f"Skin → darker: {skin_count} pixels")
    print(f"Hair/eyebrows → black: {hair_count} pixels")
    print(f"Brown clothes → dark brown: {light_brown_count} pixels")

# Export to boxman.glb
bpy.ops.object.select_all(action='SELECT')

bpy.ops.export_scene.gltf(
    filepath='/Users/gorkolas/Documents/www/rampage/public/assets/boxman.glb',
    export_format='GLB'
)

print("✓ Exported to boxman.glb")
```

## Important Notes

### 1. Always Pack the Texture
Before exporting, call `img.pack()` to embed the modified texture into the Blender file. Otherwise, the texture changes won't be included in the GLB export.

### 2. Avoid Changing Skin Tones
The script carefully avoids modifying skin/face colors by:
- Using specific green value ranges (50-110 for hood, >110 for clothing)
- Checking that green is dominant over red and blue
- Skin tones have balanced RGB values, so they're not caught by these filters

### 3. Color Value Ranges
- Blender uses 0.0-1.0 for colors internally
- Convert to 0-255 for easier human-readable comparisons
- Convert back to 0.0-1.0 when writing pixels

### 4. Brightness Percentages
- 100% = 1.0 (white)
- 50% = 0.5 (medium grey)
- 25% = 0.25 (dark grey)
- 0% = 0.0 (black)

## Color Identification Helper

To identify which colors to change, use this script:

```python
import bpy
import numpy as np
from collections import Counter

img = bpy.data.images.get('rogue_texture')

if img:
    pixels = np.array(img.pixels[:]).reshape((img.size[1], img.size[0], 4))

    target_colors = []

    for y in range(img.size[1]):
        for x in range(img.size[0]):
            r, g, b, a = pixels[y, x]

            # Modify this condition to find specific color ranges
            if g > r and g > b and g > 0.2:  # Example: find all greens
                hex_color = f"#{int(r*255):02X}{int(g*255):02X}{int(b*255):02X}"
                target_colors.append(hex_color)

    # Count occurrences
    color_counts = Counter(target_colors)

    print(f"Found {len(target_colors)} pixels")
    print("\nTop colors:")
    for color, count in color_counts.most_common(15):
        print(f"  {color}: {count} pixels")
```

## Troubleshooting

### Changes don't appear in game
1. Verify texture was packed: `img.pack()`
2. Check export settings use `GLB` format
3. Clear browser cache (hard refresh with Cmd+Shift+R)

### Wrong colors changed
- Sample the exact color values first using the identification helper
- Narrow the RGB range conditions
- Test on a small range before processing entire texture

### Face/skin changed by mistake
- Ensure green dominance check: `g > r * 1.2` (at least 20% more green than red)
- Avoid using broad ranges that catch neutral tones
- Skin typically has r ≈ g ≈ b (balanced)
