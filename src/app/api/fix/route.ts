import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/store/settingsStore";
import {
  commitFiles,
  getTestAheadCount,
  listSourceFiles,
  resolveBaselineBranch,
} from "@/lib/github/client";
import { getLlmProvider } from "@/lib/llm";
import { runSast } from "@/lib/sast/scan";
import { computeResourceStats } from "@/lib/resourceStats";
import { applyQaOutput } from "@/lib/qa/applyQaOutput";
import type {
  DiffEntry,
  FileChange,
  QaAuditResult,
  QaAutomatedTest,
  SastResult,
  UploadResult,
} from "@/lib/types";

export const maxDuration = 300;

interface FixRequestBody {
  planFileName: string;
  asIs: string;
  toBe: string;
  diffs: DiffEntry[];
  files: FileChange[];
  failedSast: SastResult[];
  failedTests: QaAutomatedTest[];
}

/**
 * Re-runs the independent QA module against a previously blocked diff,
 * pointed directly at what failed last time, so the user doesn't have to
 * re-upload the whole plan document to retry a finalize that was rejected.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FixRequestBody;
    if (!body.files?.length) {
      return NextResponse.json({ error: "수정할 파일 정보가 없습니다." }, { status: 400 });
    }
    if (body.failedSast.length === 0 && body.failedTests.length === 0) {
      return NextResponse.json(
        { error: "재수정할 FAILED 항목이 없습니다." },
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
    const baselinePaths = baselineFiles.map((f) => f.path);

    const aheadBy = await getTestAheadCount(settings.githubOwner, settings.githubRepo);
    const fromVersion = `1.${aheadBy}`;

    const provider = getLlmProvider(settings.llmProvider);
    const qaOutput = await provider.runQaAudit({
      files: body.files,
      previousFailures: { sast: body.failedSast, failedTests: body.failedTests },
    });
    const { files: fileChanges, diffs } = applyQaOutput(body.files, body.diffs, qaOutput);

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
        `AI 자동 수정 반영: ${body.planFileName} (v${fromVersion} → v${versionTo})`
      );
      commit = { sha: commitResult.sha, branch: "test" };
    }

    const result: UploadResult = {
      ok: passed,
      blockedReason: passed
        ? undefined
        : "재수정 후에도 독립 QA 모듈의 보안 점검 또는 자동화 테스트를 통과하지 못해 test 브랜치 반영이 차단되었습니다.",
      planFileName: body.planFileName,
      version: { from: fromVersion, to: versionTo },
      asIs: body.asIs,
      toBe: body.toBe,
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
