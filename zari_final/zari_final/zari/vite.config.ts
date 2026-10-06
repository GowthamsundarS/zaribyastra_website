import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2020",
    cssCodeSplit: true,
    // Perf: lenis is dynamically imported (desktop-only smoother) so it
    // must NOT be forced into the upfront motion chunk — it becomes its
    // own on-demand chunk and mobile never downloads it.
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          motion: ["framer-motion"],
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
