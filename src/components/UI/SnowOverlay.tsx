import React, { useEffect, useRef } from 'react';

/**
 * SnowOverlay - 2D screen-space snow using Canvas
 * Super lightweight - just draws white dots falling down
 */
const SnowOverlay: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to window
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Snow particles (screen space)
    const particleCount = 150; // Fewer particles for subtle effect
    const particles: Array<{
      x: number;
      y: number;
      speed: number;
      size: number;
      wind: number;
    }> = [];

    // Initialize particles
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        speed: 30 + Math.random() * 50, // pixels per second
        size: 1 + Math.random() * 2,
        wind: (Math.random() - 0.5) * 20, // horizontal drift
      });
    }

    let lastTime = performance.now();

    const animate = (time: number) => {
      const deltaTime = (time - lastTime) / 1000;
      lastTime = time;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw and update particles
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';

      for (const p of particles) {
        // Update position
        p.y += p.speed * deltaTime;
        p.x += p.wind * deltaTime;

        // Wrap around edges
        if (p.y > canvas.height) {
          p.y = -5;
          p.x = Math.random() * canvas.width;
        }
        if (p.x > canvas.width) p.x = 0;
        if (p.x < 0) p.x = canvas.width;

        // Draw snowflake
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ opacity: 0.7 }}
    />
  );
};

export default SnowOverlay;
