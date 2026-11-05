import { Skeleton } from "@/components/ui/skeleton";

/** Neutral on purpose: this one state stands in for every page. */
export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Loading" className="grid grid-cols-1 gap-6 pt-6">
      <Skeleton className="h-9 w-72 max-w-full" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-64 rounded-xl" />
      <div className="grid gap-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-12 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
