/**
 * MobileInputManager - Touch and Accelerometer controls for mobile
 *
 * Two control schemes:
 * 1. Touch Surface - Bottom half of screen as directional touchpad, tap anywhere for action
 * 2. Accelerometer - Tilt phone to move, tap for action
 */

import { InputState } from '../types';
import { isMobileDevice } from '../utils/device';

export type MobileControlScheme = 'touch' | 'accelerometer' | 'hybrid' | 'none';

export interface MobileInputConfig {
  // Touch surface settings
  touchDeadzone: number; // Minimum distance from touch start to register movement (px)
  touchSensitivity: number; // Movement sensitivity multiplier

  // Accelerometer settings
  accelDeadzone: number; // Tilt threshold before registering movement (degrees)
  accelSensitivity: number; // Tilt sensitivity multiplier
  accelMaxTilt: number; // Max tilt angle for full speed (degrees)

  // Action settings
  tapThreshold: number; // Max touch duration for tap vs drag (ms)
  tapMoveThreshold: number; // Max movement for tap vs drag (px)
}

const DEFAULT_CONFIG: MobileInputConfig = {
  touchDeadzone: 15,
  touchSensitivity: 1.0,
  accelDeadzone: 5,
  accelSensitivity: 1.0,
  accelMaxTilt: 30,
  tapThreshold: 200,
  tapMoveThreshold: 20,
};

interface TouchData {
  identifier: number;
  startX: number;
  startY: number;
  startTime: number;
  currentX: number;
  currentY: number;
  isMovementTouch: boolean; // Was this touch used for movement?
  isActionTouch: boolean; // Is this touch triggering action?
}

export interface MobileInputState {
  // Normalized movement direction (-1 to 1)
  moveX: number;
  moveY: number;

  // Touch state for visual feedback
  isTouching: boolean;
  touchStartX: number;
  touchStartY: number;
  touchCurrentX: number;
  touchCurrentY: number;

  // Accelerometer state
  tiltX: number; // degrees
  tiltY: number; // degrees
}

export class MobileInputManager {
  private config: MobileInputConfig;
  private scheme: MobileControlScheme = 'none';
  private inputState: InputState;
  private mobileState: MobileInputState;

  // Touch tracking
  private activeTouches: Map<number, TouchData> = new Map();
  private movementTouch: TouchData | null = null;

  // Accelerometer
  private accelPermissionGranted = false;
  private accelSupported = false;
  private baseOrientation: { beta: number; gamma: number } | null = null;

  // Stop timeout - keeps moving briefly after touch release for quick direction changes
  private stopTimeoutId: number | null = null;
  private lastMoveX: number = 0;
  private lastMoveY: number = 0;
  private static readonly STOP_DELAY_MS = 150; // Continue moving for 150ms after release

  // Callbacks
  private onActionCallback: (() => void) | null = null;
  private onStateChangeCallback: ((state: MobileInputState) => void) | null = null;

  // Bound event handlers (for cleanup)
  private boundHandleTouchStart: (e: TouchEvent) => void;
  private boundHandleTouchMove: (e: TouchEvent) => void;
  private boundHandleTouchEnd: (e: TouchEvent) => void;
  private boundHandleDeviceOrientation: (e: DeviceOrientationEvent) => void;

  constructor(config: Partial<MobileInputConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.inputState = {
      up: false,
      down: false,
      left: false,
      right: false,
      action: false,
      mount: false,
      analogX: 0,
      analogY: 0,
    };

    this.mobileState = {
      moveX: 0,
      moveY: 0,
      isTouching: false,
      touchStartX: 0,
      touchStartY: 0,
      touchCurrentX: 0,
      touchCurrentY: 0,
      tiltX: 0,
      tiltY: 0,
    };

    // Bind handlers
    this.boundHandleTouchStart = this.handleTouchStart.bind(this);
    this.boundHandleTouchMove = this.handleTouchMove.bind(this);
    this.boundHandleTouchEnd = this.handleTouchEnd.bind(this);
    this.boundHandleDeviceOrientation = this.handleDeviceOrientation.bind(this);

    // Check accelerometer support
    this.accelSupported = 'DeviceOrientationEvent' in window;
  }

  /**
   * Set the control scheme and attach appropriate listeners
   */
  setScheme(scheme: MobileControlScheme): void {
    // Clean up previous scheme
    this.cleanup();

    this.scheme = scheme;

    if (scheme === 'touch' || scheme === 'accelerometer' || scheme === 'hybrid') {
      // All schemes use touch for action (tap)
      window.addEventListener('touchstart', this.boundHandleTouchStart, { passive: false });
      window.addEventListener('touchmove', this.boundHandleTouchMove, { passive: false });
      window.addEventListener('touchend', this.boundHandleTouchEnd, { passive: false });
      window.addEventListener('touchcancel', this.boundHandleTouchEnd, { passive: false });
    }

    if (scheme === 'accelerometer' || scheme === 'hybrid') {
      this.requestAccelerometerPermission();
    }
  }

  /**
   * Request permission for accelerometer (required on iOS 13+)
   */
  async requestAccelerometerPermission(): Promise<boolean> {
    if (!this.accelSupported) {
      console.warn('Accelerometer not supported on this device');
      return false;
    }

    // iOS 13+ requires permission request
    if (typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission === 'function') {
      try {
        const permission = await (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission();
        if (permission === 'granted') {
          this.accelPermissionGranted = true;
          this.attachAccelerometerListener();
          return true;
        }
        console.warn('Accelerometer permission denied');
        return false;
      } catch (err) {
        console.error('Error requesting accelerometer permission:', err);
        return false;
      }
    } else {
      // Non-iOS or older iOS - no permission needed
      this.accelPermissionGranted = true;
      this.attachAccelerometerListener();
      return true;
    }
  }

  private attachAccelerometerListener(): void {
    window.addEventListener('deviceorientation', this.boundHandleDeviceOrientation);
  }

  /**
   * Set callback for action (tap)
   */
  onAction(callback: () => void): void {
    this.onActionCallback = callback;
  }

  /**
   * Set callback for state changes (for UI updates)
   */
  onStateChange(callback: (state: MobileInputState) => void): void {
    this.onStateChangeCallback = callback;
  }

  /**
   * Get current input state (for Engine.handleInput)
   */
  getInputState(): InputState {
    return this.inputState;
  }

  /**
   * Get mobile-specific state (for visual feedback)
   */
  getMobileState(): MobileInputState {
    return this.mobileState;
  }

  /**
   * Check if accelerometer is available and permitted
   */
  isAccelerometerAvailable(): boolean {
    return this.accelSupported && this.accelPermissionGranted;
  }

  /**
   * Check if accelerometer is supported (may need permission)
   */
  isAccelerometerSupported(): boolean {
    return this.accelSupported;
  }

  /**
   * Calibrate accelerometer - set current orientation as neutral
   */
  calibrateAccelerometer(): void {
    // Will be set on next device orientation event
    this.baseOrientation = null;
  }

  // ============ Touch Handlers ============

  private handleTouchStart(e: TouchEvent): void {
    // Don't intercept touches on UI elements
    const target = e.target as HTMLElement;
    if (target.closest('button, [data-no-touch], .z-40, .z-50')) {
      return;
    }

    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const touchData: TouchData = {
        identifier: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        currentX: touch.clientX,
        currentY: touch.clientY,
        isMovementTouch: false,
        isActionTouch: false,
      };

      this.activeTouches.set(touch.identifier, touchData);

      // In touch or hybrid scheme, bottom 60% of screen is movement zone
      // In accelerometer-only mode, touch is only for tapping (action)
      const screenHeight = window.innerHeight;
      const isInMovementZone = touch.clientY > screenHeight * 0.4;

      if ((this.scheme === 'touch' || this.scheme === 'hybrid') && !this.movementTouch && isInMovementZone) {
        // Cancel any pending stop timeout - player is touching again
        if (this.stopTimeoutId !== null) {
          clearTimeout(this.stopTimeoutId);
          this.stopTimeoutId = null;
        }

        this.movementTouch = touchData;
        touchData.isMovementTouch = true;

        this.mobileState.isTouching = true;
        this.mobileState.touchStartX = touch.clientX;
        this.mobileState.touchStartY = touch.clientY;
        this.mobileState.touchCurrentX = touch.clientX;
        this.mobileState.touchCurrentY = touch.clientY;
      }

      // Any touch in non-movement zone (top 40%) triggers action immediately
      // This enables taser escape mashing - action stays true while finger is down
      if (!isInMovementZone || this.scheme === 'accelerometer') {
        touchData.isActionTouch = true;
        this.inputState.action = true;
      }
    }

    this.notifyStateChange();
  }

  private handleTouchMove(e: TouchEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest('button, [data-no-touch], .z-40, .z-50')) {
      return;
    }

    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const touchData = this.activeTouches.get(touch.identifier);

      if (touchData) {
        touchData.currentX = touch.clientX;
        touchData.currentY = touch.clientY;

        // Update movement if this is the movement touch
        if (this.scheme === 'touch' && touchData === this.movementTouch) {
          this.mobileState.touchCurrentX = touch.clientX;
          this.mobileState.touchCurrentY = touch.clientY;
          this.updateTouchMovement();
        }
      }
    }

    this.notifyStateChange();
  }

  private handleTouchEnd(e: TouchEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest('button, [data-no-touch], .z-40, .z-50')) {
      return;
    }

    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const touchData = this.activeTouches.get(touch.identifier);

      if (touchData) {
        const duration = Date.now() - touchData.startTime;
        const distance = Math.hypot(
          touch.clientX - touchData.startX,
          touch.clientY - touchData.startY
        );

        // Detect tap (short duration, minimal movement)
        const isTap = duration < this.config.tapThreshold &&
                      distance < this.config.tapMoveThreshold;

        // In touch mode with movement touch that was a tap, trigger action
        if (isTap && touchData.isMovementTouch) {
          this.triggerAction();
        }

        // If this was an action touch, check if any action touches remain
        if (touchData.isActionTouch) {
          // Check if any other action touches are still active
          let hasOtherActionTouch = false;
          for (const [id, data] of this.activeTouches) {
            if (id !== touch.identifier && data.isActionTouch) {
              hasOtherActionTouch = true;
              break;
            }
          }
          // Only reset action if no other action touches remain
          if (!hasOtherActionTouch) {
            this.inputState.action = false;
          }
        }

        // Clean up movement touch with delay
        if (touchData === this.movementTouch) {
          this.movementTouch = null;
          this.mobileState.isTouching = false;

          // Store last direction and use timeout before stopping
          // This allows quick touch-release-touch direction changes
          this.lastMoveX = this.mobileState.moveX;
          this.lastMoveY = this.mobileState.moveY;

          // Clear any existing timeout
          if (this.stopTimeoutId !== null) {
            clearTimeout(this.stopTimeoutId);
          }

          // Keep moving for a brief moment, then stop
          this.stopTimeoutId = window.setTimeout(() => {
            this.mobileState.moveX = 0;
            this.mobileState.moveY = 0;
            this.updateInputFromMovement();
            this.notifyStateChange();
            this.stopTimeoutId = null;
          }, MobileInputManager.STOP_DELAY_MS);
        }

        this.activeTouches.delete(touch.identifier);
      }
    }

    this.notifyStateChange();
  }

  private updateTouchMovement(): void {
    if (!this.movementTouch) return;

    const dx = this.mobileState.touchCurrentX - this.mobileState.touchStartX;
    const dy = this.mobileState.touchCurrentY - this.mobileState.touchStartY;
    const distance = Math.hypot(dx, dy);

    if (distance < this.config.touchDeadzone) {
      this.mobileState.moveX = 0;
      this.mobileState.moveY = 0;
    } else {
      // Always full speed on mobile - just use direction, normalized to magnitude 1
      // No variable speed based on joystick distance
      this.mobileState.moveX = dx / distance;
      this.mobileState.moveY = dy / distance;
    }

    this.updateInputFromMovement();
  }

  // ============ Accelerometer Handler ============

  private handleDeviceOrientation(e: DeviceOrientationEvent): void {
    if (this.scheme !== 'accelerometer' && this.scheme !== 'hybrid') return;
    if (e.beta === null || e.gamma === null) return;

    // Set base orientation on first reading or after calibration
    if (!this.baseOrientation) {
      this.baseOrientation = { beta: e.beta, gamma: e.gamma };
    }

    // Calculate tilt relative to base
    let tiltX = e.gamma - this.baseOrientation.gamma; // Left/right
    let tiltY = e.beta - this.baseOrientation.beta;   // Forward/back

    this.mobileState.tiltX = tiltX;
    this.mobileState.tiltY = tiltY;

    // Apply deadzone
    if (Math.abs(tiltX) < this.config.accelDeadzone) tiltX = 0;
    if (Math.abs(tiltY) < this.config.accelDeadzone) tiltY = 0;

    // In hybrid mode, touch takes priority - only use accelerometer when not touching
    // In accelerometer-only mode, always use accelerometer
    if (this.scheme === 'hybrid' && this.movementTouch) {
      // Touch is active, don't override movement
      return;
    }

    // Normalize to -1 to 1 based on max tilt, then snap to full magnitude
    const maxTilt = this.config.accelMaxTilt;
    const accelX = (tiltX / maxTilt) * this.config.accelSensitivity;
    const accelY = (tiltY / maxTilt) * this.config.accelSensitivity;

    // Always full speed - normalize if past deadzone
    const accelMagnitude = Math.hypot(accelX, accelY);
    if (accelMagnitude > 0.1) {
      // Normalize to magnitude 1 for full speed
      this.mobileState.moveX = accelX / accelMagnitude;
      this.mobileState.moveY = accelY / accelMagnitude;
    } else {
      this.mobileState.moveX = 0;
      this.mobileState.moveY = 0;
    }

    this.updateInputFromMovement();
    this.notifyStateChange();
  }

  // ============ Input State Conversion ============

  private updateInputFromMovement(): void {
    // Convert analog movement to digital input
    // Using threshold of 0.3 to avoid jitter
    const threshold = 0.3;

    // For isometric view:
    // moveX positive = right on screen = right+down in game world
    // moveY positive = down on screen = down+right in game world

    // The game uses:
    // up (ArrowUp) = -Z = up-right on screen
    // down (ArrowDown) = +Z = down-left on screen
    // left (ArrowLeft) = -X = up-left on screen
    // right (ArrowRight) = +X = down-right on screen

    // For intuitive touch/tilt controls:
    // Swipe/tilt up = move up on screen (actually up-left + up-right = up+left)
    // Swipe/tilt right = move right on screen (actually down-right + up-right = right+down)

    // Simplified: treat touch direction as screen direction
    // moveX = horizontal screen movement
    // moveY = vertical screen movement (positive = down)

    // Map to isometric:
    // Screen up (-Y) = game up-left (-Z, -X)
    // Screen down (+Y) = game down-right (+Z, +X)
    // Screen left (-X) = game up-left (-X, -Z)
    // Screen right (+X) = game down-right (+X, +Z)

    // Combined:
    // game X = screenX + screenY
    // game Z = screenY - screenX

    const gameX = this.mobileState.moveX;
    const gameZ = this.mobileState.moveY;

    // Set digital inputs (for compatibility)
    this.inputState.right = gameX > threshold;
    this.inputState.left = gameX < -threshold;
    this.inputState.down = gameZ > threshold;
    this.inputState.up = gameZ < -threshold;

    // Set analog inputs for smooth 360° movement
    this.inputState.analogX = gameX;
    this.inputState.analogY = gameZ;
  }

  private triggerAction(): void {
    // Set action flag briefly for tap-based attacks
    this.inputState.action = true;

    // Notify callback
    if (this.onActionCallback) {
      this.onActionCallback();
    }

    // Reset action flag next frame, but only if no action touches are held
    requestAnimationFrame(() => {
      // Check if any action touch is still active
      let hasActionTouch = false;
      for (const [, data] of this.activeTouches) {
        if (data.isActionTouch) {
          hasActionTouch = true;
          break;
        }
      }
      if (!hasActionTouch) {
        this.inputState.action = false;
      }
    });
  }

  private notifyStateChange(): void {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback({ ...this.mobileState });
    }
  }

  // ============ Cleanup ============

  cleanup(): void {
    window.removeEventListener('touchstart', this.boundHandleTouchStart);
    window.removeEventListener('touchmove', this.boundHandleTouchMove);
    window.removeEventListener('touchend', this.boundHandleTouchEnd);
    window.removeEventListener('touchcancel', this.boundHandleTouchEnd);
    window.removeEventListener('deviceorientation', this.boundHandleDeviceOrientation);

    // Clear stop timeout
    if (this.stopTimeoutId !== null) {
      clearTimeout(this.stopTimeoutId);
      this.stopTimeoutId = null;
    }

    this.activeTouches.clear();
    this.movementTouch = null;

    // Reset state
    this.inputState = {
      up: false,
      down: false,
      left: false,
      right: false,
      action: false,
      mount: false,
      analogX: 0,
      analogY: 0,
    };

    this.mobileState = {
      moveX: 0,
      moveY: 0,
      isTouching: false,
      touchStartX: 0,
      touchStartY: 0,
      touchCurrentX: 0,
      touchCurrentY: 0,
      tiltX: 0,
      tiltY: 0,
    };
  }

  /**
   * Check if device is mobile/touch capable
   */
  static isMobileDevice(): boolean {
    return isMobileDevice();
  }
}

// Singleton for easy access
export const mobileInput = new MobileInputManager();
