import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function SkeletonTable({ rows = 5, columns = 4, className }: SkeletonTableProps) {
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm",
        className,
      )}
    >
      {/* Header row */}
      <div className="flex gap-6 border-b border-border bg-muted/30 px-6 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" style={{ maxWidth: i === 0 ? 140 : 100 }} />
        ))}
      </div>

      {/* Data rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="flex gap-6 border-b border-border px-6 py-4 last:border-0"
        >
          {Array.from({ length: columns }).map((_, colIdx) => (
            <Skeleton
              key={colIdx}
              className="h-4 flex-1"
              style={{ maxWidth: colIdx === 0 ? 180 : 120 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
