/**
 * repoBuilder.js
 * ------------------------------------------------------------------
 * spec(유도된 아키텍처) + 생성 프롬프트 → "스타터 레포" 파일 목록.
 * 가드레일이 이미 반영된 실행 가능한 뼈대를 만든다. (프리미엄 핵심 가치)
 *
 * buildRepo(spec, prompt, ideaText) → { projectName, files: [{path, content}] }
 * ------------------------------------------------------------------
 */

function slugify(s) {
  const base = (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  return base || 'my-app';
}

export function buildRepo(spec, prompt, ideaText) {
  const projectName = slugify(ideaText);
  const files = [];
  const add = (path, content) => files.push({ path, content: content.replace(/\n$/, '') + '\n' });

  // 모든 레포에 스펙(마스터 프롬프트)을 동봉 — 이 레포가 왜 이렇게 생겼는지 기록
  add('PROMPT.md', `# 이 프로젝트의 설계 명령서\n\n> Nocalhostmore가 생성한 프로덕션 가드레일 프롬프트입니다.\n> AI 도구에 이어서 작업을 요청할 때 이 내용을 기준으로 삼으세요.\n\n\`\`\`\n${prompt}\n\`\`\`\n`);

  if (spec.stack === 'web') {
    buildWebRepo(spec, add, ideaText);
  } else {
    buildPythonRepo(spec, add, ideaText);
  }

  return { projectName, files };
}

/* ============================================================
   프론트엔드 전용(무료 배포) 스타터
   ============================================================ */
function buildWebRepo(spec, add, idea) {
  add(
    'index.html',
    `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(idea || 'My App')}</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main class="container">
      <h1>${escapeHtml(idea || 'My App')}</h1>
      <!-- TODO: 여기에 화면을 만드세요. 접근성을 위해 시맨틱 태그와 label을 사용하세요. -->
      <p class="hint">Nocalhostmore 스타터 · 프론트엔드 전용(서버 없음)</p>
    </main>
    <script src="script.js"></script>
  </body>
</html>`
  );

  add(
    'style.css',
    `/* 최소 리셋 + 반응형 뼈대 */
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", sans-serif;
  line-height: 1.6; color: #111; background: #fafafa;
}
.container { max-width: 720px; margin: 0 auto; padding: 24px 16px; }
h1 { font-size: clamp(20px, 5vw, 32px); }
.hint { color: #888; font-size: 13px; margin-top: 12px; }`
  );

  const storage =
    spec.persist === 'localfile'
      ? `
// 이 앱은 데이터를 사용자의 브라우저(localStorage)에만 저장합니다(무료).
// 주의: 다른 기기/브라우저에는 공유되지 않으며, 민감정보는 저장하지 마세요.
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
};
`
      : '';

  add(
    'script.js',
    `'use strict';
${storage}
// 보안: 프론트엔드 코드는 누구나 소스를 볼 수 있습니다.
//    어떤 비밀 키/비밀번호도 이 파일에 넣지 마세요.

// 사용자 입력은 항상 검증하고, 화면에 넣을 땐 textContent 를 쓰세요(innerHTML 지양 → XSS 방지).
function setText(el, value) { el.textContent = String(value); }

document.addEventListener('DOMContentLoaded', () => {
  // TODO: 앱 로직을 여기에 작성하세요.
});`
  );

  add(
    'README.md',
    `# ${idea || 'My App'}

Nocalhostmore가 만든 **프론트엔드 전용** 스타터입니다. 서버가 필요 없어 **무료로 배포**할 수 있습니다.

## 실행
브라우저로 \`index.html\` 을 바로 열거나, 로컬 서버로 확인:
\`\`\`bash
npx serve .
\`\`\`

## 배포 (무료)
- Vercel / Netlify: 이 폴더를 그대로 연결
- GitHub Pages: 저장소 push 후 Pages 활성화

## 규칙(가드레일)
- 비밀 키를 코드에 넣지 마세요(프론트엔드는 소스가 공개됩니다).
- 사용자 입력은 검증하고 \`textContent\` 로 출력하세요(XSS 방지).
`
  );

  add('.gitignore', gitignoreWeb());
}

/* ============================================================
   Python + Streamlit 스타터
   ============================================================ */
function buildPythonRepo(spec, add, idea) {
  const req = ['streamlit>=1.30'];
  if (spec.persist === 'db' || spec.persist === 'localfile') req.push('SQLAlchemy>=2.0');
  if (spec.persist === 'db') req.push('psycopg2-binary  # 운영 PostgreSQL용');
  if (spec.secrets) req.push('python-dotenv>=1.0');
  if (spec.auth) req.push('passlib[bcrypt]>=1.7');
  if (spec.filePermanent) req.push('boto3  # S3 등 오브젝트 스토리지');
  add('requirements.txt', req.join('\n'));

  // app.py 조립
  const py = [];
  py.push('import streamlit as st');
  if (spec.files) py.push('import os, uuid');
  if (spec.secrets) py.push('from config import get_secret');
  if (spec.persist === 'db' || spec.persist === 'localfile') py.push('from db import get_session, init_db');
  if (spec.auth) py.push('from auth import check_login');
  py.push('');
  py.push(`st.set_page_config(page_title=${jsonStr(idea || 'My App')})`);
  py.push('');
  py.push('# ── 사용자별 상태는 반드시 st.session_state 에 저장 (전역 변수 금지) ──');
  py.push('if "initialized" not in st.session_state:');
  py.push('    st.session_state.initialized = True');
  py.push('    # TODO: 사용자별 초기 상태를 여기서 설정하세요.');
  py.push('');

  if (spec.persist === 'db' || spec.persist === 'localfile') {
    py.push('init_db()  # 테이블 준비');
    py.push('');
  }

  if (spec.auth) {
    py.push('# ── 로그인 (개인 데이터 보호) ──');
    py.push('user = check_login()  # 로그인 안 되어 있으면 폼을 그리고 st.stop()');
    py.push('st.sidebar.write(f"👤 {user}")');
    py.push('');
  }

  py.push(`st.title(${jsonStr(idea || 'My App')})`);
  py.push('');

  if (spec.secrets) {
    py.push('# ── 비밀 키: 코드에 하드코딩 금지. get_secret 로만 불러오기 ──');
    py.push('# api_key = get_secret("OPENAI_API_KEY")');
    py.push('');
  }

  if (spec.files) {
    py.push('# ── 파일 업로드 ──');
    py.push('uploaded = st.file_uploader("파일을 올려주세요")');
    py.push('if uploaded is not None:');
    py.push('    # 원본 파일명을 신뢰하지 말고 UUID 로 임시 저장');
    py.push('    tmp_path = f"/tmp/{uuid.uuid4().hex}"');
    py.push('    try:');
    py.push('        with open(tmp_path, "wb") as f:');
    py.push('            f.write(uploaded.getbuffer())');
    py.push('        # TODO: 여기서 파일을 분석/변환하세요.');
    if (spec.filePermanent) {
      py.push('        # 영구 보관이면 S3 등으로 업로드하고 user_id 로 경로를 격리하세요.');
    }
    py.push('    finally:');
    py.push('        # 성공/실패와 무관하게 임시 파일 강제 삭제');
    py.push('        if os.path.exists(tmp_path):');
    py.push('            os.remove(tmp_path)');
    py.push('');
  }

  py.push('# TODO: 핵심 기능을 여기에 구현하세요.');
  add('app.py', py.join('\n'));

  // config.py (secrets)
  if (spec.secrets) {
    add(
      'config.py',
      `"""비밀 값 로딩. 하드코딩 금지 — Streamlit Cloud는 st.secrets, 그 외는 .env(os.environ)."""
import os
import streamlit as st
from dotenv import load_dotenv

load_dotenv()  # 로컬 개발용 .env 로드(있으면)


def get_secret(key: str) -> str:
    # 1) Streamlit Community Cloud: st.secrets
    try:
        if key in st.secrets:
            return st.secrets[key]
    except Exception:
        pass
    # 2) 그 외 클라우드: 환경변수(.env)
    val = os.environ.get(key)
    if not val:
        raise RuntimeError(f"비밀 값 '{key}' 이(가) 설정되지 않았습니다. .env 또는 st.secrets 를 확인하세요.")
    return val
`
    );
    add(
      '.env.example',
      `# 실제 값을 넣은 뒤 이 파일을 .env 로 복사하세요. (.env 는 절대 커밋하지 마세요!)\nOPENAI_API_KEY=\n`
    );
    add(
      '.streamlit/secrets.toml.example',
      `# Streamlit Community Cloud 배포 시 대시보드의 Secrets 에 입력하세요.\n# 로컬 테스트는 이 파일을 secrets.toml 로 복사해 사용(커밋 금지).\nOPENAI_API_KEY = ""\n`
    );
  }

  // db.py
  if (spec.persist === 'db' || spec.persist === 'localfile') {
    const url =
      spec.persist === 'db'
        ? 'os.environ.get("DATABASE_URL", "sqlite:///app.db")  # 개발 SQLite → 운영 PostgreSQL'
        : '"sqlite:///app.db"  # 로컬 전용, 무료';
    add(
      'db.py',
      `"""SQLAlchemy 뼈대. raw SQL 문자열 조합 금지(인젝션 위험) — ORM 을 쓰세요."""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = ${url}
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine, autoflush=False)
Base = declarative_base()


# 예시 모델 — 필요에 맞게 바꾸세요.
class Item(Base):
    __tablename__ = "items"
    from sqlalchemy import Column, Integer, String
    id = Column(Integer, primary_key=True)
    ${spec.auth ? 'owner_id = Column(String, index=True)  # 소유자 — 조회 시 본인 것만 필터링!\n    ' : ''}text = Column(String)


def init_db():
    Base.metadata.create_all(engine)


def get_session():
    return SessionLocal()
`
    );
  }

  // auth.py
  if (spec.auth) {
    add(
      'auth.py',
      `"""아주 단순한 로그인 뼈대. 비밀번호는 절대 평문 저장 금지 — bcrypt 해싱."""
import streamlit as st
from passlib.hash import bcrypt

# TODO: 실제로는 사용자 정보를 DB(db.py)에 저장하세요. 아래는 데모용 메모리 저장소입니다.
_USERS = {}  # {username: password_hash}


def _register(username, password):
    _USERS[username] = bcrypt.hash(password)


def check_login():
    """로그인돼 있으면 username 반환, 아니면 폼을 그리고 실행을 멈춘다."""
    if st.session_state.get("user"):
        return st.session_state["user"]

    st.subheader("로그인")
    username = st.text_input("아이디")
    password = st.text_input("비밀번호", type="password")
    if st.button("로그인 / 가입"):
        if username in _USERS:
            if bcrypt.verify(password, _USERS[username]):
                st.session_state["user"] = username
                st.rerun()
            else:
                st.error("비밀번호가 틀렸습니다.")
        elif username and password:
            _register(username, password)
            st.session_state["user"] = username
            st.rerun()
    st.stop()
`
    );
  }

  add('.gitignore', gitignorePython(spec));

  add(
    'README.md',
    `# ${idea || 'My App'}

Nocalhostmore가 만든 **Python + Streamlit** 스타터입니다.

## 실행
\`\`\`bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
streamlit run app.py
\`\`\`
${
  spec.secrets
    ? `\n## 비밀 키\n\`.env.example\` 을 \`.env\` 로 복사해 값을 채우세요. **\`.env\` 는 절대 커밋하지 마세요.**\nStreamlit Cloud 배포 시에는 대시보드의 Secrets 에 넣습니다.\n`
    : ''
}
## 규칙(가드레일)
- 사용자별 상태는 \`st.session_state\` 에만 저장(전역 변수 금지).
${spec.auth ? '- 비밀번호는 bcrypt 해싱, 조회는 본인(owner) 데이터만.\n' : ''}${spec.files ? '- 업로드 파일은 UUID 이름 + finally 에서 강제 삭제.\n' : ''}${spec.persist === 'db' ? '- DB는 SQLAlchemy ORM, raw SQL 금지.\n' : ''}`
  );
}

/* ---------- 공통 조각 ---------- */
function gitignoreWeb() {
  return `node_modules/\n.DS_Store\n*.log\ndist/\n`;
}
function gitignorePython(spec) {
  let g = `__pycache__/\n*.pyc\n.venv/\nvenv/\n.DS_Store\n*.db\n`;
  if (spec.secrets) g += `.env\n.streamlit/secrets.toml\n`;
  return g;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function jsonStr(s) {
  return JSON.stringify(String(s));
}
