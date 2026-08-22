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
  /** Full corrected content for files where a vulnerability was found and patched. */
  fixed_files: GeneratedFile[];
  /** Newly authored Jest / JUnit5+Mockito test files to add to the commit. */
  test_files: GeneratedFile[];
}

export interface LlmProvider {
  analyzeAndGenerate(input: AnalyzeCodegenInput): Promise<AnalyzeCodegenOutput>;
  runQaAudit(input: QaAuditInput): Promise<QaAuditOutput>;
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
}

export interface WorkbenchSettings {
  llmProvider: LlmProviderName;
  mockupUrl: string;
  githubOwner: string;
  githubRepo: string;
}

export interface ResourceStats {
  bundleSizeKb: number;
  bundleDeltaKb: number;
  codeLines: number;
  codeLineDelta: number;
}

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
  qa: QaAuditResult;
  sast: SastResult[];
  resource: ResourceStats;
  commit?: { sha: string; branch: string };
}

export interface FinalizeResult {
  ok: boolean;
  commitSha: string;
  branch: string;
  repoUrl: string;
}
