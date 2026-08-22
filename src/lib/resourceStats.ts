import type { FileChange, ResourceStats, SourceFile } from "@/lib/types";

function byteSizeKb(text: string): number {
  return Buffer.byteLength(text, "utf-8") / 1024;
}

function countLines(text: string): number {
  return text.split("\n").length;
}

/**
 * Approximates bundle size / line-count deltas from the baseline source set
 * plus the changed files, without an actual build step.
 */
export function computeResourceStats(
  baselineFiles: SourceFile[],
  changes: FileChange[]
): ResourceStats {
  const baselineByPath = new Map(baselineFiles.map((f) => [f.path, f.content]));

  let beforeKb = 0;
  let afterKb = 0;
  let beforeLines = 0;
  let afterLines = 0;

  for (const file of baselineFiles) {
    beforeKb += byteSizeKb(file.content);
    beforeLines += countLines(file.content);
  }

  for (const change of changes) {
    const wasTracked = baselineByPath.has(change.path);
    const oldSizeKb = wasTracked ? byteSizeKb(baselineByPath.get(change.path)!) : 0;
    const oldLines = wasTracked ? countLines(baselineByPath.get(change.path)!) : 0;

    afterKb += -oldSizeKb + (change.newContent ? byteSizeKb(change.newContent) : 0);
    afterLines += -oldLines + (change.newContent ? countLines(change.newContent) : 0);
  }

  const bundleSizeKb = Math.round((beforeKb + afterKb) * 10) / 10;
  const codeLines = Math.round(beforeLines + afterLines);

  return {
    bundleSizeKb,
    bundleDeltaKb: Math.round((bundleSizeKb - beforeKb) * 10) / 10,
    codeLines,
    codeLineDelta: codeLines - beforeLines,
  };
}
