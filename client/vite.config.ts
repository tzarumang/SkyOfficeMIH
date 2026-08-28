import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      // Vite still reaches for Dart Sass's legacy JS API by default, which is
      // gone in Sass 2. Asking for the modern compiler now keeps the build off
      // a deprecation that turns into a breakage.
      scss: { api: 'modern-compiler' },
    },
  },
})
