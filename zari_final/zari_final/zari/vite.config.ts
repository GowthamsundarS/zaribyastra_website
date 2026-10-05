import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2020",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          motion: ["framer-motion", "lenis"],
        },
      },
    },
  },
  server: {
    allowedHosts: true,
    watch: {
      ignored: ["**/dist/**", "**/zari_backend/**"],
    },
  },
})
