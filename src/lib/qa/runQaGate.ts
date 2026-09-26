import type {
  DiffEntry,
  FileChange,
  LlmProvider,
  QaAuditResult,
  QaAutomatedTest,
  QaSecurityFix,
  SastResult,
  SourceFile,
} from "@/lib/types";
import { applyQaOutput } from "./applyQaOutput";
import { runSast } from "@/lib/sast/scan";
import { checkMavenCompile } from "./mavenCompileCheck";
import { isValidRepoPath, normalizeRepoPath } from "@/lib/paths";

/** How many auto-fix rounds to run before giving up and surfacing a manual retry to the user. */
const MAX_ATTEMPTS = 3;

export interface QaGateResult {
  passed: boolean;
  files: FileChange[];
  diffs: DiffEntry[];
  qa: QaAuditResult;
  sast: SastResult[];
  attempts: number;
}

/**
 * Runs the independent QA/SAST module against a diff and, if it doesn't pass
 * outright, automatically feeds the exact SAST/test failures back to the QA
 * module for another pass — up to MAX_ATTEMPTS times — instead of surfacing a
 * FAILED result to the user on the first try. test 브랜치 반영이 가능하려면
 * 모든 SAST 항목이 PASS여야 하므로, 사람이 수동으로 "자동 수정" 버튼을 눌러야
 * 했던 이전 흐름을 서버 쪽에서 자동으로 반복하도록 합친 것.
 *
 * `security_fixes`/`fix_summary` accumulate across every attempt so the
 * dashboard can show what was originally caught and what was actually fixed,
 * even when the fix didn't land until the 2nd or 3rd round.
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
  let files = initialFiles
    .map((f) => ({ ...f, path: normalizeRepoPath(f.path) }))
    .filter((f) => isValidRepoPath(f.path));
  let diffs = initialDiffs
    .map((d) => ({ ...d, path: normalizeRepoPath(d.path) }))
    .filter((d) => isValidRepoPath(d.path));
  let previousFailures = seedFailures;
  let sast: SastResult[] = [];
  let automatedTests: QaAutomatedTest[] = [];
  let testProgress = "";
  const allSecurityFixes: QaSecurityFix[] = [];
  const fixSummaries: string[] = [];
  let attempts = 0;

  do {
    attempts++;
    const qaOutput = await provider.runQaAudit({ files, projectRules, previousFailures });
    const applied = applyQaOutput(files, diffs, qaOutput);
    files = applied.files;
    diffs = applied.diffs;
    sast = runSast(files);
    const mavenCheck = await checkMavenCompile(baselineFiles, files);
    if (mavenCheck) sast.push(mavenCheck);
    automatedTests = qaOutput.automated_tests;
    testProgress = qaOutput.summary.test_progress;
    allSecurityFixes.push(...qaOutput.security_fixes);
    if (qaOutput.fix_summary) fixSummaries.push(qaOutput.fix_summary);

    // `automatedTests.every(...)` on an empty array is vacuously true, so a
    // QA round that produces zero scenarios (seen in practice: it deleted
    // the test file instead of writing one, because writing it looked hard)
    // would otherwise sail through as "SUCCESS" with no verification at all.
    // Treat "no scenarios for a real diff" as its own failing test so the
    // gate retries instead of silently accepting an unverified commit.
    if (automatedTests.length === 0 && files.some((f) => f.newContent !== null)) {
      automatedTests = [
        {
          id: 0,
          target_file: files.find((f) => f.newContent !== null)?.path ?? diffs[0]?.path ?? "",
          scenario: "이번 변경사항 전체에 대한 테스트 시나리오 추출",
          framework: "Jest",
          result: "FAIL",
          reason:
            "diff에 실제 코드 변경이 있는데도 automated_tests가 0건입니다. 테스트 작성이 어렵다는 이유로 생략하거나 테스트 파일을 삭제하지 말고, 변경된 로직을 검증하는 시나리오를 최소 1개 이상 작성하세요.",
        },
      ];
    }

    const failedSast = sast.filter((r) => !r.passed);
    const failedTests = automatedTests.filter((t) => t.result !== "PASS");
    if (failedSast.length === 0 && failedTests.length === 0) break;
    previousFailures = { sast: failedSast, failedTests };
  } while (attempts < MAX_ATTEMPTS);

  const passed = sast.every((r) => r.passed) && automatedTests.every((t) => t.result === "PASS");

  const qa: QaAuditResult = {
    summary: {
      status: passed ? "SUCCESS" : "FAILED",
      test_progress: testProgress,
      vulnerability_count: sast.filter((r) => !r.passed).length,
    },
    automated_tests: automatedTests,
    security_fixes: allSecurityFixes,
    fix_summary: fixSummaries.join(" "),
  };

  return { passed, files, diffs, qa, sast, attempts };
}
