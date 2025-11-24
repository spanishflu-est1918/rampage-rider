# BOXMAN.GLB ANIMATION COMPLETE SPECIFICATION

## File Location
`/Users/gorkolas/Documents/www/rampage/public/assets/boxman.glb`

## Bone Structure (14 bones total)
```
root (ROOT)
  └── butt_bone
      └── body_IK
          ├── arm_upper.L
          │   └── arm_lower.L
          ├── arm_upper.R
          │   └── arm_lower.R
          ├── body_lower
          │   └── body_upper
          │       └── head
          ├── leg_upper.L
          │   └── leg_lower.L
          └── leg_upper.R
              └── leg_lower.R
```

## All 109 Animations
```
1. close_door_sitting_left - 18 frames
2. close_door_sitting_left.001 - 18 frames
3. close_door_sitting_left.002 - 18 frames
4. close_door_sitting_right - 18 frames
5. close_door_sitting_right.001 - 18 frames
6. close_door_sitting_right.002 - 18 frames
7. close_door_standing_left - 20 frames
8. close_door_standing_left.001 - 20 frames
9. close_door_standing_left.002 - 20 frames
10. close_door_standing_right - 20 frames
11. close_door_standing_right.001 - 20 frames
12. close_door_standing_right.002 - 20 frames
13. driving - 5 frames
14. driving.001 - 5 frames
15. driving.002 - 5 frames
16. drop_idle - 12 frames
17. drop_idle.001 - 12 frames
18. drop_idle.002 - 12 frames
19. drop_running - 6 frames
20. drop_running.001 - 6 frames
21. drop_running.002 - 6 frames
22. drop_running_roll - 13 frames
23. drop_running_roll.001 - 13 frames
24. drop_running_roll.002 - 13 frames
25. enter_airplane_left - 28 frames
26. enter_airplane_left.001 - 28 frames
27. enter_airplane_left.002 - 28 frames
28. enter_airplane_right - 28 frames
29. enter_airplane_right.001 - 28 frames
30. enter_airplane_right.002 - 28 frames
31. falling - 20 frames
32. falling.001 - 20 frames
33. falling.002 - 20 frames
34. idle - 20 frames
35. idle.001 - 20 frames
36. idle.002 - 20 frames
37. jump_idle - 12 frames
38. jump_idle.001 - 12 frames
39. jump_idle.002 - 12 frames
40. jump_running - 18 frames
41. jump_running.001 - 18 frames
42. jump_running.002 - 18 frames
43. knife_attack - 11 frames
44. knife_attack.001 - 11 frames
45. knife_attack.002 - 11 frames
46. knife_attack.003 - 11 frames
47. knife_attack.004 - 11 frames
48. knife_attack.005 - 11 frames
49. knife_attack_running - 10 frames ← BROKEN - NEEDS RECREATION
50. open_door_standing_left - 14 frames
51. open_door_standing_left.001 - 14 frames
52. open_door_standing_left.002 - 14 frames
53. open_door_standing_right - 14 frames
54. open_door_standing_right.001 - 14 frames
55. open_door_standing_right.002 - 14 frames
56. reset - 5 frames
57. reset.001 - 5 frames
58. reset.002 - 5 frames
59. rotate_left - 16 frames
60. rotate_left.001 - 16 frames
61. rotate_left.002 - 16 frames
62. rotate_right - 16 frames
63. rotate_right.001 - 16 frames
64. rotate_right.002 - 16 frames
65. run - 15 frames
66. run.001 - 15 frames
67. run.002 - 15 frames
68. sit_down_left - 14 frames
69. sit_down_left.001 - 14 frames
70. sit_down_left.002 - 14 frames
71. sit_down_right - 14 frames
72. sit_down_right.001 - 14 frames
73. sit_down_right.002 - 14 frames
74. sitting - 12 frames
75. sitting.001 - 12 frames
76. sitting.002 - 12 frames
77. sitting_shift_left - 12 frames
78. sitting_shift_left.001 - 12 frames
79. sitting_shift_left.002 - 12 frames
80. sitting_shift_right - 12 frames
81. sitting_shift_right.001 - 12 frames
82. sitting_shift_right.002 - 12 frames
83. sprint - 10 frames ← BASE FOR KNIFE ATTACK
84. sprint.001 - 10 frames
85. sprint.002 - 10 frames
86. stand_up_left - 14 frames
87. stand_up_left.001 - 14 frames
88. stand_up_left.002 - 14 frames
89. stand_up_right - 14 frames
90. stand_up_right.001 - 14 frames
91. stand_up_right.002 - 14 frames
92. start_back_left - 10 frames
93. start_back_left.001 - 10 frames
94. start_back_left.002 - 10 frames
95. start_back_right - 10 frames
96. start_back_right.001 - 10 frames
97. start_back_right.002 - 10 frames
98. start_forward - 10 frames
99. start_forward.001 - 10 frames
100. start_forward.002 - 10 frames
101. start_left - 10 frames
102. start_left.001 - 10 frames
103. start_left.002 - 10 frames
104. start_right - 10 frames
105. start_right.001 - 10 frames
106. start_right.002 - 10 frames
107. stop - 16 frames
108. stop.001 - 16 frames
109. stop.002 - 16 frames
```

---

## ANIMATION KEYFRAME DATA (COMPLETE)

### IDLE (20 frames) - Character standing still
```
Frame 0:
  arm_upper.R:
    location: (-0.000, 0.000, -0.000)
    rotation_quaternion: (1.000, -0.000, 0.000, 0.000)
  arm_lower.R:
    location: (0.000, -0.000, 0.000)
    rotation_quaternion: (1.000, 0.000, -0.000, 0.000)
  leg_upper.L:
    location: (-0.000, 0.000, 0.000)
    rotation_quaternion: (0.964, -0.253, -0.075, 0.000)
  leg_upper.R:
    location: (0.000, -0.000, 0.000)
    rotation_quaternion: (0.958, -0.230, 0.162, 0.000)
  body_IK:
    location: (0.011, 0.006, -0.039)
    rotation_quaternion: (0.993, 0.107, -0.000, 0.000)

Frame 10:
  arm_upper.R:
    location: (-0.005, 0.029, 0.005)
    rotation_quaternion: (1.000, -0.000, 0.000, 0.000)
  arm_lower.R:
    location: (0.000, -0.000, 0.000)
    rotation_quaternion: (1.000, 0.000, -0.000, 0.000)
  leg_upper.L:
    location: (-0.000, -0.000, 0.000)
    rotation_quaternion: (0.968, -0.238, -0.072, 0.000)
  leg_upper.R:
    location: (-0.000, 0.000, 0.000)
    rotation_quaternion: (0.962, -0.209, 0.162, 0.000)
  body_IK:
    location: (0.015, 0.006, -0.047)
    rotation_quaternion: (0.996, 0.075, 0.001, 0.000)

Frame 20:
  arm_upper.R:
    location: (-0.000, 0.000, -0.000)
    rotation_quaternion: (1.000, -0.000, 0.000, 0.000)
  arm_lower.R:
    location: (0.000, -0.000, 0.000)
    rotation_quaternion: (1.000, 0.000, -0.000, 0.000)
  leg_upper.L:
    location: (-0.000, -0.000, 0.000)
    rotation_quaternion: (0.964, -0.254, -0.075, 0.000)
  leg_upper.R:
    location: (-0.000, 0.000, 0.000)
    rotation_quaternion: (0.958, -0.230, 0.161, 0.000)
  body_IK:
    location: (0.011, 0.007, -0.039)
    rotation_quaternion: (0.993, 0.107, -0.000, 0.000)
```

---

### SPRINT (10 frames) - Fast running (BASE FOR KNIFE ATTACK)
```
Frame 0:
  arm_upper.R:
    location: (0.000, 0.069, 0.004)
    rotation_quaternion: (1.000, 0.000, 0.000, 0.000) ← NO ARM ROTATION
  arm_lower.R:
    location: (-0.000, 0.000, 0.000)
    rotation_quaternion: (1.000, -0.000, -0.000, 0.000)
  leg_upper.L:
    location: (0.000, -0.000, -0.000)
    rotation_quaternion: (0.969, -0.229, 0.031, 0.000) ← LEFT LEG FORWARD
  leg_upper.R:
    location: (0.000, -0.000, -0.000)
    rotation_quaternion: (-0.615, 0.777, -0.114, 0.000) ← RIGHT LEG BACK
  body_IK:
    location: (0.011, 0.006, -0.139)
    rotation_quaternion: (0.956, 0.289, -0.010, 0.000) ← BODY LEANING FORWARD

Frame 5:
  arm_upper.R:
    location: (-0.003, 0.119, 0.016)
    rotation_quaternion: (1.000, 0.000, 0.000, 0.000) ← NO ARM ROTATION
  arm_lower.R:
    location: (-0.000, 0.000, 0.000)
    rotation_quaternion: (1.000, -0.000, -0.000, 0.000)
  leg_upper.L:
    location: (0.000, -0.000, -0.000)
    rotation_quaternion: (0.653, -0.757, -0.035, 0.000) ← LEFT LEG BACK
  leg_upper.R:
    location: (0.000, -0.000, -0.000)
    rotation_quaternion: (-0.975, 0.203, -0.062, 0.000) ← RIGHT LEG FORWARD
  body_IK:
    location: (0.011, 0.006, -0.139)
    rotation_quaternion: (0.956, 0.289, -0.010, 0.000)

Frame 10:
  arm_upper.R:
    location: (0.000, 0.069, 0.004)
    rotation_quaternion: (1.000, 0.000, 0.000, 0.000)
  arm_lower.R:
    location: (-0.000, 0.000, 0.000)
    rotation_quaternion: (1.000, -0.000, -0.000, 0.000)
  leg_upper.L:
    location: (0.000, -0.000, -0.000)
    rotation_quaternion: (0.969, -0.229, 0.031, 0.000)
  leg_upper.R:
    location: (0.000, -0.000, -0.000)
    rotation_quaternion: (-0.615, 0.777, -0.114, 0.000)
  body_IK:
    location: (0.011, 0.006, -0.139)
    rotation_quaternion: (0.956, 0.289, -0.010, 0.000)
```

---

### JUMP_RUNNING (18 frames) - REFERENCE (THIS WORKS CORRECTLY)
```
Frame 0:
  arm_upper.R:
    location: (-0.000, 0.000, -0.000)
    rotation_quaternion: (1.000, -0.000, -0.000, 0.000)
  arm_lower.R:
    location: (0.000, -0.000, 0.000)
    rotation_quaternion: (1.000, 0.000, -0.000, 0.000)
  leg_upper.L:
    location: (-0.000, -0.000, 0.000)
    rotation_quaternion: (0.987, -0.010, -0.110, 0.000)
  leg_upper.R:
    location: (0.000, 0.000, 0.000)
    rotation_quaternion: (0.820, -0.554, 0.124, 0.000)
  body_IK:
    location: (0.011, 0.006, -0.039) ← GROUND LEVEL
    rotation_quaternion: (0.993, 0.107, -0.000, 0.000)

Frame 9 (peak jump):
  arm_upper.R:
    location: (-0.000, -0.005, -0.000)
    rotation_quaternion: (1.000, -0.000, -0.000, 0.000)
  arm_lower.R:
    location: (0.000, -0.000, 0.000)
    rotation_quaternion: (1.000, 0.000, -0.000, 0.000)
  leg_upper.L:
    location: (-0.000, -0.000, 0.000)
    rotation_quaternion: (0.494, -0.865, -0.039, 0.000)
  leg_upper.R:
    location: (-0.000, -0.000, 0.000)
    rotation_quaternion: (0.692, -0.698, 0.122, 0.000)
  body_IK:
    location: (0.014, -0.047, 0.210) ← ELEVATED IN AIR
    rotation_quaternion: (0.983, 0.178, 0.008, 0.000)

Frame 18:
  arm_upper.R:
    location: (-0.000, 0.000, 0.000)
    rotation_quaternion: (1.000, -0.000, -0.000, 0.000)
  arm_lower.R:
    location: (0.000, 0.000, -0.000)
    rotation_quaternion: (1.000, -0.000, 0.000, 0.000)
  leg_upper.L:
    location: (0.000, -0.000, 0.000)
    rotation_quaternion: (0.996, -0.076, -0.039, 0.000)
  leg_upper.R:
    location: (-0.000, -0.000, 0.000)
    rotation_quaternion: (0.862, -0.408, 0.186, 0.000)
  body_IK:
    location: (0.018, -0.018, 0.066)
    rotation_quaternion: (0.997, 0.046, 0.018, 0.000)
```

---

### KNIFE_ATTACK_RUNNING (10 frames) - CURRENT (BROKEN)
```
Frame 0:
  arm_upper.R:
    location: (0.000, 0.069, 0.004)
    rotation_quaternion: (0.627, 0.779, 0.000, 0.000) ← ARM ROTATED
  arm_lower.R:
    location: (-0.000, -0.000, -0.000)
    rotation_quaternion: (0.823, -0.568, -0.000, 0.000)
  leg_upper.L:
    location: (0.000, -0.000, -0.000)
    rotation_quaternion: (0.969, -0.229, 0.031, 0.000)
  leg_upper.R:
    location: (0.000, -0.000, -0.000)
    rotation_quaternion: (-0.615, 0.777, -0.114, 0.000)
  body_IK:
    location: (0.011, 0.006, -0.139)
    rotation_quaternion: (0.956, 0.289, -0.010, 0.000)

Frame 5:
  arm_upper.R:
    location: (-0.003, 0.119, 0.016)
    rotation_quaternion: (0.594, 0.472, 0.608, 0.000) ← ARM ROTATED FORWARD
  arm_lower.R:
    location: (-0.000, -0.000, -0.000)
    rotation_quaternion: (0.811, -0.559, 0.099, 0.000)
  leg_upper.L:
    location: (0.000, -0.000, -0.000)
    rotation_quaternion: (0.653, -0.757, -0.035, 0.000)
  leg_upper.R:
    location: (0.000, -0.000, -0.000)
    rotation_quaternion: (-0.975, 0.203, -0.062, 0.000)
  body_IK:
    location: (0.011, 0.006, -0.139)
    rotation_quaternion: (0.956, 0.289, -0.010, 0.000)

Frame 10:
  arm_upper.R:
    location: (0.000, 0.069, 0.004)
    rotation_quaternion: (0.627, 0.779, 0.000, 0.000)
  arm_lower.R:
    location: (-0.000, -0.000, -0.000)
    rotation_quaternion: (0.823, -0.568, -0.000, 0.000)
  leg_upper.L:
    location: (0.000, -0.000, -0.000)
    rotation_quaternion: (0.969, -0.229, 0.031, 0.000)
  leg_upper.R:
    location: (0.000, -0.000, -0.000)
    rotation_quaternion: (-0.615, 0.777, -0.114, 0.000)
  body_IK:
    location: (0.011, 0.006, -0.139)
    rotation_quaternion: (0.956, 0.289, -0.010, 0.000)
```

---

## REQUIRED: NEW KNIFE_ATTACK_RUNNING SPECIFICATION

**Goal:** Create animation that combines sprint running motion with aggressive forward knife stab

**Duration:** 15 frames (0.5 seconds at 30fps)

**Base:** Copy ALL keyframes from `sprint` animation for legs and body

**Additional arm motion:**
```
Frame 0 (wind-up):
  arm_upper.R:
    rotation_quaternion: (0.866, -0.500, 0.000, 0.000)  # 60° back
  arm_lower.R:
    rotation_quaternion: (0.966, -0.259, 0.000, 0.000)  # 30° bent

Frame 7-8 (stab peak):
  arm_upper.R:
    rotation_quaternion: (0.866, 0.500, 0.000, 0.000)   # 60° forward stab
  arm_lower.R:
    rotation_quaternion: (1.000, 0.000, 0.000, 0.000)    # Fully extended

Frame 15 (return):
  arm_upper.R:
    rotation_quaternion: (0.866, -0.500, 0.000, 0.000)  # Back to wind-up
  arm_lower.R:
    rotation_quaternion: (0.966, -0.259, 0.000, 0.000)
```

**Keep from sprint animation:**
- ALL leg_upper.L keyframes (unchanged)
- ALL leg_upper.R keyframes (unchanged)
- ALL body_IK keyframes (unchanged)
- ALL other bones unchanged

---

## REQUEST FOR GEMINI

**Context:** I have a character model (boxman.glb) with 14 bones. The character has sprint/run animations where the legs cycle naturally. I need to create a knife attack animation that COMBINES the running leg motion with an aggressive forward stabbing motion using the right arm.

**Problem:** Current knife_attack_running animation exists but doesn't work properly - the character either freezes or the arm motion isn't visible.

**Reference that works:** The `jump_running` animation successfully combines leg running motion with a jump (body_IK moves up). This proves the technique works.

**What I need from you:**

Design a complete `knife_attack_running` animation with these specifications:

1. **Duration:** 12-18 frames (you decide optimal length)
2. **Base motion:** Use ALL the leg keyframes from the `sprint` animation (copy them exactly)
3. **Added motion:** Create aggressive knife stab with right arm:
   - Frame 0: Wind-up position (arm back)
   - Mid-animation: Full forward stab extension
   - End frame: Return to wind-up (loopable)

**Provide exact quaternion rotations for:**
- `arm_upper.R` at frames: 0, [middle], [end]
- `arm_lower.R` at frames: 0, [middle], [end]

**Keep these EXACTLY as they are in sprint animation:**
- `leg_upper.L` (all frames)
- `leg_upper.R` (all frames)
- `body_IK` (all frames)
- All other bones

**Output format needed:**
```
Animation: knife_attack_running
Total frames: [your choice]

Keyframes:
Frame 0:
  arm_upper.R: rotation_quaternion = (w, x, y, z)
  arm_lower.R: rotation_quaternion = (w, x, y, z)

Frame [middle]:
  arm_upper.R: rotation_quaternion = (w, x, y, z)
  arm_lower.R: rotation_quaternion = (w, x, y, z)

Frame [end]:
  arm_upper.R: rotation_quaternion = (w, x, y, z)
  arm_lower.R: rotation_quaternion = (w, x, y, z)
```

The animation should look aggressive and feel powerful while the character continues running.

---

## PLAYER.TS CODE (Current)

Location: `/Users/gorkolas/Documents/www/rampage/src/entities/Player.ts`

**Lines 100-109 (Animation loading):**
```typescript
// Play idle animation by default
this.playAnimation('idle', 0.3);

this.modelLoaded = true;

console.log('[Player] Boxman model loaded with', this.animations.length, 'animations');
console.log('[Player] Available animations:', this.animations.map(a => a.name).join(', '));

// Create a custom knife attack animation by modifying the sprint animation
this.createKnifeAttackAnimation();
```

**Lines 126-142 (Animation creation - REMOVE THIS):**
```typescript
private createKnifeAttackAnimation(): void {
  // Find the sprint animation to use as base
  const sprintClip = this.animations.find(clip => clip.name === 'sprint');
  if (!sprintClip) {
    console.warn('[Player] Sprint animation not found, cannot create knife attack');
    return;
  }

  // Clone the sprint animation and speed it up for attack
  const attackClip = sprintClip.clone();
  attackClip.name = 'knife_attack';
  attackClip.duration = sprintClip.duration * 0.5; // Faster, more aggressive

  // Add to animations list
  this.animations.push(attackClip);
  console.log('[Player] Created knife_attack animation');
}
```

**Lines 310-325 (Animation playback):**
```typescript
if (this.input.attack) {
  // Attack - play knife attack while running
  if (this.currentAnimation !== 'knife_attack_running') {
    this.playAnimation('knife_attack_running', 0.05);
  }
} else if (!this.isGrounded && this.currentAnimation !== 'jump_running') {
  this.playAnimation('jump_running', 0.1);
} else if (isMoving && !this.isWalking && this.currentAnimation !== 'sprint') {
  // Default movement = sprint animation
  this.playAnimation('sprint', 0.1);
} else if (this.isWalking && this.currentAnimation !== 'run') {
  // Shift held = walk/run animation (slower)
  this.playAnimation('run', 0.1);
} else if (!isMoving && this.isGrounded && this.currentAnimation !== 'idle') {
  this.playAnimation('idle', 0.1);
}
```

---

## WORKFLOW

1. **User copies "REQUEST FOR GEMINI" section to Gemini chat**
2. **Gemini designs the animation** (provides exact quaternion values for arm keyframes)
3. **User pastes Gemini's response back to Claude**
4. **Claude implements using Blender MCP** (creates animation in boxman.glb)
5. **Test in browser** (press F while moving to see attack animation)
