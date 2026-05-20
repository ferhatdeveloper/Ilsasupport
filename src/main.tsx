import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './styles/legacy-overrides.css';

if (typeof document !== 'undefined') {
  document.documentElement.lang = 'tr';
}

createRoot(document.getElementById('root')!).render(<App />);
  