# Agent Workbench AI

기획서를 업로드하면 AI(Claude / Gemini / ChatGPT 중 선택)가 요구사항을 분석하고, 대상 저장소
([shds-demo-project-workbench](https://github.com/moonctp24/shds-demo-project-workbench))의
코드를 자동 생성하여 `test` 브랜치에 반영하고, 승인 시 `main` 브랜치로 최종 반영하는
워크벤치입니다.

## 준비

```bash
cp .env.local.example .env.local
```

`.env.local`에 다음 값을 채워야 실제 분석/커밋이 동작합니다.

| 변수 | 설명 |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude 분석 엔진용 API 키 |
| `GEMINI_API_KEY` | Gemini 분석 엔진용 API 키 |
| `OPENAI_API_KEY` | ChatGPT 분석 엔진용 API 키 |
| `GITHUB_TOKEN` | `GITHUB_OWNER/GITHUB_REPO`에 대한 쓰기 권한이 있는 Personal Access Token |
| `GITHUB_OWNER` / `GITHUB_REPO` | 기본값은 `moonctp24` / `shds-demo-project-workbench` |

세 엔진 모두 설정할 필요는 없습니다 — 실제로 사용할 엔진의 API 키만 채워두면 됩니다.
분석 엔진(Claude/Gemini/ChatGPT)은 `/settings` 화면 또는 화면 우측 상단의 엔진 전환
배지를 클릭해 즉시 바꿀 수 있습니다(`DEFAULT_LLM_PROVIDER`는 최초 기본값만 지정). 테스트뷰어에
표시할 목업 Agent URL도 `/settings`에서 설정합니다.

## 실행

```bash
npm install
npm run dev
```

http://localhost:3000 에서 기획서를 업로드하면:

1. AI가 문서를 분석해 AS-IS/TO-BE 요약과 변경 파일 diff를 생성합니다.
2. 코드 생성과는 별개의 **독립 QA/보안 모듈**이 diff를 적대적으로 재검토합니다 — 취약점을
   발견하면 즉시 해당 파일을 수정하고, 변경 로직 기준으로 스스로 테스트 시나리오를 추출해
   실제 Jest(프론트) / JUnit5+Mockito(백엔드) 테스트 코드를 작성합니다.
3. 이 모듈의 결과물(수정 코드 + 신규 테스트 파일)을 우리 자체의 결정론적 정규식 SAST가
   다시 스캔합니다 — 실제 커밋 여부를 가르는 최종 게이트는 LLM의 자기 보고가 아니라 이
   결정론적 스캔 + 모든 테스트 PASS 여부입니다. 통과 시에만 `test` 브랜치에 커밋됩니다.
4. "테스트뷰어 확인"은 설정된 목업 Agent URL을 iframe으로 보여줍니다.
5. "최종확정"을 클릭하면 `main` 브랜치를 `test` 브랜치의 현재 상태로 갱신합니다
   (`test` 브랜치는 삭제되지 않고 계속 유지됩니다).

QA 모듈은 실제로 `npm audit`/`mvn test`/SonarQube를 실행하지 않습니다(서버에 Node/Java
툴체인이 필요 없고 분석이 빠릅니다) — 대신 그 도구들의 규칙을 LLM이 정밀하게 직접
적용하도록 지시하며, 생성된 코드에 대한 최종 판정은 항상 우리 쪽 결정론적 SAST가 겹쳐서
재확인합니다. 감사 결과(JSON)는 Agent Workbench 내부에만 보관되며 Step4 대시보드에서
바로 렌더링됩니다(대상 저장소에는 커밋되지 않습니다).

## 구조

- `src/lib/llm` — Claude/Gemini/ChatGPT 공통 인터페이스 및 구조화 출력 스키마 (`analyzeAndGenerate` +
  독립 `runQaAudit`)
- `src/lib/github/client.ts` — Git Data API 기반 브랜치 생성/커밋/승격
- `src/lib/parsers` — .txt/.pdf/.xlsx/.pptx 기획서 파서
- `src/lib/sast` — 결정론적 정규식 기반 SAST (최종 커밋 게이트)
- `src/lib/store/settingsStore.ts` — 설정 저장소(브라우저 쿠키 기반, 서버 파일시스템 불필요)

## Vercel(무료 Hobby) 배포

이 앱은 서버리스 배포를 염두에 두고 상태를 저장하지 않도록(stateless) 만들어졌습니다:

- **설정(분석 엔진/목업 URL/저장소)** 은 서버 파일이 아니라 **브라우저 쿠키**에 저장됩니다 —
  서버리스 함수는 인스턴스 간 공유되는 쓰기 가능한 파일시스템이 없기 때문입니다.
- **버전 뱃지(v1.0 → v1.1)** 는 별도로 저장하지 않고, `test` 브랜치가 `main`보다 몇 커밋
  앞서 있는지를 GitHub에서 직접 조회해 계산합니다.
- **직전 확정 내용과의 연속성**은 서버 세션이 아니라 브라우저 탭의 클라이언트 상태로만
  유지됩니다(새로고침하면 초기화됩니다).

즉, 로컬 디스크에 아무것도 쓰지 않으므로 Vercel Hobby(무료) 플랜에 그대로 배포할 수 있습니다.
다만 배포 전 아래를 확인하세요:

1. **환경 변수**: Vercel 프로젝트 설정 → Environment Variables에 `.env.local`의 값들을
   그대로 등록합니다(`.env.local` 자체는 git에 커밋되지 않으므로 반드시 수동으로 등록해야
   합니다).
2. **함수 실행 시간**: `/api/upload`는 GitHub 조회 + LLM 분석 호출 + 독립 QA 감사 호출까지
   순차적으로 실행되어 몇십 초가 걸릴 수 있습니다. `export const maxDuration = 60`을
   설정해뒀지만, Hobby 플랜의 서버리스 함수 최대 실행 시간은 Vercel 정책에 따라 달라질 수
   있으니 [Vercel 공식 문서](https://vercel.com/docs/functions/runtimes#max-duration)에서
   현재 한도를 확인하세요. 초과하면 큰 기획서/느린 모델에서 타임아웃이 날 수 있습니다.
3. 클라이언트 번들에는 서버 전용 패키지(Anthropic/OpenAI/Gemini SDK, Octokit, pdf-parse,
   exceljs 등)가 전혀 포함되지 않도록 이미 `src/app/api/**/route.ts`에서만 import하고
   있습니다 — 별도 조치가 필요 없습니다.
