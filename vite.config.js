/**
 * Vite Configuration for EPC17
 * Multi-page build with one entry per HTML page.
 * 
 * Usage:
 *   npm run dev     — start dev server with HMR
 *   npm run build   — production build to dist/
 *   npm run preview — preview production build
 * 
 * Note: The Flask backend serves HTML; Vite only bundles JS/CSS.
 * In dev mode, Vite acts as an asset server (proxy to Flask for HTML).
 */

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    root: '.',
    base: '/',

    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                // Multi-page entry points
                index: resolve(__dirname, 'index.html'),
                events: resolve(__dirname, 'events.html'),
                registration: resolve(__dirname, 'registration.html'),
                participants: resolve(__dirname, 'participants.html'),
                series: resolve(__dirname, 'series.html'),
                races: resolve(__dirname, 'races.html'),
                analytics: resolve(__dirname, 'analytics.html'),
                eventAnalytics: resolve(__dirname, 'event-analytics.html'),
                driverProfile: resolve(__dirname, 'driver-profile.html'),
                users: resolve(__dirname, 'users.html'),
                finalResults: resolve(__dirname, 'final-results.html'),
                existingDrivers: resolve(__dirname, 'existing-drivers.html'),
                techInspection: resolve(__dirname, 'tech-inspection.html'),
            }
        },
        // Generate hashed filenames for cache busting
        assetsDir: 'assets',
        sourcemap: true
    },

    server: {
        port: 3000,
        proxy: {
            // Proxy API and page requests to Flask
            '/api': 'http://localhost:5000',
            '/socket.io': {
                target: 'http://localhost:5000',
                ws: true
            }
        }
    },

    // Exclude server-side dependencies from frontend bundle
    optimizeDeps: {
        exclude: ['better-sqlite3']
    }
});
