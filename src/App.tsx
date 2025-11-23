import React, { useState, useCallback } from 'react';
import GameCanvas from './components/GameCanvas';
import Overlay from './components/ui/Overlay';
import { MainMenu, GameOver } from './components/ui/Menus';
import { GameState, GameStats, Tier } from './types';

function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [attackAnim, setAttackAnim] = useState<string>('drop_running');
  const [stats, setStats] = useState<GameStats>({
    kills: 0,
    score: 0,
    health: 100,
    tier: Tier.FOOT,
    combo: 0,
    comboTimer: 0,
    gameTime: 0,
    killHistory: []
  });

  const handleStatsUpdate = useCallback((newStats: GameStats) => {
    setStats(newStats);
  }, []);

  const handleGameOver = useCallback((finalStats: GameStats) => {
    setStats(finalStats);
    setGameState(GameState.GAME_OVER);
  }, []);

  const startGame = () => {
    setGameState(GameState.PLAYING);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-neutral-900 select-none">

      {/* 3D Game Layer */}
      <GameCanvas
        gameActive={gameState === GameState.PLAYING}
        onStatsUpdate={handleStatsUpdate}
        onGameOver={handleGameOver}
        attackAnim={attackAnim}
      />

      {/* UI Layers */}
      {gameState === GameState.MENU && (
        <MainMenu onStart={startGame} />
      )}

      {gameState === GameState.PLAYING && (
        <Overlay
          stats={stats}
          selectedAttackAnim={attackAnim}
          onAttackAnimChange={setAttackAnim}
        />
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
