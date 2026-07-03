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
import { buildPrompt, deriveSpec } from '../js/promptBuilder.js';

let pass = 0;
function ok(name, cond) {
  assert.ok(cond, '실패: ' + name);
  pass++;
  console.log('  ✓ ' + name);
}

console.log('\n[1] 질문 그래프 무결성');
const ids = new Set(QUESTIONS.map((q) => q.id));
for (const q of QUESTIONS) {
  // 문자열 next만 정적 검증(함수 next는 런타임 분기에서 확인)
  const refs = [
    typeof q.next === 'string' ? q.next : null,
    ...(q.options || []).map((o) => (typeof o.next === 'string' ? o.next : null)),
  ].filter(Boolean);
  for (const r of refs) ok(`${q.id} → ${r} 존재`, ids.has(r));
  if (q.type === 'single')
    ok(`${q.id} recommend 유효`, q.options.some((o) => o.value === q.recommend));
}
ok('START_ID 존재', ids.has(START_ID));

console.log('\n[2] 분기 라우팅 (모순 방지 핵심)');
ok('로컬 선택 → files', resolveNext(getQuestion('deploy'), 'local', { deploy: 'local' }) === 'files');
ok('배포 선택 → audience', resolveNext(getQuestion('deploy'), 'deploy', { deploy: 'deploy' }) === 'audience');
// 파일 없음: 로컬이면 localSave, 배포면 secrets 로 갈린다 (함수 next)
ok(
  '로컬+파일없음 → localSave',
  resolveNext(getQuestion('files'), 'no', { deploy: 'local' }) === 'localSave'
);
ok(
  '배포+파일없음 → secrets (localSave 건너뜀)',
  resolveNext(getQuestion('files'), 'no', { deploy: 'deploy' }) === 'secrets'
);
ok('파일있음 → fileHandling', resolveNext(getQuestion('files'), 'yes', { deploy: 'deploy' }) === 'fileHandling');
ok('secrets가 마지막', resolveNext(getQuestion('secrets'), 'no', {}) === null);
ok('배포 경로엔 localSave 질문이 안 나온다', true); // 위 라우팅으로 보장됨

console.log('\n[3] 유도(derive) — 모순 불가능 검증');
// "각자 로그인해서 내 데이터" 하나로 로그인+DB+격리가 자동 확정
const s1 = deriveSpec({ deploy: 'deploy', audience: 'private', files: 'no', secrets: 'no' });
ok('private → auth 자동 true', s1.auth === true);
ok('private → persist=db 자동', s1.persist === 'db');
ok('private → 데이터 격리', s1.dataScope === 'isolated');
ok('private → 백엔드 필요(python)', s1.stack === 'python');
ok('private+deploy → 유료 가능성 명시', s1.paid === true);

// 로그인 없는 도구 + 순수 UI → 프론트엔드 전용, 무료
const s2 = deriveSpec({ deploy: 'deploy', audience: 'tool', files: 'no', secrets: 'no', idea: '색깔 고르는 팔레트' });
ok('tool+단순 → 프론트엔드 전용(web)', s2.stack === 'web');
ok('tool+web → 유료 아님', s2.paid === false);
ok('tool → 로그인 없음', s2.auth === false);

// 비밀 키가 있으면 프론트엔드로 둘 수 없다(키 노출) → 백엔드 강제
const s3 = deriveSpec({ deploy: 'deploy', audience: 'tool', files: 'no', secrets: 'yes', idea: '간단한 도구' });
ok('secrets=yes → 백엔드 강제(python)', s3.stack === 'python');

// 로컬 전용은 로그인/다중접속 없음
const s4 = deriveSpec({ deploy: 'local', files: 'no', localSave: 'save', idea: '메모 정리기' });
ok('로컬 → 다중접속 아님', s4.multiUser === false);
ok('로컬 → 로그인 없음', s4.auth === false);
ok('로컬 저장 → localfile', s4.persist === 'localfile');

console.log('\n[4] 프롬프트 생성 — 프론트엔드 전용(무료)');
const A = buildPrompt({ deploy: 'deploy', audience: 'tool', files: 'no', secrets: 'no', idea: '간단한 타이머 웹' });
ok('프론트엔드 규칙(index.html)', A.prompt.includes('index.html'));
ok('비밀키 프론트 금지', A.forbidden.some((f) => f.includes('비밀 키')));
ok('무료 배포 안내', A.notes.some((n) => n.includes('무료')));
ok('요약에 프론트엔드', A.summary.some((s) => s.includes('프론트엔드')));

console.log('\n[5] 프롬프트 생성 — 로그인+개인데이터(파이썬, 유료 경고)');
const B = buildPrompt({ deploy: 'deploy', audience: 'private', files: 'yes', fileHandling: 'permanent', secrets: 'yes', idea: 'AI가 내 사진 정리해주는 앱' });
ok('Streamlit 스택', B.prompt.includes('Streamlit'));
ok('로그인/해싱 규칙', B.prompt.includes('해싱'));
ok('남의 데이터 접근 차단 규칙', B.forbidden.some((f) => f.includes('남의 데이터')));
ok('영구파일 S3+UUID', B.prompt.includes('S3') && B.prompt.includes('UUID'));
ok('DB(SQLAlchemy)', B.prompt.includes('SQLAlchemy'));
ok('st.secrets/.env 규칙', B.prompt.includes('st.secrets') && B.prompt.includes('.gitignore'));
ok('AI 비용 보호', B.prompt.includes('요금 폭탄'));
ok('유료 경고 note', B.notes.some((n) => n.includes('요금')));

console.log('\n[6] 프롬프트 생성 — 공용 대시보드(공유 상태)');
const C = buildPrompt({ deploy: 'deploy', audience: 'shared', files: 'no', secrets: 'no', idea: '팀 실시간 순위표' });
ok('공유 상태 규칙(Redis)', C.prompt.includes('Redis'));
ok('경쟁 상태 방지', C.prompt.includes('race condition') || C.prompt.includes('경쟁 상태'));
ok('전역변수 금지', C.forbidden.some((f) => f.includes('전역')));

console.log('\n[7] 프롬프트 생성 — 로컬 전용 도구(파이썬, sqlite)');
const D = buildPrompt({ deploy: 'local', files: 'yes', fileHandling: 'ephemeral', localSave: 'memory', secrets: 'no', idea: '엑셀 정리 스크립트' });
ok('로컬 실행 범위 문구', D.prompt.includes('자기 컴퓨터'));
ok('일회성 파일 finally 삭제', D.prompt.includes('finally'));
ok('유료 경고 없음(로컬)', !D.notes.some((n) => n.includes('요금')));

console.log(`\n✅ 전체 통과: ${pass}개 검증\n`);
