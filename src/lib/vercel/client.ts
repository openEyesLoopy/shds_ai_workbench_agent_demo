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

function buildDeploymentsUrl(commitSha: string, projectId: string, branch: string): string {
  const params = new URLSearchParams({
    projectId,
    "meta-githubCommitSha": commitSha,
    // Without this, the same commit sha reachable from more than one branch
    // (e.g. right after 초기화 force-pushes `test` back to a commit `main`
    // already sits on) can match an unrelated branch's — possibly older,
    // stale — deployment and report success without a fresh build for THIS
    // branch ever having happened.
    branch,
    limit: "1",
  });
  const teamId = process.env.VERCEL_TEAM_ID;
  if (teamId) params.set("teamId", teamId);
  return `https://api.vercel.com/v6/deployments?${params.toString()}`;
}

async function fetchDeploymentForCommit(
  commitSha: string,
  projectId: string,
  branch: string
): Promise<RawDeployment | null> {
  const res = await fetch(buildDeploymentsUrl(commitSha, projectId, branch), {
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
 * Polls Vercel until the deployment tied to `commitSha` *on `branch`* for the
 * given `projectId` reaches a terminal state, so 테스트반영/운영반영/초기화 can
 * keep their loading state up until the Vercel redeploy is actually done
 * instead of just the GitHub push. Vercel's GitHub webhook can take a few
 * seconds to even register the deployment, so "not found yet" is treated as
 * pending, not failure. Returns `configured: false` immediately (no network
 * calls) when VERCEL_TOKEN or `projectId` aren't set, so this stays optional.
 */
export async function waitForVercelDeployment(
  commitSha: string,
  projectId: string | undefined,
  branch: string
): Promise<VercelDeploymentStatus> {
  if (!process.env.VERCEL_TOKEN || !projectId) {
    return { configured: false, found: false, state: null, url: null, timedOut: false };
  }

  const deadline = Date.now() + MAX_WAIT_MS;
  let lastState: string | null = null;
  let lastUrl: string | null = null;

  while (Date.now() < deadline) {
    const deployment = await fetchDeploymentForCommit(commitSha, projectId, branch);
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

/**
 * Explicitly asks Vercel to build+deploy `commitSha` on `branch` (bypassing
 * its deployment deduplication via `forceNew=1`). Vercel's git auto-deploy
 * only fires for genuinely new commits — a 초기화(reset) force-pushes `test`
 * *backward* to a commit Vercel has already built once before (e.g. because
 * `main` sits on it too), which its dedup logic treats as "nothing to
 * build", so the branch's alias domain can keep pointing at the later
 * (since-reverted) deployment indefinitely without this. A normal forward
 * push (테스트반영/운영반영) doesn't need this — Vercel's own webhook already
 * redeploys those on its own. No-ops when VERCEL_TOKEN/`projectId` aren't
 * configured.
 */
export async function triggerVercelDeployment(
  projectId: string | undefined,
  branch: string,
  commitSha: string,
  owner: string,
  repo: string
): Promise<void> {
  if (!process.env.VERCEL_TOKEN || !projectId) return;

  const params = new URLSearchParams({ forceNew: "1" });
  const teamId = process.env.VERCEL_TEAM_ID;
  if (teamId) params.set("teamId", teamId);

  const res = await fetch(`https://api.vercel.com/v13/deployments?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: projectId,
      project: projectId,
      gitSource: { type: "github", ref: branch, org: owner, repo, sha: commitSha },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Vercel 재배포 트리거에 실패했습니다 (HTTP ${res.status}). ${detail}`);
  }
}
