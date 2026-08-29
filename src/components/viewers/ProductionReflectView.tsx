import { CheckCircle2, GitBranch, GitCommitHorizontal, XCircle } from "lucide-react";
import type { FinalizeResult, QaAuditResult } from "@/lib/types";
import { LoadingPane, VercelStatusBadge } from "@/components/viewers/dashboardShared";

interface ProductionReflectViewProps {
  isFinalizing: boolean;
  finalizeResult: FinalizeResult | null;
  finalizeError: string | null;
  qa: QaAuditResult;
}

/** The dedicated "최종 반영(운영반영)" screen — separate from the test-reflect dashboard. */
export default function ProductionReflectView({
  isFinalizing,
  finalizeResult,
  finalizeError,
  qa,
}: ProductionReflectViewProps) {
  if (isFinalizing) {
    return (
      <LoadingPane
        title="운영 반영중..."
        detail="운영 저장소 main 브랜치에 소스를 반영하고 Vercel(운영) 재배포가 완료되기를 기다리고 있습니다."
      />
    );
  }

  if (finalizeError) {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-3">
            <XCircle className="text-red-500" size={22} />
            <div>
              <p className="text-sm font-semibold text-gray-900">운영 반영에 실패했습니다</p>
              <p className="mt-0.5 text-xs text-gray-500">{finalizeError}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!finalizeResult) {
    return (
      <LoadingPane title="운영반영 대기 중" detail="테스트반영 화면에서 운영반영 버튼을 눌러주세요." />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="text-emerald-500" size={28} />
            <div>
              <p className="text-base font-semibold text-gray-900">운영반영이 완료되었습니다</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <GitCommitHorizontal size={12} /> {finalizeResult.commitSha.slice(0, 7)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <GitBranch size={12} /> {finalizeResult.branch} branch
                </span>
                <span>방금 전 배포됨</span>
                <VercelStatusBadge vercel={finalizeResult.vercel} />
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

        {qa.fix_summary && (
          <div className="rounded-lg border border-emerald-200 bg-white p-3">
            <p className="mb-1 text-xs font-semibold text-gray-700">QA 모듈이 무엇을, 왜 수정했는지</p>
            <p className="text-xs text-gray-600">{qa.fix_summary}</p>
            {qa.security_fixes.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5 border-t border-gray-100 pt-2">
                {qa.security_fixes.map((fix, i) => (
                  <li key={i} className="text-[11px] text-gray-500">
                    <span className="font-medium text-gray-700">{fix.file}</span> — {fix.issue}:{" "}
                    {fix.fix_detail}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
