import React, { useState, useCallback, useEffect, useRef } from 'react';
import GameCanvas from './components/GameCanvas';
import Overlay from './components/ui/Overlay';
import NotificationSystem, { NotificationController } from './components/ui/NotificationSystem';
import SnowOverlay from './components/ui/SnowOverlay';
import VehicleSelector from './components/ui/VehicleSelector';
import MobileControls from './components/ui/MobileControls';
import { GameOver } from './components/ui/Menus';
import LoadingScreen from './components/ui/LoadingScreen';
import IrisWipeReveal from './components/ui/IrisWipe';
import { GameState, GameStats, Tier, KillNotification } from './types';
import { VehicleType } from './constants';
import ErrorBoundary from './components/ErrorBoundary';
import { preloader, LoadingState } from './core/Preloader';
import { gameAudio } from './audio';

interface EngineControls {
  spawnVehicle: (type: VehicleType | null) => void;
  triggerRampage: () => void;
}

function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [loadingState, setLoadingState] = useState<LoadingState>(() => preloader.getState());
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [irisActive, setIrisActive] = useState(false);
  const [irisReady, setIrisReady] = useState(false);
  const [loadingFadeOut, setLoadingFadeOut] = useState(false);

  // Start loading AFTER user interaction (required for audio)
  useEffect(() => {
    if (!hasUserInteracted) return;

    const unsubscribe = preloader.addProgressListener((state) => {
      setLoadingState(state);
    });

    preloader.preloadAll().catch(() => {
      // Errors already logged by loaders
    });

    // Audio is initialized in Engine.init() along with menu music and ambient

    return () => {
      unsubscribe();
    };
  }, [hasUserInteracted]);
  const [stats, setStats] = useState<GameStats>({
    kills: 0,
    copKills: 0,
    score: 0,
    health: 100,
    tier: Tier.FOOT,
    combo: 0,
    comboTimer: 0,
    comboCopKills: 0,
    desperationCopKills: 0,
    gameTime: 0,
    heat: 0,
    wantedStars: 0,
    inPursuit: false,
    inRampageMode: false,
    rampageFuel: 0,
    rampageDuration: 0,
    killHistory: [],
    copHealthBars: [],
    isTased: false,
    taseEscapeProgress: 0
  });

  const handleStatsUpdate = useCallback((newStats: GameStats) => {
    setStats(newStats);
  }, []);

  const handleGameOver = useCallback((finalStats: GameStats) => {
    setStats(finalStats);
    setGameState(GameState.GAME_OVER);
  }, []);

  // Unified notification system
  const notificationControllerRef = useRef<NotificationController | null>(null);

  const handleKillNotification = useCallback((notification: KillNotification) => {
    if (notificationControllerRef.current) {
      // Use explicit type if provided, otherwise infer from isPursuit
      const type = notification.type || (notification.isPursuit ? 'pursuit' : 'kill');
      const subtext = notification.points > 0 ? `+${notification.points}` : undefined;
      notificationControllerRef.current.addNotification(type, notification.message, subtext, notification.combo);
    }
  }, []);

  const registerNotificationController = useCallback((controller: NotificationController) => {
    notificationControllerRef.current = controller;
  }, []);

  const startGame = () => {
    // Mark game as started to prevent menu music from playing
    gameAudio.setGameStarted(true);
    // Stop menu music immediately before starting game
    gameAudio.stopMenuMusic();
    // Start loading screen fade out
    setLoadingFadeOut(true);
    // Show iris wipe (black screen)
    setIrisActive(true);
    setIrisReady(false);
    // After fade in completes (800ms), start game
    setTimeout(() => {
      setGameState(GameState.PLAYING);
      setLoadingFadeOut(false);
    }, 900);
    // After iris is fully opaque, start the reveal animation
    setTimeout(() => {
      setIrisReady(true);
    }, 1200);
    // Resume audio context asynchronously (already unlocked by user click)
    gameAudio.resume().catch(() => {});
  };

  const togglePause = useCallback(() => {
    if (gameState === GameState.PLAYING) {
      setGameState(GameState.PAUSED);
    } else if (gameState === GameState.PAUSED) {
      setGameState(GameState.PLAYING);
    }
  }, [gameState]);

  // Debug vehicle spawning (dev only)
  const engineControlsRef = useRef<EngineControls | null>(null);
  const [currentVehicle, setCurrentVehicle] = useState<VehicleType | null>(null);

  const handleEngineReady = useCallback((controls: EngineControls) => {
    engineControlsRef.current = controls;
  }, []);

  const handleVehicleSelect = useCallback((vehicleType: VehicleType | null) => {
    if (engineControlsRef.current) {
      engineControlsRef.current.spawnVehicle(vehicleType);
      setCurrentVehicle(vehicleType);
    }
  }, []);

  const handleTriggerRampage = useCallback(() => {
    if (engineControlsRef.current) {
      engineControlsRef.current.triggerRampage();
    }
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-neutral-900 select-none">

      {/* 3D Game Layer */}
      <ErrorBoundary>
        <GameCanvas
          gameActive={gameState === GameState.PLAYING}
          onStatsUpdate={handleStatsUpdate}
          onGameOver={handleGameOver}
          onKillNotification={handleKillNotification}
          onEngineReady={handleEngineReady}
          onPauseToggle={togglePause}
        />
      </ErrorBoundary>

      {/* Tap to Start - required for audio permissions */}
      {!hasUserInteracted && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black cursor-pointer group"
          onClick={() => setHasUserInteracted(true)}
        >
          {/* CRT scanline overlay */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.03]"
            style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)'
            }}
          />

          {/* Vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 0%, transparent 40%, rgba(0,0,0,0.8) 100%)'
            }}
          />

          {/* Pulsing ring */}
          <div className="relative">
            <div
              className="absolute inset-0 -m-8 rounded-full animate-ping opacity-20"
              style={{
                background: 'radial-gradient(circle, #ff3333 0%, transparent 70%)',
                animationDuration: '2s'
              }}
            />
            <div
              className="absolute inset-0 -m-4 rounded-full animate-pulse opacity-30"
              style={{
                background: 'radial-gradient(circle, #ff3333 0%, transparent 60%)',
                animationDuration: '1.5s'
              }}
            />

            {/* Simple tap indicator */}
            <div
              className="w-20 h-20 md:w-24 md:h-24 rounded-full border-2 flex items-center justify-center
                         transition-all duration-300 group-hover:scale-110 group-active:scale-95"
              style={{
                borderColor: '#ff3333',
                boxShadow: '0 0 30px rgba(255,51,51,0.4), inset 0 0 20px rgba(255,51,51,0.1)'
              }}
            >
              <div
                className="w-0 h-0 ml-2"
                style={{
                  borderLeft: '20px solid #ff3333',
                  borderTop: '12px solid transparent',
                  borderBottom: '12px solid transparent',
                  filter: 'drop-shadow(0 0 8px rgba(255,51,51,0.8))'
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Loading Screen / Main Menu (combined) */}
      {hasUserInteracted && gameState === GameState.MENU && (
        <div
          className={`transition-opacity duration-1000 ${loadingFadeOut ? 'opacity-0' : 'opacity-100'}`}
        >
          <LoadingScreen state={loadingState} onStart={startGame} />
        </div>
      )}

      {gameState === GameState.PLAYING && (
        <>
          {!stats.inRampageMode && <SnowOverlay />}
          <Overlay stats={stats} />
          <NotificationSystem
            onRegister={registerNotificationController}
            showEnterPrompt={stats.isNearCar && !stats.isInVehicle}
            showTasedAlert={stats.isTased}
            taseEscapeProgress={stats.taseEscapeProgress}
          />
          {/* Dev-only vehicle selector - below top bar on mobile, centered on desktop */}
          {import.meta.env.DEV && (
            <div className="absolute top-14 md:top-4 left-1/2 -translate-x-1/2 z-40 flex gap-2 bg-black/60 p-1 md:p-2 rounded-lg border border-white/20">
              <VehicleSelector onSelect={handleVehicleSelect} currentVehicle={currentVehicle} onTriggerRampage={handleTriggerRampage} />
            </div>
          )}
        </>
      )}

      {gameState === GameState.PAUSED && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white retro mb-8">PAUSED</h1>
            <p className="text-white/60 text-sm retro">Press ESC to resume</p>
          </div>
        </div>
      )}

      {gameState === GameState.GAME_OVER && (
        <GameOver stats={stats} onRestart={startGame} />
      )}

      {/* Mobile Controls - visual feedback + control scheme toggle */}
      <MobileControls enabled={gameState === GameState.PLAYING} />

      {/* Iris wipe reveal transition */}
      <IrisWipeReveal
        isActive={irisActive}
        isReady={irisReady}
        duration={600}
        onComplete={() => setIrisActive(false)}
      />
    </div>
  );
}

export default App;
