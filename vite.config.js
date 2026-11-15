import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel sets VERCEL_ENV at build time ("production" | "preview" | "development").
// Only a production build may talk to the live payment server; everything else is
// pinned to the isolated sandbox (see src/lib/paymentEnv.js).
const deployEnv = process.env.VERCEL_ENV === 'production' ? 'production' : 'sandbox'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __RYUGE_DEPLOY_ENV__: JSON.stringify(deployEnv),
  },
})
