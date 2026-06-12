import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

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
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
})
