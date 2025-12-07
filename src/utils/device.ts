/**
 * Device detection utilities
 */

let _isMobile: boolean | null = null;

/**
 * Check if the current device is mobile/touch-capable
 * Result is cached after first call
 */
export function isMobileDevice(): boolean {
  if (_isMobile === null) {
    _isMobile = 'ontouchstart' in window ||
                navigator.maxTouchPoints > 0 ||
                window.matchMedia('(pointer: coarse)').matches;
  }
  return _isMobile;
}

/**
 * Check if accelerometer is supported
 */
export function isAccelerometerSupported(): boolean {
  return 'DeviceOrientationEvent' in window;
}
