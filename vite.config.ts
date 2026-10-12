import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // The reminder API lives in the Worker. Run `npm run dev:worker` alongside
    // `npm run dev` and the Vite dev server forwards /api to it.
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
