export type LlmProviderName = "claude" | "gemini" | "openai";

export type DiffType = "ADD" | "MODIFY" | "DELETE";

export interface DiffEntry {
  type: DiffType;
  path: string;
  component: string;
  description: string;
}

export interface GeneratedFile {
  path: string;
  content: string | null; // null = delete
}

export interface SourceFile {
  path: string;
  content: string;
}

export interface FileChange {
  path: string;
  oldContent: string | null;
  newContent: string | null;
}

export interface AnalyzeCodegenInput {
  planText: string;
  planFileName: string;
  sourceFiles: SourceFile[];
  previousToBe?: string;
}

export interface AnalyzeCodegenOutput {
  asIs: string;
  toBe: string;
  diffs: DiffEntry[];
  files: GeneratedFile[];
}

export interface SastResult {
  rule: string;
  label: string;
  detail: string;
  passed: boolean;
}

/** Independent QA & security review of a generated diff — see lib/llm/prompts.ts QA_SYSTEM_PROMPT. */
export interface QaAuditInput {
  files: FileChange[];
  /** When retrying after a blocked finalize, the exact items that must be resolved this time. */
  previousFailures?: {
    sast: SastResult[];
    failedTests: QaAutomatedTest[];
  };
}

export interface QaAutomatedTest {
  id: number;
  target_file: string;
  scenario: string;
  framework: string;
  result: "PASS" | "FAIL";
  /** Why the QA module judged it PASS/FAIL — the concrete code evidence it found. */
  reason: string;
}

export interface QaSecurityFix {
  file: string;
  issue: string;
  fix_detail: string;
  tool_applied: string;
}

export interface QaAuditOutput {
  summary: {
    status: "SUCCESS" | "FAILED";
    test_progress: string;
    vulnerability_count: number;
  };
  automated_tests: QaAutomatedTest[];
  security_fixes: QaSecurityFix[];
  /** 1-3 sentence Korean summary of what was changed this pass, and why (or why nothing needed fixing). */
  fix_summary: string;
  /** Full corrected content for files where a vulnerability was found and patched. */
  fixed_files: GeneratedFile[];
  /** Newly authored Jest / JUnit5+Mockito test files to add to the commit. */
  test_files: GeneratedFile[];
}

/** Input for generating the "업무 비즈니스 요약" diagram — always run against the just-committed `test` branch source. */
export interface BusinessDiagramInput {
  files: FileChange[];
  asIs: string;
  toBe: string;
}

export interface BusinessDiagramOutput {
  /** Raw Mermaid.js diagram definition (e.g. starting with "flowchart TD"). */
  mermaid: string;
  /** 1-3 sentence Korean summary of the business logic flow the diagram shows. */
  summary: string;
}

export interface LlmProvider {
  analyzeAndGenerate(input: AnalyzeCodegenInput): Promise<AnalyzeCodegenOutput>;
  runQaAudit(input: QaAuditInput): Promise<QaAuditOutput>;
  generateBusinessDiagram(input: BusinessDiagramInput): Promise<BusinessDiagramOutput>;
}

/** QaAuditOutput as surfaced to the client — fixed_files/test_files are merged into `files` instead. */
export interface QaAuditResult {
  summary: {
    status: "SUCCESS" | "FAILED";
    test_progress: string;
    vulnerability_count: number;
  };
  automated_tests: QaAutomatedTest[];
  security_fixes: QaSecurityFix[];
  fix_summary: string;
}

export interface WorkbenchSettings {
  llmProvider: LlmProviderName;
  mockupUrl: string;
  /** `test` branch target — where 테스트반영 commits AI-generated changes. */
  githubOwner: string;
  githubRepo: string;
  /** Separate production repo — 운영반영 commits straight to its `main` branch. */
  prodGithubOwner: string;
  prodGithubRepo: string;
}

export interface ResourceStats {
  bundleSizeKb: number;
  bundleDeltaKb: number;
  codeLines: number;
  codeLineDelta: number;
}

/**
 * Pure analysis/codegen output — no QA/SAST verdict yet. `ok`/`blockedReason`
 * here only ever reflect "기획서에서 반영할 코드 변경 사항을 찾지 못했습니다"
 * (nothing to test-reflect at all), never a security/test failure — that
 * verdict doesn't exist until the user actually clicks 테스트반영 and
 * /api/test-reflect runs the QA gate.
 */
export interface UploadResult {
  ok: boolean;
  blockedReason?: string;
  planFileName: string;
  version: { from: string; to: string };
  asIs: string;
  toBe: string;
  diffs: DiffEntry[];
  files: FileChange[];
  baselinePaths: string[];
}

/** Vercel redeploy status for a commit, when the relevant VERCEL_* env vars are configured. */
export interface VercelDeployStatus {
  configured: boolean;
  found: boolean;
  state: string | null;
  url: string | null;
  timedOut: boolean;
}

/**
 * Result of clicking "테스트반영" — this is where the QA/SAST gate actually
 * runs (previously it ran silently during upload). `ok: false` means the
 * gate blocked it and nothing was committed; `qa`/`sast`/`resource`/`files`/
 * `diffs` reflect whatever the gate's last attempt produced either way, so
 * the dashboard can show exactly what was checked and why it did or didn't
 * pass. The git/Vercel/diagram fields are only present when `ok` is true.
 */
export interface TestReflectResult {
  ok: boolean;
  blockedReason?: string;
  qa: QaAuditResult;
  sast: SastResult[];
  resource: ResourceStats;
  files: FileChange[];
  diffs: DiffEntry[];
  commitSha?: string;
  branch?: string;
  repoUrl?: string;
  vercel?: VercelDeployStatus;
  businessDiagram?: BusinessDiagramOutput;
}

/** Result of committing the same files straight onto the production repo's `main` branch — the "운영반영" step. */
export interface FinalizeResult {
  ok: boolean;
  commitSha: string;
  branch: string;
  repoUrl: string;
  vercel?: VercelDeployStatus;
}

/** Result of resetting `test` back to whatever `main` currently points at. */
export interface ResetResult {
  ok: boolean;
  commitSha: string;
  branch: string;
  repoUrl: string;
}
