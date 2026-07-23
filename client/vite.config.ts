import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy/stable third-party code into its own chunks so the
        // browser can cache them separately from app code. React itself
        // rarely changes between deploys, and recharts is only needed on
        // pages with charts — bundling both into every page's chunk meant
        // a full re-download on every app update even when neither library
        // changed.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) return 'charts'
            if (
              id.includes('react-dom') ||
              id.includes('/react/') ||
              id.includes('react-router-dom')
            ) return 'react-vendor'
          }
        },
      },
    },
  },
})
