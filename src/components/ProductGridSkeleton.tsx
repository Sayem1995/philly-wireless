import { cn } from "@/lib/utils";

/** Stable card placeholders so the catalogue does not jump while loading. */
export default function ProductGridSkeleton({
  count = 8,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-5", className)} role="status" aria-label="Loading products">
      <span className="sr-only">Loading products…</span>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-3xl border border-blush bg-white animate-pulse"
          aria-hidden="true"
        >
          <div className="aspect-[4/3] bg-blush/60" />
          <div className="space-y-3 p-6">
            <div className="h-4 w-2/3 rounded-full bg-blush/70" />
            <div className="h-3 w-full rounded-full bg-blush/50" />
            <div className="h-3 w-4/5 rounded-full bg-blush/50" />
            <div className="flex items-center justify-between pt-3">
              <div className="h-5 w-20 rounded-full bg-blush/60" />
              <div className="h-3 w-16 rounded-full bg-blush/50" />
            </div>
            <div className="h-10 w-full rounded-full bg-blush/50" />
          </div>
        </div>
      ))}
    </div>
  );
}
