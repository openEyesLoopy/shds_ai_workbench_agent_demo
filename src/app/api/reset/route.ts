import { NextResponse } from "next/server";
import { getSettings } from "@/lib/store/settingsStore";
import { promoteBranch, repoCommitUrl } from "@/lib/github/client";
import { triggerVercelDeployment, waitForVercelDeployment } from "@/lib/vercel/client";
import { triggerRenderDeploy, waitForRenderDeployment } from "@/lib/render/client";
import type { ResetResult } from "@/lib/types";

export const maxDuration = 300;

/**
 * Points `test` back at whatever `main` currently is, discarding any AI
 * commits not yet finalized. This moves the branch *backward* to a commit
 * that was very possibly already built once before (e.g. `main` already sits
 * on it) — both Vercel's and Render's git auto-deploy treat that as "nothing
 * new to build" and skip it, which would otherwise leave the previously-live
 * (since-reverted) build serving indefinitely (see triggerVercelDeployment/
 * triggerRenderDeploy). So this explicitly asks both to rebuild this exact
 * commit and waits for both, so the response only resolves once they're
 * actually caught up with the reset, not just the GitHub ref update.
 */
export async function POST() {
  try {
    const settings = await getSettings();
    const sha = await promoteBranch(settings.githubOwner, settings.githubRepo, "main", "test");

    await Promise.all([
      triggerVercelDeployment(
        process.env.VERCEL_PROJECT_ID,
        "test",
        sha,
        settings.githubOwner,
        settings.githubRepo
      ),
      triggerRenderDeploy(sha, process.env.RENDER_TEST_SERVICE_ID),
    ]);
    const [vercel, render] = await Promise.all([
      waitForVercelDeployment(sha, process.env.VERCEL_PROJECT_ID, "test"),
      waitForRenderDeployment(sha, process.env.RENDER_TEST_SERVICE_ID),
    ]);

    const result: ResetResult = {
      ok: true,
      commitSha: sha,
      branch: "test",
      repoUrl: repoCommitUrl(settings.githubOwner, settings.githubRepo, sha),
      vercel,
      render,
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
