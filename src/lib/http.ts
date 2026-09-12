/**
 * Parses a fetch Response as JSON, but tolerates the platform/infra returning
 * something else entirely (a plain-text or HTML error page) instead of the
 * route handler's own JSON — e.g. a payload-too-large rejection or a gateway
 * timeout never reaches our try/catch, so `res.json()` throws a cryptic
 * "Unexpected token '<'/'A' ... is not valid JSON" that tells the user
 * nothing. This turns that into an actual explanation.
 */
export async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (res.status === 413) {
      throw new Error("업로드한 파일이 너무 큽니다 — 서버가 요청 크기를 거부했습니다.");
    }
    if (res.status === 504 || res.status === 502) {
      throw new Error("서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
    }
    const snippet = text.trim().slice(0, 200) || "(빈 응답)";
    throw new Error(`서버가 올바른 응답을 반환하지 않았습니다 (HTTP ${res.status}): ${snippet}`);
  }
}
