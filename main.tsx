import React from 'react';
import { createRoot } from 'react-dom/client';
import Dashboard from './Dashboard';
import ErrorBoundary from './ErrorBoundary';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found.');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  </React.StrictMode>
);
