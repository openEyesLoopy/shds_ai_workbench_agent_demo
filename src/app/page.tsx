"use client";

import { useState } from "react";
import { Code2, GitBranch, Rocket } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import EngineToggle from "@/components/EngineToggle";
import UploadDropzone from "@/components/UploadDropzone";
import AnalyzingOverlay from "@/components/AnalyzingOverlay";
import WorkspaceLayout from "@/components/WorkspaceLayout";
import LeftInfoPanel from "@/components/panels/LeftInfoPanel";
import RequirementDiffList from "@/components/viewers/RequirementDiffList";
import PipelineDashboard from "@/components/viewers/PipelineDashboard";
import ProductionReflectView from "@/components/viewers/ProductionReflectView";
import type {
  DiffEntry,
  FileChange,
  FinalizeResult,
  QaAutomatedTest,
  ResetResult,
  SastResult,
  TestReflectResult,
  UploadResult,
} from "@/lib/types";

type AppState = "idle" | "analyzing" | "workspace";

/** What /api/test-reflect needs to (re-)run the QA gate — either a fresh upload or a blocked retry. */
interface TestReflectBase {
  planFileName: string;
  files: FileChange[];
  diffs: DiffEntry[];
  asIs: string;
  toBe: string;
}

// 테스트뷰어 is a tab inside the step-3 dashboard now, not its own step.
// Step 3 (테스트반영) and step 4 (최종 반영/운영반영) are separate screens.
const STEP_META = {
  2: { title: "요구사항 분석", icon: <Code2 size={16} /> },
  3: { title: "테스트반영", icon: <GitBranch size={16} /> },
  4: { title: "최종 반영(운영반영)", icon: <Rocket size={16} /> },
} as const;

export default function Home() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [workspaceStep, setWorkspaceStep] = useState<2 | 3 | 4>(2);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [isTestReflecting, setIsTestReflecting] = useState(false);
  const [testReflectResult, setTestReflectResult] = useState<TestReflectResult | null>(null);
  const [testReflectError, setTestReflectError] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<FinalizeResult | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);

  const hasResult = uploadResult !== null;

  const completedSteps = new Set<number>();
  if (hasResult) completedSteps.add(1);
  if (appState === "workspace" && workspaceStep > 2) completedSteps.add(2);
  if (appState === "workspace" && workspaceStep > 3) completedSteps.add(3);
  if (finalizeResult) completedSteps.add(4);

  const enabledSteps = new Set<number>([1]);
  if (hasResult) {
    enabledSteps.add(2);
    // Step 3 (테스트반영) only becomes reachable once it's actually been
    // triggered from the 요구사항 분석 screen — not just by having an analysis
    // result — so sidebar navigation alone can never kick off the QA gate or
    // a test-branch commit.
    if (testReflectResult || isTestReflecting || testReflectError) {
      enabledSteps.add(3);
    }
    // Same principle for step 4 (운영반영) — only reachable once it's actually
    // been triggered from the 테스트반영 screen.
    if (finalizeResult || isFinalizing || finalizeError) {
      enabledSteps.add(4);
    }
  }

  async function handleFileSelected(file: File) {
    setUploadError(null);
    setFixError(null);
    setAppState("analyzing");
    setFinalizeResult(null);
    setFinalizeError(null);
    setTestReflectResult(null);
    setTestReflectError(null);

    try {
      const form = new FormData();
      form.append("file", file);
      if (uploadResult?.ok && uploadResult.toBe) {
        form.append("previousToBe", uploadResult.toBe);
      }
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "분석 중 오류가 발생했습니다.");
      }

      setUploadResult(data as UploadResult);
      setWorkspaceStep(2);
      setAppState("workspace");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
      setAppState("idle");
    }
  }

  /**
   * "테스트반영" — this is the only place the QA/SAST gate actually runs.
   * Called fresh from the 요구사항 분석 screen (no `previousFailures`), or as
   * a retry from a blocked result (`previousFailures` seeded from what just
   * failed) — both go through this same request, just with different
   * loading/error state so the retry only spins its own button instead of
   * replacing the whole blocked screen.
   */
  async function runTestReflect(
    base: TestReflectBase,
    previousFailures?: { sast: SastResult[]; failedTests: QaAutomatedTest[] }
  ) {
    const isRetry = Boolean(previousFailures);
    if (isRetry) {
      setIsFixing(true);
      setFixError(null);
    } else {
      setIsTestReflecting(true);
      setTestReflectError(null);
    }
    try {
      const res = await fetch("/api/test-reflect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...base, previousFailures }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "테스트 브랜치 반영 중 오류가 발생했습니다.");
      // No artificial delay here — the request already only resolves once
      // the QA gate finishes and, if it passed, the Vercel redeploy for the
      // new commit is done too (see /api/test-reflect).
      setTestReflectResult(data as TestReflectResult);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "테스트 브랜치 반영 중 오류가 발생했습니다.";
      if (isRetry) setFixError(message);
      else setTestReflectError(message);
    } finally {
      if (isRetry) setIsFixing(false);
      else setIsTestReflecting(false);
    }
  }

  /** "운영반영" — commits the actual test-reflected (QA-passed) files onto the separate production repo's `main` branch. */
  async function runFinalize(upload: UploadResult, testReflect: TestReflectResult) {
    setIsFinalizing(true);
    setFinalizeError(null);
    try {
      const res = await fetch("/api/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planFileName: upload.planFileName,
          fromVersion: upload.version.from,
          toVersion: upload.version.to,
          files: testReflect.files,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "운영 반영 중 오류가 발생했습니다.");
      // No artificial delay here either — resolves once the production
      // Vercel redeploy for this commit is done (see /api/finalize).
      setFinalizeResult(data as FinalizeResult);
    } catch (err) {
      setFinalizeError(err instanceof Error ? err.message : "운영 반영 중 오류가 발생했습니다.");
    } finally {
      setIsFinalizing(false);
    }
  }

  async function handleReset() {
    if (
      !window.confirm(
        "test 브랜치를 현재 main 브랜치 상태로 되돌립니다. 지금까지 반영된 AI 변경사항은 사라집니다. 계속할까요?"
      )
    ) {
      return;
    }
    setIsResetting(true);
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      const data: ResetResult | { error: string } = await res.json();
      if (!res.ok) throw new Error("error" in data ? data.error : "초기화 중 오류가 발생했습니다.");
      setAppState("idle");
      setUploadResult(null);
      setFinalizeResult(null);
      setFinalizeError(null);
      setTestReflectResult(null);
      setTestReflectError(null);
      setUploadError(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "초기화 중 오류가 발생했습니다.");
    } finally {
      setIsResetting(false);
    }
  }

  function handleSelectStep(step: 1 | 2 | 3 | 4) {
    if (step === 1) {
      setAppState("idle");
      return;
    }
    if (!hasResult) return;
    // Sidebar navigation only ever moves between already-reachable screens —
    // it never triggers 테스트반영/운영반영 itself. Those only fire from their
    // own buttons (handleTestReflectClick / handleProductionReflectClick).
    setAppState("workspace");
    setWorkspaceStep(step);
  }

  function handleTestReflectClick() {
    if (!uploadResult?.ok) return;
    setWorkspaceStep(3);
    if (!testReflectResult && !isTestReflecting) {
      void runTestReflect({
        planFileName: uploadResult.planFileName,
        files: uploadResult.files,
        diffs: uploadResult.diffs,
        asIs: uploadResult.asIs,
        toBe: uploadResult.toBe,
      });
    }
  }

  /** "FAILED 항목 자동 수정" — retries the QA gate from a blocked testReflectResult, seeded with what just failed. */
  function handleFixClick() {
    if (!uploadResult || !testReflectResult || testReflectResult.ok) return;
    const failedSast = testReflectResult.sast.filter((r) => !r.passed);
    const failedTests = testReflectResult.qa.automated_tests.filter((t) => t.result !== "PASS");
    if (failedSast.length === 0 && failedTests.length === 0) return;
    void runTestReflect(
      {
        planFileName: uploadResult.planFileName,
        files: testReflectResult.files,
        diffs: testReflectResult.diffs,
        asIs: uploadResult.asIs,
        toBe: uploadResult.toBe,
      },
      { sast: failedSast, failedTests }
    );
  }

  function handleProductionReflectClick() {
    if (!uploadResult || !testReflectResult?.ok) return;
    setWorkspaceStep(4);
    if (!finalizeResult && !isFinalizing) {
      void runFinalize(uploadResult, testReflectResult);
    }
  }

  function handleBackToAnalysis() {
    setWorkspaceStep(2);
  }

  function handleBackToTestReflect() {
    setWorkspaceStep(3);
  }

  return (
    <div className="relative flex h-dvh w-full flex-col-reverse md:flex-row">
      <Sidebar
        currentStep={appState === "idle" ? 1 : workspaceStep}
        completedSteps={completedSteps}
        enabledSteps={enabledSteps}
        onSelectStep={handleSelectStep}
      />

      <main className="relative min-h-0 flex-1">
        {appState !== "workspace" && (
          <>
            <div className="absolute right-3 top-3 z-30 md:right-4 md:top-4">
              <EngineToggle />
            </div>
            <UploadDropzone
              onFileSelected={handleFileSelected}
              errorMessage={uploadError}
              disabled={appState === "analyzing"}
            />
          </>
        )}
        {appState === "analyzing" && <AnalyzingOverlay />}

        {appState === "workspace" && uploadResult && (
          <WorkspaceLayout
            headerIcon={STEP_META[workspaceStep].icon}
            headerTitle={STEP_META[workspaceStep].title}
            versionBadge={workspaceStep === 2 ? uploadResult.version : undefined}
            leftPanel={
              workspaceStep === 2 ? (
                <LeftInfoPanel
                  planFileName={uploadResult.planFileName}
                  asIs={uploadResult.asIs}
                  toBe={uploadResult.toBe}
                  blockedReason={uploadResult.blockedReason}
                />
              ) : undefined
            }
            actions={
              <>
                <EngineToggle compact />
                {workspaceStep === 2 && (
                  <>
                    {!testReflectResult && (
                      <button
                        type="button"
                        onClick={handleReset}
                        disabled={isResetting}
                        title="test 브랜치를 현재 main 브랜치 상태로 되돌립니다"
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {isResetting ? "초기화 중..." : "초기화"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleTestReflectClick}
                      disabled={isResetting || !uploadResult.ok}
                      title={uploadResult.ok ? undefined : uploadResult.blockedReason}
                      className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      테스트반영
                    </button>
                  </>
                )}
                {workspaceStep === 3 && testReflectResult && (
                  <>
                    <button
                      type="button"
                      onClick={handleReset}
                      disabled={isResetting}
                      title="test 브랜치를 현재 main 브랜치 상태로 되돌립니다"
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {isResetting ? "초기화 중..." : "초기화"}
                    </button>
                    <button
                      type="button"
                      onClick={handleBackToAnalysis}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      다시수정하기
                    </button>
                    {testReflectResult.ok && (
                      <button
                        type="button"
                        onClick={handleProductionReflectClick}
                        disabled={isFinalizing}
                        className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                      >
                        {finalizeResult ? "운영반영 결과 보기" : "운영반영"}
                      </button>
                    )}
                  </>
                )}
                {workspaceStep === 4 && (
                  <button
                    type="button"
                    onClick={handleBackToTestReflect}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    테스트반영으로
                  </button>
                )}
              </>
            }
          >
            {workspaceStep === 2 && <RequirementDiffList diffs={uploadResult.diffs} />}
            {workspaceStep === 3 && (
              <PipelineDashboard
                isTestReflecting={isTestReflecting}
                testReflectResult={testReflectResult}
                testReflectError={testReflectError}
                baselinePaths={uploadResult.baselinePaths}
                onFix={handleFixClick}
                isFixing={isFixing}
                fixError={fixError}
              />
            )}
            {workspaceStep === 4 && testReflectResult?.ok && (
              <ProductionReflectView
                isFinalizing={isFinalizing}
                finalizeResult={finalizeResult}
                finalizeError={finalizeError}
                qa={testReflectResult.qa}
              />
            )}
          </WorkspaceLayout>
        )}
      </main>
    </div>
  );
}
