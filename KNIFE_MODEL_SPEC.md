# KNIFE MODEL SPECIFICATION FOR GEMINI

## Context
I have a 3D character (boxman) with an attack animation. The character's right arm performs a stabbing motion. I need to add a visible knife model that is parented to the right hand bone, so it moves with the hand during the attack animation.

## Current Setup
- Character model: `/Users/gorkolas/Documents/www/rampage/public/assets/boxman.glb`
- Armature with 14 bones
- Right arm bones: `arm_upper.R` → `arm_lower.R`
- Attack animation: `knife_attack_upper` (arms-only overlay animation)

## Bone Hierarchy (relevant section)
```
arm_upper.R
  └── arm_lower.R
```

## What I Need From You

Design a **large, aggressive combat knife** model specification that I can create in Blender and attach to the character's right hand.

### Knife Requirements:
1. **Style**: Large tactical combat knife (think military/survival knife)
2. **Size**: Blade should be ~0.3-0.4 Blender units long (visible and intimidating)
3. **Grip**: Handle positioned so knife points forward from fist
4. **Blade orientation**: Blade pointing forward (along +Y axis when held)
5. **Simple geometry**: Low-poly (50-100 triangles max for performance)

### Provide the Following Specification:

#### 1. Mesh Geometry (Vertex positions)
Provide vertex coordinates for a simple knife mesh:
- Blade (rectangular with pointed tip)
- Handle/grip
- Guard (crossguard between blade and handle)

**Format:**
```
Vertices (in local space, origin at grip center):
v1: (x, y, z)
v2: (x, y, z)
...

Faces (triangle indices):
f1: v1, v2, v3
f2: v1, v3, v4
...
```

#### 2. Parenting Information
- **Parent bone**: `arm_lower.R` (this is the forearm/hand bone)
- **Position offset** from bone origin: (x, y, z)
- **Rotation offset** from bone rotation: (x, y, z) in Euler angles or (w, x, y, z) quaternion

#### 3. Material/Color
Simple single color is fine:
- Blade color: (R, G, B) - metallic gray/silver
- Handle color: (R, G, B) - black or dark brown

#### 4. Expected Result
When attached, the knife should:
- Appear in the character's right hand
- Point forward (blade tip ahead of fist)
- Move naturally with the stabbing animation
- Be visible from the isometric camera angle

---

## Implementation Note
Once you provide this specification, I will use Blender MCP to:
1. Create the knife mesh with your vertex data
2. Parent it to `arm_lower.R` bone
3. Apply your position/rotation offsets
4. Add simple materials
5. Export the updated boxman.glb

Please provide the complete specification above.
