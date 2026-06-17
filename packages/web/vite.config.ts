import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
    plugins: [
        TanStackRouterVite({
            target: 'react',
            autoCodeSplitting: true,
            routesDirectory: 'routes',
            generatedRouteTree: 'routeTree.gen.ts',
        }),
        react(),
        tailwindcss(),
    ],
    root: 'src/client',
    build: {
        outDir: '../../dist/client',
        emptyOutDir: true,
    },
    server: {
        host: '0.0.0.0',
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
})
