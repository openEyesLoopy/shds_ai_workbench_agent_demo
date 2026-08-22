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

  const files: SourceFile[] = [];
  for (const path of filePaths) {
    const { data } = await client.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(data) || data.type !== "file" || !data.content) continue;
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    files.push({ path, content });
  }
  return files;
}

interface CommitFilesResult {
  sha: string;
  branchCreated: boolean;
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

  const { data: baseCommit } = await client.git.getCommit({
    owner,
    repo,
    commit_sha: branchSha,
  });

  const treeEntries = await Promise.all(
    files.map(async (file) => {
      if (file.newContent === null) {
        return { path: file.path, mode: "100644" as const, type: "blob" as const, sha: null };
      }
      const { data: blob } = await client.git.createBlob({
        owner,
        repo,
        content: file.newContent,
        encoding: "utf-8",
      });
      return { path: file.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
    })
  );

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
