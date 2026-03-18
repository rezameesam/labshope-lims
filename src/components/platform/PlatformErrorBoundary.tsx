import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  sectionName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class PlatformErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[PlatformErrorBoundary]", error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center p-8">
          <div className="max-w-md rounded-[28px] border border-slate-700 bg-slate-800 p-8 text-center shadow-lg">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
              <AlertTriangle className="h-6 w-6 text-red-400" />
            </div>
            <h3 className="font-heading text-lg font-semibold text-slate-100">
              Something went wrong
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              {this.props.sectionName
                ? `The ${this.props.sectionName} section encountered an unexpected error.`
                : "This section encountered an unexpected error."}
            </p>
            {this.state.error && (
              <p className="mt-3 rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs text-slate-400">
                {this.state.error.message}
              </p>
            )}
            <Button
              className="mt-6 gap-2 border-slate-600 bg-slate-700 text-slate-200 hover:bg-slate-600"
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

export default PlatformErrorBoundary;
