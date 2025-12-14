import React from 'react';
import { MobileControlScheme } from '../../input/MobileInputManager';

interface ControlSchemeSelectorProps {
  scheme: MobileControlScheme;
  onChange: (scheme: MobileControlScheme) => void;
  accelerometerSupported: boolean;
  showDivider?: boolean;
}

const NEON = {
  cyan: '#00F5FF',
};

const CONTROL_OPTIONS: Array<{ label: string; value: MobileControlScheme; hint: string }> = [
  { label: 'TOUCH', value: 'touch', hint: 'Drag to move' },
  { label: 'TILT', value: 'accelerometer', hint: 'Tilt phone' },
  { label: 'HYBRID', value: 'hybrid', hint: 'Both modes' },
];

export const ControlSchemeSelector: React.FC<ControlSchemeSelectorProps> = ({
  scheme,
  onChange,
  accelerometerSupported,
  showDivider = true,
}) => {
  return (
    <div className="w-full max-w-[280px] mx-auto">
      {/* Divider */}
      {showDivider && (
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${NEON.cyan}40)` }} />
          <span
            className="text-[9px] retro tracking-[0.3em]"
            style={{ color: NEON.cyan, textShadow: `0 0 8px ${NEON.cyan}60` }}
          >
            CONTROLS
          </span>
          <div className="flex-1 h-[2px]" style={{ background: `linear-gradient(90deg, ${NEON.cyan}40, transparent)` }} />
        </div>
      )}

      {/* Control buttons - 8-bit style */}
      <div className="flex gap-1">
        {CONTROL_OPTIONS.map((option) => {
          const active = scheme === option.value;
          const disabled = option.value !== 'touch' && !accelerometerSupported;
          return (
            <button
              key={option.value}
              onClick={() => !disabled && onChange(option.value)}
              disabled={disabled}
              className="relative flex-1 py-2 retro text-[10px] transition-all border-2"
              style={{
                color: active ? '#fff' : '#666',
                background: active ? 'black' : 'transparent',
                borderColor: active ? NEON.cyan : '#333',
                boxShadow: active ? `0 0 15px ${NEON.cyan}40, 0 4px 0 ${NEON.cyan}30` : '0 4px 0 #1a1a1a',
                opacity: disabled ? 0.4 : 1,
                transform: active ? 'translateY(-2px)' : 'none',
              }}
            >
              <span
                style={{
                  textShadow: active ? `0 0 8px ${NEON.cyan}` : 'none',
                }}
              >
                {option.label}
              </span>
              {/* Corner pixels for active state */}
              {active && (
                <>
                  <div className="absolute -top-1 -left-1 w-1 h-1" style={{ background: NEON.cyan }} />
                  <div className="absolute -top-1 -right-1 w-1 h-1" style={{ background: NEON.cyan }} />
                  <div className="absolute -bottom-1 -left-1 w-1 h-1" style={{ background: NEON.cyan }} />
                  <div className="absolute -bottom-1 -right-1 w-1 h-1" style={{ background: NEON.cyan }} />
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Hint text */}
      <p
        className="text-[8px] retro tracking-wider text-center mt-3"
        style={{ color: '#555' }}
      >
        {CONTROL_OPTIONS.find(o => o.value === scheme)?.hint}
      </p>
    </div>
  );
};

export default ControlSchemeSelector;
