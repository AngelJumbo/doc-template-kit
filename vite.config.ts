import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/lib/index.ts',
      name: 'DocTemplateKit',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    outDir: 'dist',
    rollupOptions: {
      external: ['react', 'react-dom'],
    },
  },
})
