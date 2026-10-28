import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppShellErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
  homeHref?: string;
}

interface AppShellErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AppShellErrorBoundary extends Component<
  AppShellErrorBoundaryProps,
  AppShellErrorBoundaryState
> {
  state: AppShellErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppShellErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[AppShellErrorBoundary]", error, errorInfo);
  }

  componentDidUpdate(prevProps: AppShellErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({
        hasError: false,
        error: null,
      });
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="relative min-h-screen overflow-hidden bg-background px-6 py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--destructive)/0.12),_transparent_42%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.5))]" />
        <div className="relative mx-auto flex min-h-[calc(100vh-8rem)] max-w-3xl items-center justify-center">
          <section className="w-full rounded-[32px] border border-destructive/20 bg-background/95 p-8 shadow-xl backdrop-blur sm:p-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>

            <h1 className="mt-6 font-heading text-3xl font-semibold text-foreground">
              The app shell hit an unexpected error
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
              The current route could not finish rendering. You can retry in place,
              reload the app, or return to a safe entry point.
            </p>

            {import.meta.env.DEV && this.state.error?.message ? (
              <pre className="mt-6 overflow-x-auto rounded-2xl border border-border/70 bg-muted/60 p-4 text-xs text-muted-foreground">
                {this.state.error.message}
              </pre>
            ) : null}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button className="gap-2" onClick={this.handleRetry}>
                <RotateCcw className="h-4 w-4" />
                Try rendering again
              </Button>
              <Button className="gap-2" variant="outline" onClick={this.handleReload}>
                <RefreshCw className="h-4 w-4" />
                Reload application
              </Button>
              <Button asChild variant="ghost">
                <a href={this.props.homeHref ?? "/"}>Go to homepage</a>
              </Button>
            </div>
          </section>
        </div>
      </main>
    );
  }
}

export default AppShellErrorBoundary;
