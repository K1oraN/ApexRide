import '@fontsource/roboto-condensed/latin-400.css';
import '@fontsource/roboto-condensed/latin-500.css';
import '@fontsource/roboto-condensed/latin-600.css';
import '@fontsource/roboto-condensed/latin-700-italic.css';
import '@fontsource/roboto-condensed/latin-700.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { App } from './App';

import './styles/global.css';
import './styles/components.css';
import './styles/shell.css';

import './styles/vertical-scroll.css';
import './styles/explore-mobile-fixes.css';
import './styles/apex-ui-overhaul.css';
import './styles/apex-stage-07.css';

if (
  import.meta.env.PROD &&
  'serviceWorker' in navigator &&
  window.isSecureContext
) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('Elemento raiz não encontrado');
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
