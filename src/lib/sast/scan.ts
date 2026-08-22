import type { FileChange, SastResult } from "@/lib/types";

interface Pattern {
  label: string;
  regex: RegExp;
}

const SECRET_PATTERNS: Pattern[] = [
  { label: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/ },
  {
    label: "하드코딩된 시크릿/토큰/비밀번호",
    regex: /(secret|password|passwd|api[_-]?key|access[_-]?token)\s*[:=]\s*["'`][^"'`\s]{8,}["'`]/i,
  },
  { label: "PEM 개인키", regex: /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  { label: "Slack 토큰", regex: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
];

const XSS_PATTERNS: Pattern[] = [
  { label: "dangerouslySetInnerHTML 사용", regex: /dangerouslySetInnerHTML/ },
  { label: "innerHTML 직접 대입", regex: /\.innerHTML\s*=/ },
  { label: "eval() 호출", regex: /\beval\s*\(/ },
  { label: "new Function() 동적 코드 생성", regex: /new\s+Function\s*\(/ },
];

const SQL_INJECTION_PATTERNS: Pattern[] = [
  {
    label: "문자열 결합 기반 SQL 쿼리 (SELECT/INSERT/UPDATE/DELETE + 연결 연산자)",
    regex: /(SELECT|INSERT|UPDATE|DELETE)[^;"'`]*["'`]\s*\+/i,
  },
  {
    label: "템플릿 리터럴에 변수를 직접 삽입한 SQL 쿼리",
    regex: /`[^`]*(SELECT|INSERT|UPDATE|DELETE)[^`]*\$\{[^}]+\}[^`]*`/i,
  },
  {
    label: "JDBC Statement(문자열 결합)로 실행되는 쿼리 — PreparedStatement 권장",
    regex: /createStatement\s*\([^)]*\)[\s\S]{0,200}execute(Query|Update)\s*\([^)]*\+/,
  },
];

function findFirstMatch(
  files: FileChange[],
  patterns: Pattern[]
): { label: string; path: string; snippet: string } | null {
  for (const file of files) {
    if (!file.newContent) continue;
    for (const pattern of patterns) {
      const match = pattern.regex.exec(file.newContent);
      if (match) {
        return { label: pattern.label, path: file.path, snippet: match[0].slice(0, 80) };
      }
    }
  }
  return null;
}

function scanCategory(
  rule: string,
  label: string,
  files: FileChange[],
  patterns: Pattern[]
): SastResult {
  const hit = findFirstMatch(files, patterns);
  if (!hit) {
    return { rule, label, passed: true, detail: "의심 패턴이 발견되지 않았습니다." };
  }
  return {
    rule,
    label,
    passed: false,
    detail: `${hit.path} 에서 [${hit.label}] 패턴이 발견되었습니다: "${hit.snippet}"`,
  };
}

function extractDependencyNames(packageJsonText: string): string[] {
  try {
    const parsed = JSON.parse(packageJsonText) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return [
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
    ];
  } catch {
    return [];
  }
}

function scanThirdPartyDependencies(files: FileChange[]): SastResult {
  const rule = "third_party_modules";
  const label = "서드파티 모듈 취약점 (package.json 의존성 변경)";

  const packageJsonChange = files.find((f) => f.path.endsWith("package.json"));
  if (!packageJsonChange || !packageJsonChange.newContent) {
    return { rule, label, passed: true, detail: "package.json 변경 없음 — 의존성 추가 없음." };
  }

  const before = extractDependencyNames(packageJsonChange.oldContent ?? "{}");
  const after = extractDependencyNames(packageJsonChange.newContent);
  const added = after.filter((dep) => !before.includes(dep));

  if (added.length === 0) {
    return { rule, label, passed: true, detail: "신규 의존성이 추가되지 않았습니다." };
  }
  return {
    rule,
    label,
    passed: false,
    detail: `신규 의존성이 추가되어 CVE 검토가 필요합니다: ${added.join(", ")}`,
  };
}

/** Lightweight heuristic SAST — no build/execution of the target app required. */
export function runSast(files: FileChange[]): SastResult[] {
  return [
    scanCategory("hardcoded_secrets", "하드코딩된 시크릿/토큰", files, SECRET_PATTERNS),
    scanCategory("xss", "XSS / 위험한 동적 실행", files, XSS_PATTERNS),
    scanCategory("sql_injection", "SQL Injection", files, SQL_INJECTION_PATTERNS),
    scanThirdPartyDependencies(files),
  ];
}
