import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true, timeout: 190_000, proxyTimeout: 190_000 } },
  },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.js', include: ['src/**/*.test.{js,jsx}'] },
})
