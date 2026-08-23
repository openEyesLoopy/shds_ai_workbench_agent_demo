import { NextRequest, NextResponse } from "next/server";
import { parsePlanDocument } from "@/lib/parsers";
import { getSettings } from "@/lib/store/settingsStore";
import {
  commitFiles,
  getTestAheadCount,
  listSourceFiles,
  repoTreeUrl,
  resolveBaselineBranch,
} from "@/lib/github/client";
import { getLlmProvider } from "@/lib/llm";
import { runSast } from "@/lib/sast/scan";
import { computeResourceStats } from "@/lib/resourceStats";
import { applyQaOutput } from "@/lib/qa/applyQaOutput";
import type { FileChange, QaAuditResult, UploadResult } from "@/lib/types";

export const maxDuration = 300;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "업로드된 파일이 없습니다." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "파일 크기가 너무 큽니다 (최대 10MB)." },
        { status: 400 }
      );
    }
    // Continuity context from the client's previous analysis in this browser
    // tab — kept stateless server-side (no session store) on purpose.
    const previousToBe = form.get("previousToBe");

    const buffer = Buffer.from(await file.arrayBuffer());
    const planText = await parsePlanDocument(file.name, buffer);
    if (!planText.trim()) {
      return NextResponse.json(
        { error: "문서에서 텍스트를 추출하지 못했습니다." },
        { status: 400 }
      );
    }

    const settings = await getSettings();

    const baselineBranch = await resolveBaselineBranch(settings.githubOwner, settings.githubRepo);
    const baselineFiles = await listSourceFiles(
      settings.githubOwner,
      settings.githubRepo,
      baselineBranch
    );

    const provider = getLlmProvider(settings.llmProvider);
    const analysis = await provider.analyzeAndGenerate({
      planText,
      planFileName: file.name,
      sourceFiles: baselineFiles,
      previousToBe: typeof previousToBe === "string" && previousToBe ? previousToBe : undefined,
    });

    const baselineByPath = new Map(baselineFiles.map((f) => [f.path, f.content]));
    const generatedChanges: FileChange[] = analysis.files.map((f) => ({
      path: f.path,
      oldContent: baselineByPath.get(f.path) ?? null,
      newContent: f.content,
    }));

    // The version badge is derived from how far `test` already sits ahead of
    // `main` on GitHub — the actual source of truth — rather than a separately
    // persisted counter.
    const aheadBy = await getTestAheadCount(settings.githubOwner, settings.githubRepo);
    const fromVersion = `1.${aheadBy}`;
    const baselinePaths = baselineFiles.map((f) => f.path);

    if (generatedChanges.length === 0) {
      const emptyQa: QaAuditResult = {
        summary: { status: "FAILED", test_progress: "0개 시나리오 중 0개 자동화 완료 (0/0)", vulnerability_count: 0 },
        automated_tests: [],
        security_fixes: [],
        fix_summary: "",
      };
      const result: UploadResult = {
        ok: false,
        blockedReason: "기획서에서 반영할 코드 변경 사항을 찾지 못했습니다.",
        planFileName: file.name,
        version: { from: fromVersion, to: fromVersion },
        asIs: analysis.asIs,
        toBe: analysis.toBe,
        diffs: analysis.diffs,
        files: generatedChanges,
        baselinePaths,
        qa: emptyQa,
        sast: [],
        resource: computeResourceStats(baselineFiles, generatedChanges),
      };
      return NextResponse.json(result);
    }

    // Independent QA & security module — reviews the diff on its own terms,
    // patches vulnerabilities it finds, and writes real Jest/JUnit test code.
    const qaOutput = await provider.runQaAudit({ files: generatedChanges });
    const { files: fileChanges, diffs } = applyQaOutput(generatedChanges, analysis.diffs, qaOutput);

    // Deterministic re-scan of the QA module's own output — the actual gate,
    // not just the LLM's self-reported vulnerability_count.
    const sast = runSast(fileChanges);
    const sastPassed = sast.every((r) => r.passed);
    const testsPassed = qaOutput.automated_tests.every((t) => t.result === "PASS");
    const passed = sastPassed && testsPassed;
    const vulnerabilityCount = sast.filter((r) => !r.passed).length;

    const qa: QaAuditResult = {
      summary: {
        status: passed ? "SUCCESS" : "FAILED",
        test_progress: qaOutput.summary.test_progress,
        vulnerability_count: vulnerabilityCount,
      },
      automated_tests: qaOutput.automated_tests,
      security_fixes: qaOutput.security_fixes,
      fix_summary: qaOutput.fix_summary,
    };

    const resource = computeResourceStats(baselineFiles, fileChanges);

    let commit: UploadResult["commit"];
    let versionTo = fromVersion;

    if (passed) {
      versionTo = `1.${aheadBy + 1}`;
      const commitResult = await commitFiles(
        settings.githubOwner,
        settings.githubRepo,
        "test",
        fileChanges,
        `AI 분석 반영: ${file.name} (v${fromVersion} → v${versionTo})`
      );
      commit = { sha: commitResult.sha, branch: "test" };
    }

    const result: UploadResult = {
      ok: passed,
      blockedReason: passed
        ? undefined
        : "독립 QA 모듈의 보안 점검 또는 자동화 테스트를 통과하지 못해 test 브랜치 반영이 차단되었습니다.",
      planFileName: file.name,
      version: { from: fromVersion, to: versionTo },
      asIs: analysis.asIs,
      toBe: analysis.toBe,
      diffs,
      files: fileChanges,
      baselinePaths,
      qa,
      sast,
      resource,
      commit,
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({
    repoUrl: repoTreeUrl(settings.githubOwner, settings.githubRepo, "test"),
  });
}
