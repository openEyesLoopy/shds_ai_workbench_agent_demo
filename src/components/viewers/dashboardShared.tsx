import { RefreshCw, ShieldAlert } from "lucide-react";
import clsx from "clsx";
import type { QaAuditResult, ResourceStats, SastResult, VercelDeployStatus } from "@/lib/types";

export function StatTag({ delta, unit }: { delta: number; unit: string }) {
  const improved = delta <= 0;
  return (
    <span
      className={clsx(
        "rounded px-1.5 py-0.5 text-[11px] font-semibold",
        improved ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
      )}
    >
      {delta > 0 ? "+" : ""}
      {delta}
      {unit} {improved ? "최적화" : "증가"}
    </span>
  );
}

export function VercelStatusBadge({ vercel }: { vercel: VercelDeployStatus | undefined }) {
  if (!vercel?.configured) return null;

  if (vercel.state === "READY") {
    return (
      <a
        href={vercel.url ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 hover:underline"
      >
        ▲ Vercel 배포 완료
      </a>
    );
  }
  if (vercel.state === "ERROR" || vercel.state === "CANCELED") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700">
        ▲ Vercel 배포 실패
      </span>
    );
  }
  if (vercel.timedOut) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
        ▲ Vercel 배포 확인 시간 초과 — 계속 진행 중일 수 있습니다
      </span>
    );
  }
  return null;
}

export function LoadingPane({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 bg-code-panel text-gray-300">
      <RefreshCw className="animate-spin-slow" size={26} />
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-xs text-gray-500">{detail}</p>
    </div>
  );
}

export function MetricsColumn({
  sast,
  qa,
  resource,
}: {
  sast: SastResult[];
  qa: QaAuditResult;
  resource: ResourceStats;
}) {
  return (
    <div className="flex w-full shrink-0 flex-col gap-4 md:w-72">
      <div className="rounded-xl border border-panel-border p-4">
        <p className="mb-3 text-xs font-semibold text-gray-500">
          리소스 효율성 비교 (AS-IS vs TO-BE)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-[10px] font-semibold uppercase text-gray-400">Bundle Size</p>
            <p className="text-lg font-bold text-gray-900">{resource.bundleSizeKb}KB</p>
            <StatTag delta={resource.bundleDeltaKb} unit="KB" />
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-[10px] font-semibold uppercase text-gray-400">Code Lines</p>
            <p className="text-lg font-bold text-gray-900">{resource.codeLines}</p>
            <StatTag delta={resource.codeLineDelta} unit="줄" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-panel-border p-4">
        <p className="mb-3 text-xs font-semibold text-gray-500">보안 취약점 점검 (SAST)</p>
        <div className="flex flex-col gap-2">
          {sast.map((rule) => (
            <div
              key={rule.rule}
              className={clsx(
                "rounded-lg border px-3 py-2",
                rule.passed ? "border-panel-border" : "border-red-200 bg-red-50"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium text-gray-800">{rule.label}</p>
                <span
                  className={clsx(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold",
                    rule.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                  )}
                >
                  {rule.passed ? "PASSED" : "FAILED"}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-gray-500">{rule.detail}</p>
            </div>
          ))}
          {sast.length === 0 && <p className="text-xs text-gray-400">스캔된 파일이 없습니다.</p>}
        </div>
      </div>

      <div className="rounded-xl border border-panel-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
            <ShieldAlert size={13} /> QA 모듈 — 자동 보안 조치
          </p>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">
            {qa.security_fixes.length}건 조치
          </span>
        </div>
        {qa.security_fixes.length === 0 ? (
          <p className="text-xs text-gray-400">발견된 취약점이 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {qa.security_fixes.map((fix, i) => (
              <div key={i} className="min-w-0 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                <p className="break-words text-xs font-medium text-gray-800">
                  {fix.file} — {fix.issue}
                </p>
                <p className="mt-0.5 break-words text-[11px] text-gray-500">{fix.fix_detail}</p>
                <p className="mt-1 break-words text-[10px] font-medium text-amber-700">
                  적용 기준: {fix.tool_applied}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
