import { Component, ErrorInfo, ReactNode } from 'react';
import { THEME } from './themeConstants';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex min-h-screen flex-col items-center justify-center bg-[#02080B] px-6 text-center text-white"
          role="alert"
        >
          <svg className="h-16 w-16 text-[#54F6BA]" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <path d="M18 16 32 8l14 8v16L32 40 18 32V16Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
            <path d="M18 32 8 38v16l14 8 14-8V40M46 32l10 6v16l-14 8-14-8" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
            <circle cx="32" cy="32" r="4" fill="currentColor" />
          </svg>
          <h1 className="mt-8 text-3xl font-bold tracking-[-0.02em]">
            Something went <span style={{ color: THEME.primaryAccent }}>wrong</span>
          </h1>
          <p className="mt-4 max-w-md leading-7 text-white/70">
            The campus map hit an unexpected error. Reload the page to get back to navigating.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-8 rounded-md px-6 py-3 text-base font-semibold text-[#031610]"
            style={{ background: `linear-gradient(135deg, ${THEME.primaryAccent} 0%, #35E9A8 100%)` }}
          >
            Reload app
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;