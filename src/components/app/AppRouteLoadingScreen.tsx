interface AppRouteLoadingScreenProps {
  title?: string;
  description?: string;
}

const skeletonWidths = ["w-28", "w-full", "w-5/6", "w-4/6"] as const;

const AppRouteLoadingScreen = ({
  title = "Loading the next view",
  description = "Preparing the route shell and restoring fresh data for a smooth transition.",
}: AppRouteLoadingScreenProps) => (
  <main
    id="main-content"
    aria-busy="true"
    aria-live="polite"
    className="relative min-h-screen overflow-hidden bg-background"
  >
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.14),_transparent_42%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.45))]" />
    <div className="relative mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-16">
      <section className="w-full max-w-2xl rounded-[32px] border border-border/70 bg-background/90 p-8 shadow-xl backdrop-blur sm:p-10">
        <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
          </span>
          <span>Secure workspace loading</span>
        </div>

        <h1 className="mt-4 font-heading text-3xl font-semibold text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
          {description}
        </p>

        <div className="mt-8 space-y-4" aria-hidden="true">
          {skeletonWidths.map((widthClass, index) => (
            <div
              key={widthClass}
              className={`animate-pulse rounded-2xl border border-border/60 bg-card-gradient p-4 ${
                index === 2 ? "min-h-24" : "min-h-16"
              }`}
            >
              <div className={`h-3 rounded-full bg-primary/12 ${widthClass}`} />
              <div className="mt-3 h-3 rounded-full bg-muted" />
              <div className="mt-2 h-3 rounded-full bg-muted/80" />
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs uppercase tracking-[0.24em] text-muted-foreground/80">
          Optimizing route transition
        </p>
      </section>
    </div>
  </main>
);

export default AppRouteLoadingScreen;
