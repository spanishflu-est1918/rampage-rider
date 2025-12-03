import React from 'react';

interface RampageVignetteProps {
  active: boolean;
}

/**
 * RampageVignette - Red screen edge vignette during rampage mode
 * Adds intensity and frames the white void
 */
const RampageVignette: React.FC<RampageVignetteProps> = ({ active }) => {
  if (!active) return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[5]"
      style={{
        background: `
          radial-gradient(
            ellipse at center,
            transparent 40%,
            rgba(180, 0, 0, 0.15) 70%,
            rgba(120, 0, 0, 0.35) 100%
          )
        `,
        animation: 'pulse-vignette 2s ease-in-out infinite',
      }}
    >
      <style>{`
        @keyframes pulse-vignette {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default RampageVignette;
