import React, { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Notification types with different visual styles
 */
export type NotificationType = 'kill' | 'pursuit' | 'prompt' | 'alert';

interface TransientNotification {
  id: number;
  type: NotificationType;
  message: string;
  subtext?: string;
}

interface NotificationController {
  addNotification: (type: NotificationType, message: string, subtext?: string) => void;
}

interface NotificationSystemProps {
  onRegister: (controller: NotificationController) => void;
  // Persistent prompts - shown while condition is true
  showEnterPrompt?: boolean;
  showTasedAlert?: boolean;
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
}) => {
  const [notifications, setNotifications] = useState<TransientNotification[]>([]);
  const nextIdRef = useRef(0);

  const addNotification = useCallback((type: NotificationType, message: string, subtext?: string) => {
    const id = nextIdRef.current++;

    setNotifications(prev => {
      const limited = prev.length >= 3 ? prev.slice(1) : prev;
      return [...limited, { id, type, message, subtext }];
    });

    // Auto-remove after animation
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 1200);
  }, []);

  useEffect(() => {
    onRegister({ addNotification });
  }, [onRegister, addNotification]);

  return (
    <div className="absolute inset-0 pointer-events-none z-40 flex flex-col items-center justify-center">
      {/* Transient notifications (kills, etc) */}
      {notifications.map((notification, index) => {
        const style = NOTIFICATION_STYLES[notification.type];
        return (
          <div
            key={notification.id}
            className="absolute"
            style={{
              top: `calc(40% - ${index * 50}px)`,
              animation: 'notif-fadeSlideUp 1.2s ease-out forwards',
            }}
          >
            <div className="text-center">
              <div
                className={`font-black retro ${style.textClass}`}
                style={{ textShadow: style.textShadow }}
              >
                {notification.message}
              </div>
              {notification.subtext && style.subtextClass && (
                <div
                  className={`font-bold retro ${style.subtextClass}`}
                  style={{ textShadow: style.subtextShadow }}
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
            PRESS SPACE TO ENTER
          </div>
        </div>
      )}

      {/* Persistent: Tased Alert */}
      {showTasedAlert && (
        <div
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
          style={{ animation: 'notif-shake 0.1s infinite' }}
        >
          <div className="text-center">
            <div
              className={`font-black retro ${NOTIFICATION_STYLES.alert.textClass}`}
              style={{ textShadow: NOTIFICATION_STYLES.alert.textShadow, animation: 'notif-flash 0.3s infinite' }}
            >
              TASED!
            </div>
            <div
              className={`font-bold retro ${NOTIFICATION_STYLES.alert.subtextClass}`}
              style={{ textShadow: NOTIFICATION_STYLES.alert.subtextShadow, animation: 'notif-flash 0.3s infinite' }}
            >
              MASH SPACE!
            </div>
          </div>
        </div>
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
          10% { transform: translate(calc(-50% - 2px), calc(-50% + 2px)); }
          20% { transform: translate(calc(-50% + 2px), calc(-50% - 2px)); }
          30% { transform: translate(calc(-50% - 2px), calc(-50% - 2px)); }
          40% { transform: translate(calc(-50% + 2px), calc(-50% + 2px)); }
          50% { transform: translate(calc(-50% - 2px), -50%); }
          60% { transform: translate(calc(-50% + 2px), -50%); }
          70% { transform: translate(-50%, calc(-50% - 2px)); }
          80% { transform: translate(-50%, calc(-50% + 2px)); }
          90% { transform: translate(calc(-50% - 2px), calc(-50% + 2px)); }
        }
        @keyframes notif-flash {
          0%, 50% { opacity: 1; }
          25%, 75% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};

export default NotificationSystem;
export type { NotificationController };
