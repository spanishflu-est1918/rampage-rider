import React, { useState, useEffect } from 'react';
import { LoadingState, LoadingPhase } from '../../core/Preloader';
import { gameAudio } from '../../audio/GameAudio';

interface LoadingScreenProps {
  state: LoadingState;
  onStart: () => void;
}

// Neon colors matching Overlay.tsx
const NEON = {
  yellow: '#FFE500',
  cyan: '#00F5FF',
  magenta: '#FF00FF',
  red: '#FF3333',
  orange: '#FF8800',
  purple: '#AA55FF',
};

const PHASE_MESSAGES: Record<LoadingPhase, string> = {
  'initializing': 'BOOTING UP...',
  'physics': 'PHYSICS ENGINE',
  'models': 'LOADING ASSETS',
  'cloning-pedestrians': 'SPAWNING CROWDS',
  'cloning-cops': 'DEPLOYING COPS',
  'cloning-vehicles': 'FUELING RIDES',
  'complete': 'PRESS START'
};

const TAGLINES = [
  "YOUR UBER RATING: ZERO STARS.",
  "MORALLY QUESTIONABLE CARDIO.",
  "WALK. BIKE. DRIVE. DESTROY.",
  "CLIMB THE FOOD CHAIN.",
  "EVERY KILL IS A PROMOTION.",
  "CARDIO WITH CONSEQUENCES.",
  "ANGER MANAGEMENT SPEEDRUN.",
  "NETWORKING, BUT VIOLENTLY.",
];

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ state, onStart }) => {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [showStart, setShowStart] = useState(false);
  const [buttonEnabled, setButtonEnabled] = useState(false);
  const [taglineIndex, setTaglineIndex] = useState(() =>
    Math.floor(Math.random() * TAGLINES.length)
  );
  const [blinkVisible, setBlinkVisible] = useState(true);
  const [glitchOffset, setGlitchOffset] = useState(0);
  const [noiseLineY, setNoiseLineY] = useState<number | null>(null);

  // Smooth progress animation
  useEffect(() => {
    const target = state.progress * 100;
    const interval = setInterval(() => {
      setDisplayProgress(prev => {
        const diff = target - prev;
        if (Math.abs(diff) < 0.5) return target;
        return prev + diff * 0.2;
      });
    }, 16);
    return () => clearInterval(interval);
  }, [state.progress]);

  // Show start button when complete
  useEffect(() => {
    if (state.phase === 'complete') {
      const timer = setTimeout(() => setShowStart(true), 400);
      return () => clearTimeout(timer);
    }
  }, [state.phase]);

  // Delay button pressability by 1.5s after showing
  useEffect(() => {
    if (showStart) {
      const timer = setTimeout(() => setButtonEnabled(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [showStart]);

  // Rotate taglines
  useEffect(() => {
    const interval = setInterval(() => {
      setTaglineIndex((prev) => (prev + 1) % TAGLINES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Blinking cursor effect
  useEffect(() => {
    const interval = setInterval(() => {
      setBlinkVisible(v => !v);
    }, 530);
    return () => clearInterval(interval);
  }, []);

  // Glitch effect - runs continuously like ErrorBoundary
  useEffect(() => {
    const interval = setInterval(() => {
      // 30% chance of glitch, ±4px offset
      setGlitchOffset(Math.random() > 0.7 ? (Math.random() - 0.5) * 4 : 0);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Random noise line effect
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.9) {
        setNoiseLineY(15 + Math.random() * 70);
        setTimeout(() => setNoiseLineY(null), 80);
      }
    }, 150);
    return () => clearInterval(interval);
  }, []);

  const progressPercent = Math.round(displayProgress);
  const filledBlocks = Math.floor(displayProgress / 5); // 20 blocks total

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black overflow-hidden">
      {/* Ambient radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 40%, ${NEON.red}08 0%, transparent 50%),
                       radial-gradient(ellipse at 30% 70%, ${NEON.cyan}05 0%, transparent 40%),
                       radial-gradient(ellipse at 70% 80%, ${NEON.yellow}05 0%, transparent 40%)`,
        }}
      />

      {/* Scanline effect - matches ErrorBoundary */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.05]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, #fff 2px, #fff 4px)'
        }}
      />

      {/* Pixel grid background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(${NEON.cyan}20 1px, transparent 1px),
            linear-gradient(90deg, ${NEON.cyan}20 1px, transparent 1px)
          `,
          backgroundSize: '32px 32px'
        }}
      />

      {/* Animated noise line - more visible */}
      {noiseLineY !== null && (
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: `${noiseLineY}%`,
            height: '2px',
            background: `linear-gradient(90deg, transparent, ${NEON.cyan}60, ${NEON.red}60, transparent)`,
            opacity: 0.8,
          }}
        />
      )}

      {/* Glitch overlay - matches ErrorBoundary mix-blend-overlay */}
      {glitchOffset !== 0 && (
        <div
          className="absolute inset-0 pointer-events-none mix-blend-overlay"
          style={{
            background: `linear-gradient(${90 + glitchOffset * 10}deg,
              transparent 0%,
              ${NEON.red}10 ${45 + glitchOffset * 5}%,
              ${NEON.cyan}05 ${55 + glitchOffset * 5}%,
              transparent 100%
            )`,
            transform: `translateX(${glitchOffset * 2}px)`,
          }}
        />
      )}

      <div className="relative w-full max-w-md px-6">
        {/* Title - aggressive glitch with sideways movement */}
        <div className="text-center mb-8">
          <div
            style={{
              transform: `translateX(${glitchOffset}px)`,
              display: 'inline-block',
            }}
          >
            <h1
              className="text-4xl md:text-5xl font-bold retro leading-tight"
              style={{
                color: NEON.red,
                textShadow: `
                  0 0 20px ${NEON.red}80,
                  0 0 40px ${NEON.red}40,
                  4px 4px 0 #000,
                  ${glitchOffset * 1.5}px 0 0 ${NEON.cyan}
                `,
              }}
            >
              HOLIDAY
            </h1>
          </div>
          <div
            style={{
              transform: `translateX(${-glitchOffset}px)`,
              display: 'inline-block',
              width: '100%',
            }}
          >
            <h1
              className="text-4xl md:text-5xl font-bold retro leading-tight -mt-1"
              style={{
                color: NEON.yellow,
                textShadow: `
                  0 0 20px ${NEON.yellow}80,
                  0 0 40px ${NEON.yellow}40,
                  4px 4px 0 #000,
                  ${-glitchOffset * 1.5}px 0 0 ${NEON.magenta}
                `,
              }}
            >
              MAYHEM
            </h1>
          </div>
        </div>

        {/* Tagline */}
        <div className="text-center mb-8 h-6">
          <p
            className="text-xs retro transition-opacity duration-300"
            style={{ color: NEON.cyan, textShadow: `0 0 10px ${NEON.cyan}60` }}
          >
            {showStart ? TAGLINES[taglineIndex] : ''}
          </p>
        </div>

        {/* Loading Bar Section */}
        {!showStart && (
          <div className="space-y-4">
            {/* Progress bar container */}
            <div className="relative">
              {/* Outer frame */}
              <div
                className="p-1"
                style={{
                  background: NEON.yellow,
                  boxShadow: `0 0 20px ${NEON.yellow}40`
                }}
              >
                {/* Inner black area */}
                <div className="bg-black p-2">
                  {/* Pixel blocks */}
                  <div className="flex gap-[3px]">
                    {Array.from({ length: 20 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex-1 h-6 transition-all duration-75"
                        style={{
                          background: i < filledBlocks
                            ? `linear-gradient(180deg, ${NEON.red}, ${NEON.orange})`
                            : '#1a1a1a',
                          boxShadow: i < filledBlocks
                            ? `0 0 8px ${NEON.red}80, inset 0 1px 0 rgba(255,255,255,0.3)`
                            : 'inset 0 1px 0 rgba(255,255,255,0.05)',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Percentage overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span
                  className="text-lg font-bold retro"
                  style={{
                    color: '#fff',
                    textShadow: '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000'
                  }}
                >
                  {progressPercent}%
                </span>
              </div>
            </div>

            {/* Phase indicator */}
            <div className="text-center">
              <p
                className="text-xs retro tracking-wider"
                style={{ color: NEON.yellow, textShadow: `0 0 10px ${NEON.yellow}40` }}
              >
                {PHASE_MESSAGES[state.phase]}
                <span style={{ opacity: blinkVisible ? 1 : 0 }}>_</span>
              </p>

              {state.itemsTotal > 0 && state.phase !== 'complete' && (
                <p className="text-[10px] retro mt-2" style={{ color: '#666' }}>
                  {state.itemsLoaded} / {state.itemsTotal}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Start Button */}
        {showStart && (
          <div className="text-center">
            <button
              onClick={() => {
                if (!buttonEnabled) return;
                gameAudio.playGameStart();
                onStart();
              }}
              disabled={!buttonEnabled}
              className="group relative px-12 py-4 retro text-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: NEON.red,
                color: '#fff',
                boxShadow: `
                  0 0 30px ${NEON.red}60,
                  0 6px 0 #8B0000,
                  inset 0 2px 0 rgba(255,255,255,0.3)
                `,
                textShadow: '2px 2px 0 #000',
              }}
            >
              <span className="relative z-10">START GAME</span>
              {/* Animated glow pulse */}
              <div
                className="absolute inset-0 animate-pulse opacity-50"
                style={{
                  background: `radial-gradient(ellipse at center, ${NEON.yellow}40 0%, transparent 70%)`,
                }}
              />
            </button>

            {/* Blinking prompt */}
            <p
              className="text-[10px] retro mt-6 tracking-widest"
              style={{
                color: NEON.cyan,
                opacity: blinkVisible ? 1 : 0.3,
                textShadow: `0 0 10px ${NEON.cyan}60`
              }}
            >
              INSERT COIN
            </p>
          </div>
        )}

        {/* Decorative corners */}
        <div className="absolute -top-4 -left-4 w-4 h-4 border-t-4 border-l-4" style={{ borderColor: NEON.yellow }} />
        <div className="absolute -top-4 -right-4 w-4 h-4 border-t-4 border-r-4" style={{ borderColor: NEON.yellow }} />
        <div className="absolute -bottom-4 -left-4 w-4 h-4 border-b-4 border-l-4" style={{ borderColor: NEON.yellow }} />
        <div className="absolute -bottom-4 -right-4 w-4 h-4 border-b-4 border-r-4" style={{ borderColor: NEON.yellow }} />
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 text-center">
        <p className="text-[8px] retro tracking-widest" style={{ color: '#444' }}>
          {showStart ? 'PRESS START TO BEGIN' : 'LOADING ASSETS • PLEASE WAIT'}
        </p>
      </div>

      {/* Vignette effect */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)',
        }}
      />
    </div>
  );
};

export default LoadingScreen;
