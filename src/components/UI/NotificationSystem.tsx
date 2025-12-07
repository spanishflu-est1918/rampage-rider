import React, { useState, useEffect, useCallback, useRef } from 'react';
import { isMobileDevice } from '../../utils/device';

/**
 * Notification types with different visual styles
 */
export type NotificationType = 'kill' | 'pursuit' | 'prompt' | 'alert';

interface TransientNotification {
  id: number;
  type: NotificationType;
  message: string;
  subtext?: string;
  combo: number; // For score popup scaling
}

interface NotificationController {
  addNotification: (type: NotificationType, message: string, subtext?: string, combo?: number) => void;
}

interface NotificationSystemProps {
  onRegister: (controller: NotificationController) => void;
  // Persistent prompts - shown while condition is true
  showEnterPrompt?: boolean;
  showTasedAlert?: boolean;
  taseEscapeProgress?: number; // 0-100 progress for escaping taser
}

const NOTIFICATION_STYLES: Record<NotificationType, {
  textClass: string;
  textShadow: string;
  subtextClass?: string;
  subtextShadow?: string;
}> = {
  kill: {
    textClass: 'text-2xl text-red-500',
    textShadow: '0 0 10px #ef4444, 0 0 20px #ef4444, 0 0 40px #dc2626',
    subtextClass: 'text-base text-white',
    subtextShadow: '0 0 8px #fff, 0 0 16px #fff',
  },
  pursuit: {
    textClass: 'text-3xl text-orange-400 scale-110',
    textShadow: '0 0 10px #f97316, 0 0 20px #f97316, 0 0 40px #ea580c, 0 0 80px #ea580c',
    subtextClass: 'text-lg text-yellow-300',
    subtextShadow: '0 0 8px #fde047, 0 0 16px #facc15',
  },
  prompt: {
    textClass: 'text-3xl text-cyan-400',
    textShadow: '0 0 10px #22d3ee, 0 0 20px #22d3ee, 0 0 40px #06b6d4, 0 0 80px #06b6d4, 2px 2px 0 #000',
  },
  alert: {
    textClass: 'text-3xl text-yellow-400',
    textShadow: '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
    subtextClass: 'text-xl text-white',
    subtextShadow: '2px 2px 0 #000',
  },
};

const NotificationSystem: React.FC<NotificationSystemProps> = ({
  onRegister,
  showEnterPrompt = false,
  showTasedAlert = false,
  taseEscapeProgress = 0,
}) => {
  const [notifications, setNotifications] = useState<TransientNotification[]>([]);
  const nextIdRef = useRef(0);
  const isMobile = isMobileDevice();

  const addNotification = useCallback((type: NotificationType, message: string, subtext?: string, combo: number = 0) => {
    const id = nextIdRef.current++;

    setNotifications(prev => {
      const limited = prev.length >= 3 ? prev.slice(1) : prev;
      return [...limited, { id, type, message, subtext, combo }];
    });

    // Auto-remove after animation (longer for high combo)
    const duration = combo >= 20 ? 1800 : combo >= 10 ? 1500 : 1200;
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, duration);
  }, []);

  useEffect(() => {
    onRegister({ addNotification });
  }, [onRegister, addNotification]);

  return (
    <div className="absolute inset-0 pointer-events-none z-40 flex flex-col items-center justify-center">
      {/* Transient notifications (kills, etc) */}
      {notifications.map((notification, index) => {
        const style = NOTIFICATION_STYLES[notification.type];
        // Scale based on combo: 1.0 at 0, up to 2.0 at 50+ combo
        const comboScale = 1 + Math.min(notification.combo, 50) * 0.02;
        // Extra glow intensity at high combo
        const glowIntensity = notification.combo >= 20 ? 1.5 : notification.combo >= 10 ? 1.2 : 1;
        return (
          <div
            key={notification.id}
            className="absolute"
            style={{
              top: `calc(40% - ${index * 50}px)`,
              animation: `notif-fadeSlideUp ${notification.combo >= 10 ? '1.5s' : '1.2s'} ease-out forwards`,
              transform: `scale(${comboScale})`,
            }}
          >
            <div className="text-center">
              <div
                className={`font-black retro ${style.textClass}`}
                style={{
                  textShadow: style.textShadow,
                  filter: glowIntensity > 1 ? `brightness(${glowIntensity})` : undefined,
                }}
              >
                {notification.message}
              </div>
              {notification.subtext && style.subtextClass && (
                <div
                  className={`font-bold retro ${style.subtextClass}`}
                  style={{
                    textShadow: style.subtextShadow,
                    filter: glowIntensity > 1 ? `brightness(${glowIntensity})` : undefined,
                  }}
                >
                  {notification.subtext}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Persistent: Enter Vehicle Prompt */}
      {showEnterPrompt && (
        <div
          className="absolute top-[45%] left-1/2 transform -translate-x-1/2 -translate-y-1/2"
          style={{ animation: 'notif-pulse 1s ease-in-out infinite' }}
        >
          <div
            className={`font-black retro ${NOTIFICATION_STYLES.prompt.textClass}`}
            style={{ textShadow: NOTIFICATION_STYLES.prompt.textShadow }}
          >
            {isMobile ? 'TAP TO ENTER' : 'PRESS SPACE TO ENTER'}
          </div>
        </div>
      )}

      {/* Persistent: Tased Alert - MASSIVE full-screen takeover */}
      {showTasedAlert && (
        <>
          {/* Dark vignette overlay */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.7) 100%)',
              animation: 'taser-vignette-pulse 0.15s infinite alternate',
            }}
          />

          {/* Center text */}
          <div
            className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
            style={{ animation: 'notif-shake 0.08s infinite' }}
          >
            <div className="text-center">
              <div
                className="font-black retro text-6xl md:text-8xl text-yellow-300"
                style={{
                  textShadow: '0 0 20px #fde047, 0 0 40px #facc15, 0 0 60px #eab308, 4px 4px 0 #000',
                  animation: 'notif-flash 0.2s infinite',
                }}
              >
                ⚡ TASED! ⚡
              </div>
              <div
                className="font-bold retro text-2xl md:text-4xl text-white mt-4"
                style={{
                  textShadow: '3px 3px 0 #000',
                  animation: 'taser-text-shake 0.1s infinite',
                }}
              >
                {isMobile ? 'TAP RAPIDLY TO ESCAPE!' : 'MASH SPACE TO ESCAPE!'}
              </div>
            </div>
          </div>

          {/* MASSIVE progress bar at bottom */}
          <div className="absolute bottom-8 left-4 right-4 md:left-8 md:right-8">
            {/* Progress bar container */}
            <div
              className="relative w-full h-16 md:h-24 border-8 border-white rounded-2xl overflow-hidden"
              style={{
                boxShadow: '0 8px 0 #333, 0 0 40px rgba(255,255,0,0.5), inset 0 -8px 0 rgba(0,0,0,0.4)',
                background: 'linear-gradient(to bottom, #1a1a1a 0%, #0a0a0a 100%)',
              }}
            >
              {/* Background grid pattern for visual interest */}
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 10%, rgba(255,255,255,0.1) 10%, rgba(255,255,255,0.1) 10.5%)',
                }}
              />

              {/* Progress fill with electric effect */}
              <div
                className="absolute left-0 top-0 h-full transition-all duration-100"
                style={{
                  width: `${taseEscapeProgress}%`,
                  background: taseEscapeProgress > 80
                    ? 'linear-gradient(to right, #22c55e 0%, #4ade80 50%, #86efac 100%)'
                    : taseEscapeProgress > 50
                      ? 'linear-gradient(to right, #eab308 0%, #facc15 50%, #fde047 100%)'
                      : 'linear-gradient(to right, #dc2626 0%, #ef4444 50%, #f87171 100%)',
                  boxShadow: taseEscapeProgress > 80
                    ? '0 0 30px #4ade80, 0 0 60px #22c55e, inset 0 0 20px rgba(255,255,255,0.4)'
                    : taseEscapeProgress > 50
                      ? '0 0 30px #facc15, 0 0 60px #eab308, inset 0 0 20px rgba(255,255,255,0.4)'
                      : '0 0 30px #ef4444, 0 0 60px #dc2626, inset 0 0 20px rgba(255,255,255,0.4)',
                  animation: 'taser-bar-pulse 0.1s infinite alternate',
                }}
              >
                {/* Electric sparks effect on the leading edge */}
                <div
                  className="absolute right-0 top-0 bottom-0 w-4"
                  style={{
                    background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.8))',
                    animation: 'taser-spark 0.05s infinite',
                  }}
                />
              </div>

              {/* Percentage text */}
              <div
                className="absolute inset-0 flex items-center justify-center font-black retro text-white text-3xl md:text-5xl"
                style={{
                  textShadow: '3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
                }}
              >
                {Math.floor(taseEscapeProgress)}%
              </div>

              {/* Tick marks */}
              <div className="absolute inset-0 flex justify-between px-2 items-center pointer-events-none">
                {[25, 50, 75].map((tick) => (
                  <div
                    key={tick}
                    className="absolute h-full w-1 bg-white/30"
                    style={{ left: `${tick}%` }}
                  />
                ))}
              </div>
            </div>

            {/* SPACE/TAP key indicator below bar */}
            <div className="flex justify-center mt-4">
              <div
                className="px-8 py-3 bg-neutral-800 border-4 border-white rounded-xl font-black retro text-xl md:text-2xl text-white"
                style={{
                  boxShadow: '0 6px 0 #444, inset 0 -4px 0 rgba(0,0,0,0.3)',
                  animation: 'taser-key-bounce 0.15s infinite',
                }}
              >
                {isMobile ? '👆 TAP 👆' : '␣ SPACE ␣'}
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes notif-fadeSlideUp {
          0% { opacity: 0; transform: translateY(20px) scale(0.9); }
          20% { opacity: 1; transform: translateY(0) scale(1); }
          80% { opacity: 1; transform: translateY(-30px); }
          100% { opacity: 0; transform: translateY(-60px); }
        }
        @keyframes notif-pulse {
          0%, 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.02); }
        }
        @keyframes notif-shake {
          0%, 100% { transform: translate(-50%, -50%); }
          10% { transform: translate(calc(-50% - 4px), calc(-50% + 4px)); }
          20% { transform: translate(calc(-50% + 4px), calc(-50% - 4px)); }
          30% { transform: translate(calc(-50% - 4px), calc(-50% - 4px)); }
          40% { transform: translate(calc(-50% + 4px), calc(-50% + 4px)); }
          50% { transform: translate(calc(-50% - 4px), -50%); }
          60% { transform: translate(calc(-50% + 4px), -50%); }
          70% { transform: translate(-50%, calc(-50% - 4px)); }
          80% { transform: translate(-50%, calc(-50% + 4px)); }
          90% { transform: translate(calc(-50% - 4px), calc(-50% + 4px)); }
        }
        @keyframes notif-flash {
          0%, 50% { opacity: 1; }
          25%, 75% { opacity: 0.5; }
        }
        @keyframes taser-vignette-pulse {
          0% { opacity: 0.8; }
          100% { opacity: 1; }
        }
        @keyframes taser-text-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-3px); }
          75% { transform: translateX(3px); }
        }
        @keyframes taser-bar-pulse {
          0% { filter: brightness(1); }
          100% { filter: brightness(1.2); }
        }
        @keyframes taser-spark {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes taser-key-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
};

export default NotificationSystem;
export type { NotificationController };
