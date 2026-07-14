import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from "react";

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Warcry Herald application error", error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <main className="page page--narrow" role="alert">
          <section className="notice notice--danger">
            <p className="eyebrow">Application error</p>
            <h1>The campaign ledger could not be opened.</h1>
            <p>
              Refresh the page and try again. If the problem continues, capture
              the browser console error before changing campaign data.
            </p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
