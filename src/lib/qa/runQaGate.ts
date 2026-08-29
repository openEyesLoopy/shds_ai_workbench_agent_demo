import type {
  DiffEntry,
  FileChange,
  LlmProvider,
  QaAuditResult,
  QaAutomatedTest,
  QaSecurityFix,
  SastResult,
} from "@/lib/types";
import { applyQaOutput } from "./applyQaOutput";
import { runSast } from "@/lib/sast/scan";

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
  seedFailures?: { sast: SastResult[]; failedTests: QaAutomatedTest[] }
): Promise<QaGateResult> {
  let files = initialFiles;
  let diffs = initialDiffs;
  let previousFailures = seedFailures;
  let sast: SastResult[] = [];
  let automatedTests: QaAutomatedTest[] = [];
  let testProgress = "";
  const allSecurityFixes: QaSecurityFix[] = [];
  const fixSummaries: string[] = [];
  let attempts = 0;

  do {
    attempts++;
    const qaOutput = await provider.runQaAudit({ files, previousFailures });
    const applied = applyQaOutput(files, diffs, qaOutput);
    files = applied.files;
    diffs = applied.diffs;
    sast = runSast(files);
    automatedTests = qaOutput.automated_tests;
    testProgress = qaOutput.summary.test_progress;
    allSecurityFixes.push(...qaOutput.security_fixes);
    if (qaOutput.fix_summary) fixSummaries.push(qaOutput.fix_summary);

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
