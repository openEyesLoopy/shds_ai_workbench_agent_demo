import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/store/settingsStore";
import { commitFiles, getTestAheadCount, listProjectRules, listSourceFiles, repoCommitUrl, resolveBaselineBranch } from "@/lib/github/client";
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
// pass plus a git commit, which comfortably fits.
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
 * "테스트반영" — this is the single place the independent QA/SAST gate
 * actually runs and, only if it passes, commits to the `test` branch.
 * Nothing here happens on upload or on sidebar navigation — only an explicit
 * click of 테스트반영 (or a retry via "FAILED 항목 자동 수정", which just calls
 * this again with `previousFailures` seeded) reaches this endpoint at all.
 * Each call does exactly one QA pass — repeated rounds are the *client*
 * calling this endpoint again (page.tsx's auto-fix loop), not a loop in here.
 *
 * Resolves as soon as the commit succeeds — it does *not* wait for the
 * Vercel/Render redeploy. The client polls /api/deploy-status for that (see
 * lib/pollDeployStatus.ts) so this request stays short regardless of how
 * long the actual redeploy takes.
 */
export async function POST(request: NextRequest) {
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

    const { passed, files: fileChanges, diffs, qa, sast } = await runQaGate(
      provider,
      body.files,
      body.diffs,
      baselineFiles,
      projectRules,
      body.previousFailures
    );
    const resource = computeResourceStats(baselineFiles, fileChanges);

    if (!passed) {
      const result: TestReflectResult = {
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
    }

    // QA 모듈은 이미 통과했으므로(passed=true), 아래에서 실패하더라도 그건
    // QA/보안 문제가 아니라 GitHub 커밋 인프라 문제다. 바깥 catch로 흘려보내면
    // 방금 통과한 qa/sast 결과가 통째로 사라지고 화면엔 이전 시도의 낡은 결과
    // 위에 원인 불명의 에러만 남는다 — 그 QA 결과를 그대로 들고, 원인을
    // 명확히 구분한 blockedReason으로 반환한다.
    try {
      const aheadBy = await getTestAheadCount(settings.githubOwner, settings.githubRepo);
      const fromVersion = `1.${aheadBy}`;
      const toVersion = `1.${aheadBy + 1}`;

      const commitResult = await commitFiles(
        settings.githubOwner,
        settings.githubRepo,
        "test",
        fileChanges,
        `AI 분석 반영: ${body.planFileName} (v${fromVersion} → v${toVersion})`
      );

      // The "업무 비즈니스" diagram is its own LLM call (see
      // /api/business-diagram) — stacking it on top of the QA audit call in
      // this same request was, together, routinely enough to exceed Vercel
      // Hobby's 60s function cap even after everything else here got fast.
      // The client fetches it separately, in parallel with the deploy-status
      // poll, once this response comes back.
      const result: TestReflectResult = {
        ok: true,
        qa,
        sast,
        resource,
        files: fileChanges,
        diffs,
        commitSha: commitResult.sha,
        branch: "test",
        repoUrl: repoCommitUrl(settings.githubOwner, settings.githubRepo, commitResult.sha),
      };
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
      const result: TestReflectResult = {
        ok: false,
        blockedReason: `독립 QA 모듈의 보안 점검·자동화 테스트는 통과했지만, test 브랜치에 커밋하는 중 GitHub 오류가 발생해 반영이 완료되지 못했습니다. 대부분 일시적인 문제이니 "테스트반영"을 다시 시도해보세요.\n\n${message}`,
        qa,
        sast,
        resource,
        files: fileChanges,
        diffs,
      };
      return NextResponse.json(result);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
