// Depois do `expo export -p web`: liga manifest, ícones e service worker ao index.html.
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../dist/index.html', import.meta.url);
let html = readFileSync(file, 'utf8');

const tags = `
    <meta name="theme-color" content="#D62828" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="Simbora" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />`;

const register = `<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}</script>`;

html = html
  .replace('<html lang="en">', '<html lang="pt-BR">')
  .replace(
    /<meta name="viewport"[^>]*>/,
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
  )
  .replace('</title>', `</title>${tags}`)
  .replace('</body>', `${register}\n</body>`);

writeFileSync(file, html);
console.log('PWA: index.html atualizado');
