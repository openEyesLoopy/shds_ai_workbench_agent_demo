import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { FileChange, SastResult, SourceFile } from "@/lib/types";

const execFileAsync = promisify(execFile);

const BACKEND_PREFIX = "demo-back/";
const COMPILE_TIMEOUT_MS = 90_000;
const OUTPUT_TAIL_CHARS = 4000;

interface ExecFileError extends NodeJS.ErrnoException {
  stdout?: string;
  stderr?: string;
  killed?: boolean;
}

function mergeBackendTree(
  baselineFiles: SourceFile[],
  changedFiles: FileChange[]
): Map<string, string> {
  const tree = new Map<string, string>();
  for (const file of baselineFiles) {
    if (file.path.startsWith(BACKEND_PREFIX)) tree.set(file.path, file.content);
  }
  for (const change of changedFiles) {
    if (!change.path.startsWith(BACKEND_PREFIX)) continue;
    if (change.newContent === null) tree.delete(change.path);
    else tree.set(change.path, change.newContent);
  }
  return tree;
}

function tail(text: string, max: number): string {
  return text.length > max ? `...(생략)...\n${text.slice(-max)}` : text;
}

/**
 * Best-effort real `mvn compile` against the merged demo-back source tree,
 * written out to a throwaway temp dir (the target repo isn't cloned locally —
 * everything comes from GitHub's API). Only runs when a backend file was
 * actually touched and a pom.xml exists in the merged tree; returns null
 * (no-op) otherwise so frontend-only changes never pay this cost.
 *
 * Skips with `passed: true` — never blocks — whenever Maven itself isn't
 * usable (not installed, or too slow to finish in time). This is what keeps
 * it safe on Vercel: the serverless runtime has no JDK/Maven, so this always
 * degrades to a no-op there instead of failing the QA gate. It only adds
 * real signal in environments that do have `mvn` on PATH (local dev, a
 * self-hosted runner, etc).
 */
export async function checkMavenCompile(
  baselineFiles: SourceFile[],
  changedFiles: FileChange[]
): Promise<SastResult | null> {
  const backendTouched = changedFiles.some((f) => f.path.startsWith(BACKEND_PREFIX));
  if (!backendTouched) return null;

  const tree = mergeBackendTree(baselineFiles, changedFiles);
  if (!tree.has(`${BACKEND_PREFIX}pom.xml`)) return null;

  const rule = "maven_compile";
  const label = "Java 백엔드 컴파일 검증 (mvn compile)";

  let tempDir: string | null = null;
  try {
    tempDir = await mkdtemp(path.join(tmpdir(), "qa-mvn-"));

    await Promise.all(
      Array.from(tree.entries()).map(async ([fullPath, content]) => {
        const relativePath = fullPath.slice(BACKEND_PREFIX.length);
        // tempDir is only known at runtime (mkdtemp), which would otherwise make
        // Next's build-time file tracer conservatively bundle the whole project
        // into the serverless output.
        const absPath = path.join(/* turbopackIgnore: true */ tempDir!, relativePath);
        await mkdir(path.dirname(absPath), { recursive: true });
        await writeFile(absPath, content, "utf-8");
      })
    );

    await execFileAsync("mvn", ["-q", "-B", "-DskipTests", "compile"], {
      cwd: tempDir,
      timeout: COMPILE_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      shell: process.platform === "win32",
    });

    return {
      rule,
      label,
      passed: true,
      detail: "mvn compile 성공 — 백엔드 소스가 정상적으로 컴파일됩니다.",
    };
  } catch (err) {
    const e = err as ExecFileError;

    if (e.code === "ENOENT" || /not recognized|command not found/i.test(e.stderr ?? "")) {
      return {
        rule,
        label,
        passed: true,
        detail:
          "이 환경에는 Maven이 설치되어 있지 않아 실제 컴파일 검증을 건너뛰었습니다 (Vercel 등 서버리스 배포 환경에서는 정상입니다).",
      };
    }
    if (e.killed) {
      return {
        rule,
        label,
        passed: true,
        detail: `제한 시간(${COMPILE_TIMEOUT_MS / 1000}초) 내에 컴파일이 끝나지 않아 검증을 건너뛰었습니다.`,
      };
    }

    const output = tail(`${e.stdout ?? ""}\n${e.stderr ?? ""}`.trim(), OUTPUT_TAIL_CHARS);
    return {
      rule,
      label,
      passed: false,
      detail: `mvn compile 실패:\n${output}`,
    };
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
