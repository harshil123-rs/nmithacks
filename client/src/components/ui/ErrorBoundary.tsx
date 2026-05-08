import { Component, type ErrorInfo, type ReactNode } from "react";
import * as Sentry from "@sentry/react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground relative overflow-hidden">
        {/* Background glow blobs — same as Hero */}
        <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/[0.06] rounded-full blur-[180px] pointer-events-none" />
        <div className="absolute bottom-[10%] right-[10%] w-[300px] h-[300px] bg-secondary/[0.04] rounded-full blur-[150px] pointer-events-none" />
        <div className="absolute top-[40%] left-[5%] w-[250px] h-[250px] bg-accent/[0.03] rounded-full blur-[120px] pointer-events-none" />

        <div className="clay-lg p-10 sm:p-14 max-w-md w-full text-center relative z-10">
          {/* Icon */}
          <div className="clay-icon inline-flex items-center justify-center w-16 h-16 mb-6 bg-gradient-to-br from-[#1e2736] to-[#171d28]">
            <span className="text-3xl">🙀</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold mb-2 gradient-text-primary">
            Something went wrong
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mb-8 leading-relaxed">
            An unexpected error occurred. Try refreshing the page — if it
            persists, reach out to us.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="clay-btn clay-btn-primary px-8 py-3 text-sm sm:text-base w-full sm:w-auto"
            >
              Refresh page
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              className="clay-btn clay-btn-ghost px-8 py-3 text-sm sm:text-base w-full sm:w-auto"
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
