import type { ReactNode } from "react";

interface WorkspaceLayoutProps {
  headerIcon: ReactNode;
  headerTitle: string;
  versionBadge?: { from: string; to: string };
  actions?: ReactNode;
  /** Omit for screens (e.g. the post-테스트반영 dashboard) that have their own internal layout instead. */
  leftPanel?: ReactNode;
  children: ReactNode;
}

export default function WorkspaceLayout({
  headerIcon,
  headerTitle,
  versionBadge,
  actions,
  leftPanel,
  children,
}: WorkspaceLayoutProps) {
  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-4 md:flex-row md:overflow-hidden md:p-4">
      {leftPanel && (
        <aside className="w-full shrink-0 overflow-y-auto rounded-xl border border-panel-border bg-panel p-4 md:h-full md:w-[30%] md:max-w-sm">
          {leftPanel}
        </aside>
      )}

      <section className="flex min-h-[420px] w-full flex-1 flex-col overflow-hidden rounded-xl border border-panel-border bg-panel">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-panel-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">{headerIcon}</span>
            <h2 className="text-sm font-semibold text-gray-800">{headerTitle}</h2>
            {versionBadge && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                {versionBadge.from} → {versionBadge.to}
              </span>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>

        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </section>
    </div>
  );
}
