import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router";

type Props = { children: ReactNode; resetKey?: string };
type State = { error: Error | null; info: ErrorInfo | null };

/**
 * Catches render errors anywhere below it.
 *
 * Without a boundary, a single render error unmounts the whole React tree and
 * the user sees a blank white page with no explanation — the only recourse
 * being a manual refresh. This surfaces the failure instead, and offers a way
 * out, so a bug is diagnosable rather than invisible.
 *
 * `resetKey` clears the error when it changes (we pass the current pathname),
 * so navigating away from a broken page recovers instead of sticking on the
 * error screen until a manual reload.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the full detail in the console for debugging.
    console.error("[ErrorBoundary] render error:", error, info.componentStack);
    this.setState({ info });
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, info: null });
    }
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-ivory flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-2xl bg-white border border-blush rounded-3xl p-8 shadow-sm">
          <h1 className="font-serif text-2xl text-ink mb-2">Something went wrong on this page</h1>
          <p className="text-sm text-ink/55 mb-6">
            The rest of the site is fine — this is a display error, not a problem with your data.
            Reloading usually clears it.
          </p>

          <pre className="text-[12.5px] leading-relaxed bg-blush-light border border-blush rounded-xl p-4 overflow-auto max-h-64 whitespace-pre-wrap break-words text-ink/80">
            {error.message || String(error)}
            {info?.componentStack ? `\n${info.componentStack.trim().split("\n").slice(0, 6).join("\n")}` : ""}
          </pre>

          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={() => window.location.reload()}
              className="bg-burgundy text-ivory text-sm font-semibold px-6 py-3 rounded-full hover:bg-burgundy-dark transition-colors"
            >
              Reload page
            </button>
            <a
              href="/"
              className="border border-burgundy/30 text-burgundy text-sm font-semibold px-6 py-3 rounded-full hover:bg-blush transition-colors"
            >
              Go to homepage
            </a>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * Resets the boundary when the route changes, so clicking a nav link recovers
 * from a broken page instead of leaving the user stuck until a manual refresh.
 * Must be rendered inside a Router.
 */
export function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}
