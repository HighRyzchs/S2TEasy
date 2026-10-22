import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Browser-only preview of the settings / history UI (mock IPC).
export default defineConfig({
  root: resolve('src/renderer'),
  define: {
    'import.meta.env.VITE_BROWSER_PREVIEW': JSON.stringify('1')
  },
  resolve: {
    alias: {
      '@shared': resolve('src/shared')
    }
  },
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  }
})
