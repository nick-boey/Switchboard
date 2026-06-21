import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Minimal React + Vite app (Decision 7). Section 6 builds the real Mantine shell + theme.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
