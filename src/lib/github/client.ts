import { Octokit } from "@octokit/rest";
import type { FileChange, SourceFile } from "@/lib/types";

const SOURCE_PREFIXES = ["demo-front/src", "demo-back/src"];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".java", ".css", ".json"];
const EXTRA_FILES = ["demo-front/package.json", "demo-back/pom.xml"];

let cachedClient: Octokit | null = null;

function octokit(): Octokit {
  if (cachedClient) return cachedClient;
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "GITHUB_TOKEN이 설정되어 있지 않습니다. .env.local에 repo 쓰기 권한이 있는 GitHub Personal Access Token을 추가해주세요."
    );
  }
  cachedClient = new Octokit({ auth: token });
  return cachedClient;
}

export function repoTreeUrl(owner: string, repo: string, branch: string): string {
  return `https://github.com/${owner}/${repo}/tree/${branch}`;
}

export function repoCommitUrl(owner: string, repo: string, sha: string): string {
  return `https://github.com/${owner}/${repo}/commit/${sha}`;
}

async function getRefSha(
  owner: string,
  repo: string,
  branch: string
): Promise<string | null> {
  try {
    const { data } = await octokit().git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    return data.object.sha;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 404) return null;
    throw err;
  }
}

/** Prefers the persistent `test` branch as the AS-IS baseline; falls back to `main`. */
export async function resolveBaselineBranch(
  owner: string,
  repo: string
): Promise<string> {
  const testSha = await getRefSha(owner, repo, "test");
  return testSha ? "test" : "main";
}

/**
 * How many commits `test` currently sits ahead of `main` — used as the source
 * of truth for the v1.{N} version badge instead of a separately-persisted
 * counter (which wouldn't survive a stateless serverless deployment anyway).
 */
export async function getTestAheadCount(owner: string, repo: string): Promise<number> {
  const testSha = await getRefSha(owner, repo, "test");
  if (!testSha) return 0;
  try {
    const { data } = await octokit().repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: "main...test",
    });
    return data.ahead_by;
  } catch {
    return 0;
  }
}

function isSourcePath(path: string): boolean {
  if (EXTRA_FILES.includes(path)) return true;
  const underSourceDir = SOURCE_PREFIXES.some((prefix) => path.startsWith(`${prefix}/`));
  if (!underSourceDir) return false;
  return SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext));
}

export async function listSourceFiles(
  owner: string,
  repo: string,
  ref: string
): Promise<SourceFile[]> {
  const client = octokit();
  const refSha = await getRefSha(owner, repo, ref);
  if (!refSha) {
    throw new Error(`'${ref}' 브랜치를 찾을 수 없습니다.`);
  }

  const { data: tree } = await client.git.getTree({
    owner,
    repo,
    tree_sha: refSha,
    recursive: "true",
  });

  const filePaths = tree.tree
    .filter((entry) => entry.type === "blob" && entry.path && isSourcePath(entry.path))
    .map((entry) => entry.path as string);

  const fetched = await Promise.all(
    filePaths.map(async (path) => {
      const { data } = await client.repos.getContent({ owner, repo, path, ref });
      if (Array.isArray(data) || data.type !== "file" || !data.content) return null;
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      return { path, content };
    })
  );
  return fetched.filter((f): f is SourceFile => f !== null);
}

interface CommitFilesResult {
  sha: string;
  branchCreated: boolean;
}

// GitHub's Git Data API occasionally throws this right after a burst of
// createBlob calls, before the blobs have fully replicated on GitHub's end —
// a documented eventual-consistency quirk, not a real conflict. Re-running
// the whole blob→tree→commit→ref sequence a couple of times, with a short
// backoff, resolves it almost every time.
const TRANSIENT_COMMIT_ERROR_PATTERN = /BadObjectState/i;
// Two 테스트반영 requests landing close together (a double-click, or a manual
// "FAILED 항목 자동 수정" overlapping the auto-fix effect) both read the same
// branch head, then race to move it — the second's updateRef gets rejected as
// non-fast-forward. That's not a real content conflict, just a stale base:
// re-reading the branch head and rebuilding the tree on top of it resolves it,
// since the tree only overlays the touched file paths onto base_tree.
const NON_FAST_FORWARD_ERROR_PATTERN = /fast.forward|is not a fast|reference update failed/i;
const COMMIT_RETRY_ATTEMPTS = 5;
const COMMIT_RETRY_BASE_DELAY_MS = 1500;

function isTransientCommitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return TRANSIENT_COMMIT_ERROR_PATTERN.test(message);
}

function isNonFastForwardError(err: unknown): boolean {
  const status = (err as { status?: number }).status;
  const message = err instanceof Error ? err.message : String(err);
  return status === 422 && NON_FAST_FORWARD_ERROR_PATTERN.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Commits the given file changes onto `branch`, creating it from `main` first
 * if it doesn't exist yet. Uses the Git Data API directly (blobs/tree/commit/ref)
 * so no local clone is needed.
 */
export async function commitFiles(
  owner: string,
  repo: string,
  branch: string,
  files: FileChange[],
  message: string
): Promise<CommitFilesResult> {
  const client = octokit();

  let branchSha = await getRefSha(owner, repo, branch);
  let branchCreated = false;
  if (!branchSha) {
    const mainSha = await getRefSha(owner, repo, "main");
    if (!mainSha) throw new Error("기준 브랜치 'main'을 찾을 수 없습니다.");
    await client.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha: mainSha,
    });
    branchSha = mainSha;
    branchCreated = true;
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= COMMIT_RETRY_ATTEMPTS; attempt++) {
    try {
      // Re-read the branch head on every attempt (not just once, up front) so
      // a retry after a non-fast-forward conflict rebases onto whatever
      // another concurrent commit just landed, instead of repeating the same
      // stale base and failing the same way again.
      if (attempt > 1) {
        const latestSha = await getRefSha(owner, repo, branch);
        if (latestSha) branchSha = latestSha;
      }

      const { data: baseCommit } = await client.git.getCommit({
        owner,
        repo,
        commit_sha: branchSha,
      });

      // Sequential on purpose — firing all createBlob calls concurrently via
      // Promise.all was suspected of triggering GitHub's git-data eventual
      // consistency lag (the source of the BadObjectState errors this retry
      // loop is guarding against) under a burst of simultaneous writes to the
      // same repo.
      const treeEntries: { path: string; mode: "100644"; type: "blob"; sha: string | null }[] = [];
      for (const file of files) {
        if (file.newContent === null) {
          treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: null });
          continue;
        }
        const { data: blob } = await client.git.createBlob({
          owner,
          repo,
          content: file.newContent,
          encoding: "utf-8",
        });
        treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
      }

      const { data: newTree } = await client.git.createTree({
        owner,
        repo,
        base_tree: baseCommit.tree.sha,
        tree: treeEntries,
      });

      const { data: newCommit } = await client.git.createCommit({
        owner,
        repo,
        message,
        tree: newTree.sha,
        parents: [branchSha],
      });

      await client.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newCommit.sha,
        force: false,
      });

      return { sha: newCommit.sha, branchCreated };
    } catch (err) {
      lastError = err;
      // Full diagnostic dump on every failure (not just the final one) so a
      // recurrence is traceable from the server log instead of just the bare
      // "message - docs_url" string the UI shows — that string alone wasn't
      // enough to root-cause the BadObjectState reports.
      const status = (err as { status?: number }).status;
      const responseData = (err as { response?: { data?: unknown } }).response?.data;
      console.error(
        `[commitFiles] attempt ${attempt}/${COMMIT_RETRY_ATTEMPTS} failed for ${owner}/${repo}@${branch}`,
        `status=${status}`,
        `files=${files.map((f) => f.path).join(", ")}`,
        `response=${JSON.stringify(responseData)}`,
        err
      );
      const retryable = isTransientCommitError(err) || isNonFastForwardError(err);
      if (attempt >= COMMIT_RETRY_ATTEMPTS || !retryable) {
        throw err;
      }
      await sleep(COMMIT_RETRY_BASE_DELAY_MS * attempt);
    }
  }

  throw lastError;
}

/**
 * Points `toBranch` at whatever commit `fromBranch` currently sits on
 * (creating `toBranch` if needed). No merge commit — the production
 * source simply becomes identical to the test branch's latest state.
 */
export async function promoteBranch(
  owner: string,
  repo: string,
  fromBranch: string,
  toBranch: string
): Promise<string> {
  const client = octokit();
  const sourceSha = await getRefSha(owner, repo, fromBranch);
  if (!sourceSha) {
    throw new Error(`'${fromBranch}' 브랜치를 찾을 수 없습니다.`);
  }

  const targetSha = await getRefSha(owner, repo, toBranch);
  if (!targetSha) {
    await client.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${toBranch}`,
      sha: sourceSha,
    });
  } else {
    await client.git.updateRef({
      owner,
      repo,
      ref: `heads/${toBranch}`,
      sha: sourceSha,
      force: true,
    });
  }
  return sourceSha;
}
