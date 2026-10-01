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
const RENDER_FAILED_STATUSES = new Set([
  "deactivated",
  "build_failed",
  "update_failed",
  "canceled",
  "pre_deploy_failed",
]);

const POLL_INTERVAL_MS = 4000;

// A deployment that *exists* and is still building is waited on with no time
// limit — it will reach a terminal state on its own. What can never resolve
// by waiting is a commit for which Vercel/Render never created a deployment
// at all (webhook skipped it, ignored-build-step, dedup...): `found` stays
// false forever. So that case gets a grace period, then an explicit request
// to deploy that exact commit, then a generous ceiling before giving up.
const NOT_FOUND_GRACE_MS = 60_000;
const NOT_FOUND_AFTER_TRIGGER_MS = 5 * 60_000;
// Consecutive failed status checks (deploy-status route erroring, network
// down) before giving up — otherwise a permanently broken status endpoint
// would leave the caller spinning forever with no way out.
const MAX_CONSECUTIVE_ERRORS = 15;

type Side = "vercel" | "render";

function isVercelDone(v: VercelDeployStatus): boolean {
  return !v.configured || (v.state !== null && VERCEL_TERMINAL_STATES.has(v.state));
}

function isRenderDone(r: RenderDeployStatus): boolean {
  return !r.configured || (r.status !== null && RENDER_TERMINAL_STATUSES.has(r.status));
}

function isSettled(status: DeployStatusResult): boolean {
  return (
    (isVercelDone(status.vercel) || status.vercel.timedOut) &&
    (isRenderDone(status.render) || status.render.timedOut)
  );
}

function markUnfinishedTimedOut(status: DeployStatusResult, sides: Side[]): DeployStatusResult {
  return {
    vercel:
      sides.includes("vercel") && !isVercelDone(status.vercel)
        ? { ...status.vercel, timedOut: true }
        : status.vercel,
    render:
      sides.includes("render") && !isRenderDone(status.render)
        ? { ...status.render, timedOut: true }
        : status.render,
  };
}

/** One-line Korean summary of what a deploy poll is currently waiting on, for loading UI. */
export function describeDeployWait(status: DeployStatusResult): string {
  const parts: string[] = [];
  const { vercel, render } = status;
  if (vercel.configured) {
    let label: string;
    if (vercel.timedOut) label = "확인 시간 초과";
    else if (vercel.state === "READY") label = "배포 완료";
    else if (vercel.state === "ERROR" || vercel.state === "CANCELED") label = "배포 실패";
    else if (!vercel.found) label = "새 배포 감지 대기 중";
    else label = `빌드 진행 중 (${vercel.state ?? "대기"})`;
    parts.push(`Vercel: ${label}`);
  }
  if (render.configured) {
    let label: string;
    if (render.timedOut) label = "확인 시간 초과";
    else if (render.status === "live") label = "재기동 완료";
    else if (render.status && RENDER_FAILED_STATUSES.has(render.status)) label = "배포 실패";
    else if (!render.found) label = "새 배포 감지 대기 중";
    else label = `배포 진행 중 (${render.status ?? "대기"})`;
    parts.push(`Render: ${label}`);
  }
  return parts.join(" · ");
}

function requestDeployTrigger(target: "test" | "prod", sha: string, sides: Side[]): void {
  void fetch("/api/deploy-trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target, sha, sides }),
  }).catch(() => undefined);
}

/**
 * Repeats a one-shot /api/deploy-status check every few seconds until both
 * Vercel and Render reach a terminal state. A deployment that exists is
 * waited on indefinitely — a slower rebuild (e.g. a second/third reflect in
 * a row, a cold Render instance) must not get dropped because an arbitrary
 * cutoff elapsed. A transient fetch error is swallowed and retried rather
 * than aborting the wait.
 *
 * The one thing waiting can't fix is a commit that never got a deployment:
 * after NOT_FOUND_GRACE_MS without one, this asks /api/deploy-trigger to
 * deploy that exact commit, and only gives up on that side (`timedOut`) if
 * still nothing shows up NOT_FOUND_AFTER_TRIGGER_MS later. It also gives up
 * after MAX_CONSECUTIVE_ERRORS failed status checks in a row.
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
  const startedAt = Date.now();
  let triggeredAt: number | null = null;
  let consecutiveErrors = 0;
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
        consecutiveErrors = 0;
        last = (await res.json()) as DeployStatusResult;

        const missing: Side[] = [];
        if (last.vercel.configured && !last.vercel.found) missing.push("vercel");
        if (last.render.configured && !last.render.found) missing.push("render");

        if (missing.length > 0 && triggeredAt === null && Date.now() - startedAt >= NOT_FOUND_GRACE_MS) {
          triggeredAt = Date.now();
          requestDeployTrigger(target, sha, missing);
        }
        if (missing.length > 0 && triggeredAt !== null && Date.now() - triggeredAt >= NOT_FOUND_AFTER_TRIGGER_MS) {
          last = markUnfinishedTimedOut(last, missing);
        }

        onUpdate(last);
        if (isSettled(last)) return last;
      } else {
        consecutiveErrors++;
      }
    } catch {
      consecutiveErrors++;
    }

    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      last = markUnfinishedTimedOut(last, ["vercel", "render"]);
      onUpdate(last);
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
