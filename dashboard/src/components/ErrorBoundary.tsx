import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  label: string;
}

interface State {
  message: string | null;
}

// A throw during render unmounts the whole React tree, so one panel reading a
// field the daemon did not send would blank the entire dashboard. Each panel
// that renders daemon data is wrapped so a failure stays inside that panel.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : "Something went wrong" };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`${this.props.label} failed to render`, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    return (
      <div className="mx-auto my-6 max-w-[680px] rounded-control border border-warn/25 bg-warn-soft px-4 py-3 text-[11px] leading-relaxed text-warn-strong">
        <strong>{this.props.label} is unavailable.</strong> {this.state.message}. This usually means the
        daemon is older than the dashboard — restart Obol to update it.
      </div>
    );
  }
}
