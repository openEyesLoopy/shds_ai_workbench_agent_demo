import type { DeployStatusResult, RenderDeployStatus, VercelDeployStatus } from "@/lib/types";

// Kept as plain literals (not imported from lib/vercel|render/client.ts,
// which also touch process.env/fetch) so this client-side module stays free
// of anything server-only — mirrors the same duplication already used in
// components/viewers/dashboardShared.tsx for the same reason.
const VERCEL_TERMINAL_STATES = new Set(["READY", "ERROR", "CANCELED"]);
const RENDER_TERMINAL_STATUSES = new Set([
  "live",
  "deactivated",
  "build_failed",
  "update_failed",
  "canceled",
  "pre_deploy_failed",
]);

const POLL_INTERVAL_MS = 4000;

function isVercelDone(v: VercelDeployStatus): boolean {
  return !v.configured || (v.state !== null && VERCEL_TERMINAL_STATES.has(v.state));
}

function isRenderDone(r: RenderDeployStatus): boolean {
  return !r.configured || (r.status !== null && RENDER_TERMINAL_STATUSES.has(r.status));
}

/**
 * Repeats a one-shot /api/deploy-status check every few seconds until both
 * Vercel and Render reach a terminal state. Polls indefinitely — a slower
 * rebuild (e.g. a second/third reflect in a row, a cold Render instance)
 * must not get dropped just because an arbitrary cutoff elapsed while the
 * real deploy was still running. A transient fetch error is swallowed and
 * retried rather than aborting the wait.
 *
 * This exists because this app runs on Vercel's Hobby plan, which kills
 * serverless functions at 60s — 테스트반영/운영반영/초기화 used to block on a
 * single long-running server request that waited out the Vercel/Render
 * redeploy itself, which routinely got killed by that cap. Now each of those
 * routes returns immediately once its git commit succeeds, and the *client*
 * (here) does the waiting instead, one short HTTP call at a time, so no
 * single request ever has to stay open longer than one quick round trip.
 *
 * `onUpdate` fires after every successful poll (not just at the end) so the
 * caller can show live progress — see PipelineDashboard/ProductionReflectView's
 * use of this via page.tsx.
 */
export async function pollDeployStatus(
  target: "test" | "prod",
  sha: string,
  onUpdate: (status: DeployStatusResult) => void
): Promise<DeployStatusResult> {
  let last: DeployStatusResult = {
    vercel: { configured: false, found: false, state: null, url: null, timedOut: false },
    render: { configured: false, found: false, status: null, timedOut: false },
  };

  for (;;) {
    try {
      const res = await fetch(
        `/api/deploy-status?target=${target}&sha=${encodeURIComponent(sha)}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        last = (await res.json()) as DeployStatusResult;
        onUpdate(last);
        if (isVercelDone(last.vercel) && isRenderDone(last.render)) {
          return last;
        }
      }
    } catch {
      // transient network error — keep polling instead of giving up
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
