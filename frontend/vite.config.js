import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: "/",   // ✅ Absolute path for GoDaddy nested routing asset support
  plugins: [
    react(),
    tailwindcss(),
  ],
})