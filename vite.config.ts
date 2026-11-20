import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 开发模式同样走后端（模型配置存于 SQLite，由后端注入，保证行为与生产一致）
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: entry('./index.html'),
        admin: entry('./admin.html'),
      },
    },
  },
})
