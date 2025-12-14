import React, { useState, useCallback, useEffect } from 'react';
import { gameAudio } from '../../audio/GameAudio';
import { audioManager } from '../../audio/AudioManager';
import { MobileControlScheme } from '../../input/MobileInputManager';
import { ControlSchemeSelector } from './ControlSchemeSelector';
import { saveSetting } from '../../utils/settings';

interface SettingsModalProps {
  isMobile: boolean;
  mobileScheme: MobileControlScheme;
  onSchemeChange: (scheme: MobileControlScheme) => void;
  accelerometerSupported: boolean;
  bloodlessMode: boolean;
  onBloodlessModeChange: (enabled: boolean) => void;
}

const NEON = {
  yellow: '#FFE500',
  cyan: '#00F5FF',
  magenta: '#FF00FF',
  red: '#FF3333',
  orange: '#FF8800',
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isMobile,
  mobileScheme,
  onSchemeChange,
  accelerometerSupported,
  bloodlessMode,
  onBloodlessModeChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [muted, setMuted] = useState(audioManager.getIsMuted());
  const [musicVol, setMusicVol] = useState(audioManager.getMusicVolume());
  const [sfxVol, setSfxVol] = useState(audioManager.getSfxVolume());

  // Sync state if audio changes externally
  useEffect(() => {
    if (isOpen) {
      setMuted(audioManager.getIsMuted());
      setMusicVol(audioManager.getMusicVolume());
      setSfxVol(audioManager.getSfxVolume());
    }
  }, [isOpen]);

  const handleMuteToggle = useCallback(() => {
    const newMuted = gameAudio.toggleMute();
    setMuted(newMuted);
    saveSetting('muted', newMuted);
  }, []);

  const handleMusicVol = useCallback((vol: number) => {
    gameAudio.setMusicVolume(vol);
    setMusicVol(vol);
    saveSetting('musicVolume', vol);
  }, []);

  const handleSfxVol = useCallback((vol: number) => {
    gameAudio.setSfxVolume(vol);
    setSfxVol(vol);
    saveSetting('sfxVolume', vol);
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setIsOpen(false);
    }
  }, []);

  return (
    <>
      {/* Settings Button */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(true)}
          className="h-full bg-black px-2 py-1.5 border-2 pointer-events-auto hover:brightness-125 transition-all flex items-center gap-1.5"
          style={{ borderColor: NEON.cyan, boxShadow: `0 0 10px ${NEON.cyan}20` }}
        >
          <span
            className="text-sm"
            style={{ textShadow: `0 0 8px ${NEON.cyan}80` }}
          >
            ⚙️
          </span>
        </button>
        <div className="absolute -top-1 -left-1 w-1.5 h-1.5 border-t border-l" style={{ borderColor: NEON.cyan }} />
        <div className="absolute -bottom-1 -right-1 w-1.5 h-1.5 border-b border-r" style={{ borderColor: NEON.cyan }} />
      </div>

      {/* Modal Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto"
          onClick={handleBackdropClick}
        >
          {/* Modal Content */}
          <div
            className="relative bg-black border-2 p-4 md:p-6 w-[90vw] max-w-xs"
            style={{
              borderColor: NEON.cyan,
              boxShadow: `0 0 30px ${NEON.cyan}40, inset 0 0 60px ${NEON.cyan}05`,
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4 md:mb-6 pb-2 border-b" style={{ borderColor: `${NEON.cyan}40` }}>
              <h2
                className="text-sm md:text-base retro tracking-widest"
                style={{ color: NEON.cyan, textShadow: `0 0 10px ${NEON.cyan}60` }}
              >
                SETTINGS
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-lg md:text-xl hover:scale-110 transition-transform"
                style={{ color: NEON.red, textShadow: `0 0 8px ${NEON.red}` }}
              >
                ✕
              </button>
            </div>

            {/* Audio Section */}
            <div className="mb-4 md:mb-6">
              <h3
                className="text-[10px] md:text-xs retro tracking-[0.2em] mb-3"
                style={{ color: NEON.yellow, textShadow: `0 0 8px ${NEON.yellow}40` }}
              >
                AUDIO
              </h3>

              {/* Mute Toggle */}
              <button
                onClick={handleMuteToggle}
                className="w-full text-[10px] md:text-xs retro py-2 mb-3 border transition-all hover:brightness-125"
                style={{
                  borderColor: muted ? '#444' : NEON.cyan,
                  color: muted ? '#666' : NEON.cyan,
                  textShadow: muted ? 'none' : `0 0 6px ${NEON.cyan}`,
                  background: muted ? 'transparent' : `${NEON.cyan}10`,
                }}
              >
                {muted ? 'UNMUTE ALL' : 'MUTE ALL'}
              </button>

              {/* Music Volume */}
              <div className="mb-3">
                <div className="flex justify-between text-[10px] md:text-xs retro mb-1.5">
                  <span style={{ color: NEON.yellow }}>MUSIC</span>
                  <span style={{ color: NEON.yellow }}>{Math.round(musicVol * 100)}%</span>
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

              {/* SFX Volume */}
              <div>
                <div className="flex justify-between text-[10px] md:text-xs retro mb-1.5">
                  <span style={{ color: NEON.orange }}>SFX</span>
                  <span style={{ color: NEON.orange }}>{Math.round(sfxVol * 100)}%</span>
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
            </div>

            {/* Gameplay Section */}
            <div className="mb-4 md:mb-6">
              <h3
                className="text-[10px] md:text-xs retro tracking-[0.2em] mb-3"
                style={{ color: NEON.magenta, textShadow: `0 0 8px ${NEON.magenta}40` }}
              >
                GAMEPLAY
              </h3>

              {/* Bloodless Mode Toggle */}
              <button
                onClick={() => onBloodlessModeChange(!bloodlessMode)}
                className="w-full text-[10px] md:text-xs retro py-2 border transition-all hover:brightness-125"
                style={{
                  borderColor: bloodlessMode ? NEON.magenta : '#444',
                  color: bloodlessMode ? NEON.magenta : '#666',
                  textShadow: bloodlessMode ? `0 0 6px ${NEON.magenta}` : 'none',
                  background: bloodlessMode ? `${NEON.magenta}10` : 'transparent',
                }}
              >
                BLOODLESS MODE: {bloodlessMode ? 'ON' : 'OFF'}
              </button>
              <p className="text-[8px] retro mt-1 text-center" style={{ color: '#555' }}>
                No blood effects, knockback only
              </p>
            </div>

            {/* Controls Section (Mobile Only) */}
            {isMobile && (
              <ControlSchemeSelector
                scheme={mobileScheme}
                onChange={onSchemeChange}
                accelerometerSupported={accelerometerSupported}
              />
            )}

            {/* Corner decorations */}
            <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2" style={{ borderColor: NEON.cyan }} />
            <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2" style={{ borderColor: NEON.cyan }} />
            <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2" style={{ borderColor: NEON.cyan }} />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2" style={{ borderColor: NEON.cyan }} />
          </div>
        </div>
      )}
    </>
  );
};

export default SettingsModal;
