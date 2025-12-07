import React, { useEffect, useState, useRef } from 'react';

interface IrisWipeProps {
  /** When true, shows black screen then opens */
  isActive: boolean;
  /** When true, starts the reveal animation */
  isReady: boolean;
  duration?: number;
  onComplete?: () => void;
}

/**
 * Iris wipe transition - black screen that opens from center
 */
export const IrisWipeReveal: React.FC<IrisWipeProps> = ({
  isActive,
  isReady,
  duration = 5000,
  onComplete
}) => {
  const [radius, setRadius] = useState(0);
  const [opacity, setOpacity] = useState(0);
  const [visible, setVisible] = useState(false);
  const animatingRef = useRef(false);
  const fadeInRef = useRef(false);

  // Show when active - fade in the black screen
  useEffect(() => {
    if (isActive && !fadeInRef.current) {
      setVisible(true);
      setRadius(0);
      setOpacity(0);
      animatingRef.current = false;
      fadeInRef.current = true;

      // Fade in animation
      const start = performance.now();
      const fadeInDuration = 800;

      const tick = (now: number) => {
        const t = Math.min((now - start) / fadeInDuration, 1);
        setOpacity(t);
        if (t < 1) {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    }
  }, [isActive]);

  // Animate when ready
  useEffect(() => {
    if (isReady && visible && !animatingRef.current) {
      animatingRef.current = true;
      const start = performance.now();
      const maxR = 150;

      const tick = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        // Linear easing - constant speed throughout
        setRadius(t * maxR);

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          setVisible(false);
          animatingRef.current = false;
          onComplete?.();
        }
      };

      requestAnimationFrame(tick);
    }
  }, [isReady, visible, duration, onComplete]);

  if (!visible) return null;

  // radius goes from 0 to 150 (needs to cover diagonal of screen)
  // Convert to vmax for the circle diameter
  const size = radius; // percentage of vmax

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden"
      style={{ pointerEvents: 'none', opacity }}
    >
      {/* Centered circle with massive box-shadow for the black area */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: `${size}vmax`,
          height: `${size}vmax`,
          borderRadius: '50%',
          boxShadow: '0 0 0 200vmax black',
        }}
      />
    </div>
  );
};

export default IrisWipeReveal;
