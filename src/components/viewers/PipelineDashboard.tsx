import {
  CheckCircle2,
  XCircle,
  ShieldAlert,
  GitCommitHorizontal,
  GitBranch,
  RefreshCw,
} from "lucide-react";
import clsx from "clsx";
import type { FinalizeResult, QaAuditResult, ResourceStats, SastResult } from "@/lib/types";

interface PipelineDashboardProps {
  isFinalizing: boolean;
  finalizeResult: FinalizeResult | null;
  canFinalize: boolean;
  sast: SastResult[];
  qa: QaAuditResult;
  resource: ResourceStats;
}

function StatTag({ delta, unit }: { delta: number; unit: string }) {
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

export default function PipelineDashboard({
  isFinalizing,
  finalizeResult,
  canFinalize,
  sast,
  qa,
  resource,
}: PipelineDashboardProps) {
  if (canFinalize && (isFinalizing || !finalizeResult)) {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 bg-code-panel text-gray-300">
        <RefreshCw className="animate-spin-slow" size={26} />
        <p className="text-sm font-semibold text-white">CI/CD 파이프라인 실행 중...</p>
        <p className="text-xs text-gray-500">
          test 브랜치 소스를 운영(PROD) 브랜치로 반영하고 있습니다.
        </p>
      </div>
    );
  }

  const tests = qa.automated_tests;
  const passedTests = tests.filter((t) => t.result === "PASS").length;
  const failedSast = sast.filter((r) => !r.passed);

  return (
    <div className="flex flex-col gap-4 p-4">
      {canFinalize && finalizeResult ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="text-emerald-500" size={22} />
            <div>
              <p className="text-sm font-semibold text-gray-900">운영 브랜치 반영 완료</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <GitCommitHorizontal size={12} /> {finalizeResult.commitSha.slice(0, 7)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <GitBranch size={12} /> {finalizeResult.branch} branch
                </span>
                <span>방금 전 배포됨</span>
              </p>
            </div>
          </div>
          <a
            href={finalizeResult.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
          >
            GitHub에서 보기
          </a>
        </div>
      ) : (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-3">
            <XCircle className="text-red-500" size={22} />
            <div>
              <p className="text-sm font-semibold text-gray-900">최종 반영이 차단되었습니다</p>
              <p className="mt-0.5 text-xs text-gray-500">
                아래 SAST/QA 결과 중 FAILED 항목이 원인입니다. test 브랜치에는 아무것도
                반영되지 않았습니다.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-4">
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
              {sast.length === 0 && (
                <p className="text-xs text-gray-400">스캔된 파일이 없습니다.</p>
              )}
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
                  <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                    <p className="text-xs font-medium text-gray-800">
                      {fix.file} — {fix.issue}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500">{fix.fix_detail}</p>
                    <p className="mt-1 text-[10px] font-medium text-amber-700">
                      적용 기준: {fix.tool_applied}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
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
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500">
                AI 자동 시나리오 테스트 (독립 QA 모듈)
              </p>
              <span
                className={clsx(
                  "rounded px-1.5 py-0.5 text-[10px] font-bold",
                  passedTests === tests.length && tests.length > 0
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-700"
                )}
              >
                {passedTests}/{tests.length} 성공
              </span>
            </div>
            <p className="mb-2 text-[11px] text-gray-400">{qa.summary.test_progress}</p>
            <div className="flex flex-col gap-2">
              {tests.map((t) => (
                <div
                  key={t.id}
                  className={clsx(
                    "rounded-lg border px-2.5 py-2",
                    t.result === "PASS" ? "border-panel-border" : "border-red-200 bg-red-50"
                  )}
                >
                  <div className="flex items-start gap-1.5 text-xs">
                    {t.result === "PASS" ? (
                      <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle size={13} className="mt-0.5 shrink-0 text-red-500" />
                    )}
                    <span className="text-gray-600">
                      <span className="font-medium text-gray-800">[{t.target_file}]</span>{" "}
                      {t.scenario} <span className="text-gray-400">({t.framework})</span>
                    </span>
                  </div>
                  {t.reason && (
                    <p className="mt-1 pl-[19px] text-[11px] text-gray-500">{t.reason}</p>
                  )}
                </div>
              ))}
              {tests.length === 0 && (
                <p className="text-xs text-gray-400">추출된 시나리오가 없습니다.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {!canFinalize && failedSast.length === 0 && tests.length === 0 && (
        <p className="text-xs text-gray-400">
          SAST와 자동화 테스트 모두 결과가 비어 있습니다 — AI가 이번 diff에서 검증할 대상을
          찾지 못했을 수 있습니다. 좌측 패널의 DIFF 요약을 확인해주세요.
        </p>
      )}
    </div>
  );
}
