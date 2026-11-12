import { cn } from "@/lib/utils";

export function Kbd({ children, className, tone = "default" }: { children: React.ReactNode; className?: string; tone?: "default" | "inverse" }) {
  const keys = typeof children === "string" ? children.split(" ").filter(Boolean) : [children];
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {keys.map((k, i) => (
        <kbd
          key={i}
          className={cn(
            "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] px-1 font-sans text-[0.6875rem] font-medium leading-none",
            tone === "inverse" ? "bg-fg-inverse/15 text-fg-inverse/80" : "border border-line bg-surface-sunken text-fg-3 shadow-[inset_0_-1px_0_var(--border)]",
          )}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
