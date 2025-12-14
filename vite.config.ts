import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const fluApiUrl = env.VITE_FLU_API_URL || 'https://flu-services.vercel.app';
    const fluApiKey = env.VITE_FLU_API_KEY || '';

    return {
      server: {
        port: 8080,
        host: '0.0.0.0',
        https: {
          key: fs.readFileSync('./localhost+3-key.pem'),
          cert: fs.readFileSync('./localhost+3.pem'),
        },
        proxy: {
          '/api/flu': {
            target: fluApiUrl,
            changeOrigin: true,
            rewrite: (p) => p.replace(/^\/api\/flu/, '/api'),
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.setHeader('Authorization', `Bearer ${fluApiKey}`);
              });
            },
          },
        },
      },
      plugins: [react(), tailwindcss()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        }
      }
    };
});
