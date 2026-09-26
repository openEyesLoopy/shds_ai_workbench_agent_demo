import { NextResponse } from "next/server";
import { getSettings } from "@/lib/store/settingsStore";
import { promoteBranch, repoCommitUrl } from "@/lib/github/client";
import { triggerVercelDeployment } from "@/lib/vercel/client";
import { triggerRenderDeploy } from "@/lib/render/client";
import type { ResetResult } from "@/lib/types";

// See test-reflect/route.ts's comment — Vercel Hobby kills functions at 60s,
// so this no longer waits for the Vercel/Render redeploy inline; the client
// polls /api/deploy-status for that instead (lib/pollDeployStatus.ts). The
// two trigger calls below stay here since they're each one quick POST, not a
// wait loop.
export const maxDuration = 60;

/**
 * Points `test` back at whatever `main` currently is, discarding any AI
 * commits not yet finalized. This moves the branch *backward* to a commit
 * that was very possibly already built once before (e.g. `main` already sits
 * on it) — both Vercel's and Render's git auto-deploy treat that as "nothing
 * new to build" and skip it, which would otherwise leave the previously-live
 * (since-reverted) build serving indefinitely. So this explicitly asks both
 * to rebuild this exact commit (triggerVercelDeployment/triggerRenderDeploy)
 * before returning — the client then polls /api/deploy-status until both
 * are actually caught up with the reset.
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

    const result: ResetResult = {
      ok: true,
      commitSha: sha,
      branch: "test",
      repoUrl: repoCommitUrl(settings.githubOwner, settings.githubRepo, sha),
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
