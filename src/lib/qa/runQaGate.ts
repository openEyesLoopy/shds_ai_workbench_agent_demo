import type {
  DiffEntry,
  FileChange,
  LlmProvider,
  QaAuditResult,
  QaAutomatedTest,
  SastResult,
  SourceFile,
} from "@/lib/types";
import { applyQaOutput } from "./applyQaOutput";
import { runSast } from "@/lib/sast/scan";
import { checkMavenCompile } from "./mavenCompileCheck";
import { isValidRepoPath, normalizeRepoPath } from "@/lib/paths";

export interface QaGateResult {
  passed: boolean;
  files: FileChange[];
  diffs: DiffEntry[];
  qa: QaAuditResult;
  sast: SastResult[];
}

/**
 * Runs the independent QA/SAST module against a diff *once* and reports
 * whether it passed. This used to loop internally up to 3 times, feeding
 * each round's failures back into the next round within the same request —
 * but that's redundant with the client's own auto-retry loop (page.tsx's
 * MAX_AUTO_FIX_ROUNDS, which already re-invokes /api/test-reflect with
 * `previousFailures` seeded from whatever just failed), and chaining 3 LLM
 * calls into one server request routinely exceeded Vercel Hobby's 60s
 * serverless function cap. A single attempt per request, retried by the
 * client instead, keeps every request short no matter how many rounds it
 * actually takes to converge.
 */
export async function runQaGate(
  provider: LlmProvider,
  initialFiles: FileChange[],
  initialDiffs: DiffEntry[],
  baselineFiles: SourceFile[],
  projectRules: SourceFile[],
  seedFailures?: { sast: SastResult[]; failedTests: QaAutomatedTest[] }
): Promise<QaGateResult> {
  // A client retrying a blocked attempt resends its own last-known
  // files/diffs as-is — if an earlier round already let a hallucinated
  // placeholder path (e.g. a literal "N/A") slip in, it would otherwise ride
  // along on every retry forever. Clean it here too, not just in
  // applyQaOutput, so a poisoned client state self-heals on the next retry.
  const files = initialFiles
    .map((f) => ({ ...f, path: normalizeRepoPath(f.path) }))
    .filter((f) => isValidRepoPath(f.path));
  const diffs = initialDiffs
    .map((d) => ({ ...d, path: normalizeRepoPath(d.path) }))
    .filter((d) => isValidRepoPath(d.path));

  const qaOutput = await provider.runQaAudit({ files, projectRules, previousFailures: seedFailures });
  const applied = applyQaOutput(files, diffs, qaOutput);
  const resultFiles = applied.files;
  const resultDiffs = applied.diffs;
  const sast = runSast(resultFiles);
  const mavenCheck = await checkMavenCompile(baselineFiles, resultFiles);
  if (mavenCheck) sast.push(mavenCheck);
  let automatedTests = qaOutput.automated_tests;

  // `automatedTests.every(...)` on an empty array is vacuously true, so a
  // QA round that produces zero scenarios (seen in practice: it deleted the
  // test file instead of writing one, because writing it looked hard) would
  // otherwise sail through as "SUCCESS" with no verification at all. Treat
  // "no scenarios for a real diff" as its own failing test so the gate
  // blocks instead of silently accepting an unverified commit.
  if (automatedTests.length === 0 && resultFiles.some((f) => f.newContent !== null)) {
    automatedTests = [
      {
        id: 0,
        target_file: resultFiles.find((f) => f.newContent !== null)?.path ?? resultDiffs[0]?.path ?? "",
        scenario: "이번 변경사항 전체에 대한 테스트 시나리오 추출",
        framework: "Jest",
        result: "FAIL",
        reason:
          "diff에 실제 코드 변경이 있는데도 automated_tests가 0건입니다. 테스트 작성이 어렵다는 이유로 생략하거나 테스트 파일을 삭제하지 말고, 변경된 로직을 검증하는 시나리오를 최소 1개 이상 작성하세요.",
      },
    ];
  }

  const passed = sast.every((r) => r.passed) && automatedTests.every((t) => t.result === "PASS");

  const qa: QaAuditResult = {
    summary: {
      status: passed ? "SUCCESS" : "FAILED",
      test_progress: qaOutput.summary.test_progress,
      vulnerability_count: sast.filter((r) => !r.passed).length,
    },
    automated_tests: automatedTests,
    security_fixes: qaOutput.security_fixes,
    fix_summary: qaOutput.fix_summary,
  };

  return { passed, files: resultFiles, diffs: resultDiffs, qa, sast };
}
