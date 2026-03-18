import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface SkeletonCardProps {
  className?: string;
}

export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-6 shadow-sm",
        className,
      )}
    >
      <Skeleton className="mb-3 h-3 w-20" />
      <Skeleton className="mb-2 h-8 w-16" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}
