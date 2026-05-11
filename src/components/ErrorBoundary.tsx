import { Component, type ErrorInfo, type ReactNode } from 'react';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { reportError } from '@/lib/error-reporter';
import ErrorFallback from './ErrorFallback';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

class ErrorBoundaryInner extends Component<Props & { onReset?: () => void }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, {
      source: 'render',
      componentStack: info.componentStack ?? undefined,
      context: { digest: (info as { digest?: string }).digest },
    });
  }

  resetError = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.resetError);
    return <ErrorFallback error={error} resetError={this.resetError} />;
  }
}

/**
 * Global error boundary.
 *
 * Wraps QueryErrorResetBoundary so retrying an error from the fallback
 * also resets any failed React Query state — without this, queries that
 * threw during render would re-throw immediately on retry.
 *
 * Catches: render errors in children
 * Does NOT catch: event handlers, async errors, errors in the boundary itself.
 *   → Use useErrorReporter() for those.
 *
 * NOTE on Sentry: integration is already handled inside reportError().
 *   Set VITE_SENTRY_DSN + run `npm i @sentry/react` to activate.
 */
export default function ErrorBoundary({ children, fallback }: Props) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundaryInner fallback={fallback} onReset={reset}>
          {children}
        </ErrorBoundaryInner>
      )}
    </QueryErrorResetBoundary>
  );
}
