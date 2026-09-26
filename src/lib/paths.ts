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

// Jest test files are colocated next to the source they cover (e.g.
// page.test.tsx, page.qa-audit.test.ts), so a suffix match is enough; Maven
// puts every Java test under its own src/test/ source root regardless of
// class name, so that's checked by directory instead of by name.
const TEST_FILE_PATTERNS = [/\.(test|spec)\.[jt]sx?$/, /\/src\/test\//];

/**
 * True for QA/scenario-test files (Jest `*.test.ts(x)`, JUnit under
 * `src/test/`) as opposed to the actual production source they cover — used
 * to keep the "코드 비교" view scoped to real runtime code the user asked to
 * change, since the QA module's own generated test files aren't part of
 * what's deployed/running and just clutter that comparison.
 */
export function isTestFilePath(path: string): boolean {
  return TEST_FILE_PATTERNS.some((re) => re.test(path));
}
