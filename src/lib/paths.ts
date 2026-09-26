/**
 * Strips leading slashes the LLM occasionally emits (e.g. "/demo-front/src/...").
 * GitHub's Git Data API rejects tree entries whose path starts with "/"
 * ("tree.path cannot start with a slash"), which otherwise blocks 테스트반영
 * entirely for that whole batch of files.
 */
export function normalizeRepoPath(path: string): string {
  return path.replace(/^\/+/, "");
}

// The only two source roots this app ever reads from or writes to (see
// SOURCE_PREFIXES in lib/github/client.ts) — any real generated file path
// must live under one of these.
const VALID_REPO_PATH_PREFIXES = ["demo-front/", "demo-back/"];

/**
 * Rejects placeholder/hallucinated paths an LLM occasionally emits instead
 * of a real file path — most commonly a literal "N/A" for an entry it didn't
 * actually mean to include (seen from more than one provider). Silently
 * including such an entry in a git tree makes GitHub's tree-creation API
 * fail with a cryptic "GitRPC::BadObjectState" that blocks the *entire*
 * commit, not just that one bogus file — so these must be filtered out
 * before any file list reaches commitFiles, not just at the git-call boundary.
 */
export function isValidRepoPath(path: string): boolean {
  return VALID_REPO_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}
