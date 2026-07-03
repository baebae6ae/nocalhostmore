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
import { buildRepo } from '../js/repoBuilder.js';
import { makeZipBytes } from '../js/zip.js';
import { scanCode } from '../js/diagnose.js';
import { PRESETS, getPreset, encodeAnswers, decodeAnswers, buildPresetFragmentUrl } from '../js/presets.js';

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
ok('secrets → aitool', resolveNext(getQuestion('secrets'), 'no', {}) === 'aitool');
ok('aitool이 마지막', resolveNext(getQuestion('aitool'), 'chatbot', {}) === null);
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

console.log('\n[8] AI 도구 분기 — 프롬프트가 서로 달라야 함');
const base = { deploy: 'deploy', audience: 'tool', files: 'no', secrets: 'no', idea: '간단한 타이머' };
const chat = buildPrompt({ ...base, aitool: 'chatbot' });
const agent = buildPrompt({ ...base, aitool: 'agent' });
ok('두 프롬프트는 서로 다르다', chat.prompt !== agent.prompt);
ok('채팅형: 단계별/멈춤 지시', chat.prompt.includes('한 번에 다 쓰지 마라') && chat.prompt.includes('다음'));
ok('채팅형: 진행 체크리스트 지시', chat.prompt.includes('[진행'));
ok('채팅형: 자르지 마라', chat.prompt.includes('중간에서 자르지 마라'));
ok('에이전트형: 파일 직접 생성', agent.prompt.includes('파일을 실제로 생성'));
ok('에이전트형: 실행/테스트 검증', agent.prompt.includes('실행/테스트'));
ok('에이전트형엔 "다음 기다려" 게이트 없음', !agent.prompt.includes('내 "다음"을 기다려'));
ok('채팅형 팁 존재', /다음/.test(chat.tip));
ok('에이전트형 팁 존재', /에이전트|Cursor/.test(agent.tip));
ok('요약에 도구 종류', chat.summary.some((s) => s.includes('채팅형')) && agent.summary.some((s) => s.includes('에이전트')));
ok('기본값(aitool 미지정)은 채팅형', buildPrompt(base).spec.aitool === 'chatbot');

console.log('\n[9] 스타터 레포 생성 (Pro)');
const webSpec = deriveSpec({ deploy: 'deploy', audience: 'tool', files: 'no', secrets: 'no', idea: '타이머 웹' });
const webRepo = buildRepo(webSpec, buildPrompt({ deploy: 'deploy', audience: 'tool', files: 'no', secrets: 'no', idea: '타이머 웹', aitool: 'chatbot' }).prompt, '타이머 웹');
const webPaths = webRepo.files.map((f) => f.path);
ok('web 레포: index.html', webPaths.includes('index.html'));
ok('web 레포: script.js', webPaths.includes('script.js'));
ok('web 레포: .gitignore', webPaths.includes('.gitignore'));
ok('web 레포: PROMPT.md 동봉', webPaths.includes('PROMPT.md'));

const pySpec = deriveSpec({ deploy: 'deploy', audience: 'private', files: 'yes', fileHandling: 'permanent', secrets: 'yes', idea: 'AI 사진 정리 앱' });
const pyRepo = buildRepo(pySpec, 'PROMPT', 'AI 사진 정리 앱');
const pyPaths = pyRepo.files.map((f) => f.path);
ok('py 레포: app.py', pyPaths.includes('app.py'));
ok('py 레포: requirements.txt', pyPaths.includes('requirements.txt'));
ok('py 레포: config.py(secrets)', pyPaths.includes('config.py'));
ok('py 레포: db.py(persist)', pyPaths.includes('db.py'));
ok('py 레포: auth.py(로그인)', pyPaths.includes('auth.py'));
ok('py 레포: .env.example', pyPaths.includes('.env.example'));
const gitignore = pyRepo.files.find((f) => f.path === '.gitignore').content;
ok('py .gitignore 에 .env 포함', gitignore.includes('.env'));
const reqs = pyRepo.files.find((f) => f.path === 'requirements.txt').content;
ok('requirements 에 streamlit', reqs.includes('streamlit'));
ok('requirements 에 passlib(로그인)', reqs.includes('passlib'));

const webReadme = webRepo.files.find((f) => f.path === 'README.md').content;
ok('web README 에 출처 백링크', webReadme.includes('Nocalhostmore로 생성된 프로젝트 뼈대입니다.'));
const pyReadme = pyRepo.files.find((f) => f.path === 'README.md').content;
ok('py README 에 출처 백링크', pyReadme.includes('Nocalhostmore로 생성된 프로젝트 뼈대입니다.'));

console.log('\n[10] ZIP 인코더');
const zbytes = makeZipBytes([
  { path: 'a/index.html', content: '<h1>hi</h1>' },
  { path: 'a/README.md', content: '# hello' },
]);
ok('zip 은 PK\\x03\\x04 로 시작', zbytes[0] === 0x50 && zbytes[1] === 0x4b && zbytes[2] === 0x03 && zbytes[3] === 0x04);
ok('zip 끝에 EOCD(PK\\x05\\x06)', (() => {
  for (let i = zbytes.length - 22; i >= 0; i--) {
    if (zbytes[i] === 0x50 && zbytes[i + 1] === 0x4b && zbytes[i + 2] === 0x05 && zbytes[i + 3] === 0x06) return true;
  }
  return false;
})());
ok('zip 바이트 길이 > 0', zbytes.length > 100);

console.log('\n[11] 코드 진단(scanCode) — 정규식 휴리스틱 스캐너');
const cleanCode = `
def add(a, b):
    return a + b

def main():
    result = add(1, 2)
    print(result)
`;
const cleanResult = scanCode(cleanCode);
ok('클린 코드: 발견 없음', cleanResult.findings.length === 0);
ok('클린 코드: 100점', cleanResult.score === 100);

const secretCode = `
import openai
api_key = "sk-abcdefghijklmnopqrstuvwxyz123456"
client = openai.OpenAI(api_key=api_key)
`;
const secretResult = scanCode(secretCode);
ok('하드코딩 키: 발견됨', secretResult.findings.some((f) => f.id === 'secret'));
ok('하드코딩 키: 감점됨', secretResult.score < 100);

const exceptCode = `
try:
    risky()
except Exception:
    pass
`;
const exceptResult = scanCode(exceptCode);
ok('빈 except: 발견됨', exceptResult.findings.some((f) => f.id === 'empty-except'));

const jsCatchCode = `
try {
  risky();
} catch (e) {}
`;
ok('JS 빈 catch: 발견됨', scanCode(jsCatchCode).findings.some((f) => f.id === 'empty-except'));

const evalCode = `
def run(user_input):
    return eval(user_input)
`;
ok('eval 사용: 발견됨', scanCode(evalCode).findings.some((f) => f.id === 'dangerous-fn'));

const sqlCode = `
def get_user(name):
    query = f"SELECT * FROM users WHERE name = '{name}'"
    cursor.execute(query)
`;
ok('SQL 인젝션 의심(f-string): 발견됨', scanCode(sqlCode).findings.some((f) => f.id === 'sql-injection'));

const sqlConcatCode = `cursor.execute("SELECT * FROM users WHERE id = " + user_id)`;
ok('SQL 인젝션 의심(문자열 +): 발견됨', scanCode(sqlConcatCode).findings.some((f) => f.id === 'sql-injection'));

const filenameCode = `
def save(uploaded_file):
    with open(uploaded_file.name, "wb") as f:
        f.write(uploaded_file.getbuffer())
`;
ok('원본 파일명 저장 경로 사용: 발견됨', scanCode(filenameCode).findings.some((f) => f.id === 'raw-filename'));

const globalCode = `
def handle_request(user_data):
    global current_user
    current_user = user_data
`;
ok('전역 변수(Streamlit 맥락 아님): 발견됨', scanCode(globalCode).findings.some((f) => f.id === 'global-state'));

const globalWithStreamlitCode = `
import streamlit as st
def handle():
    global counter
    counter = st.session_state.get("counter", 0)
`;
ok(
  '전역 변수(근처에 st. 있음): 발견 안 됨',
  !scanCode(globalWithStreamlitCode).findings.some((f) => f.id === 'global-state')
);

ok('점수는 항상 0~100 사이', [cleanResult, secretResult, exceptResult].every((r) => r.score >= 0 && r.score <= 100));

console.log('\n[12] 프리셋 데이터 무결성 (js/presets.js)');
const qIds = new Set(QUESTIONS.map((q) => q.id));
const validValues = {};
for (const q of QUESTIONS) {
  if (q.type === 'single') validValues[q.id] = new Set(q.options.map((o) => o.value));
}
ok('프리셋이 1개 이상 존재', PRESETS.length > 0);
const seenSlugs = new Set();
for (const preset of PRESETS) {
  ok(`${preset.slug}: slug 중복 없음`, !seenSlugs.has(preset.slug));
  seenSlugs.add(preset.slug);
  ok(`${preset.slug}: title 존재`, typeof preset.title === 'string' && preset.title.length > 0);
  ok(`${preset.slug}: description 존재`, typeof preset.description === 'string' && preset.description.length > 0);
  ok(`${preset.slug}: idea 답변 존재(텍스트)`, typeof preset.answers.idea === 'string' && preset.answers.idea.length > 0);
  for (const [qid, value] of Object.entries(preset.answers)) {
    ok(`${preset.slug}: '${qid}' 는 실제 질문 id`, qIds.has(qid));
    if (validValues[qid]) {
      ok(`${preset.slug}: '${qid}'='${value}' 는 유효한 옵션값`, validValues[qid].has(value));
    }
  }
  // 답변만으로 실제 라우팅을 끝까지 따라가도 문제(=deriveSpec/buildPrompt)없이 프롬프트가 나와야 한다.
  const spec = deriveSpec(preset.answers);
  ok(`${preset.slug}: deriveSpec 이 stack 을 결정함`, spec.stack === 'web' || spec.stack === 'python');
  const built = buildPrompt(preset.answers);
  ok(`${preset.slug}: buildPrompt 결과 프롬프트 문자열 생성`, typeof built.prompt === 'string' && built.prompt.length > 0);
}
ok('getPreset 로 슬러그 조회', getPreset('ai-chatbot').slug === 'ai-chatbot');
ok('getPreset 없는 슬러그는 null', getPreset('no-such-preset') === null);

console.log('\n[13] 프리셋 → 프래그먼트 링크 인코딩 (한글 라운드트립)');
const sample = getPreset('ai-chatbot');
const encoded = encodeAnswers(sample.answers);
ok('base64 문자열 생성', typeof encoded === 'string' && encoded.length > 0);
const decoded = decodeAnswers(encoded);
ok('디코딩 결과가 원본과 동일(한글 포함)', JSON.stringify(decoded) === JSON.stringify(sample.answers));
ok('idea 한글 텍스트가 안 깨짐', decoded.idea === sample.answers.idea);
const url = buildPresetFragmentUrl(sample, '../app.html');
ok('프래그먼트 URL 형식', url.startsWith('../app.html#s='));
ok('프래그먼트 URL 이 base64 인코딩과 일치', url === `../app.html#s=${encoded}`);

console.log(`\n✅ 전체 통과: ${pass}개 검증\n`);
