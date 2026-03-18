import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  tabName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class AdminErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[AdminErrorBoundary]", error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center p-8">
          <div className="max-w-md rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <h3 className="font-heading text-lg font-semibold text-slate-900">
              Something went wrong
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {this.props.tabName
                ? `The ${this.props.tabName} section encountered an unexpected error.`
                : "This section encountered an unexpected error."}
            </p>
            {this.state.error && (
              <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-600">
                {this.state.error.message}
              </p>
            )}
            <Button
              className="mt-6 gap-2"
              variant="outline"
              onClick={this.handleRetry}
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AdminErrorBoundary;
