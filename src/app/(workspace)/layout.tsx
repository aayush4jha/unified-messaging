import { AppShell } from "@/components/shell/app-shell";

/**
 * The workspace renders from client-side state (local sample data or the
 * authenticated API), so its server-rendered shell is a skeleton by design.
 * Opt these routes out of instant-navigation validation.
 */
export const instant = false;

export default function WorkspaceLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
