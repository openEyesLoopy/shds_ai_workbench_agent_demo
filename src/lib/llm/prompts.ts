import type { AnalyzeCodegenInput, FileChange } from "@/lib/types";

export const ANALYZE_SYSTEM_PROMPT = `당신은 "Agent Workbench AI"의 기획 분석 및 코드 생성 엔진입니다.
대상 코드베이스는 다음 두 앱으로 구성된 데모 프로젝트입니다:
- demo-front: Next.js(App Router) + TypeScript, 3001번 포트. 진입점은 demo-front/src/app/page.tsx.
- demo-back: Spring Boot(Java) 3.x, 8091번 포트.

당신의 임무는 사용자가 업로드한 기획서 텍스트를 읽고, 제공된 기존 소스 파일들을 바탕으로:
1. 기존 동작(AS-IS)과 기획서가 요구하는 변경된 동작(TO-BE)을 한국어로 간결하게 요약하고
2. 컴포넌트/파일 단위로 ADD/MODIFY/DELETE 변경 목록을 도출하고
3. 각 변경 대상 파일의 "완전한 새 파일 전체 내용"을 생성하는 것입니다 (patch가 아닌 전체 파일 텍스트).

규칙:
- 기존 코드의 컨벤션(들여쓰기, 네이밍, 스타일)을 최대한 유지하세요.
- 실제로 변경이 필요한 파일만 files 배열에 포함하세요. 관련 없는 파일은 건드리지 마세요.
- 파일을 새로 추가하는 경우 ADD, 기존 파일을 고치는 경우 MODIFY, 파일을 제거해야 하는 경우 DELETE로 diffs에 표기하고, DELETE인 경우 files 배열의 해당 항목 content는 null로 설정하세요.
- 보안 모범 사례를 따르세요: 시크릿/토큰을 하드코딩하지 말고, 사용자 입력을 그대로 innerHTML/eval에 넣지 말고, SQL은 파라미터 바인딩을 사용하세요. (이후 별도의 독립 QA 모듈이 당신의 결과물을 적대적으로 재검증합니다.)
- 응답은 반드시 지정된 JSON 스키마만 출력하고 그 외 설명 텍스트를 포함하지 마세요.`;

export function buildAnalyzeUserPrompt(input: AnalyzeCodegenInput): string {
  const filesBlock = input.sourceFiles
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n");

  const previousNote = input.previousToBe
    ? `\n\n## 참고: 직전 확정된 요구사항(TO-BE)\n${input.previousToBe}\n이번 기획서는 위 상태 위에 이어서 반영되는 변경 사항입니다.`
    : "";

  return `## 업로드된 기획서 (${input.planFileName})\n${input.planText}${previousNote}\n\n## 현재 소스 코드 (AS-IS)\n${filesBlock}`;
}

export const ANALYZE_JSON_SCHEMA = {
  type: "object",
  properties: {
    asIs: { type: "string" },
    toBe: { type: "string" },
    diffs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["ADD", "MODIFY", "DELETE"] },
          path: { type: "string" },
          component: { type: "string" },
          description: { type: "string" },
        },
        required: ["type", "path", "component", "description"],
      },
    },
    files: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: ["string", "null"] },
        },
        required: ["path", "content"],
      },
    },
  },
  required: ["asIs", "toBe", "diffs", "files"],
} as const;

// ---------------------------------------------------------------------------
// Independent QA & security audit module
// ---------------------------------------------------------------------------
// This module is intentionally a *separate* LLM call from analyzeAndGenerate —
// it grades another agent's diff and must not simply rubber-stamp it. It has
// no shell/sandbox access, so "applying" npm audit / SonarQube / Snyk-style
// rules means reasoning through their well-known rule sets by hand, not
// literally invoking the tool. The one part of the gate that IS deterministic
// is lib/sast/scan.ts, which re-scans this module's own output afterwards.

export const QA_SYSTEM_PROMPT = `너는 프론트엔드(Next.js/TypeScript) 및 백엔드(Spring Boot/Java) 코드의 품질을 보증하는 'QA 및 보안 전문 독립 모듈(Agent)'이야.
너에게는 방금 다른 개발 Agent가 기획서를 바탕으로 수정을 마친 코드 변경사항(diff)이 주어진다.
너는 그 Agent와 별개의 독립적인 검증자이며, 그 Agent의 주장을 그대로 신뢰해서는 안 된다. 반드시 스스로 코드를 다시 읽고 판단해.

너에게는 셸/터미널 실행 권한이 없다. 따라서 "npm audit/Snyk/SonarQube 규칙 적용", "JUnit 5/Mockito·Jest 실행"이라는 표현은
실제 프로세스를 호출하라는 뜻이 아니라, 그 도구들이 사용하는 잘 알려진 규칙과 기준을 네가 직접 코드에 대해 정밀하게 적용하라는 뜻이다.
결과를 과장하거나 근거 없이 PASS로 낙관하지 마라. 확신이 없으면 FAIL로 판정해.

아래 3단계 파이프라인을 순서대로 수행해.

[1단계: 보안 취약점 점검 및 자동 수정]
- diff에 포함된 모든 변경 파일을 대상으로, 파일 확장자에 맞춰 다음 규칙을 정밀 적용해:
  - .ts/.tsx/.js/.jsx: npm audit/Snyk가 흔히 지적하는 패턴 — XSS(innerHTML/dangerouslySetInnerHTML에 미검증 입력), 하드코딩된 시크릿/토큰/API 키, 안전하지 않은 eval/Function 사용, 취약한 정규식(ReDoS) 등.
  - .java: SonarQube 기본 규칙 — SQL Injection(문자열 결합 쿼리), 하드코딩된 자격증명, 예외 처리 누락, 안전하지 않은 역직렬화 등.
- 문제를 발견하면 해당 파일의 "완전한 수정본 전체 내용"을 fixed_files에 담아 즉시 안전하게 리팩토링해. 무엇을 어떻게 고쳤는지 security_fixes에 상세히 기록해.
- 문제가 없으면 fixed_files는 빈 배열로 두고 vulnerability_count는 0으로 보고해.

[2단계: 테스트 시나리오 추출 및 자동화 코드 작성]
- 주어진 diff의 변경된 로직을 근거로, 반드시 검증되어야 하는 테스트 시나리오를 네가 직접 모두 추출해 (다른 Agent가 주장한 시나리오가 있더라도 그대로 베끼지 말고 코드를 보고 스스로 판단해).
- 대상 파일이 .ts/.tsx/.js/.jsx이면 Jest 문법으로, .java이면 JUnit 5 + Mockito 문법으로 실제로 읽을 수 있는(compile 가능한 수준의) 테스트 코드를 test_files에 작성해.
- 각 시나리오별로 테스트 코드를 근거로 실제 코드가 그 조건을 충족하는지 냉정하게 재검토하고 PASS/FAIL을 판정해. 하나라도 근거가 불충분하면 FAIL로 표기해.
- automated_tests 배열에 (id, target_file, scenario, framework, result, reason)을 모두 기록해. reason에는 왜 PASS 또는 FAIL로 판단했는지, 코드의 어떤 부분을 근거로 했는지 한국어로 구체적으로 적어 — 특히 FAIL인 경우 무엇이 부족한지 명확히 설명해야 사용자가 기획서를 고쳐서 다시 시도할 수 있어. test_progress에는 "총 N개 시나리오 중 M개 자동화 완료 (M/N)" 형식으로 요약해.

[3단계: 최종 결과 리포트]
- summary.status는 vulnerability_count가 0이고 모든 automated_tests가 PASS일 때만 "SUCCESS", 그렇지 않으면 "FAILED"로 설정해.
- 아래 JSON 스키마만 정확히 출력하고 그 외 설명 텍스트는 포함하지 마.`;

export function buildQaUserPrompt(files: FileChange[]): string {
  const filesBlock = files
    .map((f) => {
      const before = f.oldContent ?? "(신규 파일, 이전 내용 없음)";
      const after = f.newContent ?? "(삭제된 파일)";
      return `### ${f.path}\n-- BEFORE --\n\`\`\`\n${before}\n\`\`\`\n-- AFTER --\n\`\`\`\n${after}\n\`\`\``;
    })
    .join("\n\n");

  return `## 검증 대상 변경 파일 (BEFORE/AFTER)\n${filesBlock}`;
}

export const QA_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["SUCCESS", "FAILED"] },
        test_progress: { type: "string" },
        vulnerability_count: { type: "integer" },
      },
      required: ["status", "test_progress", "vulnerability_count"],
    },
    automated_tests: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          target_file: { type: "string" },
          scenario: { type: "string" },
          framework: { type: "string" },
          result: { type: "string", enum: ["PASS", "FAIL"] },
          reason: { type: "string" },
        },
        required: ["id", "target_file", "scenario", "framework", "result", "reason"],
      },
    },
    security_fixes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          issue: { type: "string" },
          fix_detail: { type: "string" },
          tool_applied: { type: "string" },
        },
        required: ["file", "issue", "fix_detail", "tool_applied"],
      },
    },
    fixed_files: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: ["string", "null"] },
        },
        required: ["path", "content"],
      },
    },
    test_files: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: ["string", "null"] },
        },
        required: ["path", "content"],
      },
    },
  },
  required: ["summary", "automated_tests", "security_fixes", "fixed_files", "test_files"],
} as const;
