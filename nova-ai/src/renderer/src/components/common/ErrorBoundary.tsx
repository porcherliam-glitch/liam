import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '../ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown above the message (default "Dieser Bereich konnte nicht angezeigt werden"). */
  title?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Catches render errors of a page so the rest of the app keeps working. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[nova] render error', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-danger/12 text-danger-fg">
          <TriangleAlert aria-hidden className="h-5 w-5" />
        </span>
        <h2 className="text-base font-semibold">{this.props.title ?? 'Dieser Bereich konnte nicht angezeigt werden'}</h2>
        <p className="text-[13px] text-muted">
          In der Oberfläche ist ein Fehler aufgetreten. Die Arbeit von NOVA im Hintergrund ist davon nicht betroffen.
        </p>
        <pre className="max-w-full overflow-auto rounded-lg bg-bg px-3 py-2 text-left font-mono text-xs text-muted">{this.state.error.message}</pre>
        <Button icon={RefreshCw} onClick={() => this.setState({ error: null })}>
          Erneut versuchen
        </Button>
      </div>
    );
  }
}
