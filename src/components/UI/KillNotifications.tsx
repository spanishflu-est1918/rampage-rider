import React, { useState, useEffect, useCallback } from 'react';

interface KillNotification {
  id: number;
  message: string;
  isPursuit: boolean;
  points: number;
  timestamp: number;
}

interface KillNotificationsProps {
  onRegister: (addNotification: (message: string, isPursuit: boolean, points: number) => void) => void;
}

const KillNotifications: React.FC<KillNotificationsProps> = ({ onRegister }) => {
  const [notifications, setNotifications] = useState<KillNotification[]>([]);
  const [nextId, setNextId] = useState(0);

  const addNotification = useCallback((message: string, isPursuit: boolean, points: number) => {
    const newNotification: KillNotification = {
      id: nextId,
      message,
      isPursuit,
      points,
      timestamp: Date.now(),
    };

    setNotifications(prev => [...prev, newNotification]);
    setNextId(prev => prev + 1);

    // Remove after animation completes
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
    }, 1500);
  }, [nextId]);

  // Register the addNotification function with parent
  useEffect(() => {
    onRegister(addNotification);
  }, [onRegister, addNotification]);

  return (
    <div className="absolute inset-0 pointer-events-none z-40 flex flex-col items-center justify-center">
      <style>{`
        @keyframes killNotification {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.8);
          }
          15% {
            opacity: 1;
            transform: translateY(0) scale(1.1);
          }
          30% {
            transform: translateY(-10px) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-80px) scale(0.9);
          }
        }
        @keyframes pursuitPulse {
          0%, 100% { text-shadow: 0 0 10px #ff0000, 0 0 20px #ff0000, 0 0 30px #ff0000; }
          50% { text-shadow: 0 0 20px #ff0000, 0 0 40px #ff0000, 0 0 60px #ff0000, 0 0 80px #ff6600; }
        }
      `}</style>

      {notifications.map((notification, index) => (
        <div
          key={notification.id}
          className="absolute"
          style={{
            animation: 'killNotification 1.5s ease-out forwards',
            top: `calc(45% - ${index * 40}px)`,
          }}
        >
          <div className={`text-center ${notification.isPursuit ? 'scale-125' : ''}`}>
            <div
              className={`font-black retro ${notification.isPursuit ? 'text-4xl text-orange-500' : 'text-3xl text-red-500'}`}
              style={{
                textShadow: notification.isPursuit
                  ? '3px 3px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000'
                  : '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
                animation: notification.isPursuit ? 'pursuitPulse 0.2s infinite' : undefined,
              }}
            >
              {notification.message}
            </div>
            <div
              className={`font-bold retro ${notification.isPursuit ? 'text-xl text-yellow-400' : 'text-lg text-white'}`}
              style={{ textShadow: '2px 2px 0 #000' }}
            >
              +{notification.points}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default KillNotifications;
