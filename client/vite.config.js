import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../', '') // read from project root or client root
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:3000'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': backendUrl,
      },
    },
    build: {
      outDir: 'dist',
    },
  }
})
