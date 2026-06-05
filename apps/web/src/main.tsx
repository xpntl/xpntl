import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@xpntl/ui/tokens';
import './index.css';

// Theme is owned by `lib/theme.ts`, which sets `data-theme` on import.
import './lib/theme';
const html = document.documentElement;
if (!html.hasAttribute('data-density')) html.setAttribute('data-density', 'compact');
if (!html.hasAttribute('data-focus-ring')) html.setAttribute('data-focus-ring', 'offset');

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the PWA service worker so xpntl is installable as a desktop/standalone
// app. The SW is network-only (see public/sw.js) — no offline caching.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
