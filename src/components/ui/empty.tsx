import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center animate-fade-in", compact ? "px-6 py-10" : "px-8 py-16", className)}>
      {icon ? (
        <div className="mb-4 inline-flex size-11 items-center justify-center rounded-[12px] border border-line bg-surface text-fg-3 shadow-sm [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <h3 className="text-[0.875rem] font-semibold tracking-[-0.01em] text-fg">{title}</h3>
      {description ? <p className="mt-1.5 max-w-[320px] text-[0.8125rem] leading-5 text-fg-3 text-balance">{description}</p> : null}
      {action ? <div className="mt-5 flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-sm", className)} />;
}

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-1 p-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-md px-3 py-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2 pt-0.5">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-3 w-[85%]" />
            <Skeleton className="h-3 w-[60%]" />
          </div>
        </div>
      ))}
    </div>
  );
}
