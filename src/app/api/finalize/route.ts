import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/store/settingsStore";
import { commitFiles, repoCommitUrl } from "@/lib/github/client";
import { waitForVercelDeployment } from "@/lib/vercel/client";
import type { FileChange, FinalizeResult } from "@/lib/types";

export const maxDuration = 300;

interface FinalizeRequestBody {
  planFileName: string;
  fromVersion: string;
  toVersion: string;
  files: FileChange[];
}

/**
 * "운영반영" — the production repo is a separate GitHub repository from the
 * `test` one (not just another branch of it), so this can't be a same-repo
 * ref move like the old test→main promotion. It commits the same
 * QA/SAST-passed files that were pushed to `test` straight onto the
 * production repo's `main` branch instead, then — same as /api/test-reflect —
 * only resolves once the production Vercel project's redeploy for this
 * commit is actually READY.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FinalizeRequestBody;
    if (!body.files?.length) {
      return NextResponse.json({ error: "반영할 파일 정보가 없습니다." }, { status: 400 });
    }

    const settings = await getSettings();
    const commitResult = await commitFiles(
      settings.prodGithubOwner,
      settings.prodGithubRepo,
      "main",
      body.files,
      `AI 운영 반영: ${body.planFileName} (v${body.fromVersion} → v${body.toVersion})`
    );

    const vercel = await waitForVercelDeployment(
      commitResult.sha,
      process.env.VERCEL_PROD_PROJECT_ID
    );

    const result: FinalizeResult = {
      ok: true,
      commitSha: commitResult.sha,
      branch: "main",
      repoUrl: repoCommitUrl(settings.prodGithubOwner, settings.prodGithubRepo, commitResult.sha),
      vercel,
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
