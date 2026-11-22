import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Register the SHANT MATKA service worker with scope '/'
registerSW({
  immediate: true,
});

createRoot(document.getElementById('root')!).render(<App />);
