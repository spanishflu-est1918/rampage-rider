import React from 'react';
import { GameStats, TierConfig, Tier } from '../../types';
import { TIER_CONFIGS } from '../../constants';
import { Badge } from '@/components/ui/8bit/badge';
import HealthBar from '@/components/ui/8bit/health-bar';
import { Progress } from '@/components/ui/8bit/progress';

const AVAILABLE_ANIMATIONS = [
  'close_door_sitting_left', 'close_door_sitting_right',
  'close_door_standing_left', 'close_door_standing_right',
  'driving', 'drop_idle', 'drop_running', 'drop_running_roll',
  'enter_airplane_left', 'enter_airplane_right', 'falling',
  'idle', 'jump_idle', 'jump_running',
  'open_door_standing_left', 'open_door_standing_right',
  'reset', 'rotate_left', 'rotate_right', 'run',
  'sit_down_left', 'sit_down_right', 'sitting',
  'sitting_shift_left', 'sitting_shift_right', 'sprint',
  'stand_up_left', 'stand_up_right',
  'start_back_left', 'start_back_right',
  'start_forward', 'start_left', 'start_right', 'stop'
];

interface OverlayProps {
  stats: GameStats;
  selectedAttackAnim: string;
  onAttackAnimChange: (anim: string) => void;
}

const Overlay: React.FC<OverlayProps> = ({ stats, selectedAttackAnim, onAttackAnimChange }) => {
  const currentConfig: TierConfig = TIER_CONFIGS[stats.tier];
  const nextTier = (stats.tier + 1) as Tier;
  const nextConfig = TIER_CONFIGS[nextTier];

  const progress = nextConfig
    ? ((stats.kills - TIER_CONFIGS[stats.tier].minKills) / (nextConfig.minKills - TIER_CONFIGS[stats.tier].minKills)) * 100
    : 100;

  const healthPercent = (stats.health / currentConfig.maxHealth) * 100;

  return (
    <div className="absolute top-0 left-0 w-full h-full p-4 flex flex-col justify-between z-10">

      {/* Animation Selector - Top Right */}
      <div className="absolute top-4 right-4 pointer-events-auto">
        <div className="bg-black/90 backdrop-blur-sm p-3 border-2 border-green-500">
          <label className="block text-xs text-green-400 mb-1 retro">F Key Animation</label>
          <select
            value={selectedAttackAnim}
            onChange={(e) => onAttackAnimChange(e.target.value)}
            className="bg-black border border-green-600 text-green-400 p-1 text-xs retro w-48"
          >
            {AVAILABLE_ANIMATIONS.map(anim => (
              <option key={anim} value={anim}>{anim}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="pointer-events-none w-full h-full flex flex-col justify-between">

      {/* Top Bar */}
      <div className="flex justify-between items-start gap-4">
        <div className="bg-black/80 backdrop-blur-sm p-4 rounded-none border-l-4 border-destructive text-white w-64">
          <h2 className="text-xs text-muted-foreground font-bold uppercase tracking-widest retro">Score</h2>
          <div className="text-3xl font-black font-mono retro">{stats.score.toLocaleString()}</div>

          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-muted-foreground retro">MULTIPLIER</span>
            <Badge variant="default" className="text-lg bg-yellow-500 text-black">
              x{(1 + (Math.min(stats.combo, 50) * 0.1)).toFixed(1)}
            </Badge>
          </div>
          {stats.combo > 0 && (
            <div className="mt-2">
              <Progress
                value={(stats.comboTimer / 2.0) * 100}
                variant="retro"
                className="h-2"
                progressBg="bg-yellow-500"
              />
            </div>
          )}
        </div>

        <div className="bg-black/80 backdrop-blur-sm p-4 rounded-none text-right">
          <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest retro">Kills</div>
          <Badge variant="destructive" className="text-4xl">
            {stats.kills}
          </Badge>
        </div>
      </div>

      {/* Bottom Bar: Health & Tier */}
      <div className="flex items-end gap-4">
        {/* Health */}
        <div className="flex-1 max-w-md bg-black/80 backdrop-blur-sm p-4 rounded-none">
          <div className="flex justify-between text-xs font-bold text-muted-foreground mb-2 retro">
            <span>INTEGRITY</span>
            <span>{Math.ceil(stats.health)}/{currentConfig.maxHealth}</span>
          </div>
          <HealthBar
            value={healthPercent}
            variant="retro"
            className="h-6"
          />
        </div>

        {/* Tier Info */}
        <div className="flex-1 bg-black/90 backdrop-blur-md p-4 rounded-none border-t-4" style={{borderColor: `#${currentConfig.color.toString(16)}`}}>
          <div className="flex justify-between items-center mb-2">
            <div>
              <h3 className="text-xs text-muted-foreground font-bold uppercase retro">Current Vehicle</h3>
              <div className="text-xl font-bold text-white retro">{currentConfig.name}</div>
            </div>
            {nextConfig && (
              <div className="text-right">
                <div className="text-xs text-muted-foreground retro">NEXT UNLOCK</div>
                <Badge variant="outline" className="font-mono">
                  {Math.max(0, nextConfig.minKills - stats.kills)} Kills
                </Badge>
              </div>
            )}
          </div>

          {nextConfig && (
            <Progress
              value={Math.min(100, Math.max(0, progress))}
              variant="retro"
              className="h-2"
              progressBg="bg-blue-500"
            />
          )}

          <div className="mt-2 text-xs text-muted-foreground italic retro">
            {currentConfig.description}
          </div>
        </div>
      </div>
      </div>

    </div>
  );
};

export default Overlay;
