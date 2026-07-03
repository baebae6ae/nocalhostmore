/**
 * questions.js
 * ------------------------------------------------------------------
 * "이륙 전 체크리스트" 질문 모델.
 *
 * 원칙:
 *  - 질문은 초보자의 '일상 언어'로 던진다.
 *  - 각 선택지는 백엔드에서 '아키텍처 규칙'으로 매핑된다(promptBuilder.js).
 *  - 모든 분기 질문에는 "잘 모르겠어요"가 있고, 선택 시 추천안을 설명과 함께 보여준다.
 *
 * 이 파일은 순수 데이터 + 분기(라우팅) 로직만 담는다.
 * 실제 프롬프트 문장 조립은 promptBuilder.js가 담당한다.
 * ------------------------------------------------------------------
 */

/**
 * 질문 객체 스키마
 *   id:        고유 식별자 (answers 맵의 key)
 *   step:      묶음 표시용 스텝 라벨
 *   type:      'text' | 'single'
 *   title:     화면에 크게 보이는 질문
 *   hint:      질문 아래 보조 설명(선택)
 *   placeholder: text 타입 입력창 placeholder
 *   options:   single 타입의 선택지 목록
 *     - value:  저장되는 값
 *     - label:  버튼에 보이는 짧은 문구
 *     - desc:   버튼 아래 한 줄 설명(일상 언어)
 *     - tag:    우측에 붙는 작은 배지(선택)
 *     - next:   이 선택 시 다음 질문 id(분기). 없으면 기본 순서.
 *   recommend: "잘 모르겠어요" 선택 시 추천할 option value
 *   next:      기본 다음 질문 id (옵션 next가 우선)
 */

export const STEPS = [
  { key: 'core', label: '서비스의 심장' },
  { key: 'scale', label: '접속 규모' },
  { key: 'data', label: '데이터 & 파일' },
  { key: 'security', label: '보안' },
  { key: 'arch', label: '아키텍처' },
];

export const QUESTIONS = [
  // ── Step 1. 서비스의 심장 ─────────────────────────────────────────
  {
    id: 'idea',
    step: 'core',
    type: 'text',
    title: '어떤 마법 같은 프로그램을 만들고 싶으신가요?',
    hint: '떠오르는 대로 편하게 적어주세요. 이 내용이 그대로 "기능 명세서"가 됩니다.',
    placeholder: '예) 엑셀 파일을 올리면 AI가 요약해서 표로 그려주는 웹사이트',
    required: true,
    next: 'stack',
  },

  {
    id: 'stack',
    step: 'core',
    type: 'single',
    title: '어떤 언어로 만들어 볼까요?',
    hint: '만들고 싶은 것에 따라 잘 맞는 도구가 달라요. 잘 모르겠다면 추천을 받아보세요.',
    options: [
      {
        value: 'python',
        label: '파이썬(Python)',
        desc: 'AI·데이터 분석·자동화에 강해요. 초보 입문에 가장 추천돼요.',
        tag: '추천',
      },
      {
        value: 'node',
        label: '자바스크립트 / 타입스크립트',
        desc: '웹 서비스, 실시간 앱, 화려한 프론트엔드에 강해요.',
      },
    ],
    recommend: 'python',
    recommendReason:
      '만들려는 게 "AI가 무언가를 분석/요약/생성"하는 쪽이면 파이썬이 라이브러리가 풍부하고 예제가 많아 가장 덜 막힙니다. 순수 웹 앱/실시간 채팅 위주면 자바스크립트가 유리해요.',
    next: 'users',
  },

  // ── Step 2. 접속 규모와 상태 관리 ────────────────────────────────
  {
    id: 'users',
    step: 'scale',
    type: 'single',
    title: '이 프로그램은 최종적으로 누가 쓰게 되나요?',
    hint: '여기서 "내 컴퓨터용 스크립트"로 남을지 "정식 웹 서비스"가 될지 운명이 갈려요.',
    options: [
      {
        value: 'solo',
        label: '나 혼자, 내 컴퓨터에서만 쓸 거예요',
        desc: '전역 변수를 편하게 써도 되고, 사용자 분리가 필요 없어요.',
      },
      {
        value: 'multi',
        label: '링크를 공유해서 여러 명이 같이 쓸 거예요',
        desc: '팀원·고객이 동시에 접속하는 상황. 사용자별 데이터가 섞이지 않게 해야 해요.',
        tag: '다중 접속',
        next: 'dataVisibility',
      },
    ],
    recommend: 'multi',
    recommendReason:
      '"언젠가 남한테 링크 보내서 보여줄 수도 있다"는 생각이 조금이라도 있으면 처음부터 여러 명(B)으로 설계하는 게 안전합니다. 나중에 혼자용 코드를 여럿용으로 고치는 건 사실상 재작성이에요.',
    next: 'fileUpload',
  },
  {
    id: 'dataVisibility',
    step: 'scale',
    type: 'single',
    title: '여러 명이 쓸 때, A가 입력한 걸 B가 봐도 되나요?',
    hint: '이 답에 따라 사용자별로 데이터를 격리할지, 다 같이 공유할지가 정해져요.',
    options: [
      {
        value: 'isolated',
        label: '절대 안 돼요! 각자 자기 것만 봐야 해요',
        desc: '로그인/작업 공간이 사람마다 독립돼요. (독립 세션)',
      },
      {
        value: 'shared',
        label: '다 같이 보는 게시판·대시보드예요',
        desc: '모두가 같은 데이터를 함께 보고 갱신해요. (공유 상태)',
      },
    ],
    recommend: 'isolated',
    recommendReason:
      '회원별 기록·업로드·결과처럼 "내 것"이 있는 서비스는 대부분 독립 세션(A)이 맞습니다. 순위표·공지·팀 대시보드처럼 "모두의 것"만 있으면 공유(B)예요. 헷갈리면 독립 세션이 사고를 훨씬 덜 냅니다.',
    next: 'fileUpload',
  },

  // ── Step 3. 데이터 저장과 파일 입출력 ────────────────────────────
  {
    id: 'fileUpload',
    step: 'data',
    type: 'single',
    title: '이미지·PDF·엑셀 같은 "파일"을 올리는 기능이 있나요?',
    options: [
      {
        value: 'no',
        label: '아니요, 파일 업로드는 없어요',
        desc: '텍스트/버튼 입력만으로 동작해요.',
      },
      {
        value: 'yes',
        label: '네, 사용자가 파일을 업로드해요',
        desc: '업로드한 파일이 섞이거나 서버 용량이 터지지 않게 해야 해요.',
        next: 'fileHandling',
      },
    ],
    recommend: 'no',
    recommendReason:
      '지금 당장 파일 올리는 기능이 명확히 없다면 "아니요"를 고르세요. 나중에 필요해지면 그때 추가해도 늦지 않습니다.',
    next: 'textPersist',
  },
  {
    id: 'fileHandling',
    step: 'data',
    type: 'single',
    title: '올라온 파일은 어떻게 처리할까요?',
    options: [
      {
        value: 'ephemeral',
        label: '분석·변환만 하고 바로 지울 거예요',
        desc: '결과만 필요하고 원본은 서버에 남길 필요 없어요. (일회성)',
        tag: '추천',
      },
      {
        value: 'persist',
        label: '나중에도 볼 수 있게 계속 보관할 거예요',
        desc: '갤러리·내 문서함처럼 다시 열어봐야 해요. (영구 보관)',
      },
    ],
    recommend: 'ephemeral',
    recommendReason:
      '"올려서 한 번 처리하고 결과만 보여주면 끝"이면 일회성(A)이 안전하고 비용도 안 듭니다. 사용자가 "내가 올린 목록을 다시 본다"가 핵심 기능일 때만 영구 보관(B)을 고르세요.',
    next: 'textPersist',
  },
  {
    id: 'textPersist',
    step: 'data',
    type: 'single',
    title: '입력한 기록(회원정보·글 등)이 영구적으로 남아야 하나요?',
    hint: '"내일 다시 켰을 때도 남아있어야 하는가?"로 생각하면 쉬워요.',
    options: [
      {
        value: 'memory',
        label: '아니요, 새로고침하면 사라져도 돼요',
        desc: '한 번 쓰고 마는 계산기·변환기 같은 도구예요. (임시 메모리)',
      },
      {
        value: 'db',
        label: '네, 내일 다시 접속해도 남아있어야 해요',
        desc: '회원가입·저장·히스토리가 있는 서비스예요. (데이터베이스)',
      },
    ],
    recommend: 'db',
    recommendReason:
      '로그인·저장·"내 기록" 중 하나라도 있으면 데이터베이스(B)가 필요합니다. 정말로 "결과 한 번 보여주고 끝"인 도구만 임시 메모리(A)로 충분해요.',
    next: 'secrets',
  },

  // ── Step 4. 외부 연동과 보안 ─────────────────────────────────────
  {
    id: 'secrets',
    step: 'security',
    type: 'single',
    title: '외부 API 키나 비밀번호가 들어가나요?',
    hint: 'OpenAI 키, 공공데이터 키, 결제 모듈, DB 비밀번호 같은 "남에게 보이면 안 되는 값" 말이에요.',
    options: [
      {
        value: 'no',
        label: '아니요, 그런 비밀 값은 없어요',
        desc: '외부 유료 서비스나 로그인 연동이 없어요.',
      },
      {
        value: 'yes',
        label: '네, 비밀 키가 들어가요',
        desc: 'GitHub에 실수로 올려서 요금 폭탄 맞는 사고를 막아야 해요.',
        tag: '요금 폭탄 주의',
        next: 'hosting',
      },
    ],
    recommend: 'yes',
    recommendReason:
      'AI(OpenAI 등)를 쓰거나, 로그인·결제·외부 데이터가 조금이라도 있으면 "네"입니다. 키가 코드에 박히면 공개 저장소에 올리는 순간 털립니다. 조금이라도 애매하면 "네"로 두고 안전장치를 챙기세요.',
    next: 'auth',
  },
  {
    id: 'hosting',
    step: 'security',
    type: 'single',
    title: '어디에 배포(호스팅)할 계획인가요?',
    hint: '만든 걸 "인터넷에 올려서 남이 접속하게" 하는 장소예요.',
    options: [
      {
        value: 'streamlit',
        label: 'Streamlit Community Cloud',
        desc: '파이썬 앱을 가장 쉽게 무료 배포하는 곳이에요.',
      },
      {
        value: 'cloud',
        label: '일반 클라우드 (Vercel · Render · AWS 등)',
        desc: '더 자유롭게 배포하는 표준적인 방식이에요.',
      },
    ],
    recommend: 'cloud',
    recommendReason:
      '파이썬 + Streamlit로 화면까지 한 번에 만드는 중이라면 Streamlit Cloud가 가장 간편합니다. 그 외(FastAPI 서버, JS 앱, 자유로운 구조)면 Vercel·Render 같은 일반 클라우드가 표준이에요. 헷갈리면 일반 클라우드(B)가 확장성 면에서 무난합니다.',
    next: 'auth',
  },

  // ── Step 5. 아키텍처 결정 ────────────────────────────────────────
  {
    id: 'auth',
    step: 'arch',
    type: 'single',
    title: '사용자가 "로그인"을 해야 하나요?',
    hint: '아이디·비밀번호나 구글 로그인으로 "누가 접속했는지" 구분이 필요한지의 질문이에요.',
    options: [
      {
        value: 'no',
        label: '아니요, 로그인 없이 바로 쓸 수 있어요',
        desc: '누구나 링크만 있으면 바로 사용해요.',
      },
      {
        value: 'yes',
        label: '네, 로그인한 사람만 쓰거나 "내 정보"가 있어요',
        desc: '회원가입·마이페이지·권한 구분이 필요해요.',
      },
    ],
    recommend: 'no',
    recommendReason:
      '초기 버전은 로그인 없이 시작하는 걸 추천합니다(A). 로그인은 만들 게 확 늘어나요. 다만 "각자 자기 데이터만 본다"를 앞에서 골랐다면 결국 로그인(B)이 필요해집니다.',
    next: 'ui',
  },
  {
    id: 'ui',
    step: 'arch',
    type: 'single',
    title: '눈에 보이는 "웹 화면(UI)"까지 한 번에 만들까요?',
    hint: '이 답이 코드의 최종 형태를 결정해요.',
    options: [
      {
        value: 'fullstack',
        label: '네, 화면까지 뚝딱 만들어 주세요',
        desc: '버튼·입력창이 보이는 완성된 웹앱을 원해요.',
        tag: '초보 추천',
      },
      {
        value: 'api',
        label: '아니요, 눈에 안 보이는 "서버(API)"만 필요해요',
        desc: '프론트엔드는 나중에 따로 붙일 거예요.',
      },
    ],
    recommend: 'fullstack',
    recommendReason:
      '혼자 빠르게 결과물을 보고 싶은 바이브 코딩 초보라면 화면까지 한 번에(A)가 정답입니다. "프론트/백을 분리해서 협업하거나 앱·웹 여러 곳에 붙일 거다"가 확실할 때만 서버만(B)을 고르세요.',
    next: null, // 마지막 질문
  },
];

/** id로 질문 찾기 */
export function getQuestion(id) {
  return QUESTIONS.find((q) => q.id === id) || null;
}

/**
 * 현재 질문 + 선택값을 받아 다음 질문 id를 계산한다.
 * 옵션의 next가 우선, 없으면 질문의 기본 next.
 */
export function resolveNext(question, selectedValue) {
  if (question.type === 'single') {
    const opt = question.options.find((o) => o.value === selectedValue);
    if (opt && opt.next) return opt.next;
  }
  return question.next || null;
}

/** 시작 질문 id */
export const START_ID = 'idea';
