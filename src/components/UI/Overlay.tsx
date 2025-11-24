import React from 'react';
import { GameStats, TierConfig, Tier } from '../../types';
import { TIER_CONFIGS } from '../../constants';
import { Badge } from '@/components/ui/8bit/badge';
import HealthBar from '@/components/ui/8bit/health-bar';
import HeatBar from '@/components/ui/8bit/heat-bar';
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

      {/* Taser Stun Prompt */}
      {stats.isTased && (
        <div
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50"
          style={{
            animation: 'shake 0.1s infinite'
          }}
        >
          <style>{`
            @keyframes shake {
              0%, 100% { transform: translate(-50%, -50%) translate(0, 0); }
              10% { transform: translate(-50%, -50%) translate(-2px, 2px); }
              20% { transform: translate(-50%, -50%) translate(2px, -2px); }
              30% { transform: translate(-50%, -50%) translate(-2px, -2px); }
              40% { transform: translate(-50%, -50%) translate(2px, 2px); }
              50% { transform: translate(-50%, -50%) translate(-2px, 0px); }
              60% { transform: translate(-50%, -50%) translate(2px, 0px); }
              70% { transform: translate(-50%, -50%) translate(0px, -2px); }
              80% { transform: translate(-50%, -50%) translate(0px, 2px); }
              90% { transform: translate(-50%, -50%) translate(-2px, 2px); }
            }
          `}</style>
          <div className="text-center">
            <div className="text-6xl font-black text-yellow-400 retro mb-2" style={{ textShadow: '4px 4px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000' }}>
              ⚡ TASED! ⚡
            </div>
            <div className="text-3xl font-bold text-white retro" style={{ textShadow: '3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' }}>
              MASH SPACE!
            </div>
          </div>
        </div>
      )}

      {/* Cop Health Dots */}
      {stats.copHealthBars?.map((cop, index) => (
        <div
          key={index}
          className="absolute flex gap-0.5"
          style={{
            left: `${cop.x}px`,
            top: `${cop.y}px`,
            transform: 'translate(-50%, -50%)'
          }}
        >
          {[...Array(cop.maxHealth)].map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full border border-black ${
                i < cop.health ? 'bg-red-500' : 'bg-gray-600'
              }`}
            />
          ))}
        </div>
      ))}

      {/* Performance Monitor (Right Side, Centered) */}
      {stats.performance && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/90 backdrop-blur-sm p-2 rounded border border-green-500 font-mono text-xs text-green-400" style={{ transform: 'scale(0.65) translateY(-50%)', transformOrigin: 'right center' }}>
          <div className="font-bold text-green-300 mb-1 text-center">PERFORMANCE</div>

          {/* Current Stats */}
          <div className="mb-2">
            <div>FPS: <span className={stats.performance.fps < 30 ? 'text-red-500 font-bold' : stats.performance.fps < 50 ? 'text-yellow-500' : 'text-green-400'}>{stats.performance.fps.toFixed(0)}</span></div>
            <div>Frame: <span className={stats.performance.frameTime > 33 ? 'text-red-500 font-bold' : stats.performance.frameTime > 20 ? 'text-yellow-500' : 'text-green-400'}>{stats.performance.frameTime.toFixed(1)}ms</span> <span className="text-gray-500">(avg: {stats.performance.avgFrameTime.toFixed(1)}ms)</span></div>
          </div>

          {/* Current Breakdown */}
          <div className="text-gray-400 text-[10px] mb-2">
            <div className={stats.performance.physics > stats.performance.avgPhysics * 2 ? 'text-red-400 font-bold' : ''}>Phy: {stats.performance.physics.toFixed(1)}ms <span className="text-gray-600">(avg: {stats.performance.avgPhysics.toFixed(1)})</span></div>
            <div className={stats.performance.entities > stats.performance.avgEntities * 2 ? 'text-red-400 font-bold' : ''}>Ent: {stats.performance.entities.toFixed(1)}ms <span className="text-gray-600">(avg: {stats.performance.avgEntities.toFixed(1)})</span></div>
            <div className={stats.performance.rendering > stats.performance.avgRendering * 2 ? 'text-red-400 font-bold' : ''}>Rnd: {stats.performance.rendering.toFixed(1)}ms <span className="text-gray-600">(avg: {stats.performance.avgRendering.toFixed(1)})</span></div>
          </div>

          {/* Current Counts */}
          <div className="text-gray-500 text-[9px] mb-2">
            <div>Cops:{stats.performance.counts.cops} Peds:{stats.performance.counts.pedestrians} Bldg:{stats.performance.counts.buildings}</div>
            <div>Parts:{stats.performance.counts.particles} Blood:{stats.performance.counts.bloodDecals}</div>
          </div>

          {/* Worst Frame Info */}
          {stats.performance.worstFrame.frameTime > 50 && (
            <div className="border-t border-red-500/30 pt-1 mt-1">
              <div className="text-red-400 font-bold text-[10px]">WORST SPIKE:</div>
              <div className="text-red-300 text-[10px]">{stats.performance.worstFrame.frameTime.toFixed(1)}ms ({(1000 / stats.performance.worstFrame.frameTime).toFixed(0)} FPS)</div>
              <div className="text-yellow-400 text-[10px]">
                Cause: <span className="font-bold uppercase">{stats.performance.worstFrame.bottleneck}</span>
              </div>
              <div className="text-gray-500 text-[9px]">
                P:{stats.performance.worstFrame.physics.toFixed(1)}
                E:{stats.performance.worstFrame.entities.toFixed(1)}
                R:{stats.performance.worstFrame.rendering.toFixed(1)}
              </div>
              <div className="text-orange-300 text-[9px] mt-1">
                <div>At spike: {stats.performance.worstFrame.counts.cops}cops {stats.performance.worstFrame.counts.pedestrians}peds {stats.performance.worstFrame.counts.buildings}bldg</div>
                <div>{stats.performance.worstFrame.counts.particles}parts {stats.performance.worstFrame.counts.bloodDecals}blood</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top Bar */}
      <div className="flex justify-between items-start gap-4">
        <div className="bg-black/80 backdrop-blur-sm p-4 rounded-none border-l-4 border-destructive text-white w-64" style={{ transform: 'scale(0.75)', transformOrigin: 'top left' }}>
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

        <div className="bg-black/80 backdrop-blur-sm p-4 rounded-none text-right" style={{ transform: 'scale(0.75)', transformOrigin: 'top right' }}>
          <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest retro">Kills</div>
          <Badge variant="destructive" className="text-4xl">
            {stats.kills}
          </Badge>
        </div>
      </div>

      {/* Bottom Bar: Health & Tier */}
      <div className="flex items-end gap-4">
        {/* Health & Heat */}
        <div className="flex-1 max-w-md bg-black/80 backdrop-blur-sm p-4 rounded-none" style={{ transform: 'scale(0.75)', transformOrigin: 'bottom left' }}>
          {/* Wanted Stars */}
          <div className="mb-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-muted-foreground retro">WANTED LEVEL</span>
              <div className="flex gap-1">
                {[0, 1, 2].map((starIndex) => (
                  <div
                    key={starIndex}
                    className={`w-6 h-6 ${
                      starIndex < stats.wantedStars
                        ? 'bg-yellow-500 text-black'
                        : 'bg-gray-700 text-gray-900'
                    } flex items-center justify-center font-bold text-lg border-2 border-black`}
                  >
                    ★
                  </div>
                ))}
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-1 retro">
              {stats.wantedStars === 0 && 'Cops will punch you'}
              {stats.wantedStars === 1 && 'Cops will tase you'}
              {stats.wantedStars >= 2 && 'Cops will shoot you'}
            </div>
          </div>

          {/* Heat Bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs font-bold text-muted-foreground mb-2 retro">
              <span>HEAT (Cop Spawn Rate)</span>
              <span>{Math.ceil(stats.heat)}%</span>
            </div>
            <HeatBar
              value={stats.heat}
              variant="retro"
              className="h-4"
            />
          </div>

          {/* Health Bar */}
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
        <div className="flex-1 bg-black/90 backdrop-blur-md p-4 rounded-none border-t-4" style={{borderColor: `#${currentConfig.color.toString(16)}`, transform: 'scale(0.75)', transformOrigin: 'bottom right'}}>
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
