import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/store/settingsStore";
import { commitFiles, getTestAheadCount, listProjectRules, listSourceFiles, repoCommitUrl, resolveBaselineBranch } from "@/lib/github/client";
import { waitForVercelDeployment } from "@/lib/vercel/client";
import { waitForRenderDeployment } from "@/lib/render/client";
import { getLlmProvider } from "@/lib/llm";
import { runQaGate } from "@/lib/qa/runQaGate";
import { computeResourceStats } from "@/lib/resourceStats";
import type {
  BusinessDiagramOutput,
  DiffEntry,
  FileChange,
  QaAutomatedTest,
  SastResult,
  TestReflectResult,
} from "@/lib/types";

export const maxDuration = 300;

interface TestReflectRequestBody {
  planFileName: string;
  files: FileChange[];
  diffs: DiffEntry[];
  asIs: string;
  toBe: string;
  /** Set only when retrying after a previous 테스트반영 attempt was blocked (the "FAILED 항목 자동 수정" button). */
  previousFailures?: { sast: SastResult[]; failedTests: QaAutomatedTest[] };
}

/**
 * "테스트반영" — this is the single place the independent QA/SAST gate
 * actually runs (with its own internal auto-retry loop) and, only if it
 * passes, commits to the `test` branch. Nothing here happens on upload or on
 * sidebar navigation — only an explicit click of 테스트반영 (or a retry via
 * "FAILED 항목 자동 수정", which just calls this again with `previousFailures`
 * seeded) reaches this endpoint at all.
 *
 * On success, the request only resolves once the Vercel redeploy triggered
 * by the push is actually READY (when Vercel polling is configured) — not
 * just once the GitHub push itself succeeds — and generates the "업무
 * 비즈니스 요약" Mermaid diagram against the exact just-committed source, in
 * parallel with the Vercel wait.
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
          "독립 QA 모듈이 자동으로 여러 차례 수정을 시도했지만 보안 점검 또는 자동화 테스트를 통과하지 못해 test 브랜치 반영이 차단되었습니다.",
        qa,
        sast,
        resource,
        files: fileChanges,
        diffs,
      };
      return NextResponse.json(result);
    }

    // QA 모듈은 이미 통과했으므로(passed=true), 아래에서 실패하더라도 그건
    // QA/보안 문제가 아니라 GitHub 커밋·재배포 인프라 문제다. 바깥 catch로
    // 흘려보내면 방금 통과한 qa/sast 결과가 통째로 사라지고 화면엔 이전
    // 시도의 낡은 결과 위에 원인 불명의 에러만 남는다 — 그 QA 결과를 그대로
    // 들고, 원인을 명확히 구분한 blockedReason으로 반환한다.
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

      const [vercel, render, businessDiagram] = await Promise.all([
        waitForVercelDeployment(commitResult.sha, process.env.VERCEL_PROJECT_ID, "test"),
        waitForRenderDeployment(commitResult.sha, process.env.RENDER_TEST_SERVICE_ID),
        provider
          .generateBusinessDiagram({ files: fileChanges, asIs: body.asIs, toBe: body.toBe })
          .catch((): BusinessDiagramOutput | undefined => undefined),
      ]);

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
        vercel,
        render,
        businessDiagram,
      };
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
      const result: TestReflectResult = {
        ok: false,
        blockedReason: `독립 QA 모듈의 보안 점검·자동화 테스트는 통과했지만, test 브랜치에 커밋하거나 재배포를 확인하는 중 GitHub/배포 인프라 오류가 발생해 반영이 완료되지 못했습니다. 대부분 일시적인 문제이니 "테스트반영"을 다시 시도해보세요.\n\n${message}`,
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
