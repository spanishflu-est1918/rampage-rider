import React, { useRef, useEffect, useState } from 'react';
import { Engine } from '../core/Engine';
import { GameStats, InputState } from '../types';

interface GameCanvasProps {
  onStatsUpdate: (stats: GameStats) => void;
  onGameOver: (stats: GameStats) => void;
  gameActive: boolean;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ onStatsUpdate, onGameOver, gameActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [engineReady, setEngineReady] = useState(false);

  // Initialize Engine
  useEffect(() => {
    if (!canvasRef.current) return;

    const initEngine = async () => {
      console.log('[GameCanvas] Initializing new Engine...');

      const engine = new Engine(
        canvasRef.current!,
        window.innerWidth,
        window.innerHeight
      );

      // Wait for async initialization (Rapier WASM)
      await engine.init();

      engine.setCallbacks(onStatsUpdate, onGameOver);
      engineRef.current = engine;
      setEngineReady(true);

      console.log('[GameCanvas] Engine ready!');
    };

    initEngine();

    const handleResize = () => {
      if (engineRef.current) {
        engineRef.current.resize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (engineRef.current) {
        engineRef.current.dispose();
      }
      window.removeEventListener('resize', handleResize);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Input Handling
  useEffect(() => {
    if (!engineReady) return;

    // Persistent input state - updated per key, not replaced
    const inputState: InputState = {
      up: false,
      down: false,
      left: false,
      right: false,
      action: false,
      mount: false,
    };

    const handleKey = (e: KeyboardEvent, isDown: boolean) => {
      if (!engineRef.current) return;

      // Update only the specific key that changed
      if (e.code === 'KeyW' || e.code === 'ArrowUp') inputState.up = isDown;
      else if (e.code === 'KeyS' || e.code === 'ArrowDown') inputState.down = isDown;
      else if (e.code === 'KeyA' || e.code === 'ArrowLeft') inputState.left = isDown;
      else if (e.code === 'KeyD' || e.code === 'ArrowRight') inputState.right = isDown;
      else if (e.code === 'Space') inputState.action = isDown;
      else if (e.code === 'KeyE') inputState.mount = isDown;

      engineRef.current.handleInput(inputState);
    };

    const onKeyDown = (e: KeyboardEvent) => handleKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => handleKey(e, false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [engineReady]);

  // Start/Stop based on gameActive prop
  useEffect(() => {
    if (engineReady && engineRef.current) {
      if (gameActive) {
        console.log('[GameCanvas] Starting game...');
        engineRef.current.start();
      } else {
        console.log('[GameCanvas] Stopping game...');
        engineRef.current.stop();
      }
    }
  }, [gameActive, engineReady]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full block z-0 bg-neutral-900"
      />
      {!engineReady && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-xl">
          Loading Physics Engine...
        </div>
      )}
    </>
  );
};

export default GameCanvas;
