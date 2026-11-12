import type { PlatformId } from "@/lib/types";
import { PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import { BRAND_PATHS } from "./brand-paths";

/**
 * Platform mark: a small rounded tile in the provider's brand color with a
 * white glyph. Used sparingly — it's the only place brand colors appear.
 */
export function PlatformIcon({ platform, size = 16, className, mono }: { platform: PlatformId; size?: number; className?: string; mono?: boolean }) {
  const info = PLATFORMS[platform];
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(3, Math.round(size * 0.28)),
        background: mono ? "var(--hover)" : info.color,
        color: mono ? "var(--text-2)" : "#fff",
      }}
      title={info.name}
      aria-label={info.name}
      role="img"
    >
      <svg viewBox="0 0 24 24" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} fill="currentColor" aria-hidden>
        <Glyph platform={platform} />
      </svg>
    </span>
  );
}

function Glyph({ platform }: { platform: PlatformId }) {
  const path = BRAND_PATHS[platform];
  if (path) return <path d={path} />;
  switch (platform) {
    case "slack":
      return (
        <g>
          <rect x="7.4" y="1.8" width="3.4" height="10.8" rx="1.7" />
          <rect x="13.2" y="11.4" width="3.4" height="10.8" rx="1.7" />
          <rect x="11.4" y="7.4" width="10.8" height="3.4" rx="1.7" />
          <rect x="1.8" y="13.2" width="10.8" height="3.4" rx="1.7" />
        </g>
      );
    case "linkedin":
      return (
        <g>
          <circle cx="5.6" cy="5.4" r="2.1" />
          <rect x="3.7" y="8.8" width="3.8" height="11.6" rx="0.6" />
          <path d="M10.2 8.8h3.6v1.7c.7-1.1 2.1-2 4-2 3.3 0 4.1 2.2 4.1 5.1v6.8h-3.8v-6c0-1.4-.3-2.7-1.9-2.7s-2.2 1.2-2.2 2.6v6.1h-3.8z" />
        </g>
      );
    case "outlook":
      return <path fillRule="evenodd" d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm0 3.7a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6Z" />;
    case "teams":
      return <path d="M4 4.5h16v3.8h-6v11.2H10V8.3H4z" />;
    case "imap":
      return <path fillRule="evenodd" d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11Zm2.4-.3 6.6 5.3 6.6-5.3H5.4ZM19 8.4l-7 5.6-7-5.6v9.1c0 .3.2.5.5.5h13c.3 0 .5-.2.5-.5V8.4Z" />;
    default:
      return <circle cx="12" cy="12" r="6" />;
  }
}

export function OrbitMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--text)" />
      <circle cx="16" cy="16" r="6.2" fill="none" stroke="var(--text-inverse)" strokeWidth="2.6" />
      <circle cx="24.2" cy="9.6" r="3" fill="var(--accent)" stroke="var(--text)" strokeWidth="1.6" />
    </svg>
  );
}

export function OrbitLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <OrbitMark />
      <span className="text-[0.9375rem] font-semibold tracking-[-0.02em] text-fg">Orbit</span>
    </span>
  );
}
