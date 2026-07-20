import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const publicMode = env.VITE_PUBLIC_MODE === 'true'

  return {
  plugins: [react()],
  base: '/cityprint/',
  define: {
    __PUBLIC_MODE__: JSON.stringify(publicMode),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/cityprint/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cityprint\/api/, '/api'),
      },
    },
    allowedHosts: [],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react-router-dom/')) {
            return 'vendor-react'
          }
          if (id.includes('/node_modules/echarts/') || id.includes('/node_modules/zrender/')) {
            return 'vendor-echarts'
          }
          if (!publicMode && id.includes('/node_modules/xlsx/')) {
            return 'vendor-xlsx'
          }
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  }
})
