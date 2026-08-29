export interface VercelDeploymentStatus {
  /** false when VERCEL_TOKEN/the target project id aren't configured — polling is opt-in. */
  configured: boolean;
  /** A deployment for this commit was actually found on Vercel. */
  found: boolean;
  state: string | null;
  url: string | null;
  timedOut: boolean;
}

const POLL_INTERVAL_MS = 4000;
// Kept under the route's maxDuration (300s) with room for the git commit step.
const MAX_WAIT_MS = 3.5 * 60 * 1000;

const TERMINAL_STATES = new Set(["READY", "ERROR", "CANCELED"]);

interface RawDeployment {
  readyState?: string;
  state?: string;
  url?: string;
}

function buildDeploymentsUrl(commitSha: string, projectId: string): string {
  const params = new URLSearchParams({
    projectId,
    "meta-githubCommitSha": commitSha,
    limit: "1",
  });
  const teamId = process.env.VERCEL_TEAM_ID;
  if (teamId) params.set("teamId", teamId);
  return `https://api.vercel.com/v6/deployments?${params.toString()}`;
}

async function fetchDeploymentForCommit(
  commitSha: string,
  projectId: string
): Promise<RawDeployment | null> {
  const res = await fetch(buildDeploymentsUrl(commitSha, projectId), {
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Vercel 배포 상태 조회에 실패했습니다 (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as { deployments?: RawDeployment[] };
  return data.deployments?.[0] ?? null;
}

/**
 * Polls Vercel until the deployment tied to `commitSha` on the given
 * `projectId` reaches a terminal state, so 테스트반영/운영반영 can keep their
 * loading state up until the Vercel redeploy is actually done instead of
 * just the GitHub push. Vercel's GitHub webhook can take a few seconds to
 * even register the deployment, so "not found yet" is treated as pending,
 * not failure. Returns `configured: false` immediately (no network calls)
 * when VERCEL_TOKEN or `projectId` aren't set, so this stays optional.
 */
export async function waitForVercelDeployment(
  commitSha: string,
  projectId: string | undefined
): Promise<VercelDeploymentStatus> {
  if (!process.env.VERCEL_TOKEN || !projectId) {
    return { configured: false, found: false, state: null, url: null, timedOut: false };
  }

  const deadline = Date.now() + MAX_WAIT_MS;
  let lastState: string | null = null;
  let lastUrl: string | null = null;

  while (Date.now() < deadline) {
    const deployment = await fetchDeploymentForCommit(commitSha, projectId);
    if (deployment) {
      lastState = deployment.readyState ?? deployment.state ?? null;
      lastUrl = deployment.url ? `https://${deployment.url}` : null;
      if (lastState && TERMINAL_STATES.has(lastState)) {
        return { configured: true, found: true, state: lastState, url: lastUrl, timedOut: false };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return { configured: true, found: lastState !== null, state: lastState, url: lastUrl, timedOut: true };
}
