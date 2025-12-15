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
import { gameAudio, audioManager } from './audio';
import { mobileInput, MobileControlScheme } from './input/MobileInputManager';
import { isMobileDevice } from './utils/device';
import { loadSettings, saveSetting } from './utils/settings';

interface EngineControls {
  spawnVehicle: (type: VehicleType | null) => void;
  triggerRampage: () => void;
  setBloodlessMode: (value: boolean) => void;
}

function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [loadingState, setLoadingState] = useState<LoadingState>(() => preloader.getState());
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [introVideoWatched, setIntroVideoWatched] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [introVideoSrc] = useState(() => {
    const videos = ['./video/intro.mp4', './video/intro2.mp4', './video/intro3.mp4', './video/intro4.mp4'];
    return videos[Math.floor(Math.random() * videos.length)];
  });
  const [irisActive, setIrisActive] = useState(false);
  const [irisReady, setIrisReady] = useState(false);
  const [loadingFadeOut, setLoadingFadeOut] = useState(false);
  const [mobileScheme, setMobileScheme] = useState<MobileControlScheme>(() => loadSettings().mobileScheme);
  const [bloodlessMode, setBloodlessMode] = useState(() => loadSettings().bloodlessMode);
  const [isMobile] = useState(() => isMobileDevice());
  const [accelerometerSupported] = useState(() => mobileInput.isAccelerometerSupported());

  // Apply saved audio settings on first interaction
  useEffect(() => {
    if (!hasUserInteracted) return;
    const settings = loadSettings();
    gameAudio.setMusicVolume(settings.musicVolume);
    gameAudio.setSfxVolume(settings.sfxVolume);
    if (settings.muted) {
      audioManager.setMuted(true);
    }
  }, [hasUserInteracted]);

  // Handler for mobile scheme changes - saves to localStorage
  const handleSchemeChange = useCallback((scheme: MobileControlScheme) => {
    setMobileScheme(scheme);
    saveSetting('mobileScheme', scheme);
  }, []);

  // Handler for bloodless mode changes - saves to localStorage and updates Engine cache
  const handleBloodlessModeChange = useCallback((enabled: boolean) => {
    setBloodlessMode(enabled);
    saveSetting('bloodlessMode', enabled);
    // Update Engine cache to avoid repeated localStorage reads
    if (engineControlsRef.current) {
      engineControlsRef.current.setBloodlessMode(enabled);
    }
  }, []);

  // Start loading AFTER intro video (or immediately on desktop)
  useEffect(() => {
    if (!hasUserInteracted || !introVideoWatched) return;

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
  }, [hasUserInteracted, introVideoWatched]);

  // Handle intro video end or skip
  const handleVideoEnd = useCallback(() => {
    setIntroVideoWatched(true);
  }, []);

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

  // Apply selected mobile control scheme (default hybrid with touch priority)
  useEffect(() => {
    if (!hasUserInteracted) return;
    if (!isMobile) return;

    const applyScheme = async () => {
      if ((mobileScheme === 'accelerometer' || mobileScheme === 'hybrid') && !accelerometerSupported) {
        setMobileScheme('touch');
        saveSetting('mobileScheme', 'touch');
        mobileInput.setScheme('touch');
        return;
      }

      if (mobileScheme === 'accelerometer' || mobileScheme === 'hybrid') {
        const granted = await mobileInput.requestAccelerometerPermission();
        if (!granted) {
          setMobileScheme('touch');
          saveSetting('mobileScheme', 'touch');
          mobileInput.setScheme('touch');
          return;
        }
      }

      mobileInput.setScheme(mobileScheme);
    };

    applyScheme();
  }, [accelerometerSupported, hasUserInteracted, isMobile, mobileScheme]);

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
    <div className="relative w-full h-[100dvh] min-h-[100dvh] overflow-hidden bg-neutral-900 select-none touch-none">

      {/* 3D Game Layer - only mount after intro video to prevent early music */}
      {introVideoWatched && (
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
      )}

      {/* Tap to Start - required for audio permissions */}
      {!hasUserInteracted && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black cursor-pointer group"
          onClick={async () => {
            // Unlock audio context on user gesture
            await gameAudio.resume();
            // Request accelerometer permission on first tap (iOS requires user gesture)
            if (
              isMobile &&
              accelerometerSupported &&
              (mobileScheme === 'accelerometer' || mobileScheme === 'hybrid')
            ) {
              await mobileInput.requestAccelerometerPermission();
            }
            setHasUserInteracted(true);
          }}
        >
          <div className="flex flex-col items-center gap-6">
            {/* Title image */}
            <img
              src="/og-image.jpg"
              alt="Christmas Market Mayhem"
              className="w-[80vw] max-w-md h-auto"
              style={{ imageRendering: 'pixelated' }}
            />
            {/* Simple play button */}
            <div
              className="w-16 h-16 md:w-20 md:h-20 border-2 border-white/40 flex items-center justify-center
                         transition-transform duration-150 group-hover:scale-105 group-active:scale-95"
            >
              <div
                className="ml-1.5 w-0 h-0"
                style={{
                  borderLeft: '16px solid white',
                  borderTop: '10px solid transparent',
                  borderBottom: '10px solid transparent',
                  opacity: 0.8
                }}
              />
            </div>
            <p className="retro text-xs text-white/40 tracking-widest">
              TAP TO START
            </p>
          </div>
        </div>
      )}

      {/* Intro Video - plays after tap, before loading */}
      {hasUserInteracted && !introVideoWatched && (
        <div
          className="fixed inset-0 z-[190] bg-black cursor-pointer"
          onClick={handleVideoEnd}
        >
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            src={introVideoSrc}
            playsInline
            autoPlay
            onEnded={handleVideoEnd}
            onError={handleVideoEnd}
          />
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/50 text-sm retro animate-pulse">
            TAP TO SKIP
          </div>
        </div>
      )}

      {/* Loading Screen / Main Menu (combined) */}
      {hasUserInteracted && introVideoWatched && gameState === GameState.MENU && (
        <div
          className={`transition-opacity duration-1000 ${loadingFadeOut ? 'opacity-0' : 'opacity-100'}`}
        >
          <LoadingScreen
            state={loadingState}
            onStart={startGame}
            mobileScheme={mobileScheme}
            onSchemeChange={handleSchemeChange}
            isMobile={isMobile}
            accelerometerSupported={accelerometerSupported}
          />
        </div>
      )}

      {gameState === GameState.PLAYING && (
        <>
          {!stats.inRampageMode && <SnowOverlay />}
          <Overlay
              stats={stats}
              mobileScheme={mobileScheme}
              onSchemeChange={handleSchemeChange}
              accelerometerSupported={accelerometerSupported}
              bloodlessMode={bloodlessMode}
              onBloodlessModeChange={handleBloodlessModeChange}
            />
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
      <MobileControls enabled={gameState === GameState.PLAYING} scheme={mobileScheme} />

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
