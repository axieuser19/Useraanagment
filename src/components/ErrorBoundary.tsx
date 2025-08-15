import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('🚨 Error Boundary caught an error:', error, errorInfo);
    }
    
    // In production, you might want to log to an error reporting service
    this.setState({ error, errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <div className="w-20 h-20 bg-red-100 border-2 border-red-600 flex items-center justify-center rounded-none mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-red-600" />
            </div>
            
            <h1 className="text-2xl font-bold text-black mb-4 uppercase tracking-wide">
              Something Went Wrong
            </h1>
            
            <p className="text-gray-600 mb-8 text-lg">
              We encountered an unexpected error. Don't worry - your data is safe.
            </p>
            
            <div className="space-y-4">
              <button
                onClick={this.handleReload}
                className="w-full bg-black text-white px-6 py-3 rounded-none font-bold uppercase tracking-wide hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 border-2 border-black"
              >
                <RefreshCw className="w-5 h-5" />
                Reload Page
              </button>
              
              <button
                onClick={this.handleGoHome}
                className="w-full bg-white text-black px-6 py-3 rounded-none font-bold uppercase tracking-wide hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 border-2 border-black"
              >
                <Home className="w-5 h-5" />
                Go to Dashboard
              </button>
            </div>
            
            {import.meta.env.DEV && this.state.error && (
              <details className="mt-8 text-left">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                  Show Error Details (Development Only)
                </summary>
                <div className="mt-4 p-4 bg-gray-100 border-2 border-gray-300 rounded-none text-xs font-mono text-left overflow-auto">
                  <div className="text-red-600 font-bold mb-2">Error:</div>
                  <div className="mb-4">{this.state.error.toString()}</div>
                  
                  {this.state.errorInfo && (
                    <>
                      <div className="text-red-600 font-bold mb-2">Component Stack:</div>
                      <div className="whitespace-pre-wrap">{this.state.errorInfo.componentStack}</div>
                    </>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
