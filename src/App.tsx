import React, { useState, useCallback, useEffect, useRef } from 'react';
import GameCanvas from './components/GameCanvas';
import Overlay from './components/ui/Overlay';
import NotificationSystem, { NotificationController } from './components/ui/NotificationSystem';
import SnowOverlay from './components/ui/SnowOverlay';
import VehicleSelector from './components/ui/VehicleSelector';
import { MainMenu, GameOver } from './components/ui/Menus';
import { GameState, GameStats, Tier, KillNotification } from './types';
import { VehicleType } from './constants';
import ErrorBoundary from './components/ErrorBoundary';
import { preloader } from './core/Preloader';

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

  // Debug vehicle spawning
  const spawnVehicleRef = useRef<((type: VehicleType | null) => void) | null>(null);
  const [currentVehicle, setCurrentVehicle] = useState<VehicleType | null>(null);

  const handleEngineReady = useCallback((spawnFn: (type: VehicleType | null) => void) => {
    spawnVehicleRef.current = spawnFn;
  }, []);

  const handleVehicleSelect = useCallback((vehicleType: VehicleType | null) => {
    if (spawnVehicleRef.current) {
      spawnVehicleRef.current(vehicleType);
      setCurrentVehicle(vehicleType);
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
          />
          <VehicleSelector onSelect={handleVehicleSelect} currentVehicle={currentVehicle} />
        </>
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
