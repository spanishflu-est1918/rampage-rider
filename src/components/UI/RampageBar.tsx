import React from 'react';
import { Progress } from '@/components/ui/8bit/progress';
import { RAMPAGE_DIMENSION } from '../../constants';

interface RampageBarProps {
  combo: number;
  comboTimer: number;
  inRampageDimension: boolean;
  rampageProgress: number;
}

/**
 * RampageBar - Shows combo progress toward rampage mode, or remaining duration when active
 *
 * Before rampage (combo < 10): Shows progress bar filling up
 * During rampage (combo >= 10): Shows pulsing red bar with remaining combo timer
 */
const RampageBar: React.FC<RampageBarProps> = ({
  combo,
  comboTimer,
  inRampageDimension,
  rampageProgress,
}) => {
  const threshold = RAMPAGE_DIMENSION.COMBO_THRESHOLD;

  // Don't show if no combo
  if (combo === 0 && !inRampageDimension) {
    return null;
  }

  // Calculate display values
  const isActive = inRampageDimension;
  const progressValue = isActive
    ? (comboTimer / 5.0) * 100 // Show timer as percentage (5s max)
    : rampageProgress;

  const label = isActive
    ? 'RAMPAGE!'
    : `${combo}/${threshold}`;

  return (
    <div
      className={`
        bg-black/90 backdrop-blur-sm p-3 rounded-none border-2
        ${isActive ? 'border-red-500 animate-pulse' : 'border-orange-500/50'}
        transition-all duration-200
      `}
      style={{
        transform: 'scale(0.75)',
        transformOrigin: 'top center',
        boxShadow: isActive ? '0 0 20px rgba(255, 0, 0, 0.5), inset 0 0 10px rgba(255, 0, 0, 0.2)' : 'none',
      }}
    >
      <div className="flex justify-between items-center mb-1">
        <span
          className={`
            text-xs font-bold uppercase tracking-widest retro
            ${isActive ? 'text-red-400 animate-pulse' : 'text-orange-400'}
          `}
        >
          {label}
        </span>
        {isActive && (
          <span className="text-xs font-mono text-red-300">
            {comboTimer.toFixed(1)}s
          </span>
        )}
      </div>

      <div className="relative">
        <Progress
          value={progressValue}
          variant="retro"
          className={`h-3 ${isActive ? '[&>div]:bg-red-500' : ''}`}
          progressBg={isActive ? 'bg-red-600' : 'bg-orange-500'}
        />

        {/* Glow overlay when active */}
        {isActive && (
          <div
            className="absolute inset-0 bg-red-500/20 animate-pulse rounded"
            style={{
              boxShadow: 'inset 0 0 8px rgba(255, 100, 100, 0.5)',
            }}
          />
        )}
      </div>

      {/* Progress markers */}
      {!isActive && (
        <div className="flex justify-between mt-1">
          {[...Array(threshold)].map((_, i) => (
            <div
              key={i}
              className={`w-1 h-1 rounded-full ${
                i < combo ? 'bg-orange-400' : 'bg-gray-600'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default RampageBar;
