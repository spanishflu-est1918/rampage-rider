import React, { useEffect, useState } from 'react';
import { MobileInputState, mobileInput } from '../../input/MobileInputManager';
import { isMobileDevice } from '../../utils/device';

interface MobileControlsProps {
  enabled: boolean;
}

// Neon colors matching the game
const NEON = {
  yellow: '#FFE500',
  cyan: '#00F5FF',
  magenta: '#FF00FF',
  red: '#FF3333',
  orange: '#FF8800',
};

interface TapRipple {
  id: number;
  x: number;
  y: number;
}

/**
 * Mobile Controls Component
 *
 * Displays:
 * - Tap ripple effect when tapping anywhere
 * - Touch joystick indicator when swiping (touch-only mode)
 * - Tilt indicator when using accelerometer
 */
export const MobileControls: React.FC<MobileControlsProps> = ({ enabled }) => {
  const [mobileState, setMobileState] = useState<MobileInputState | null>(null);
  const [tapRipples, setTapRipples] = useState<TapRipple[]>([]);
  const [useAccelerometer, setUseAccelerometer] = useState(false);
  const rippleIdRef = React.useRef(0);

  // Initialize mobile controls
  useEffect(() => {
    if (!enabled) {
      mobileInput.setScheme('none');
      return;
    }

    if (!isMobileDevice()) {
      return;
    }

    // Try hybrid mode (accelerometer + tap) first, fall back to touch
    const initControls = async () => {
      if (mobileInput.isAccelerometerSupported()) {
        const granted = await mobileInput.requestAccelerometerPermission();
        if (granted) {
          mobileInput.setScheme('hybrid');
          setUseAccelerometer(true);
        } else {
          mobileInput.setScheme('touch');
          setUseAccelerometer(false);
        }
      } else {
        mobileInput.setScheme('touch');
        setUseAccelerometer(false);
      }
    };

    initControls();

    // Listen for state changes
    mobileInput.onStateChange((state) => {
      setMobileState(state);
    });

    // Listen for taps to show ripple
    mobileInput.onAction(() => {
      // We'll handle ripples via touch events directly
    });

    return () => {
      mobileInput.cleanup();
    };
  }, [enabled]);

  // Handle tap ripples via touch events
  useEffect(() => {
    if (!enabled || !isMobileDevice()) return;

    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button, [data-no-touch], .z-40, .z-50')) {
        return;
      }

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const id = rippleIdRef.current++;

        setTapRipples(prev => [...prev, { id, x: touch.clientX, y: touch.clientY }]);

        // Remove ripple after animation
        setTimeout(() => {
          setTapRipples(prev => prev.filter(r => r.id !== id));
        }, 600);
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
    };
  }, [enabled]);

  // Don't render on desktop
  if (!isMobileDevice() || !enabled) {
    return null;
  }

  return (
    <>
      {/* Tap Ripple Effects */}
      {tapRipples.map(ripple => (
        <div
          key={ripple.id}
          className="fixed pointer-events-none z-30"
          style={{
            left: ripple.x,
            top: ripple.y,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            className="rounded-full"
            style={{
              width: 80,
              height: 80,
              border: `3px solid ${NEON.red}`,
              boxShadow: `0 0 20px ${NEON.red}, 0 0 40px ${NEON.red}40`,
              animation: 'tap-ripple 0.6s ease-out forwards',
            }}
          />
        </div>
      ))}

      {/* Touch Joystick Indicator (only in touch mode, not hybrid) */}
      {!useAccelerometer && mobileState?.isTouching && (
        <div className="fixed pointer-events-none z-30" style={{ left: 0, top: 0, width: '100%', height: '100%' }}>
          {/* Base circle at touch start */}
          <div
            className="absolute rounded-full border-2 opacity-40"
            style={{
              left: mobileState.touchStartX - 50,
              top: mobileState.touchStartY - 50,
              width: 100,
              height: 100,
              borderColor: NEON.cyan,
              boxShadow: `0 0 20px ${NEON.cyan}40`,
            }}
          />

          {/* Direction line */}
          <svg
            className="absolute"
            style={{
              left: mobileState.touchStartX,
              top: mobileState.touchStartY,
              width: 1,
              height: 1,
              overflow: 'visible',
            }}
          >
            <line
              x1={0}
              y1={0}
              x2={mobileState.touchCurrentX - mobileState.touchStartX}
              y2={mobileState.touchCurrentY - mobileState.touchStartY}
              stroke={NEON.cyan}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.6}
            />
          </svg>

          {/* Thumb indicator at current position */}
          <div
            className="absolute rounded-full"
            style={{
              left: mobileState.touchCurrentX - 20,
              top: mobileState.touchCurrentY - 20,
              width: 40,
              height: 40,
              background: `radial-gradient(circle, ${NEON.cyan}80 0%, ${NEON.cyan}20 70%, transparent 100%)`,
              boxShadow: `0 0 30px ${NEON.cyan}60`,
            }}
          />

          {/* Direction arrows showing active directions */}
          <div
            className="absolute flex items-center justify-center"
            style={{
              left: mobileState.touchStartX - 60,
              top: mobileState.touchStartY - 60,
              width: 120,
              height: 120,
            }}
          >
            {mobileState.moveY < -0.3 && (
              <div
                className="absolute text-2xl"
                style={{ top: 0, color: NEON.yellow, textShadow: `0 0 10px ${NEON.yellow}` }}
              >
                ▲
              </div>
            )}
            {mobileState.moveY > 0.3 && (
              <div
                className="absolute text-2xl"
                style={{ bottom: 0, color: NEON.yellow, textShadow: `0 0 10px ${NEON.yellow}` }}
              >
                ▼
              </div>
            )}
            {mobileState.moveX < -0.3 && (
              <div
                className="absolute text-2xl"
                style={{ left: 0, color: NEON.yellow, textShadow: `0 0 10px ${NEON.yellow}` }}
              >
                ◀
              </div>
            )}
            {mobileState.moveX > 0.3 && (
              <div
                className="absolute text-2xl"
                style={{ right: 0, color: NEON.yellow, textShadow: `0 0 10px ${NEON.yellow}` }}
              >
                ▶
              </div>
            )}
          </div>
        </div>
      )}

      {/* Accelerometer Tilt Indicator */}
      {useAccelerometer && mobileState && (Math.abs(mobileState.moveX) > 0.1 || Math.abs(mobileState.moveY) > 0.1) && (
        <div className="fixed pointer-events-none z-30" style={{ left: '50%', bottom: 80, transform: 'translateX(-50%)' }}>
          {/* Tilt compass */}
          <div
            className="relative rounded-full border-2 opacity-50"
            style={{
              width: 60,
              height: 60,
              borderColor: NEON.magenta,
              boxShadow: `0 0 15px ${NEON.magenta}40`,
            }}
          >
            {/* Center dot */}
            <div
              className="absolute rounded-full"
              style={{
                left: '50%',
                top: '50%',
                width: 6,
                height: 6,
                marginLeft: -3,
                marginTop: -3,
                background: NEON.magenta,
              }}
            />

            {/* Tilt indicator */}
            <div
              className="absolute rounded-full"
              style={{
                left: `${50 + mobileState.moveX * 35}%`,
                top: `${50 + mobileState.moveY * 35}%`,
                width: 16,
                height: 16,
                marginLeft: -8,
                marginTop: -8,
                background: `radial-gradient(circle, ${NEON.yellow} 0%, ${NEON.orange} 100%)`,
                boxShadow: `0 0 12px ${NEON.yellow}80`,
              }}
            />
          </div>
        </div>
      )}

      {/* CSS for tap ripple animation */}
      <style>{`
        @keyframes tap-ripple {
          0% {
            transform: scale(0.3);
            opacity: 1;
          }
          100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
};

export default MobileControls;
