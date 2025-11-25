import React, { useState } from 'react';

interface AnimationSelectorProps {
  animations: string[];
  onSelect: (name: string) => void;
  onPlayOnce?: (name: string) => void;
  currentAnimation: string;
}

const AnimationSelector: React.FC<AnimationSelectorProps> = ({ animations, onSelect, onPlayOnce, currentAnimation }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="h-12 px-3 bg-white/10 hover:bg-white/20 rounded text-white text-xs"
      >
        {currentAnimation || 'Anim'} {isOpen ? '▲' : '▼'}
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1 right-0 bg-black/90 border border-white/20 rounded max-h-64 overflow-y-auto w-48 z-50">
          {animations.map((anim) => (
            <div key={anim} className="flex">
              <button
                onClick={() => {
                  onSelect(anim);
                  setIsOpen(false);
                }}
                className={`flex-1 text-left px-3 py-1 text-xs hover:bg-white/20 ${
                  currentAnimation === anim ? 'bg-yellow-500/30 text-yellow-300' : 'text-white'
                }`}
              >
                {anim}
              </button>
              {onPlayOnce && (
                <button
                  onClick={() => {
                    onPlayOnce(anim);
                    setIsOpen(false);
                  }}
                  className="px-2 text-xs text-green-400 hover:bg-green-500/20"
                  title="Play once"
                >
                  ▶
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AnimationSelector;
