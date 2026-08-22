"use client";

import { useState } from "react";
import { Code2, Eye, GitBranch } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import EngineToggle from "@/components/EngineToggle";
import UploadDropzone from "@/components/UploadDropzone";
import AnalyzingOverlay from "@/components/AnalyzingOverlay";
import WorkspaceLayout from "@/components/WorkspaceLayout";
import LeftInfoPanel from "@/components/panels/LeftInfoPanel";
import CodeDiffViewer from "@/components/viewers/CodeDiffViewer";
import MockupViewer from "@/components/viewers/MockupViewer";
import PipelineDashboard from "@/components/viewers/PipelineDashboard";
import type { FinalizeResult, ResetResult, UploadResult } from "@/lib/types";

type AppState = "idle" | "analyzing" | "workspace";

const STEP_META = {
  2: { title: "코드 및 UI 분석", icon: <Code2 size={16} /> },
  3: { title: "테스트 뷰어", icon: <Eye size={16} /> },
  4: { title: "최종 반영", icon: <GitBranch size={16} /> },
} as const;

export default function Home() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [workspaceStep, setWorkspaceStep] = useState<2 | 3 | 4>(2);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<FinalizeResult | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const hasResult = uploadResult !== null;

  const completedSteps = new Set<number>();
  if (hasResult) completedSteps.add(1);
  if (appState === "workspace" && workspaceStep > 2) completedSteps.add(2);
  if (appState === "workspace" && workspaceStep > 3) completedSteps.add(3);
  if (finalizeResult) completedSteps.add(4);

  const enabledSteps = new Set<number>([1]);
  if (hasResult) {
    enabledSteps.add(2);
    enabledSteps.add(3);
    enabledSteps.add(4);
  }

  async function handleFileSelected(file: File) {
    setUploadError(null);
    setAppState("analyzing");
    setFinalizeResult(null);

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

  async function runFinalize() {
    setIsFinalizing(true);
    try {
      const res = await fetch("/api/finalize", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "최종 반영 중 오류가 발생했습니다.");
      await new Promise((resolve) => setTimeout(resolve, 2500));
      setFinalizeResult(data as FinalizeResult);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "최종 반영 중 오류가 발생했습니다.");
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
    setAppState("workspace");
    setWorkspaceStep(step);
    if (step === 4 && uploadResult?.ok && !finalizeResult && !isFinalizing) {
      void runFinalize();
    }
  }

  function handleFinalizeClick() {
    setWorkspaceStep(4);
    if (uploadResult?.ok && !finalizeResult && !isFinalizing) void runFinalize();
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
              <LeftInfoPanel
                planFileName={uploadResult.planFileName}
                asIs={uploadResult.asIs}
                toBe={uploadResult.toBe}
                diffs={uploadResult.diffs}
                blockedReason={uploadResult.blockedReason}
              />
            }
            actions={
              <>
                <EngineToggle compact />
                {!finalizeResult && (
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
                  onClick={() => setWorkspaceStep(3)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  테스트뷰어 확인
                </button>
                <button
                  type="button"
                  onClick={handleFinalizeClick}
                  disabled={isResetting}
                  title={uploadResult.ok ? undefined : "차단된 사유를 확인합니다 (main에는 반영되지 않습니다)"}
                  className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {uploadResult.ok ? "최종확정" : "차단 사유 확인"}
                </button>
              </>
            }
          >
            {workspaceStep === 2 && (
              <CodeDiffViewer baselinePaths={uploadResult.baselinePaths} changes={uploadResult.files} />
            )}
            {workspaceStep === 3 && <MockupViewer />}
            {workspaceStep === 4 && (
              <PipelineDashboard
                isFinalizing={isFinalizing}
                finalizeResult={finalizeResult}
                canFinalize={uploadResult.ok}
                sast={uploadResult.sast}
                qa={uploadResult.qa}
                resource={uploadResult.resource}
              />
            )}
          </WorkspaceLayout>
        )}
      </main>
    </div>
  );
}
