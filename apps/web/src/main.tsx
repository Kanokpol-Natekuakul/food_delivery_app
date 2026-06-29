import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/tokens.css';
import { StoreProvider } from './ui/store';
import { App } from './ui/App';

const root = document.getElementById('root');
if (!root) throw new Error('ไม่พบ #root');
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <StoreProvider persist>
        <App />
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
