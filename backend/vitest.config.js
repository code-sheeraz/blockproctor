import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['test/**/*.test.js', 'test/**/*.test.mjs'],
        exclude: ['test/integration/**', 'node_modules/**'],
        restoreMocks: true,
        clearMocks: true,
    },
});
