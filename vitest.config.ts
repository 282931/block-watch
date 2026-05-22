import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/prisma': path.resolve(__dirname, './generated/prisma/client'),
      '@/prisma/*': path.resolve(__dirname, './generated/prisma/*'),
    },
  },
});
