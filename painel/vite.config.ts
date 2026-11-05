import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Página estática: o `npm run build` gera a pasta `dist`, que qualquer
// hospedagem (Cloudflare Pages, Netlify, Vercel) entrega como está.
export default defineConfig({
  plugins: [react()],
  // /termos e /privacidade leem o texto de app/src/legal, para ficar igual ao do app.
  server: { port: 5174, strictPort: true, fs: { allow: ['..'] } },
});
