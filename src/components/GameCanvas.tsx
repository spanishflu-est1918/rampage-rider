import React, { useRef, useEffect, useState } from 'react';
import type { Engine } from '../core/Engine';
import { GameStats, InputState, KillNotification } from '../types';
import { VehicleType } from '../constants';
import { mobileInput } from '../input/MobileInputManager';
import { isMobileDevice } from '../utils/device';

interface EngineControls {
  spawnVehicle: (type: VehicleType | null) => void;
  getAnimations: () => string[];
  playAnimation: (name: string) => void;
  playAnimationOnce: (name: string) => void;
}

interface GameCanvasProps {
  onStatsUpdate: (stats: GameStats) => void;
  onGameOver: (stats: GameStats) => void;
  onKillNotification?: (notification: KillNotification) => void;
  gameActive: boolean;
  onEngineReady?: (controls: EngineControls) => void;
  onPauseToggle?: () => void; // ESC key handler
}

const GameCanvas: React.FC<GameCanvasProps> = ({ onStatsUpdate, onGameOver, onKillNotification, gameActive, onEngineReady, onPauseToggle }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [engineReady, setEngineReady] = useState(false);

  // Initialize Engine
  useEffect(() => {
    if (!canvasRef.current) return;

    let cancelled = false;
    let _initializingEngine: Engine | null = null;

    const initEngine = async () => {
      const { Engine } = await import('../core/Engine');
      const engine = new Engine(
        canvasRef.current!,
        window.innerWidth,
        window.innerHeight
      );

      _initializingEngine = engine;

      try {
        await engine.init();
      } catch {
        _initializingEngine = null;
        return;
      }

      // Check if component was unmounted during init
      if (cancelled) {
        try {
          engine.dispose();
        } catch {
          // Ignore disposal errors during cancel
        }
        _initializingEngine = null;
        return;
      }

      engine.setCallbacks(onStatsUpdate, onGameOver, onKillNotification);
      engineRef.current = engine;
      _initializingEngine = null;
      setEngineReady(true);

      // Expose engine controls to parent
      if (onEngineReady) {
        onEngineReady({
          spawnVehicle: (vehicleType) => engine.debugSpawnVehicle(vehicleType),
          getAnimations: () => engine.getAnimationNames(),
          playAnimation: (name) => engine.debugPlayAnimation(name),
          playAnimationOnce: (name) => engine.debugPlayAnimationOnce(name),
        });
      }
    };

    initEngine();

    const handleResize = () => {
      if (engineRef.current) {
        engineRef.current.resize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelled = true;

      // Dispose engine if completed initialization
      if (engineRef.current) {
        try {
          engineRef.current.dispose();
          engineRef.current = null;
        } catch {
          // Ignore disposal errors
        }
      }

      // Also dispose engine that's still initializing (React Strict Mode)
      if (_initializingEngine) {
        try {
          _initializingEngine.dispose();
        } catch {
          // Ignore disposal errors during cancel
        }
        _initializingEngine = null;
      }

      window.removeEventListener('resize', handleResize);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Input Handling (Keyboard + Mobile)
  useEffect(() => {
    if (!engineReady) return;

    const isMobile = isMobileDevice();

    // Persistent input state - updated per key, not replaced
    const inputState: InputState = {
      up: false,
      down: false,
      left: false,
      right: false,
      action: false,
      mount: false,
      attack: false, // F key for attack
    };

    // Camera rotation
    let cameraAngle = 0;
    let cameraHeight = 6.25;

    const handleKey = (e: KeyboardEvent, isDown: boolean) => {
      if (!engineRef.current) return;

      // ESC to pause
      if (isDown && e.code === 'Escape') {
        onPauseToggle?.();
        return;
      }

      // Camera rotation with Q/E/W/S
      if (isDown) {
        const camera = engineRef.current.getCamera();

        if (e.code === 'KeyQ') {
          engineRef.current.disableCameraFollow = true;
          cameraAngle += 0.1; // Rotate left
          const radius = 7.5;
          camera.position.x = Math.cos(cameraAngle) * radius;
          camera.position.z = Math.sin(cameraAngle) * radius;
          camera.position.y = cameraHeight;
          camera.lookAt(0, 0, 0);
        } else if (e.code === 'KeyE') {
          engineRef.current.disableCameraFollow = true;
          cameraAngle -= 0.1; // Rotate right
          const radius = 7.5;
          camera.position.x = Math.cos(cameraAngle) * radius;
          camera.position.z = Math.sin(cameraAngle) * radius;
          camera.position.y = cameraHeight;
          camera.lookAt(0, 0, 0);
        } else if (e.code === 'KeyW') {
          engineRef.current.disableCameraFollow = true;
          cameraHeight += 0.5; // Move up
          const radius = 7.5;
          camera.position.x = Math.cos(cameraAngle) * radius;
          camera.position.z = Math.sin(cameraAngle) * radius;
          camera.position.y = cameraHeight;
          camera.lookAt(0, 0, 0);
        } else if (e.code === 'KeyS') {
          engineRef.current.disableCameraFollow = true;
          cameraHeight = Math.max(1, cameraHeight - 0.5); // Move down (min height 1)
          const radius = 7.5;
          camera.position.x = Math.cos(cameraAngle) * radius;
          camera.position.z = Math.sin(cameraAngle) * radius;
          camera.position.y = cameraHeight;
          camera.lookAt(0, 0, 0);
        } else if (e.code === 'KeyR') {
          // Reset camera to auto-follow
          engineRef.current.disableCameraFollow = false;
          cameraAngle = 0;
          cameraHeight = 6.25;
        } else if (e.code === 'KeyH') {
          // Debug: Boost heat by 25% to test motorbike cop spawning
          engineRef.current.debugBoostHeat();
        }
      }

      // Movement with Arrow keys only
      if (e.code === 'ArrowUp') inputState.up = isDown;
      else if (e.code === 'ArrowDown') inputState.down = isDown;
      else if (e.code === 'ArrowLeft') inputState.left = isDown;
      else if (e.code === 'ArrowRight') inputState.right = isDown;
      else if (e.code === 'Space') {
        inputState.action = isDown; // Universal action: attack, enter car, escape taser
      }
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') inputState.mount = isDown; // Walk (slow down)

      engineRef.current.handleInput(inputState);
    };

    const onKeyDown = (e: KeyboardEvent) => handleKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => handleKey(e, false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Mobile input handling
    let mobileInputFrame: number | null = null;

    if (isMobile) {
      // Initialize mobile controls
      mobileInput.setScheme('touch');

      // Poll mobile input state each frame
      const updateMobileInput = () => {
        if (!engineRef.current) return;

        const mobileState = mobileInput.getInputState();

        // Merge mobile input with keyboard (mobile overrides if active)
        // Analog values take priority when present
        const mergedInput: InputState = {
          up: inputState.up || mobileState.up,
          down: inputState.down || mobileState.down,
          left: inputState.left || mobileState.left,
          right: inputState.right || mobileState.right,
          action: inputState.action || mobileState.action,
          mount: inputState.mount || mobileState.mount,
          analogX: mobileState.analogX,
          analogY: mobileState.analogY,
        };

        engineRef.current.handleInput(mergedInput);
        mobileInputFrame = requestAnimationFrame(updateMobileInput);
      };

      mobileInputFrame = requestAnimationFrame(updateMobileInput);
    }

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);

      if (mobileInputFrame !== null) {
        cancelAnimationFrame(mobileInputFrame);
      }

      if (isMobile) {
        mobileInput.cleanup();
      }
    };
  }, [engineReady, onPauseToggle]);

  // Start/Stop based on gameActive prop
  useEffect(() => {
    if (engineReady && engineRef.current) {
      if (gameActive) {
        engineRef.current.start();
      } else {
        engineRef.current.stop();
      }
    }
  }, [gameActive, engineReady]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 w-full h-full block z-0 bg-neutral-900"
    />
  );
};

export default GameCanvas;
