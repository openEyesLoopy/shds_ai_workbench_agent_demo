import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/store/settingsStore";
import { commitFiles, repoCommitUrl } from "@/lib/github/client";
import type { FileChange, FinalizeResult } from "@/lib/types";

// See test-reflect/route.ts's comment — Vercel Hobby kills functions at 60s,
// so this no longer waits for the Vercel/Render redeploy inline; the client
// polls /api/deploy-status for that instead (lib/pollDeployStatus.ts).
export const maxDuration = 60;

interface FinalizeRequestBody {
  planFileName: string;
  fromVersion: string;
  toVersion: string;
  files: FileChange[];
}

/**
 * "운영반영" — commits the same QA/SAST-passed files that were pushed to
 * `test` straight onto the `main` branch of the production repo/branch
 * configured in settings (prodGithubOwner/prodGithubRepo — this may be the
 * very same repo as the test target, just a different branch, or a fully
 * separate repo; commitFiles doesn't care either way). Resolves as soon as
 * the commit succeeds — the client is responsible for polling
 * /api/deploy-status until the production Vercel/Render redeploy is ready.
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

    const result: FinalizeResult = {
      ok: true,
      commitSha: commitResult.sha,
      branch: "main",
      repoUrl: repoCommitUrl(settings.prodGithubOwner, settings.prodGithubRepo, commitResult.sha),
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
