"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  GitCommitHorizontal,
  GitBranch,
  RefreshCw,
  ListChecks,
  FileDiff,
  Eye,
  Workflow,
} from "lucide-react";
import clsx from "clsx";
import type { QaAuditResult, TestReflectResult } from "@/lib/types";
import CodeDiffViewer from "@/components/viewers/CodeDiffViewer";
import MockupViewer from "@/components/viewers/MockupViewer";
import BusinessDiagramView from "@/components/viewers/BusinessDiagramView";
import { LoadingPane, MetricsColumn, VercelStatusBadge } from "@/components/viewers/dashboardShared";

interface PipelineDashboardProps {
  isTestReflecting: boolean;
  testReflectResult: TestReflectResult | null;
  testReflectError?: string | null;

  /** Retry button on a blocked result — re-runs the QA gate seeded with what just failed. */
  onFix?: () => void;
  isFixing?: boolean;
  fixError?: string | null;

  /** Baseline file list for the "코드 비교" tree — the changed files themselves come from testReflectResult. */
  baselinePaths: string[];
}

type DashboardTab = "scenario" | "diff" | "viewer" | "diagram";

const TABS: { id: DashboardTab; label: string; icon: typeof ListChecks }[] = [
  { id: "scenario", label: "AI 시나리오 테스트", icon: ListChecks },
  { id: "diff", label: "코드 비교", icon: FileDiff },
  { id: "viewer", label: "테스트 뷰어", icon: Eye },
  { id: "diagram", label: "업무 비즈니스", icon: Workflow },
];

function ScenarioTestPane({ qa }: { qa: QaAuditResult }) {
  const tests = qa.automated_tests;
  const passedTests = tests.filter((t) => t.result === "PASS").length;

  return (
    // No independent scroll region here — the dashboard's tab-content wrapper
    // already scrolls, and nesting a second `overflow-auto` inside it was
    // causing scroll position to jump when switching to another tab.
    <div className="flex flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500">
          총 {tests.length}개 시나리오 중 {passedTests}개 자동화 완료 ({passedTests}/{tests.length})
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
      <p className="mb-3 text-[11px] text-gray-400">{qa.summary.test_progress}</p>
      <div className="flex flex-col gap-2.5">
        {tests.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "rounded-lg border px-3 py-2.5",
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
                <span className="font-medium text-gray-800">[{t.target_file}]</span> {t.scenario}{" "}
                <span className="text-gray-400">({t.framework})</span>
              </span>
            </div>
            {t.reason && <p className="mt-1 pl-[19px] text-[11px] text-gray-500">{t.reason}</p>}
          </div>
        ))}
        {tests.length === 0 && <p className="text-xs text-gray-400">추출된 시나리오가 없습니다.</p>}
      </div>
    </div>
  );
}

export default function PipelineDashboard({
  isTestReflecting,
  testReflectResult,
  testReflectError,
  onFix,
  isFixing,
  fixError,
  baselinePaths,
}: PipelineDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("scenario");
  const tabContentRef = useRef<HTMLDivElement>(null);

  // Always land at the top of the new tab's content instead of carrying over
  // whatever scroll position the previous tab was left at.
  useEffect(() => {
    tabContentRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  // 테스트반영 클릭 직후, 아직 QA 게이트조차 시작하기 전이거나 진행 중인 상태.
  if (isTestReflecting || (!testReflectResult && !testReflectError)) {
    return (
      <LoadingPane
        title="테스트 반영중..."
        detail="독립 QA 모듈이 보안 점검·자동화 테스트를 수행하고, 통과 시 test 브랜치에 소스를 반영한 뒤 Vercel 재배포가 완료되기를 기다리고 있습니다."
      />
    );
  }

  if (testReflectError) {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-3">
            <XCircle className="text-red-500" size={22} />
            <div>
              <p className="text-sm font-semibold text-gray-900">테스트 브랜치 반영에 실패했습니다</p>
              <p className="mt-0.5 text-xs text-gray-500">{testReflectError}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // testReflectResult is guaranteed to be set past this point — blocked and
  // passed results share the exact same layout (banner + metrics + tabs) so
  // a failed run is just as inspectable as a successful one, only the
  // banner's color/copy and the retry action differ.
  const result = testReflectResult!;
  const { qa, sast, resource } = result;
  const passed = result.ok;

  return (
    <div className="flex flex-col gap-4 p-4">
      {passed ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 className="text-emerald-500" size={22} />
          <div>
            <p className="text-sm font-semibold text-gray-900">테스트 브랜치 반영 완료</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <GitCommitHorizontal size={12} /> {result.commitSha!.slice(0, 7)}
              </span>
              <span className="inline-flex items-center gap-1">
                <GitBranch size={12} /> {result.branch} branch
              </span>
              <span>방금 전 반영됨</span>
              <VercelStatusBadge vercel={result.vercel} />
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <XCircle className="text-red-500" size={22} />
              <div>
                <p className="text-sm font-semibold text-gray-900">테스트 반영이 차단되었습니다</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {result.blockedReason ??
                    "아래 SAST/QA 결과 중 FAILED 항목이 원인입니다. test 브랜치에는 아무것도 반영되지 않았습니다."}
                </p>
              </div>
            </div>
            {onFix && (
              <button
                type="button"
                onClick={onFix}
                disabled={isFixing}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                <RefreshCw size={12} className={isFixing ? "animate-spin-slow" : undefined} />
                {isFixing ? "FAILED 항목 자동 수정 중..." : "FAILED 항목 자동 수정"}
              </button>
            )}
          </div>
          {fixError && <p className="mt-2 text-xs text-red-600">{fixError}</p>}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-4 md:flex-row">
        <MetricsColumn sast={sast} qa={qa} resource={resource} />

        <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-xl border border-panel-border">
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-panel-border bg-panel px-2 py-1.5">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={clsx(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium",
                  activeTab === id ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
                )}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
          <div ref={tabContentRef} className="min-h-0 flex-1 overflow-auto">
            {activeTab === "scenario" && <ScenarioTestPane qa={qa} />}
            {activeTab === "diff" && (
              <CodeDiffViewer baselinePaths={baselinePaths} changes={result.files} />
            )}
            {activeTab === "viewer" && <MockupViewer />}
            {activeTab === "diagram" && (
              <BusinessDiagramView
                mermaidDefinition={result.businessDiagram?.mermaid}
                summary={result.businessDiagram?.summary}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
