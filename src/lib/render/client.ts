export interface RenderDeployStatus {
  /** false when RENDER_API_KEY/the target service id aren't configured — polling is opt-in. */
  configured: boolean;
  /** A deploy for this commit was actually found on Render. */
  found: boolean;
  status: string | null;
  timedOut: boolean;
}

const POLL_INTERVAL_MS = 4000;
// Kept under the route's maxDuration (300s) with room for the git commit step
// and the Vercel wait it runs alongside (see test-reflect/finalize routes).
const MAX_WAIT_MS = 3.5 * 60 * 1000;

// https://api-docs.render.com/reference/list-deploys
const TERMINAL_STATUSES = new Set([
  "live",
  "deactivated",
  "build_failed",
  "update_failed",
  "canceled",
  "pre_deploy_failed",
]);
interface RawDeploy {
  status?: string;
  commit?: { id?: string };
}

async function fetchDeployForCommit(
  commitSha: string,
  serviceId: string
): Promise<RawDeploy | null> {
  const res = await fetch(
    `https://api.render.com/v1/services/${serviceId}/deploys?limit=20`,
    {
      headers: { Authorization: `Bearer ${process.env.RENDER_API_KEY}` },
      cache: "no-store",
    }
  );
  if (!res.ok) {
    throw new Error(`Render 배포 상태 조회에 실패했습니다 (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as { deploy: RawDeploy }[];
  return data.find((entry) => entry.deploy.commit?.id === commitSha)?.deploy ?? null;
}

/**
 * Polls Render until the deploy tied to `commitSha` on the given `serviceId`
 * reaches a terminal state (live, or one of the failure statuses), mirroring
 * lib/vercel/client.ts's waitForVercelDeployment so 테스트반영/운영반영 can
 * keep their loading state up until the backend's Render redeploy — not just
 * the frontend's Vercel redeploy — is actually done. Render's deploy webhook
 * can take a few seconds to register, so "not found yet" is treated as
 * pending, not failure. Returns `configured: false` immediately (no network
 * calls) when RENDER_API_KEY or `serviceId` aren't set, so this stays optional.
 */
export async function waitForRenderDeployment(
  commitSha: string,
  serviceId: string | undefined
): Promise<RenderDeployStatus> {
  if (!process.env.RENDER_API_KEY || !serviceId) {
    return { configured: false, found: false, status: null, timedOut: false };
  }

  const deadline = Date.now() + MAX_WAIT_MS;
  let lastStatus: string | null = null;

  while (Date.now() < deadline) {
    const deploy = await fetchDeployForCommit(commitSha, serviceId);
    if (deploy) {
      lastStatus = deploy.status ?? null;
      if (lastStatus && TERMINAL_STATUSES.has(lastStatus)) {
        return { configured: true, found: true, status: lastStatus, timedOut: false };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return { configured: true, found: lastStatus !== null, status: lastStatus, timedOut: true };
}

/**
 * Explicitly asks Render to build+deploy `commitId` on `serviceId`. Render's
 * git auto-deploy only fires for genuinely new commits pushed to the branch —
 * a 초기화(reset) force-pushes `test` *backward* to a commit Render has
 * already built once before, which its webhook does not treat as something
 * to redeploy, so without this the previously-live (since-reverted) build
 * just keeps serving indefinitely. A normal forward push (테스트반영/운영반영)
 * doesn't need this — Render's own webhook already redeploys those on its
 * own. No-ops when RENDER_API_KEY/`serviceId` aren't configured.
 */
export async function triggerRenderDeploy(
  commitId: string,
  serviceId: string | undefined
): Promise<void> {
  if (!process.env.RENDER_API_KEY || !serviceId) return;

  const res = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RENDER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ commitId }),
  });
  if (!res.ok) {
    throw new Error(`Render 재배포 트리거에 실패했습니다 (HTTP ${res.status}).`);
  }
}
