import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Nutpay] Uncaught render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100%', padding: '20px', color: '#888', fontSize: '13px',
          textAlign: 'center', background: 'var(--background)'
        }}>
          Something went wrong. Please reload.
        </div>
      );
    }
    return this.props.children;
  }
}
