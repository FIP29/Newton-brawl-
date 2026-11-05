import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import gsap from 'gsap';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { wakeServer } from './api/client';
import './styles/global.css';

// UI animations must run in real time even if a frame stalls: the ULTIMATE cinematic is timed to
// match the server's fixed 60-tick freeze, so GSAP's default lag smoothing (which slows time) is off.
gsap.ticker.lagSmoothing(0);

// Free hosting puts the backend to sleep when idle: start waking it the moment the page opens.
void wakeServer();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
