import React, { useState, useCallback, useEffect, useRef } from 'react';
import GameCanvas from './components/GameCanvas';
import Overlay from './components/UI/Overlay';
import NotificationSystem, { NotificationController } from './components/UI/NotificationSystem';
import SnowOverlay from './components/UI/SnowOverlay';
import VehicleSelector from './components/UI/VehicleSelector';
import AnimationSelector from './components/UI/AnimationSelector';
import { MainMenu, GameOver } from './components/UI/Menus';
import { GameState, GameStats, Tier, KillNotification } from './types';
import { VehicleType } from './constants';
import ErrorBoundary from './components/ErrorBoundary';
import { preloader } from './core/Preloader';

interface EngineControls {
  spawnVehicle: (type: VehicleType | null) => void;
  getAnimations: () => string[];
  playAnimation: (name: string) => void;
  playAnimationOnce: (name: string) => void;
}

function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [isLoading, setIsLoading] = useState(true);

  // Preload heavy assets (Rapier WASM + models) on mount
  useEffect(() => {
    preloader.preloadAll().then(() => {
      setIsLoading(false);
    });
  }, []);
  const [stats, setStats] = useState<GameStats>({
    kills: 0,
    copKills: 0,
    score: 0,
    health: 100,
    tier: Tier.FOOT,
    combo: 0,
    comboTimer: 0,
    gameTime: 0,
    heat: 0,
    wantedStars: 0,
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
      const type = notification.isPursuit ? 'pursuit' : 'kill';
      notificationControllerRef.current.addNotification(type, notification.message, `+${notification.points}`);
    }
  }, []);

  const registerNotificationController = useCallback((controller: NotificationController) => {
    notificationControllerRef.current = controller;
  }, []);

  const startGame = () => {
    setGameState(GameState.PLAYING);
  };

  const togglePause = useCallback(() => {
    if (gameState === GameState.PLAYING) {
      setGameState(GameState.PAUSED);
    } else if (gameState === GameState.PAUSED) {
      setGameState(GameState.PLAYING);
    }
  }, [gameState]);

  // Debug vehicle spawning
  const engineControlsRef = useRef<EngineControls | null>(null);
  const [currentVehicle, setCurrentVehicle] = useState<VehicleType | null>(null);
  const [currentAnimation, setCurrentAnimation] = useState<string>('Idle_A');

  // Hardcoded animation list (async loading makes dynamic list unreliable)
  const animations = [
    'Death_A', 'Death_A_Pose', 'Death_B', 'Death_B_Pose',
    'Hit_A', 'Hit_B', 'Idle_A', 'Idle_B', 'Interact',
    'Jump_Full_Long', 'Jump_Full_Short', 'Jump_Idle', 'Jump_Land', 'Jump_Start',
    'Melee_1H_Attack_Chop', 'Melee_1H_Attack_Jump_Chop', 'Melee_1H_Attack_Slice_Diagonal',
    'Melee_1H_Attack_Slice_Horizontal', 'Melee_1H_Attack_Stab',
    'Melee_2H_Attack_Chop', 'Melee_2H_Attack_Slice', 'Melee_2H_Attack_Spin',
    'Melee_2H_Attack_Spinning', 'Melee_2H_Attack_Stab', 'Melee_2H_Idle',
    'Melee_Block', 'Melee_Block_Attack', 'Melee_Block_Hit', 'Melee_Blocking',
    'Melee_Dualwield_Attack_Chop', 'Melee_Dualwield_Attack_Slice', 'Melee_Dualwield_Attack_Stab',
    'Melee_Unarmed_Attack_Kick', 'Melee_Unarmed_Attack_Punch_A', 'Melee_Unarmed_Idle',
    'PickUp', 'Running_A', 'Running_B', 'Spawn_Air', 'Spawn_Ground',
    'T-Pose', 'Throw', 'Use_Item', 'Walking_A', 'Walking_B', 'Walking_C', 'Seated_Bike'
  ];

  const handleEngineReady = useCallback((controls: EngineControls) => {
    engineControlsRef.current = controls;
  }, []);

  const handleVehicleSelect = useCallback((vehicleType: VehicleType | null) => {
    if (engineControlsRef.current) {
      engineControlsRef.current.spawnVehicle(vehicleType);
      setCurrentVehicle(vehicleType);
    }
  }, []);

  const handleAnimationSelect = useCallback((name: string) => {
    if (engineControlsRef.current) {
      engineControlsRef.current.playAnimation(name);
      setCurrentAnimation(name);
    }
  }, []);

  const handleAnimationPlayOnce = useCallback((name: string) => {
    if (engineControlsRef.current) {
      engineControlsRef.current.playAnimationOnce(name);
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

      {/* UI Layers */}
      {gameState === GameState.MENU && (
        <MainMenu onStart={startGame} isLoading={isLoading} />
      )}

      {gameState === GameState.PLAYING && (
        <>
          <SnowOverlay />
          <Overlay stats={stats} />
          <NotificationSystem
            onRegister={registerNotificationController}
            showEnterPrompt={stats.isNearCar && !stats.isInVehicle}
            showTasedAlert={stats.isTased}
            taseEscapeProgress={stats.taseEscapeProgress}
          />
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex gap-2 bg-black/60 p-2 rounded-lg border border-white/20">
            <VehicleSelector onSelect={handleVehicleSelect} currentVehicle={currentVehicle} />
            <AnimationSelector
              animations={animations}
              onSelect={handleAnimationSelect}
              onPlayOnce={handleAnimationPlayOnce}
              currentAnimation={currentAnimation}
            />
          </div>
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

      {/* Mobile Controls Hint */}
      {gameState === GameState.PLAYING && (
         <div className="absolute bottom-4 left-0 w-full text-center text-white/20 text-xs pointer-events-none md:hidden">
             SWIPE TO MOVE • TAP TO ATTACK
         </div>
      )}
    </div>
  );
}

export default App;
