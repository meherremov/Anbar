import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Gözlənilməz xəta baş verdi.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Application Error:', error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#E6ECF2] dark:bg-[#0B1120] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Sistemdə xəta baş verdi
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Məlumatlarınız təhlükəsizdir. Səhifəni yeniləyərək davam edə bilərsiniz.
            </p>
            <div className="text-xs font-mono text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg p-3 break-words">
              {this.state.errorMessage}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-2.5 px-4 text-sm font-medium text-white bg-blue-700 hover:bg-blue-600 rounded-lg transition-colors cursor-pointer"
            >
              Səhifəni yenilə
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
