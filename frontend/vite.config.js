import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '^/api/health$': {
        target: 'http://127.0.0.1:8080',
        rewrite: () => '/health',
      },
      // Sprint 4 coaching voice/wording proxy. The OpenAI key stays in the backend only.
      '/api/coach': {
        target: 'http://127.0.0.1:8080',
      },
      // Sprint 5 accounts and workout storage (FastAPI). Development only; not production routing.
      '/api/auth': { target: 'http://127.0.0.1:8080' },
      '/api/users': { target: 'http://127.0.0.1:8080' },
      '/api/exercises': { target: 'http://127.0.0.1:8080' },
      '/api/workouts': { target: 'http://127.0.0.1:8080' },
    },
  },
})
