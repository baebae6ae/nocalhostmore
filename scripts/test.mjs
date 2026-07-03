/**
 * test.mjs — 순수 로직 스모크 테스트 (DOM 불필요)
 * 실행: npm test  또는  node scripts/test.mjs
 */
import assert from 'node:assert';
import {
  QUESTIONS,
  getQuestion,
  resolveNext,
  START_ID,
} from '../js/questions.js';
import { buildPrompt } from '../js/promptBuilder.js';

let pass = 0;
function ok(name, cond) {
  assert.ok(cond, '실패: ' + name);
  pass++;
  console.log('  ✓ ' + name);
}

console.log('\n[1] 질문 그래프 무결성');
// 모든 next 참조가 실제 질문을 가리키는지
const ids = new Set(QUESTIONS.map((q) => q.id));
for (const q of QUESTIONS) {
  const refs = [q.next, ...(q.options || []).map((o) => o.next)].filter(Boolean);
  for (const r of refs) {
    ok(`${q.id} → ${r} 존재`, ids.has(r));
  }
  if (q.type === 'single') {
    ok(`${q.id} recommend 유효`, q.options.some((o) => o.value === q.recommend));
  }
}
ok('START_ID 존재', ids.has(START_ID));

console.log('\n[2] 분기 라우팅');
ok('solo 선택 시 dataVisibility 건너뜀', resolveNext(getQuestion('users'), 'solo') === 'fileUpload');
ok('multi 선택 시 dataVisibility 로', resolveNext(getQuestion('users'), 'multi') === 'dataVisibility');
ok('파일 없음 → textPersist', resolveNext(getQuestion('fileUpload'), 'no') === 'textPersist');
ok('파일 있음 → fileHandling', resolveNext(getQuestion('fileUpload'), 'yes') === 'fileHandling');
ok('secrets 있음 → hosting', resolveNext(getQuestion('secrets'), 'yes') === 'hosting');
ok('마지막 질문 ui next=null', resolveNext(getQuestion('ui'), 'fullstack') === null);

console.log('\n[3] 프롬프트 생성 — 다중/격리/일회성/DB/클라우드/API (파이썬)');
const A = buildPrompt({
  idea: '엑셀 올리면 AI가 요약해서 표로 그려주는 웹사이트',
  stack: 'python',
  users: 'multi',
  dataVisibility: 'isolated',
  fileUpload: 'yes',
  fileHandling: 'ephemeral',
  textPersist: 'db',
  secrets: 'yes',
  hosting: 'cloud',
  auth: 'no',
  ui: 'fullstack',
});
ok('아이디어 박제됨', A.prompt.includes('엑셀 올리면 AI가 요약'));
ok('st.session_state 규칙 주입', A.prompt.includes('st.session_state'));
ok('전역 변수 금지 규칙', A.forbidden.some((f) => f.includes('global')));
ok('UUID 임시파일 규칙', A.prompt.includes('UUID'));
ok('finally 삭제 규칙', A.prompt.includes('finally'));
ok('SQLAlchemy 규칙', A.prompt.includes('SQLAlchemy'));
ok('.env gitignore 규칙', A.prompt.includes('.gitignore'));
ok('AI 비용 보호 규칙(요약 언급)', A.prompt.includes('요금 폭탄'));
ok('Streamlit 풀스택', A.prompt.includes('Streamlit'));
ok('요약 칩 존재', A.summary.length >= 5);

console.log('\n[4] 프롬프트 생성 — 솔로/Streamlit secrets/API없이 (파이썬)');
const B = buildPrompt({
  idea: '내 PC에서 폴더 정리하는 스크립트',
  stack: 'python',
  users: 'solo',
  fileUpload: 'no',
  textPersist: 'memory',
  secrets: 'yes',
  hosting: 'streamlit',
  auth: 'no',
  ui: 'fullstack',
});
ok('솔로 전역변수 허용 문구', B.prompt.includes('전역 변수 사용을 허용'));
ok('st.secrets 규칙', B.prompt.includes('st.secrets'));
ok('하드코딩 금지', B.forbidden.some((f) => f.includes('하드코딩')));

console.log('\n[5] 프롬프트 생성 — Node/공유상태/영구파일/로그인/API서버');
const C = buildPrompt({
  idea: '팀이 같이 보는 실시간 대시보드',
  stack: 'node',
  users: 'multi',
  dataVisibility: 'shared',
  fileUpload: 'yes',
  fileHandling: 'persist',
  textPersist: 'db',
  secrets: 'no',
  auth: 'yes',
  ui: 'api',
});
ok('공유 상태 규칙(Redis 언급)', C.prompt.includes('Redis'));
ok('영구 보관 S3 규칙', C.prompt.includes('S3'));
ok('Prisma ORM(Node)', C.prompt.includes('Prisma'));
ok('비밀번호 해싱 규칙', C.forbidden.some((f) => f.includes('평문')));
ok('FastAPI 아님(Express)', C.prompt.includes('Express'));

console.log(`\n✅ 전체 통과: ${pass}개 검증\n`);
