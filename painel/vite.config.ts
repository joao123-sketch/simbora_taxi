import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Página estática: o `npm run build` gera a pasta `dist`, que qualquer
// hospedagem (Cloudflare Pages, Netlify, Vercel) entrega como está.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true },
});
