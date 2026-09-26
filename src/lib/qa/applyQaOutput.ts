import type { DiffEntry, FileChange, QaAuditOutput } from "@/lib/types";
import { isValidRepoPath, normalizeRepoPath } from "@/lib/paths";

function frameworkForPath(path: string): string {
  if (path.endsWith(".java")) return "JUnit 5 & Mockito";
  return "Jest";
}

/**
 * Applies the QA module's fixed_files onto the diff, and appends its
 * test_files as new ADD entries. If a test_file path already exists (e.g. a
 * retried fix regenerated the same test file), its content and diff entry
 * are replaced in place instead of duplicated.
 */
export function applyQaOutput(
  fileChanges: FileChange[],
  diffs: DiffEntry[],
  qa: Pick<QaAuditOutput, "fixed_files" | "test_files">
): { files: FileChange[]; diffs: DiffEntry[] } {
  // Drop any entry whose path the QA module hallucinated as a placeholder
  // (seen: a literal "N/A") instead of a real file path — including one in
  // the commit later makes GitHub's tree API fail with a cryptic error that
  // blocks the *entire* batch, not just that one bogus file. Also drop any
  // fixed_files entry with content: null — fixed_files exists to patch a
  // vulnerability with a complete rewritten file, never to delete one; seen
  // in practice: a null here silently deleted a core production file (e.g.
  // page.tsx), and because the client resends its last-known files on every
  // retry, that deletion then persisted forever, with every later round
  // "correctly" failing to test a file that no longer existed — a
  // self-inflicted, never-recovering loop this guard prevents at the root.
  const fixedFiles = qa.fixed_files
    .map((f) => ({ ...f, path: normalizeRepoPath(f.path) }))
    .filter((f) => isValidRepoPath(f.path) && f.content !== null);
  const testFiles = qa.test_files
    .map((f) => ({ ...f, path: normalizeRepoPath(f.path) }))
    .filter((f) => isValidRepoPath(f.path));

  const files = fileChanges.map((change) => {
    const fix = fixedFiles.find((f) => f.path === change.path);
    return fix ? { ...change, newContent: fix.content } : change;
  });

  const testFilePaths = new Set(testFiles.map((f) => f.path));
  const nextDiffs = diffs.filter((d) => !testFilePaths.has(d.path));

  for (const testFile of testFiles) {
    const existingIdx = files.findIndex((f) => f.path === testFile.path);
    if (existingIdx >= 0) {
      files[existingIdx] = { ...files[existingIdx], newContent: testFile.content };
    } else {
      files.push({ path: testFile.path, oldContent: null, newContent: testFile.content });
    }
    nextDiffs.push({
      type: "ADD",
      path: testFile.path,
      component: testFile.path.split("/").pop() ?? testFile.path,
      description: `QA 모듈이 생성한 자동화 테스트 코드 (${frameworkForPath(testFile.path)})`,
    });
  }

  // Same no-op-delete guard as upload/route.ts: a fixed_files entry can turn
  // an existing ADD (oldContent: null) into content: null, which is a delete
  // of a file that never existed in the baseline — GitHub's tree API rejects
  // the *entire* commit for that, not just this one file.
  const droppedPaths = new Set(
    files.filter((f) => f.newContent === null && f.oldContent === null).map((f) => f.path)
  );
  return {
    files: files.filter((f) => !droppedPaths.has(f.path)),
    diffs: nextDiffs.filter((d) => !droppedPaths.has(d.path)),
  };
}
