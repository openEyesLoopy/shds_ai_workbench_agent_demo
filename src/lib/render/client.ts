export interface RenderDeployStatus {
  /** false when RENDER_API_KEY/the target service id aren't configured — polling is opt-in. */
  configured: boolean;
  /** A deploy for this commit was actually found on Render. */
  found: boolean;
  status: string | null;
  timedOut: boolean;
}

// https://api-docs.render.com/reference/list-deploys
export const RENDER_TERMINAL_STATUSES = new Set([
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
 * Checks Render *once* for the deploy tied to `commitSha` on `serviceId` — no
 * internal polling loop (see vercel/client.ts's checkVercelDeployment for
 * why: Vercel's Hobby plan kills serverless functions at 60s, so a
 * multi-minute server-side wait loop routinely 504'd in production even
 * though it worked fine on `next dev`). The route returns as soon as the git
 * commit succeeds, and the *client* calls this repeatedly via
 * /api/deploy-status until it reaches a terminal status. Returns
 * `configured: false` immediately (no network calls) when RENDER_API_KEY or
 * `serviceId` aren't set, so this stays optional.
 */
export async function checkRenderDeployment(
  commitSha: string,
  serviceId: string | undefined
): Promise<RenderDeployStatus> {
  if (!process.env.RENDER_API_KEY || !serviceId) {
    return { configured: false, found: false, status: null, timedOut: false };
  }

  const deploy = await fetchDeployForCommit(commitSha, serviceId);
  if (!deploy) {
    return { configured: true, found: false, status: null, timedOut: false };
  }
  return { configured: true, found: true, status: deploy.status ?? null, timedOut: false };
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
