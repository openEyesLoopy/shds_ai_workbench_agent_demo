import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/store/settingsStore";
import { commitFiles, getTestAheadCount, repoCommitUrl } from "@/lib/github/client";
import type { FileChange } from "@/lib/types";

export const maxDuration = 60;

interface TestCommitRequestBody {
  planFileName: string;
  files: FileChange[];
}

/**
 * "테스트반영" step 2 — commits the files the QA gate (/api/test-reflect)
 * just passed onto the `test` branch. Split out of that route because the QA
 * LLM call alone can use ~55s of its 60s serverless budget, which left this
 * commit dying mid-way; as its own request it gets a fresh budget. Returns
 * as soon as the commit lands — the client polls /api/deploy-status for the
 * redeploy.
 */
export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    const body = (await request.json()) as TestCommitRequestBody;
    if (!body.files?.length) {
      return NextResponse.json({ error: "반영할 파일 정보가 없습니다." }, { status: 400 });
    }

    const settings = await getSettings();
    const aheadBy = await getTestAheadCount(settings.githubOwner, settings.githubRepo);
    const fromVersion = `1.${aheadBy}`;
    const toVersion = `1.${aheadBy + 1}`;

    const commitResult = await commitFiles(
      settings.githubOwner,
      settings.githubRepo,
      "test",
      body.files,
      `AI 분석 반영: ${body.planFileName} (v${fromVersion} → v${toVersion})`
    );
    console.log(`[test-commit] commit finished in ${Date.now() - t0}ms`);

    return NextResponse.json({
      commitSha: commitResult.sha,
      branch: "test",
      repoUrl: repoCommitUrl(settings.githubOwner, settings.githubRepo, commitResult.sha),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
