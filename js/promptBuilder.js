/**
 * promptBuilder.js  (v2)
 * ------------------------------------------------------------------
 * 체크리스트 답변(answers) → "가드레일 마스터 프롬프트" 조립 엔진.
 *
 * 핵심 변화:
 *  - 사용자는 언어/프레임워크를 고르지 않는다. 여기서 '의도'로부터 자동 결정한다.
 *  - 로그인·영속성·다중접속 등은 audience 한 선택에서 모순 없이 유도한다.
 *  - 서버/DB가 필요한 구성은 '유료 가능성'을 결과에 명시한다.
 *
 * answers 키:
 *   idea, deploy('local'|'deploy'), audience?('tool'|'private'|'shared'),
 *   files('no'|'yes'), fileHandling?('ephemeral'|'permanent'),
 *   localSave?('memory'|'save'), secrets('no'|'yes')
 * ------------------------------------------------------------------
 */

function mentionsAIorData(idea = '') {
  return /\b(ai|llm|gpt|openai|claude|gemini|챗봇|인공지능|요약|생성|번역|추천|분석|데이터|엑셀|excel|csv|pdf|이미지|사진|음성|크롤)\b/i.test(
    idea
  );
}

/**
 * 답변으로부터 아키텍처 사실을 '유도'한다. (모순이 생길 수 없는 단일 진실)
 */
export function deriveSpec(a = {}) {
  const deployed = a.deploy === 'deploy';
  const audience = deployed ? a.audience : 'solo';

  const files = a.files === 'yes';
  const filePermanent = files && a.fileHandling === 'permanent';

  // 다중 사용자 / 데이터 격리 / 로그인 — audience 하나에서 모순 없이 결정
  const multiUser = deployed && audience !== 'solo';
  const dataScope =
    audience === 'shared' ? 'shared' : audience === 'private' ? 'isolated' : 'none';
  const auth = audience === 'private'; // "내 정보를 로그인해서 본다" 일 때만 로그인

  // 영속성
  let persist; // 'none' | 'db' | 'localfile'
  if (deployed) {
    persist = audience === 'private' || audience === 'shared' ? 'db' : 'none';
  } else {
    persist = a.localSave === 'save' ? 'localfile' : 'none';
  }

  const secrets = a.secrets === 'yes';
  const dataHeavy = mentionsAIorData(a.idea || '') || files;
  const aitool = a.aitool === 'agent' ? 'agent' : 'chatbot'; // 기본: 채팅형(안전)

  // 백엔드(서버)가 필요한가? → 필요하면 파이썬, 아니면 순수 프론트엔드
  const needsBackend =
    secrets || auth || persist === 'db' || filePermanent || files || dataHeavy;
  const stack = needsBackend ? 'python' : 'web';

  // 유료 가능성: 진짜 서버/DB/저장공간이 필요한 배포 구성
  const paid = deployed && (persist === 'db' || filePermanent);

  return {
    deployed,
    audience,
    files,
    filePermanent,
    multiUser,
    dataScope,
    auth,
    persist,
    secrets,
    dataHeavy,
    stack,
    paid,
    aitool,
  };
}

/**
 * 마스터 프롬프트 조립.
 * @returns {{ prompt, summary, forbidden, notes, spec }}
 */
export function buildPrompt(answers) {
  const a = answers || {};
  const spec = deriveSpec(a);
  const idea = (a.idea || '').trim() || '(작성된 기능 설명 없음 — 사용자에게 먼저 물어볼 것)';

  const rules = [];
  const forbidden = [];
  const summary = [];
  const notes = []; // 사용자에게 보여줄 안내(비용 등)

  const isWeb = spec.stack === 'web';

  // ── 스택/배포 대상 결정 및 안내 ──────────────────────────────
  let stackLine, deployTarget, framework;
  if (isWeb) {
    framework = '순수 HTML · CSS · JavaScript (별도 서버 없음)';
    deployTarget = '정적 호스팅 (Vercel · Netlify · GitHub Pages) — 무료';
    stackLine = '프론트엔드 전용 (HTML/CSS/JavaScript)';
    summary.push('스택: 프론트엔드 전용(무료 배포)');
  } else {
    framework = 'Python + Streamlit (화면과 서버를 한 번에)';
    deployTarget = spec.deployed
      ? 'Streamlit Community Cloud (무료 시작) 등'
      : '내 컴퓨터에서 실행';
    stackLine = 'Python + Streamlit';
    summary.push('스택: Python + Streamlit');
  }

  // ── 배포/사용 범위 요약 ─────────────────────────────────────
  if (!spec.deployed) {
    summary.push('사용: 나 혼자(로컬)');
  } else if (spec.audience === 'tool') {
    summary.push('사용: 여러 명 · 로그인 없는 도구');
  } else if (spec.audience === 'private') {
    summary.push('사용: 여러 명 · 로그인 · 개인 데이터');
  } else {
    summary.push('사용: 여러 명 · 공용(함께 보기)');
  }

  // ── AI 도구 요약 ────────────────────────────────────────────
  summary.push(spec.aitool === 'agent' ? 'AI 도구: 코딩 에이전트' : 'AI 도구: 채팅형');

  // ── 비용 안내(유료 가능성) ──────────────────────────────────
  if (spec.paid) {
    notes.push(
      '💳 이 구성은 데이터를 계속 저장할 **서버/DB(또는 클라우드 저장공간)** 가 필요해요. ' +
        '무료로 시작할 수 있지만, 사용자가 늘거나 저장량이 커지면 **매달 요금이 들 수 있습니다.**'
    );
    summary.push('⚠️ 서버/저장 비용 발생 가능');
  } else if (isWeb && spec.deployed) {
    notes.push('🆓 서버가 필요 없어서 **무료로 배포**할 수 있는 구성이에요. (정적 호스팅)');
  }

  // ============================================================
  //  아키텍처 규칙 조립
  // ============================================================

  if (isWeb) {
    // ── 프론트엔드 전용 경로 ──────────────────────────────────
    rules.push(
      '### 구조 (프론트엔드 전용)\n' +
        '- 이 프로그램은 **브라우저에서만 도는 프론트엔드**다. 별도의 백엔드 서버를 만들지 마라(필요 없다).\n' +
        '- 코드는 `index.html` · `style.css` · `script.js` 로 **역할별로 분리**하라. 한 파일에 다 넣지 마라.\n' +
        '- 시맨틱 HTML과 기본 접근성(라벨, 대비, 키보드)을 지키고, **모바일/데스크톱 반응형**으로 만들어라.'
    );
    if (spec.persist === 'localfile') {
      rules.push(
        '### 저장\n' +
          '- 기록은 브라우저의 **`localStorage`** 에 저장해 새로고침 후에도 남게 하라(서버 불필요·무료).\n' +
          '- 단, `localStorage` 는 그 브라우저에만 남는다는 점을 코드 주석과 안내에 밝혀라. 민감정보는 저장하지 마라.'
      );
    }
    rules.push(
      '### 안전\n' +
        '- 프론트엔드 코드는 **누구나 소스를 볼 수 있다.** 어떤 비밀 키/비밀번호도 코드에 절대 넣지 마라.\n' +
        '- 사용자 입력을 화면에 넣을 때 그대로 innerHTML 로 넣지 말고, **입력을 검증/이스케이프**하라(XSS 방지).'
    );
    forbidden.push('프론트엔드 코드에 비밀 키·비밀번호를 넣는 것 (소스가 그대로 노출됨)');
    forbidden.push('사용자 입력을 검증 없이 innerHTML 등에 그대로 넣는 것 (XSS 위험)');
  } else {
    // ── 파이썬(Streamlit) 경로 ────────────────────────────────
    rules.push(
      '### 구조 (화면 포함 웹앱)\n' +
        `- **${framework}** 로 프론트-백이 통합된 실행 가능한 웹앱을 만든다.\n` +
        '- 한 파일에 전부 넣지 말고 화면/로직/데이터 접근을 **모듈로 분리**하라(예: `ui`, `services`, `db`).'
    );

    // 동시 접속 / 상태 격리
    if (!spec.deployed) {
      rules.push(
        '### 실행 범위\n' +
          '- 단일 사용자가 **자기 컴퓨터에서만** 실행한다. 다중 접속은 가정하지 않는다.\n' +
          '- 전역 변수 사용은 허용하되, 나중에 웹 서비스로 확장할 수 있게 함수/모듈로 정리하라.'
      );
    } else if (spec.dataScope === 'shared') {
      rules.push(
        '### 동시 접속 · 공유 상태 (매우 중요)\n' +
          '- 여러 사용자가 **동시에 같은 데이터**를 보고 바꾼다. 상태를 프로세스 메모리(전역 변수)에 두지 마라 — 서버 재시작/증설 시 즉시 깨진다.\n' +
          '- 공유 상태는 **데이터베이스(또는 Redis 캐시)** 를 단일 진실 공급원으로 두고 동기화하라.\n' +
          '- 여러 명이 같은 값을 동시에 바꿀 수 있으니 **트랜잭션/락**으로 경쟁 상태(race condition)를 막아라.'
      );
      forbidden.push('공유 상태를 전역 변수·모듈 스코프에 저장하는 것 (서버 증설 시 깨짐)');
    } else if (spec.multiUser) {
      // tool 또는 private (둘 다 사용자별 세션 격리 필요)
      rules.push(
        '### 동시 접속 · 사용자 데이터 격리 (매우 중요)\n' +
          '- 링크를 공유해 **여러 명이 동시에** 사용한다. A 사용자의 데이터가 B 사용자에게 절대 보여선 안 된다.\n' +
          '- 사용자별 상태는 반드시 **`st.session_state`** 에 저장하라. 전역 변수(`global`)나 모듈 스코프에 사용자 데이터를 담는 것을 **엄격히 금지**한다(모든 접속자가 값을 공유해 데이터가 섞인다).'
      );
      forbidden.push('전역 변수(global)/모듈 스코프에 사용자별 데이터를 저장하는 것 (st.session_state 사용)');
    }

    // 로그인 (유도된 값)
    if (spec.auth) {
      rules.push(
        '### 로그인 (개인 데이터)\n' +
          '- 사람마다 "내 데이터"가 있으므로 로그인이 필요하다. 비밀번호는 **절대 평문 저장 금지**, `passlib`/`bcrypt` 로 해싱하라.\n' +
          '- 데이터에는 **소유자(user_id)** 를 붙이고, 조회/수정 시 **반드시 로그인한 본인 것인지 서버에서 확인**한 뒤 접근을 허용하라(남의 데이터 접근 차단).'
      );
      forbidden.push('비밀번호를 평문으로 저장하는 것 (반드시 해싱)');
      forbidden.push('로그인 사용자 확인 없이 user_id만 믿고 남의 데이터를 내려주는 것');
    }

    // 파일
    if (spec.files) {
      if (spec.filePermanent) {
        rules.push(
          '### 파일 업로드 · 영구 보관\n' +
            '- 업로드 파일을 계속 보관한다. 로컬 디스크에 영구 저장하지 말고 **오브젝트 스토리지(예: AWS S3)** 를 기본으로 하라(재배포마다 로컬 파일은 사라진다).\n' +
            '- 저장 경로는 **사용자 ID를 폴더/prefix로 격리**하라(예: `uploads/{user_id}/...`).\n' +
            '- 원본 파일명을 신뢰하지 마라. 저장 시 **UUID로 이름을 바꾸고**, 경로 조작(`../`, path traversal)을 차단하라.\n' +
            '- 허용 **확장자·MIME 타입·최대 크기**를 서버에서 검증하라.'
        );
        forbidden.push('사용자가 보낸 원본 파일명을 그대로 저장 경로에 쓰는 것 (path traversal 위험)');
      } else {
        rules.push(
          '### 파일 업로드 · 일회성 처리\n' +
            '- 파일은 분석/변환에만 쓰고 남기지 않는다.\n' +
            '- 임시 파일명은 **UUID** 로 만들어 다른 사용자 파일과 겹치지 않게 하라(덮어쓰기 방지).\n' +
            '- 처리 성공/실패와 무관하게 **`try ... finally` 의 finally 에서 `os.remove()` 로 임시 파일을 강제 삭제**하라. 에러가 나도 파일이 남으면 안 된다.\n' +
            '- 허용 **확장자·MIME 타입·최대 크기**를 서버에서 검증하라.'
        );
        forbidden.push('처리 중 에러 시 임시 업로드 파일이 서버에 그대로 남는 코드 (finally에서 정리)');
      }
    }

    // 영속성
    if (spec.persist === 'db') {
      rules.push(
        '### 데이터 영속성 (데이터베이스)\n' +
          '- 기록이 재시작 후에도 남아야 한다. **SQLAlchemy ORM** 을 기본 뼈대로 쓰고, 원시(raw) SQL 문자열을 직접 이어붙이지 마라(SQL 인젝션 위험).\n' +
          '- 개발은 SQLite, 운영은 PostgreSQL 로 쉽게 바꿀 수 있게 **DB 접속 정보를 환경변수로 분리**하라.'
      );
    } else if (spec.persist === 'localfile') {
      rules.push(
        '### 데이터 영속성 (로컬 저장)\n' +
          '- 내 컴퓨터에서만 쓰므로 로컬 **SQLite** 파일에 저장하면 충분하다(무료). SQLAlchemy 로 다루면 나중에 확장이 쉽다.'
      );
    } else {
      rules.push(
        '### 데이터 영속성 (임시)\n' +
          '- 영구 저장은 필요 없다. 인메모리로 처리하되, **재시작하면 데이터가 사라진다는 점을 주석과 실행 안내에 명확히 밝혀라.**'
      );
    }

    // 비밀 키
    if (spec.secrets) {
      rules.push(
        '### 비밀 키 관리\n' +
          '- API 키·비밀번호를 **코드에 하드코딩하는 것을 절대 금지**한다.\n' +
          '- 배포처가 Streamlit Community Cloud 면 **`st.secrets["KEY"]`** 로만 불러오고, 그 외(Render/AWS 등)면 **`.env` + `python-dotenv`(os.environ)** 를 쓴다.\n' +
          '- 실제 비밀 파일(`.env`, `.streamlit/secrets.toml`)은 **`.gitignore` 에 추가**하고, 값이 빈 예시(`.env.example`)만 저장소에 두어라. 실수로 커밋되면 즉시 유출로 간주해 키를 교체하라.'
      );
      forbidden.push('API 키·비밀번호를 소스 코드에 직접 적어두는 것 (하드코딩)');
      forbidden.push('.env / secrets.toml 같은 비밀 파일을 Git에 커밋하는 것');

      if (mentionsAIorData(idea)) {
        rules.push(
          '### 외부 AI/API 비용 보호\n' +
            '- 외부 유료 API(예: OpenAI)를 호출한다. **타임아웃·재시도(backoff)·에러 처리**로 감싸 실패해도 앱이 죽지 않게 하라.\n' +
            '- 무한 루프/과도한 호출로 **요금 폭탄**이 나지 않도록 요청 크기·횟수에 상한(가드)을 두어라.'
        );
      }
    }
  }

  // ── 공통 금지 ────────────────────────────────────────────────
  forbidden.push('에러를 조용히 삼키는 빈 예외 처리(빈 except / 빈 catch)');
  forbidden.push('사용자 입력을 검증 없이 그대로 신뢰하는 것');
  forbidden.push('설명 없이 "일단 되게" 만든 뒤 나중에 고치자는 식의 코드');

  // ── 최종 프롬프트 문자열 ─────────────────────────────────────
  const forbiddenBlock = forbidden.map((f, i) => `${i + 1}. ${f}`).join('\n');
  const rulesBlock = rules.join('\n\n');

  // ── AI 도구별 '진행/전달 방식' 프로토콜 (프롬프트가 서로 달라지는 축) ──
  let protocolBlock, closingLine, deliverArtifact, tip;
  if (spec.aitool === 'agent') {
    protocolBlock =
      '너는 프로젝트 폴더의 **파일을 직접 생성·수정하고 명령을 실행할 수 있는 코딩 에이전트**다. 이 능력을 최대한 활용하라.\n' +
      '- 먼저 폴더/파일 구조 계획(트리 + 파일별 한 줄 역할)을 제시하고, 내 승인을 받은 뒤 **파일을 실제로 생성**하라.\n' +
      '- 큰 기능도 작은 단위로 나눠 진행하고, **각 단계마다 실제로 실행/테스트해 동작을 확인**하라(추측으로 "됐다" 하지 마라).\n' +
      '- 의존성 설치·실행·테스트 명령을 직접 수행하고, 실패하면 **에러 로그를 근거로 스스로 고쳐라.**\n' +
      '- 린트/포매터와 기본 테스트를 셋업하고 통과 상태를 유지하라.\n' +
      '- 할 일 목록(TODO)을 관리하며 순서대로 완료하고, 완료할 때마다 무엇을 했는지 짧게 보고하라.\n' +
      '- 결정이 필요하거나 막히면, 실제 상황/에러와 함께 나에게 질문하라.\n' +
      '- 출력 길이는 신경 쓰지 말고 파일 단위로 온전히 작성하라(에이전트는 잘리지 않는다).';
    closingLine =
      '먼저 폴더/파일 구조 계획을 제시하고, 내 승인을 받은 뒤 파일 생성을 시작하세요.';
    deliverArtifact = '파일을 직접 생성하되, 무엇을 만들었는지 경로와 함께 요약';
    tip =
      '⚙️ 이 프롬프트를 코딩 에이전트(Cursor·Claude Code 등)에 그대로 붙여넣으면 파일을 직접 만들어 줍니다. 먼저 제시하는 "구조 계획"을 확인한 뒤 진행을 승인하세요.';
  } else {
    protocolBlock =
      '너는 **채팅창**에서 답한다. 응답 길이 제한이 있으니 **절대 한 번에 다 쓰지 마라.** 아래처럼 나눠서 진행하고, 각 단계 끝에서 멈춰 내 "다음"을 기다려라.\n' +
      '- **1단계(설계)**: 폴더/파일 트리 + 각 파일의 한 줄 역할(매니페스트) + 데이터 흐름만. **코드는 쓰지 말 것.** 여기서 멈춘다.\n' +
      '- **2단계(뼈대)**: 실행만 되는 최소 골격(스텁이라도 실행되는 상태)부터 준다.\n' +
      '- **3단계~**: 매니페스트 순서대로 파일을 **1~2개씩 완결**해서 준다.\n' +
      '- 매 응답 **맨 위에 `[진행 n/총 m]` 체크리스트를 다시 출력**해 맥락 유실을 막아라.\n' +
      '- **코드를 절대 중간에서 자르지 마라.** 한 파일이 너무 길면 논리적 경계에서 나누고 맨 끝에 "(이어서 계속)"이라 표시한 뒤 다음 메시지에서 이어라.\n' +
      '- 내가 "다음"이라 하면 다음 항목, "이어서"라 하면 잘린 부분부터, "수정: 파일명"이라 하면 그 파일만 다시 준다.';
    closingLine =
      '먼저 1단계(설계 계획)만 제시하고 멈추세요. 코드는 내가 "다음"이라고 하면 그때 작성합니다.';
    deliverArtifact = '각 파일의 코드를 파일 경로와 함께 제시';
    tip =
      '💡 붙여넣은 뒤 AI가 멈추면 "다음"이라고 입력해 이어받으세요. 코드가 중간에 잘리면 "이어서"라고 하면 됩니다. (파일이 많은 큰 프로젝트라면 Cursor·Claude Code 같은 에이전트형이 훨씬 편해요.)';
  }

  const prompt = `당신은 **10년차 시니어 프로덕션 소프트웨어 아키텍트**입니다.
당신의 임무는 단순히 "돌아가는 코드"가 아니라, **처음부터 정식 배포(프로덕션)에 견디는 구조**로 코드를 설계하는 것입니다. 아래 [아키텍처 제약]은 협상 불가능한 규칙이며, 이를 어기는 코드는 **폐기 대상**입니다.

작업 순서:
1) 요구사항과 제약을 먼저 요약하고, 폴더/파일 구조 계획을 제시한다.
2) 그다음 계획에 맞춰 코드를 작성한다.
3) 마지막에 실행 방법과 배포 시 주의점을 정리한다.
확실하지 않은 점은 임의로 가정하지 말고 먼저 나에게 질문하세요.

================================================================
[1] 만들 것 (기능 명세서)
================================================================
${idea}

================================================================
[2] 기술 스택 & 배포 (고정)
================================================================
- 스택: ${stackLine}
- 배포 대상: ${deployTarget}
- 이 스택/구조를 임의로 바꾸지 마세요.

================================================================
[3] 반드시 지켜야 할 아키텍처 제약 (Guardrails)
================================================================
${rulesBlock}

================================================================
[4] 절대 금지 사항 (Anti-patterns)
================================================================
아래는 이 프로젝트에서 절대 하면 안 되는 것들입니다. 하나라도 위반하면 다시 작성하세요.
${forbiddenBlock}

================================================================
[5] 산출물 형식
================================================================
- 전체 **폴더/파일 구조**를 트리로 먼저 보여줄 것.
- ${deliverArtifact}할 것.
- 필요한 실행 준비물(${isWeb ? '없음 — 브라우저로 바로 열림' : 'requirements.txt'})과 **실행 방법**·**환경변수 설정법**을 단계별로 안내할 것.
- 초보자가 이해하도록 핵심 부분에 간결한 한국어 주석을 달 것.

================================================================
[6] 작성·진행 방식 (매우 중요 — 반드시 준수)
================================================================
${protocolBlock}

이제 위 제약을 100% 지키면서, ${closingLine}`;

  return { prompt, summary, forbidden, notes, tip, spec };
}
