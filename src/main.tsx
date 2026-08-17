import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import Dashboard from './components/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';
import './styles.css';

registerSW({ immediate: true });

function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const online = () => setIsOffline(false);
    const offline = () => setIsOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  if (!isOffline) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#F87171',
        color: '#031610',
        padding: '8px 16px',
        textAlign: 'center',
        fontSize: '14px',
        fontWeight: 600,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
      role="alert"
    >
      You're offline — cached routes still work, but AI and live updates are unavailable.
    </div>
  );
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found.');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <OfflineBanner />
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  </React.StrictMode>
);
