import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/store/settingsStore";
import { listProjectRules, listSourceFiles, resolveBaselineBranch } from "@/lib/github/client";
import { getLlmProvider } from "@/lib/llm";
import { runQaGate } from "@/lib/qa/runQaGate";
import { computeResourceStats } from "@/lib/resourceStats";
import type {
  DiffEntry,
  FileChange,
  QaPreviousAttempt,
  TestReflectResult,
} from "@/lib/types";

// This app runs on Vercel's Hobby plan, which kills serverless functions at
// 60s regardless of what's declared here — waiting for the Vercel/Render
// redeploy *inside* this request used to routinely exceed that, so it no
// longer does (see lib/pollDeployStatus.ts, which the client uses to poll
// /api/deploy-status instead). This route now only ever does one QA/SAST
// pass — the git commit is its own request (/api/test-commit).
export const maxDuration = 60;

interface TestReflectRequestBody {
  planFileName: string;
  files: FileChange[];
  diffs: DiffEntry[];
  asIs: string;
  toBe: string;
  /** Set only when retrying after a previous 테스트반영 attempt was blocked (the "FAILED 항목 자동 수정" button). */
  previousFailures?: QaPreviousAttempt;
}

/**
 * "테스트반영" step 1 — this is the single place the independent QA/SAST gate
 * actually runs. If it passes, the client then commits via /api/test-commit.
 * Nothing here happens on upload or on sidebar navigation — only an explicit
 * click of 테스트반영 (or a retry via "FAILED 항목 자동 수정", which just calls
 * this again with `previousFailures` seeded) reaches this endpoint at all.
 * Each call does exactly one QA pass — repeated rounds are the *client*
 * calling this endpoint again (page.tsx's auto-fix loop), not a loop in here.
 *
 * Neither this nor /api/test-commit waits for the Vercel/Render redeploy —
 * the client polls /api/deploy-status for that (see lib/pollDeployStatus.ts).
 */
export async function POST(request: NextRequest) {
  // See runQaGate.ts's comment — these let a 60s-timeout invocation's Vercel
  // logs show exactly how far it got (GitHub fetch vs QA/LLM vs commit)
  // instead of just the bare "Task timed out" with no breakdown.
  const t0 = Date.now();
  try {
    const body = (await request.json()) as TestReflectRequestBody;
    if (!body.files?.length) {
      return NextResponse.json({ error: "반영할 파일 정보가 없습니다." }, { status: 400 });
    }

    const settings = await getSettings();
    const provider = getLlmProvider(settings.llmProvider, settings);

    const baselineBranch = await resolveBaselineBranch(settings.githubOwner, settings.githubRepo);
    const [baselineFiles, projectRules] = await Promise.all([
      listSourceFiles(settings.githubOwner, settings.githubRepo, baselineBranch),
      listProjectRules(settings.githubOwner, settings.githubRepo, baselineBranch),
    ]);
    console.log(
      `[test-reflect] baseline fetched @ ${Date.now() - t0}ms (${baselineFiles.length} source files, ${projectRules.length} rule files)`
    );

    const { passed, files: fileChanges, diffs, qa, sast } = await runQaGate(
      provider,
      body.files,
      body.diffs,
      baselineFiles,
      projectRules,
      body.previousFailures
    );
    console.log(`[test-reflect] QA gate finished @ ${Date.now() - t0}ms (passed=${passed})`);
    const resource = computeResourceStats(baselineFiles, fileChanges);

    // Passing QA does NOT commit here: the QA LLM call alone can eat ~55s of
    // this request's 60s budget (seen in production logs), which left the
    // commit that used to follow it dying mid-way. The client commits via
    // /api/test-commit in its own request with its own fresh budget.
    const result: TestReflectResult = passed
      ? { ok: false, qaPassed: true, qa, sast, resource, files: fileChanges, diffs }
      : {
          ok: false,
          blockedReason:
            "독립 QA 모듈이 보안 점검 또는 자동화 테스트를 통과하지 못해 test 브랜치 반영이 차단되었습니다.",
          qa,
          sast,
          resource,
          files: fileChanges,
          diffs,
        };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
