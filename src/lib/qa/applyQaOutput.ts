import type { DiffEntry, FileChange, QaAuditOutput } from "@/lib/types";

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
  const files = fileChanges.map((change) => {
    const fix = qa.fixed_files.find((f) => f.path === change.path);
    return fix ? { ...change, newContent: fix.content } : change;
  });

  const testFilePaths = new Set(qa.test_files.map((f) => f.path));
  const nextDiffs = diffs.filter((d) => !testFilePaths.has(d.path));

  for (const testFile of qa.test_files) {
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

  return { files, diffs: nextDiffs };
}
