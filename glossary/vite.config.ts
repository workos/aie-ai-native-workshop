import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Static SPA build → ./dist, served by the Cloudflare Worker's ASSETS binding.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
