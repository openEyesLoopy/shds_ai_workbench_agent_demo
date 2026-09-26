import { NextRequest, NextResponse } from "next/server";
import { parsePlanDocument } from "@/lib/parsers";
import { getSettings } from "@/lib/store/settingsStore";
import {
  getTestAheadCount,
  listProjectRules,
  listSourceFiles,
  repoTreeUrl,
  resolveBaselineBranch,
} from "@/lib/github/client";
import { getLlmProvider } from "@/lib/llm";
import { isValidRepoPath, normalizeRepoPath } from "@/lib/paths";
import type { FileChange, UploadResult } from "@/lib/types";

export const maxDuration = 300;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Analyzes the uploaded plan document and generates the code diff — nothing
 * more. No QA/SAST gate runs here, and nothing is committed: those only
 * happen once the user reviews this on the 요구사항 분석 screen and clicks
 * 테스트반영 (see /api/test-reflect).
 */
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

    // Independent of the LLM analysis below (only needs owner/repo), so kick
    // it off now instead of waiting until after the — much slower — LLM call
    // to start it. Shaves one GitHub round trip off the critical path.
    const aheadByPromise = getTestAheadCount(settings.githubOwner, settings.githubRepo);

    const baselineBranch = await resolveBaselineBranch(settings.githubOwner, settings.githubRepo);
    const [baselineFiles, projectRules] = await Promise.all([
      listSourceFiles(settings.githubOwner, settings.githubRepo, baselineBranch),
      listProjectRules(settings.githubOwner, settings.githubRepo, baselineBranch),
    ]);

    const provider = getLlmProvider(settings.llmProvider, settings);
    const analysis = await provider.analyzeAndGenerate({
      planText,
      planFileName: file.name,
      sourceFiles: baselineFiles,
      projectRules,
      previousToBe: typeof previousToBe === "string" && previousToBe ? previousToBe : undefined,
    });

    const baselineByPath = new Map(baselineFiles.map((f) => [f.path, f.content]));
    // Drop any entry whose path the LLM hallucinated as a placeholder (seen:
    // a literal "N/A") instead of a real file path — including one in the
    // commit later makes GitHub's tree API fail with a cryptic error that
    // blocks the *entire* batch, not just that one bogus file.
    const generatedChangesRaw: FileChange[] = analysis.files
      .map((f) => ({ ...f, path: normalizeRepoPath(f.path) }))
      .filter((f) => isValidRepoPath(f.path))
      .map((f) => ({
        path: f.path,
        oldContent: baselineByPath.get(f.path) ?? null,
        newContent: f.content,
      }));
    // A DELETE (newContent: null) for a path that never actually existed in
    // the baseline (oldContent also null) is a no-op the LLM hallucinated —
    // besides being meaningless, GitHub's tree API rejects the *entire*
    // commit with a cryptic "GitRPC::BadObjectState" if one of these slips
    // through (reproduced directly against the repo's API).
    const droppedPaths = new Set(
      generatedChangesRaw
        .filter((f) => f.newContent === null && f.oldContent === null)
        .map((f) => f.path)
    );
    const generatedChanges = generatedChangesRaw.filter((f) => !droppedPaths.has(f.path));
    // Diff entries share the same path space as generatedChanges (both
    // rendered together, and later re-sent as-is to /api/test-reflect) —
    // normalize/filter the same way so a bogus, leading-slash, or dropped
    // no-op-delete path never shows as a phantom entry in the diff list.
    const normalizedDiffs = analysis.diffs
      .map((d) => ({ ...d, path: normalizeRepoPath(d.path) }))
      .filter((d) => isValidRepoPath(d.path) && !droppedPaths.has(d.path));

    // The version badge is derived from how far `test` already sits ahead of
    // `main` on GitHub — the actual source of truth — rather than a separately
    // persisted counter. This is just a preview label; the real version used
    // in the commit message is computed the same way again in /api/test-reflect.
    const aheadBy = await aheadByPromise;
    const fromVersion = `1.${aheadBy}`;
    const baselinePaths = baselineFiles.map((f) => f.path);

    const result: UploadResult = {
      ok: generatedChanges.length > 0,
      blockedReason:
        generatedChanges.length > 0
          ? undefined
          : "기획서에서 반영할 코드 변경 사항을 찾지 못했습니다.",
      planFileName: file.name,
      version: { from: fromVersion, to: `1.${aheadBy + 1}` },
      asIs: analysis.asIs,
      toBe: analysis.toBe,
      menuTree: analysis.menuTree,
      diffs: normalizedDiffs,
      files: generatedChanges,
      baselinePaths,
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
