/**
 * presets.js
 * ------------------------------------------------------------------
 * 자주 만드는 앱 유형별로 체크리스트 답변을 미리 채워주는 "프리셋" 데이터.
 *
 * 목적:
 *  1) 처음 온 초보자가 빈 체크리스트를 마주하는 진입장벽을 낮춘다.
 *  2) 프리셋 하나하나가 `presets/index.html`에서 독립된 카드/랜딩 요소가 되어
 *     검색 유입을 만든다.
 *  3) 완전 무료 기능으로 재방문 동선을 넓힌다.
 *
 * 여기 담긴 answers 는 js/questions.js 의 QUESTIONS 배열에 정의된
 * 실제 질문 id·value 와 정확히 일치해야 한다(자동 검증은 scripts/test.mjs 참고).
 *
 * 이 파일은 순수 데이터 + 인코딩 헬퍼만 담는다. DOM을 만지지 않으므로
 * 브라우저(ESM import)와 Node(scripts/test.mjs) 양쪽에서 그대로 import할 수 있다.
 * ------------------------------------------------------------------
 */

export const PRESETS = [
  {
    slug: 'ai-chatbot',
    title: 'AI 챗봇',
    description:
      '사용자가 질문을 입력하면 AI가 답을 만들어 보여주는 채팅형 웹 서비스. AI API 연결과 비밀 키 보호가 핵심입니다.',
    tag: 'AI 연결',
    answers: {
      idea: '사용자가 질문을 입력하면 AI가 답변을 생성해서 보여주는 채팅 웹사이트',
      deploy: 'deploy',
      audience: 'tool',
      files: 'no',
      secrets: 'yes',
      aitool: 'chatbot',
    },
  },
  {
    slug: 'personal-blog',
    title: '개인 블로그 · 포트폴리오',
    description: '내 글이나 작업물을 소개하는 개인 사이트. 로그인·결제 없이 누구나 바로 보는 정적인 페이지예요.',
    tag: '가장 간단',
    answers: {
      idea: '내가 쓴 글과 작업물을 소개하는 개인 블로그 겸 포트폴리오 사이트',
      deploy: 'deploy',
      audience: 'tool',
      files: 'no',
      secrets: 'no',
      aitool: 'chatbot',
    },
  },
  {
    slug: 'simple-crud',
    title: '간단한 관리 도구 (가계부 · 할 일)',
    description: '내가 로그인해서 내 기록만 저장하고 다시 보는 개인용 도구. 로그인과 데이터베이스가 필요해요.',
    tag: '서버 비용 주의',
    answers: {
      idea: '매일 쓰는 돈이나 할 일을 기록하고, 로그인해서 나만 다시 볼 수 있는 관리 도구',
      deploy: 'deploy',
      audience: 'private',
      files: 'no',
      secrets: 'no',
      aitool: 'chatbot',
    },
  },
  {
    slug: 'image-gallery',
    title: '이미지 갤러리',
    description: '사진을 올리면 계속 모아서 보여주는 갤러리. 업로드한 파일을 지우지 않고 영구 보관해요.',
    tag: '저장공간 비용 주의',
    answers: {
      idea: '사진을 올리면 계속 모아서 보여주는 이미지 갤러리 웹사이트',
      deploy: 'deploy',
      audience: 'tool',
      files: 'yes',
      fileHandling: 'permanent',
      secrets: 'no',
      aitool: 'chatbot',
    },
  },
  {
    slug: 'local-script',
    title: '내 컴퓨터용 자동화 스크립트',
    description: '인터넷에 올리지 않고 내 컴퓨터에서만 실행하는 도구. 배포·로그인·서버 비용이 전혀 없어요.',
    tag: '무료',
    answers: {
      idea: '엑셀이나 파일을 정리해주는, 내 컴퓨터에서만 실행하는 자동화 스크립트',
      deploy: 'local',
      files: 'no',
      localSave: 'memory',
      secrets: 'no',
      aitool: 'chatbot',
    },
  },
];

/** slug 로 프리셋 찾기 */
export function getPreset(slug) {
  return PRESETS.find((p) => p.slug === slug) || null;
}

/**
 * answers 객체 → base64 문자열.
 * JSON.stringify → UTF-8 바이트 → base64 순서로 인코딩해 한글이 깨지지 않는다.
 * (표준 btoa 는 라틴1 범위 밖 문자를 다루지 못하므로 TextEncoder 로 바이트화한 뒤 넘긴다)
 */
export function encodeAnswers(answers) {
  const json = JSON.stringify(answers);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** encodeAnswers 의 역변환. (지금은 이 파일 자체 테스트용 — 실제 소비는 공유링크 기능 쪽) */
export function decodeAnswers(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

/**
 * 프리셋 → 공유링크 프래그먼트 URL.
 * 형식: `<basePath>#s=<base64(UTF-8 JSON)>`
 * (공유링크 기능이 이 프래그먼트 포맷을 그대로 읽어 위저드를 채우는 건 별도 브랜치의 몫)
 */
export function buildPresetFragmentUrl(preset, basePath = 'app.html') {
  return `${basePath}#s=${encodeAnswers(preset.answers)}`;
}
