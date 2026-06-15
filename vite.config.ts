import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'dist',
        target: 'es2020',
        rollupOptions: {
            output: {
                // Stable, unhashed filenames so the service worker can precache
                // the shell by exact path. Cache-busting is handled instead by
                // bumping CACHE_VERSION in service-worker.js on each deploy.
                entryFileNames: 'assets/index.js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/index[extname]',
            },
        },
    },
});
