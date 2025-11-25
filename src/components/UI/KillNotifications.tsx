import React, { useState, useEffect, useCallback, useRef } from 'react';

interface KillNotification {
  id: number;
  message: string;
  isPursuit: boolean;
  points: number;
}

interface KillNotificationsProps {
  onRegister: (addNotification: (message: string, isPursuit: boolean, points: number) => void) => void;
}

const KillNotifications: React.FC<KillNotificationsProps> = ({ onRegister }) => {
  const [notifications, setNotifications] = useState<KillNotification[]>([]);
  const nextIdRef = useRef(0);

  const addNotification = useCallback((message: string, isPursuit: boolean, points: number) => {
    const id = nextIdRef.current++;

    setNotifications(prev => {
      // Limit to max 3 notifications at once
      const limited = prev.length >= 3 ? prev.slice(1) : prev;
      return [...limited, { id, message, isPursuit, points }];
    });

    // Remove after animation
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 1200);
  }, []);

  useEffect(() => {
    onRegister(addNotification);
  }, [onRegister, addNotification]);

  return (
    <div className="absolute inset-0 pointer-events-none z-40 flex flex-col items-center justify-center">
      {notifications.map((notification, index) => (
        <div
          key={notification.id}
          className="absolute animate-bounce"
          style={{
            top: `calc(40% - ${index * 50}px)`,
            animation: 'fadeSlideUp 1.2s ease-out forwards',
          }}
        >
          <div className={`text-center ${notification.isPursuit ? 'scale-110' : ''}`}>
            <div
              className={`font-black retro ${
                notification.isPursuit ? 'text-3xl text-orange-400' : 'text-2xl text-red-500'
              }`}
              style={{
                textShadow: notification.isPursuit
                  ? '0 0 10px #f97316, 0 0 20px #f97316, 0 0 40px #ea580c, 0 0 80px #ea580c'
                  : '0 0 10px #ef4444, 0 0 20px #ef4444, 0 0 40px #dc2626'
              }}
            >
              {notification.message}
            </div>
            <div
              className={`font-bold retro ${
                notification.isPursuit ? 'text-lg text-yellow-300' : 'text-base text-white'
              }`}
              style={{
                textShadow: notification.isPursuit
                  ? '0 0 8px #fde047, 0 0 16px #facc15'
                  : '0 0 8px #fff, 0 0 16px #fff'
              }}
            >
              +{notification.points}
            </div>
          </div>
        </div>
      ))}

      <style>{`
        @keyframes fadeSlideUp {
          0% { opacity: 0; transform: translateY(20px) scale(0.9); }
          20% { opacity: 1; transform: translateY(0) scale(1); }
          80% { opacity: 1; transform: translateY(-30px); }
          100% { opacity: 0; transform: translateY(-60px); }
        }
      `}</style>
    </div>
  );
};

export default KillNotifications;
