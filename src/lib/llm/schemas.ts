import { z } from "zod";

export const DiffEntrySchema = z.object({
  type: z.enum(["ADD", "MODIFY", "DELETE"]),
  path: z.string(),
  component: z.string(),
  description: z.string(),
});

export const GeneratedFileSchema = z.object({
  path: z.string(),
  content: z.string().nullable(),
});

export const AnalyzeCodegenSchema = z.object({
  asIs: z.string(),
  toBe: z.string(),
  diffs: z.array(DiffEntrySchema),
  files: z.array(GeneratedFileSchema),
});

export const QaAutomatedTestSchema = z.object({
  id: z.number(),
  target_file: z.string(),
  scenario: z.string(),
  framework: z.string(),
  result: z.enum(["PASS", "FAIL"]),
  reason: z.string(),
});

export const QaSecurityFixSchema = z.object({
  file: z.string(),
  issue: z.string(),
  fix_detail: z.string(),
  tool_applied: z.string(),
});

export const QaAuditSchema = z.object({
  summary: z.object({
    status: z.enum(["SUCCESS", "FAILED"]),
    test_progress: z.string(),
    vulnerability_count: z.number(),
  }),
  automated_tests: z.array(QaAutomatedTestSchema),
  security_fixes: z.array(QaSecurityFixSchema),
  fix_summary: z.string(),
  fixed_files: z.array(GeneratedFileSchema),
  test_files: z.array(GeneratedFileSchema),
});
