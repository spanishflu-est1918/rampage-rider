import React, { useState, useEffect, useCallback } from 'react';
import { GameStats, TierConfig, Tier } from '../../types';
import { TIER_CONFIGS, DEBUG_PERFORMANCE_PANEL } from '../../constants';
import RampageVignette from './RampageVignette';
import { gameAudio } from '../../audio/GameAudio';
import { audioManager } from '../../audio/AudioManager';

// Neon colors from LoadingScreen
const NEON = {
  yellow: '#FFE500',
  cyan: '#00F5FF',
  red: '#FF3333',
  orange: '#FF8800',
};

interface OverlayProps {
  stats: GameStats;
}

// Pixel block bar component
const PixelBar = ({ value, max, color, blocks = 10 }: { value: number; max: number; color: string; blocks?: number }) => {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  const filled = Math.round((percent / 100) * blocks);
  return (
    <div className="flex gap-[2px]">
      {Array.from({ length: blocks }).map((_, i) => (
        <div
          key={i}
          className="w-2 h-3"
          style={{
            background: i < filled ? color : '#1a1a1a',
            boxShadow: i < filled ? `0 0 4px ${color}80` : 'none',
          }}
        />
      ))}
    </div>
  );
};

// Mini pixel bar for mobile
const MiniPixelBar = ({ value, max, color, blocks = 6 }: { value: number; max: number; color: string; blocks?: number }) => {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  const filled = Math.round((percent / 100) * blocks);
  return (
    <div className="flex gap-[1px]">
      {Array.from({ length: blocks }).map((_, i) => (
        <div
          key={i}
          className="w-1.5 h-2"
          style={{
            background: i < filled ? color : '#1a1a1a',
            boxShadow: i < filled ? `0 0 3px ${color}80` : 'none',
          }}
        />
      ))}
    </div>
  );
};

const Overlay: React.FC<OverlayProps> = ({ stats }) => {
  const [uiHidden, setUiHidden] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [muted, setMuted] = useState(audioManager.getIsMuted());
  const [musicVol, setMusicVol] = useState(audioManager.getMusicVolume());
  const [sfxVol, setSfxVol] = useState(audioManager.getSfxVolume());
  const [audioExpanded, setAudioExpanded] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleMuteToggle = useCallback(() => {
    const newMuted = gameAudio.toggleMute();
    setMuted(newMuted);
  }, []);

  const handleMusicVol = useCallback((vol: number) => {
    gameAudio.setMusicVolume(vol);
    setMusicVol(vol);
  }, []);

  const handleSfxVol = useCallback((vol: number) => {
    gameAudio.setSfxVolume(vol);
    setSfxVol(vol);
  }, []);

  const currentConfig: TierConfig = TIER_CONFIGS[stats.tier];
  const nextTier = (stats.tier + 1) as Tier;
  const nextConfig = TIER_CONFIGS[nextTier];

  const progress = nextConfig
    ? ((stats.score - TIER_CONFIGS[stats.tier].minScore) / (nextConfig.minScore - TIER_CONFIGS[stats.tier].minScore)) * 100
    : 100;

  const multiplier = 1 + (Math.min(stats.combo, 50) * 0.1);

  // Heat color based on value
  const heatPercent = stats.heat;
  const heatColor = heatPercent >= 75 ? NEON.red : heatPercent >= 50 ? NEON.orange : heatPercent >= 25 ? NEON.yellow : '#22c55e';

  // Get vehicle color as hex string
  const vehicleColor = `#${currentConfig.color.toString(16).padStart(6, '0')}`;

  return (
    <>
      <RampageVignette active={stats.inRampageDimension || false} />

      <div
        className="absolute top-0 left-0 w-full h-full pointer-events-none p-2 md:p-3 flex flex-col justify-between z-10"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
      >


        {/* Always visible: Show UI button when hidden - same position as SNAP */}
        {uiHidden && (
          <button
            onClick={() => setUiHidden(false)}
            className="absolute top-2 left-2 md:top-3 md:left-3 bg-black px-2 py-1.5 border-2 pointer-events-auto z-20 flex items-center gap-1.5 hover:brightness-125 transition-all"
            style={{ borderColor: NEON.orange, boxShadow: `0 0 10px ${NEON.orange}20` }}
          >
            <span className="text-sm" style={{ textShadow: `0 0 8px ${NEON.orange}80` }}>👁</span>
            <span
              className="text-[9px] retro"
              style={{ color: NEON.orange, textShadow: `0 0 6px ${NEON.orange}60` }}
            >
              SHOW
            </span>
          </button>
        )}

        {uiHidden ? null : (
          <>
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
                    className="w-1.5 h-1.5"
                    style={{
                      background: i < cop.health ? NEON.red : '#333',
                      boxShadow: i < cop.health ? `0 0 4px ${NEON.red}` : 'none'
                    }}
                  />
                ))}
              </div>
            ))}

            {/* Performance Monitor */}
            {DEBUG_PERFORMANCE_PANEL && stats.performance && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/95 p-2 border border-green-500/30 font-mono text-[10px] text-green-400">
                <div className="text-green-300 mb-1 text-center">PERF</div>
                <div>FPS: <span className={stats.performance.fps < 30 ? 'text-red-500' : stats.performance.fps < 50 ? 'text-yellow-500' : 'text-green-400'}>{stats.performance.fps.toFixed(0)}</span></div>
                <div>Frame: {stats.performance.frameTime.toFixed(1)}ms</div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                MOBILE LAYOUT
            ════════════════════════════════════════════════════════════════ */}
            {isMobile ? (
              <>
                {/* TOP - Score left, controls + kills right */}
                <div className="flex justify-between items-start">
                  <div className="bg-black/90 px-2 py-1 border-l-2" style={{ borderColor: NEON.yellow }}>
                    <span className="text-[9px] retro" style={{ color: '#666' }}>SCORE </span>
                    <span className="text-base retro font-bold tabular-nums" style={{ color: '#fff' }}>{stats.score.toLocaleString()}</span>
                    {multiplier > 1 && <span className="text-[9px] retro ml-1" style={{ color: NEON.yellow }}>×{multiplier.toFixed(1)}</span>}
                  </div>

                  <div className="flex items-start gap-1">
                    {/* Audio - expandable on mobile too */}
                    <div className="relative">
                      <button
                        onClick={() => setAudioExpanded(!audioExpanded)}
                        className="bg-black/90 px-2 py-1 border-l-2 pointer-events-auto"
                        style={{ borderColor: NEON.cyan }}
                      >
                        <span
                          className="text-sm"
                          style={{
                            filter: muted ? 'grayscale(1) opacity(0.5)' : 'none',
                            textShadow: muted ? 'none' : `0 0 6px ${NEON.cyan}`
                          }}
                        >
                          {muted ? '🔇' : '🔊'}
                        </span>
                      </button>
                      {/* Mobile audio dropdown */}
                      {audioExpanded && (
                        <div
                          className="absolute top-full left-0 mt-1 bg-black border-2 p-2 min-w-[120px] z-50 pointer-events-auto"
                          style={{ borderColor: NEON.cyan, boxShadow: `0 0 10px ${NEON.cyan}40` }}
                        >
                          <button
                            onClick={handleMuteToggle}
                            className="w-full text-[9px] retro py-1 mb-2 border"
                            style={{
                              borderColor: muted ? '#444' : NEON.cyan,
                              color: muted ? '#666' : NEON.cyan
                            }}
                          >
                            {muted ? 'UNMUTE' : 'MUTE'}
                          </button>
                          <div className="space-y-2">
                            <div>
                              <div className="flex justify-between text-[8px] retro mb-0.5">
                                <span style={{ color: NEON.yellow }}>MUS</span>
                                <span style={{ color: NEON.yellow }}>{Math.round(musicVol * 100)}</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.1}
                                value={musicVol}
                                onChange={(e) => handleMusicVol(parseFloat(e.target.value))}
                                className="w-full h-2"
                                style={{ accentColor: NEON.yellow }}
                              />
                            </div>
                            <div>
                              <div className="flex justify-between text-[8px] retro mb-0.5">
                                <span style={{ color: NEON.orange }}>SFX</span>
                                <span style={{ color: NEON.orange }}>{Math.round(sfxVol * 100)}</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.1}
                                value={sfxVol}
                                onChange={(e) => handleSfxVol(parseFloat(e.target.value))}
                                className="w-full h-2"
                                style={{ accentColor: NEON.orange }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Screenshot */}
                    <button
                      onClick={() => setUiHidden(!uiHidden)}
                      className="bg-black/90 px-2 py-1 border-l-2 pointer-events-auto"
                      style={{ borderColor: NEON.orange }}
                    >
                      <span className="text-sm" style={{ textShadow: `0 0 6px ${NEON.orange}` }}>📷</span>
                    </button>
                    {/* Kills */}
                    <div className="bg-black/90 px-2 py-1 border-r-2" style={{ borderColor: NEON.red }}>
                      <span className="text-[9px] retro" style={{ color: '#666' }}>KILLS </span>
                      <span className="text-lg retro font-bold tabular-nums" style={{ color: NEON.red }}>{stats.kills}</span>
                    </div>
                  </div>
                </div>

                {/* BOTTOM - Single unified bar */}
                <div className="bg-black border-t-2" style={{ borderColor: NEON.cyan }}>
                  <div className="px-3 py-2 flex justify-between items-center gap-2">
                    {/* Left side: Stars + Bars */}
                    <div className="flex items-center gap-3">
                      {/* Wanted Stars */}
                      <div className="flex gap-0.5">
                        {[0, 1, 2].map(i => (
                          <span
                            key={i}
                            className="text-xs"
                            style={{
                              color: i < stats.wantedStars ? NEON.yellow : '#333',
                              textShadow: i < stats.wantedStars ? `0 0 6px ${NEON.yellow}` : 'none'
                            }}
                          >
                            ★
                          </span>
                        ))}
                      </div>

                      {/* Heat */}
                      <div className="flex items-center gap-1">
                        <span className="text-[8px] retro" style={{ color: '#555' }}>HT</span>
                        <MiniPixelBar value={stats.heat} max={100} color={heatColor} blocks={5} />
                      </div>

                      {/* HP/Armor */}
                      <div className="flex items-center gap-1">
                        <span className="text-[8px] retro" style={{ color: '#555' }}>
                          {stats.isInVehicle ? 'AR' : 'HP'}
                        </span>
                        {stats.isInVehicle && stats.vehicleHealth !== undefined && stats.vehicleMaxHealth !== undefined ? (
                          <MiniPixelBar value={stats.vehicleHealth} max={stats.vehicleMaxHealth} color={NEON.cyan} blocks={5} />
                        ) : (
                          <MiniPixelBar value={stats.health} max={currentConfig.maxHealth} color={NEON.red} blocks={5} />
                        )}
                      </div>

                      {/* Rampage/Combo */}
                      {(stats.combo > 0 || stats.inRampageDimension) && (
                        <div className="flex items-center gap-1">
                          <span className="text-[8px] retro" style={{ color: stats.inRampageDimension ? NEON.red : NEON.orange }}>
                            {stats.inRampageDimension ? 'RP' : 'CB'}
                          </span>
                          <MiniPixelBar
                            value={stats.inRampageDimension ? stats.rampageFuel : stats.rampageProgress || 0}
                            max={100}
                            color={stats.inRampageDimension ? NEON.red : NEON.orange}
                            blocks={5}
                          />
                        </div>
                      )}
                    </div>

                    {/* Right side: Vehicle */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs retro font-bold" style={{ color: vehicleColor }}>{currentConfig.name}</span>
                      {nextConfig && (
                        <MiniPixelBar value={progress} max={100} color={NEON.cyan} blocks={4} />
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* ═══════════════════════════════════════════════════════════════
                  DESKTOP LAYOUT
              ════════════════════════════════════════════════════════════════ */
              <>
                {/* TOP ROW */}
                <div className="flex justify-between items-start">
                  {/* TOP LEFT - Vol + Snap (small) */}
                  <div className="flex items-stretch gap-2">
                    {/* VOL - Expandable */}
                    <div className="relative">
                      <button
                        onClick={() => setAudioExpanded(!audioExpanded)}
                        className="h-full bg-black px-2 py-1.5 border-2 pointer-events-auto hover:brightness-125 transition-all flex items-center gap-1.5"
                        style={{ borderColor: NEON.cyan, boxShadow: `0 0 10px ${NEON.cyan}20` }}
                      >
                        <span
                          className="text-sm"
                          style={{
                            filter: muted ? 'grayscale(1) opacity(0.5)' : 'none',
                            textShadow: muted ? 'none' : `0 0 8px ${NEON.cyan}80`
                          }}
                        >
                          {muted ? '🔇' : '🔊'}
                        </span>
                        <span
                          className="text-[9px] retro"
                          style={{ color: NEON.cyan, textShadow: `0 0 6px ${NEON.cyan}60` }}
                        >
                          {muted ? 'OFF' : 'VOL'}
                        </span>
                      </button>
                      <div className="absolute -top-1 -left-1 w-1.5 h-1.5 border-t border-l" style={{ borderColor: NEON.cyan }} />
                      <div className="absolute -bottom-1 -right-1 w-1.5 h-1.5 border-b border-r" style={{ borderColor: NEON.cyan }} />

                      {/* Dropdown */}
                      {audioExpanded && (
                        <div
                          className="absolute top-full left-0 mt-2 bg-black border-2 p-3 min-w-[140px] z-50 pointer-events-auto"
                          style={{ borderColor: NEON.cyan, boxShadow: `0 0 15px ${NEON.cyan}40` }}
                        >
                          <button
                            onClick={handleMuteToggle}
                            className="w-full text-[10px] retro py-1.5 mb-3 border"
                            style={{
                              borderColor: muted ? '#444' : NEON.cyan,
                              color: muted ? '#666' : NEON.cyan,
                              textShadow: muted ? 'none' : `0 0 6px ${NEON.cyan}`
                            }}
                          >
                            {muted ? 'UNMUTE' : 'MUTE ALL'}
                          </button>

                          {/* Music */}
                          <div className="mb-3">
                            <div className="flex justify-between text-[10px] retro mb-1">
                              <span style={{ color: NEON.yellow }}>MUSIC</span>
                              <span style={{ color: NEON.yellow }}>{Math.round(musicVol * 100)}</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.1}
                              value={musicVol}
                              onChange={(e) => handleMusicVol(parseFloat(e.target.value))}
                              className="w-full h-2 appearance-none bg-neutral-800 cursor-pointer"
                              style={{ accentColor: NEON.yellow }}
                            />
                          </div>

                          {/* SFX */}
                          <div>
                            <div className="flex justify-between text-[10px] retro mb-1">
                              <span style={{ color: NEON.orange }}>SFX</span>
                              <span style={{ color: NEON.orange }}>{Math.round(sfxVol * 100)}</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.1}
                              value={sfxVol}
                              onChange={(e) => handleSfxVol(parseFloat(e.target.value))}
                              className="w-full h-2 appearance-none bg-neutral-800 cursor-pointer"
                              style={{ accentColor: NEON.orange }}
                            />
                          </div>

                          {/* Corner brackets */}
                          <div className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2" style={{ borderColor: NEON.cyan }} />
                          <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2" style={{ borderColor: NEON.cyan }} />
                        </div>
                      )}
                    </div>

                    {/* SNAP */}
                    <div className="relative">
                      <button
                        onClick={() => setUiHidden(!uiHidden)}
                        className="h-full bg-black px-2 py-1.5 border-2 pointer-events-auto hover:brightness-125 transition-all flex items-center gap-1.5"
                        style={{ borderColor: NEON.orange, boxShadow: `0 0 10px ${NEON.orange}20` }}
                      >
                        <span className="text-sm" style={{ textShadow: `0 0 8px ${NEON.orange}80` }}>📷</span>
                        <span
                          className="text-[9px] retro"
                          style={{ color: NEON.orange, textShadow: `0 0 6px ${NEON.orange}60` }}
                        >
                          SNAP
                        </span>
                      </button>
                      <div className="absolute -top-1 -left-1 w-1.5 h-1.5 border-t border-l" style={{ borderColor: NEON.orange }} />
                      <div className="absolute -bottom-1 -right-1 w-1.5 h-1.5 border-b border-r" style={{ borderColor: NEON.orange }} />
                    </div>
                  </div>

                  {/* TOP RIGHT - Score + Kills */}
                  <div className="flex items-stretch gap-2">
                    {/* SCORE */}
                    <div className="relative">
                      <div
                        className="bg-black px-4 py-2 border-2 min-w-[80px]"
                        style={{ borderColor: NEON.yellow, boxShadow: `0 0 15px ${NEON.yellow}30` }}
                      >
                        <div
                          className="text-[10px] retro tracking-widest text-center"
                          style={{ color: NEON.yellow, textShadow: `0 0 8px ${NEON.yellow}60` }}
                        >
                          SCORE
                        </div>
                        <div
                          className="text-2xl retro font-bold tabular-nums text-center"
                          style={{ color: '#fff', textShadow: '2px 2px 0 #000' }}
                        >
                          {stats.score.toLocaleString()}
                        </div>
                        <div className="flex items-center justify-center gap-2">
                          <span
                            className="text-[10px] retro"
                            style={{
                              color: multiplier > 1 ? NEON.yellow : '#666',
                              textShadow: multiplier > 1 ? `0 0 6px ${NEON.yellow}80` : 'none'
                            }}
                          >
                            ×{multiplier.toFixed(1)}
                          </span>
                          {stats.combo > 0 && (
                            <span
                              className="text-[10px] retro"
                              style={{ color: NEON.orange, textShadow: `0 0 6px ${NEON.orange}80` }}
                            >
                              C{stats.combo}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2" style={{ borderColor: NEON.yellow }} />
                      <div className="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2" style={{ borderColor: NEON.yellow }} />
                    </div>

                    {/* KILLS */}
                    <div className="relative">
                      <div
                        className="h-full bg-black px-4 py-2 border-2 min-w-[80px] flex flex-col justify-center"
                        style={{ borderColor: NEON.red, boxShadow: `0 0 15px ${NEON.red}30` }}
                      >
                        <div
                          className="text-[10px] retro tracking-widest text-center"
                          style={{ color: NEON.red, textShadow: `0 0 8px ${NEON.red}60` }}
                        >
                          KILLS
                        </div>
                        <div
                          className="text-2xl retro font-bold tabular-nums text-center"
                          style={{ color: NEON.red, textShadow: `0 0 10px ${NEON.red}80, 2px 2px 0 #000` }}
                        >
                          {stats.kills}
                        </div>
                      </div>
                      <div className="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2" style={{ borderColor: NEON.red }} />
                      <div className="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2" style={{ borderColor: NEON.red }} />
                    </div>
                  </div>
                </div>

                {/* BOTTOM ROW */}
                <div className="flex justify-between items-end gap-4">
                  {/* STATUS - Bottom Left */}
                  <div className="relative">
                    <div
                      className="bg-black px-4 py-3 border-2 space-y-2"
                      style={{ borderColor: NEON.cyan, boxShadow: `0 0 15px ${NEON.cyan}20` }}
                    >
                      {/* Wanted Stars */}
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] retro tracking-widest w-16" style={{ color: '#666' }}>WANTED</span>
                        <div className="flex gap-1">
                          {[0, 1, 2].map(i => (
                            <div
                              key={i}
                              className="w-4 h-4 flex items-center justify-center text-sm"
                              style={{
                                color: i < stats.wantedStars ? NEON.yellow : '#333',
                                textShadow: i < stats.wantedStars ? `0 0 8px ${NEON.yellow}` : 'none'
                              }}
                            >
                              ★
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Heat */}
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] retro tracking-widest w-16" style={{ color: '#666' }}>HEAT</span>
                        <PixelBar value={stats.heat} max={100} color={heatColor} blocks={10} />
                      </div>

                      {/* HP or Armor */}
                      <div className="flex items-center gap-3">
                        {stats.isInVehicle && stats.vehicleHealth !== undefined && stats.vehicleMaxHealth !== undefined ? (
                          <>
                            <span className="text-[10px] retro tracking-widest w-16" style={{ color: '#666' }}>ARMOR</span>
                            <PixelBar value={stats.vehicleHealth} max={stats.vehicleMaxHealth} color={NEON.cyan} blocks={10} />
                            <span className="text-[10px] retro tabular-nums" style={{ color: NEON.cyan }}>
                              {Math.ceil(stats.vehicleHealth)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] retro tracking-widest w-16" style={{ color: '#666' }}>HP</span>
                            <PixelBar value={stats.health} max={currentConfig.maxHealth} color={NEON.red} blocks={10} />
                            <span className="text-[10px] retro tabular-nums" style={{ color: NEON.red }}>
                              {Math.ceil(stats.health)}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Rampage */}
                      {(stats.combo > 0 || stats.inRampageDimension) && (
                        <div className="flex items-center gap-3 pt-1 border-t border-neutral-800 mt-1">
                          <span className="text-[10px] retro tracking-widest w-16" style={{ color: stats.inRampageDimension ? NEON.red : NEON.orange }}>
                            {stats.inRampageDimension ? 'RAMPAGE' : 'COMBO'}
                          </span>
                          <PixelBar
                            value={stats.inRampageDimension ? stats.rampageFuel : stats.rampageProgress || 0}
                            max={100}
                            color={stats.inRampageDimension ? NEON.red : NEON.orange}
                            blocks={10}
                          />
                          {stats.inRampageDimension && (
                            <span className="text-[10px] retro tabular-nums" style={{ color: NEON.red }}>
                              {Math.round(stats.rampageFuel)}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2" style={{ borderColor: NEON.cyan }} />
                    <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2" style={{ borderColor: NEON.cyan }} />
                  </div>

                  {/* VEHICLE - Bottom Right */}
                  <div className="relative">
                    <div
                      className="bg-black px-4 py-3 border-2 text-right"
                      style={{ borderColor: vehicleColor, boxShadow: `0 0 15px ${vehicleColor}30` }}
                    >
                      <div className="text-[10px] retro tracking-widest mb-1" style={{ color: '#666' }}>VEHICLE</div>
                      <div
                        className="text-lg retro font-bold"
                        style={{
                          color: vehicleColor,
                          textShadow: `0 0 10px ${vehicleColor}80, 2px 2px 0 #000`
                        }}
                      >
                        {currentConfig.name}
                      </div>
                      {nextConfig && (
                        <div className="mt-2">
                          <div className="text-[10px] retro mb-1" style={{ color: '#555' }}>
                            {nextConfig.name}
                          </div>
                          <div className="flex justify-end">
                            <PixelBar value={progress} max={100} color={NEON.cyan} blocks={8} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2" style={{ borderColor: vehicleColor }} />
                    <div className="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2" style={{ borderColor: vehicleColor }} />
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default Overlay;
