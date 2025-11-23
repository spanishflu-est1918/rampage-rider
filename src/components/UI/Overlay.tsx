import React from 'react';
import { GameStats, TierConfig, Tier } from '../../types';
import { TIER_CONFIGS } from '../../constants';
import { Badge } from '@/components/ui/8bit/badge';
import HealthBar from '@/components/ui/8bit/health-bar';
import { Progress } from '@/components/ui/8bit/progress';

interface OverlayProps {
  stats: GameStats;
}

const Overlay: React.FC<OverlayProps> = ({ stats }) => {
  const currentConfig: TierConfig = TIER_CONFIGS[stats.tier];
  const nextTier = (stats.tier + 1) as Tier;
  const nextConfig = TIER_CONFIGS[nextTier];

  const progress = nextConfig
    ? ((stats.kills - TIER_CONFIGS[stats.tier].minKills) / (nextConfig.minKills - TIER_CONFIGS[stats.tier].minKills)) * 100
    : 100;

  const healthPercent = (stats.health / currentConfig.maxHealth) * 100;

  return (
    <div className="absolute top-0 left-0 w-full h-full pointer-events-none p-4 flex flex-col justify-between z-10">

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
  );
};

export default Overlay;
