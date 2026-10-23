import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  resolve: { alias: { '@shared': resolve('src/shared') } },
  plugins: [react()],
  build: {
    outDir: resolve('.site/voice-lab'),
    emptyOutDir: true,
    rollupOptions: { input: resolve('src/renderer/voice-lab.html') }
  }
})
