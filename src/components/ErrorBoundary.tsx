import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="loading-page">
          <div className="login-bg" />
          <section className="card empty-state">
          <h2>出错了</h2>
          <p className="muted">应用遇到了意外错误，请刷新后重试。</p>
          <button
            className="btn-primary"
            onClick={() => window.location.reload()}
          >
            刷新页面
          </button>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}
