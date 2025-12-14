import React, { useState, useCallback, useEffect, useRef } from 'react';

// Neon colors matching the game UI
const NEON = {
  yellow: '#FFE500',
  cyan: '#00F5FF',
  magenta: '#FF00FF',
  red: '#FF3333',
};

interface HandleInputProps {
  onSubmit: (handle: string) => void;
  disabled?: boolean;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const HandleInput: React.FC<HandleInputProps> = ({ onSubmit, disabled = false }) => {
  const [letters, setLetters] = useState<string[]>(['A', 'A', 'A']);
  const [activeIndex, setActiveIndex] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const cycleLetter = useCallback((index: number, direction: 1 | -1) => {
    if (disabled || submitted) return;

    setLetters((prev) => {
      const newLetters = [...prev];
      const currentIdx = ALPHABET.indexOf(prev[index]);
      const newIdx = (currentIdx + direction + ALPHABET.length) % ALPHABET.length;
      newLetters[index] = ALPHABET[newIdx];
      return newLetters;
    });
  }, [disabled, submitted]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (disabled || submitted) return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        cycleLetter(activeIndex, 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        cycleLetter(activeIndex, -1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        setActiveIndex((prev) => Math.max(0, prev - 1));
        break;
      case 'ArrowRight':
        e.preventDefault();
        setActiveIndex((prev) => Math.min(2, prev + 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (!submitted) {
          setSubmitted(true);
          onSubmit(letters.join(''));
        }
        break;
      default:
        // Direct letter input
        if (/^[a-zA-Z]$/.test(e.key)) {
          e.preventDefault();
          const letter = e.key.toUpperCase();
          setLetters((prev) => {
            const newLetters = [...prev];
            newLetters[activeIndex] = letter;
            return newLetters;
          });
          // Auto-advance to next position
          if (activeIndex < 2) {
            setActiveIndex((prev) => prev + 1);
          }
        }
    }
  }, [activeIndex, cycleLetter, disabled, letters, onSubmit, submitted]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Focus the container on mount
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const handleSubmitClick = () => {
    if (disabled || submitted) return;
    setSubmitted(true);
    onSubmit(letters.join(''));
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-center gap-4"
      tabIndex={0}
    >
      {/* Letter selectors */}
      <div className="flex gap-2">
        {letters.map((letter, index) => (
          <div
            key={index}
            className="relative flex flex-col items-center"
          >
            {/* Up arrow */}
            <button
              onClick={() => cycleLetter(index, 1)}
              disabled={disabled || submitted}
              className="w-12 h-6 flex items-center justify-center transition-all hover:scale-110 active:scale-95 disabled:opacity-30"
              style={{ color: index === activeIndex ? NEON.cyan : '#666' }}
            >
              <svg width="16" height="10" viewBox="0 0 16 10" fill="currentColor">
                <path d="M8 0L16 10H0L8 0Z" />
              </svg>
            </button>

            {/* Letter display */}
            <button
              onClick={() => setActiveIndex(index)}
              disabled={disabled || submitted}
              className="w-14 h-16 flex items-center justify-center text-3xl font-bold retro transition-all"
              style={{
                background: index === activeIndex
                  ? `linear-gradient(180deg, ${NEON.cyan}30 0%, ${NEON.magenta}20 100%)`
                  : 'rgba(255,255,255,0.05)',
                border: `3px solid ${index === activeIndex ? NEON.cyan : '#333'}`,
                color: index === activeIndex ? NEON.yellow : '#fff',
                textShadow: index === activeIndex
                  ? `0 0 20px ${NEON.yellow}80, 0 0 40px ${NEON.yellow}40`
                  : '2px 2px 0 #000',
                boxShadow: index === activeIndex
                  ? `0 0 20px ${NEON.cyan}40, inset 0 0 30px ${NEON.cyan}10`
                  : 'none',
              }}
            >
              {letter}
            </button>

            {/* Down arrow */}
            <button
              onClick={() => cycleLetter(index, -1)}
              disabled={disabled || submitted}
              className="w-12 h-6 flex items-center justify-center transition-all hover:scale-110 active:scale-95 disabled:opacity-30"
              style={{ color: index === activeIndex ? NEON.cyan : '#666' }}
            >
              <svg width="16" height="10" viewBox="0 0 16 10" fill="currentColor">
                <path d="M8 10L0 0H16L8 10Z" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmitClick}
        disabled={disabled || submitted}
        className="px-8 py-3 retro text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: submitted ? '#333' : NEON.cyan,
          color: submitted ? '#666' : '#000',
          boxShadow: submitted
            ? 'none'
            : `0 0 20px ${NEON.cyan}60, 0 4px 0 #006666`,
          textShadow: submitted ? 'none' : '1px 1px 0 rgba(255,255,255,0.3)',
        }}
      >
        {submitted ? 'SUBMITTED!' : 'SUBMIT SCORE'}
      </button>

      {/* Hint text */}
      {!submitted && (
        <p className="text-[9px] retro tracking-wider" style={{ color: '#666' }}>
          USE ARROWS OR TYPE • ENTER TO SUBMIT
        </p>
      )}
    </div>
  );
};

export default HandleInput;
