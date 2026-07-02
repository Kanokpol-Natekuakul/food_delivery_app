import { Component, ErrorInfo, ReactNode } from 'react';
import { IconAlertTriangle } from './Icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '200px',
          padding: '24px',
          background: 'var(--ink-card, #1b1b1f)',
          border: '1px solid var(--ink-line, #333)',
          borderRadius: '12px',
          textAlign: 'center',
          color: 'var(--paper, #f5f5f0)',
          margin: '20px auto',
          maxWidth: '480px'
        }}>
          <div style={{ color: 'var(--chili, #FF4D3D)', marginBottom: '12px', display: 'inline-flex' }}>
            <IconAlertTriangle size={48} />
          </div>
          <h3 style={{ margin: '0 0 8px 0', fontFamily: 'var(--display)' }}>เกิดข้อผิดพลาดบางอย่าง</h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--paper-dim, #aaa)', lineHeight: 1.4 }}>
            ระบบพบข้อผิดพลาดภายในการทำงานของหน้านี้
          </p>
          {this.state.error && (
            <pre style={{
              width: '100%',
              overflowX: 'auto',
              padding: '10px',
              background: 'var(--ink, #111)',
              borderRadius: '6px',
              fontSize: '12px',
              fontFamily: 'var(--mono)',
              textAlign: 'left',
              color: 'var(--chili)',
              marginBottom: '16px',
              border: '1px solid var(--ink-line)'
            }}>
              {this.state.error.toString()}
            </pre>
          )}
          <button className="btn btn--mango" onClick={this.handleReset} style={{ width: '100%' }}>
            โหลดหน้านี้ใหม่อีกครั้ง
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
