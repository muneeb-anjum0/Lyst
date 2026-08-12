import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/firebase/firestore') || id.includes('/@firebase/firestore')) return 'firebase-firestore'
          if (id.includes('/firebase/auth') || id.includes('/@firebase/auth')) return 'firebase-auth'
          if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase-core'
          if (id.includes('/framer-motion/') || id.includes('/motion-dom/') || id.includes('/motion-utils/')) return 'motion'
          if (id.includes('/chrono-node/')) return 'parsing'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react'
          return 'vendor'
        },
      },
    },
  },
})
