/**
 * diagnose.js — "내 코드 진단" 도구.
 *
 * 이 파일에는 두 부분이 있다.
 *   1) scanCode(code) — 순수 함수. 정규식 휴리스틱으로 코드를 스캔해
 *      { score, findings } 를 반환한다. DOM/네트워크에 의존하지 않아
 *      Node(scripts/test.mjs)에서도 그대로 import 해 테스트할 수 있다.
 *   2) 화면 컨트롤러 — diagnose.html 의 textarea/버튼을 연결한다.
 *      브라우저에서만 실행되며, 코드는 어디로도 전송되지 않는다
 *      (fetch/XHR 없음 — 전부 브라우저 안에서 처리).
 *
 * ⚠️ 이건 정규식 기반 휴리스틱 스캔이다. 오탐/누락이 있을 수 있고,
 *    실제 보안 감사를 대체하지 않는다. UI에도 이 점을 명시한다.
 */

/* ---------- 룰 정의 ---------- */
// 각 룰: 코드에서 패턴을 찾아 findings 배열에 항목을 만든다.
// weight 는 해당 룰이 한 번이라도 걸렸을 때 100점에서 깎는 점수.
const RULES = [
  {
    id: 'secret',
    title: '하드코딩된 비밀 키로 보이는 문자열',
    severity: 'high',
    weight: 30,
    why: 'API 키·토큰을 코드에 그대로 적으면 저장소에 올리는 순간 전 세계에 공개되고, 나중에 지워도 Git 히스토리에 영원히 남습니다.',
    fix: '.env / st.secrets 같은 환경변수로 옮기고 .gitignore 에 추가하세요. 이미 커밋했던 키라면 지금 바로 폐기하고 재발급하세요.',
    patterns: [
      /\b(?:api[_-]?key|secret[_-]?key|access[_-]?key|auth[_-]?token|token|password|passwd)\s*[:=]\s*["'][A-Za-z0-9_\-/+=]{15,}["']/gi,
      /sk-[a-zA-Z0-9]{20,}/g,
      /OPENAI_API_KEY\s*=\s*["'][^"']+["']/gi,
      /\bAKIA[0-9A-Z]{16}\b/g,
    ],
  },
  {
    id: 'empty-except',
    title: '빈 예외 처리 (에러를 조용히 삼킴)',
    severity: 'medium',
    weight: 15,
    why: '에러를 아무 조치 없이 넘기면, 문제가 실제로 생겨도 로그 한 줄 없이 지나가 나중에 원인을 찾기 훨씬 어려워집니다.',
    fix: '최소한 로그는 남기세요 (logging.exception 등). 사용자에게도 실패했다는 걸 알려주는 편이 안전합니다.',
    patterns: [
      /except[^:\n]*:\s*(?:\r?\n\s*)?pass\b/g,
      /catch\s*\([^)]*\)\s*\{\s*\}/g,
    ],
  },
  {
    id: 'dangerous-fn',
    title: 'eval / exec 등 위험한 함수 사용',
    severity: 'high',
    weight: 20,
    why: '문자열을 코드로 그대로 실행하면, 그 문자열에 사용자 입력이 조금이라도 섞였을 때 임의 코드 실행으로 이어질 수 있습니다.',
    fix: '대부분의 경우 eval/exec 없이 원하는 동작을 구현할 수 있습니다. 꼭 필요하다면 입력값을 철저히 검증·제한하세요.',
    patterns: [/\beval\s*\(/g, /\bexec\s*\(/g, /\bnew\s+Function\s*\(/g],
  },
  {
    id: 'sql-injection',
    title: '문자열 조합으로 SQL을 만드는 패턴 (SQL 인젝션 의심)',
    severity: 'high',
    weight: 25,
    why: '사용자 입력을 문자열 그대로 SQL 쿼리에 끼워 넣으면, 입력값 조작만으로 DB 전체를 읽거나 지울 수 있습니다.',
    fix: '파라미터 바인딩(? 또는 :name)을 지원하는 쿼리 방식이나 ORM(SQLAlchemy 등)을 사용하세요.',
    patterns: [
      /f["'][^\n]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^\n]*\{[^\n]*\}[^\n]*["']/gi,
      /["']\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^"'+]*["']\s*\+/gi,
      /execute\s*\(\s*f["']/gi,
      /execute\s*\(\s*["'][^"']*%s[^"']*["']\s*%/gi,
    ],
  },
  {
    id: 'raw-filename',
    title: '업로드된 원본 파일명을 저장 경로에 그대로 사용',
    severity: 'medium',
    weight: 15,
    why: '사용자가 올린 파일명에는 경로 조작 문자(../)나 다른 사용자와 겹치는 이름이 들어올 수 있어, 덮어쓰기·경로 이탈 사고로 이어집니다.',
    fix: 'UUID 등으로 새 파일명을 만들어 저장하고, 원본 파일명은 메타데이터로만 별도 보관하세요.',
    patterns: [
      /open\s*\(\s*[\w.]*\.name\b/gi,
      /(?:os\.path\.join|path\.join)\([^)]*\.name\b[^)]*\)/gi,
    ],
  },
];

/* ---------- 유틸 ---------- */
function lineOf(code, index) {
  let line = 1;
  for (let i = 0; i < index && i < code.length; i++) {
    if (code[i] === '\n') line++;
  }
  return line;
}

function collectMatches(code, patterns) {
  const lines = new Set();
  let count = 0;
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code))) {
      count++;
      lines.add(lineOf(code, m.index));
      if (m[0].length === 0) re.lastIndex++; // 무한 루프 방지
    }
  }
  return { count, lines: [...lines].sort((a, b) => a - b) };
}

// Streamlit 맥락 전역 변수 휴리스틱: `global` 사용 근처(±250자)에
// `st.` 관련 코드가 없으면 "사용자 데이터가 전역에 섞였을 수 있다"고 의심한다.
// 완벽한 판별은 불가능하다 — 어디까지나 '의심' 수준의 힌트다.
function scanGlobalState(code) {
  const re = /global\s+\w+/g;
  const lines = new Set();
  let m;
  while ((m = re.exec(code))) {
    const start = Math.max(0, m.index - 250);
    const end = Math.min(code.length, m.index + 250);
    const window = code.slice(start, end);
    if (!/st\.\w/.test(window)) {
      lines.add(lineOf(code, m.index));
    }
  }
  return { count: lines.size, lines: [...lines].sort((a, b) => a - b) };
}

/**
 * scanCode(code) → { score, findings }
 * 순수 함수. DOM/네트워크 없음.
 */
export function scanCode(code) {
  const findings = [];
  const src = typeof code === 'string' ? code : '';

  for (const rule of RULES) {
    const { count, lines } = collectMatches(src, rule.patterns);
    if (count > 0) {
      findings.push({
        id: rule.id,
        title: rule.title,
        severity: rule.severity,
        why: rule.why,
        fix: rule.fix,
        count,
        lines,
      });
    }
  }

  // 전역 상태 휴리스틱 (별도 처리 — 조건부 룰)
  const globalState = scanGlobalState(src);
  if (globalState.count > 0) {
    findings.push({
      id: 'global-state',
      title: '전역 변수에 사용자별 데이터를 담고 있을 가능성 (휴리스틱)',
      severity: 'medium',
      why: '전역 변수는 모든 사용자가 공유합니다. 여러 명이 동시에 접속하는 앱(특히 Streamlit)에서는 한 사용자의 데이터가 다른 사용자 화면에 섞일 수 있습니다. (주변에 st. 관련 코드가 안 보여 확신도는 낮습니다.)',
      fix: 'Streamlit이라면 st.session_state, 다른 프레임워크라면 세션·요청 단위 상태로 옮기세요.',
      count: globalState.count,
      lines: globalState.lines,
    });
  }

  const WEIGHT_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r.weight]));
  WEIGHT_BY_ID['global-state'] = 15;

  let score = 100;
  for (const f of findings) {
    score -= WEIGHT_BY_ID[f.id] || 10;
  }
  score = Math.max(0, Math.min(100, score));

  return { score, findings };
}

/* ================================================================
   아래부터는 브라우저 화면 컨트롤러. Node(테스트)에서는 document가
   없으므로 이 블록은 실행되지 않는다.
   ================================================================ */
if (typeof document !== 'undefined') {
  const SEVERITY_LABEL = { high: '심각', medium: '주의' };

  function scoreClass(score) {
    if (score >= 80) return 'good';
    if (score >= 50) return 'warn';
    return 'danger';
  }

  function renderResult(result) {
    const box = document.getElementById('diagResult');
    if (!box) return;
    const { score, findings } = result;
    const cls = scoreClass(score);

    let html = `
      <div class="diag-disclaimer">
        이 결과는 정규식 기반 <b>휴리스틱 스캔</b>입니다. 오탐·누락이 있을 수 있고,
        실제 보안 감사나 코드 리뷰를 대체하지 않습니다. 참고용으로만 써주세요.
      </div>
      <div class="diag-score diag-score-${cls}">
        <div class="diag-score-num">${score}<span>/100</span></div>
        <div class="diag-score-desc">${
          findings.length === 0
            ? '눈에 띄는 패턴을 찾지 못했습니다.'
            : `${findings.length}개 패턴이 발견됐습니다.`
        }</div>
      </div>
    `;

    if (findings.length > 0) {
      html += '<div class="diag-findings">';
      for (const f of findings) {
        html += `
          <div class="diag-finding diag-finding-${f.severity}">
            <div class="diag-finding-head">
              <span class="badge ${f.severity === 'high' ? 'warn' : ''}">${SEVERITY_LABEL[f.severity] || '주의'}</span>
              <span class="diag-finding-title">${escapeHtml(f.title)}</span>
              <span class="diag-finding-count">${f.count}건 · 줄 ${f.lines.slice(0, 8).join(', ')}${f.lines.length > 8 ? ' 외' : ''}</span>
            </div>
            <p class="diag-finding-why"><b>왜 위험한가</b> — ${escapeHtml(f.why)}</p>
            <p class="diag-finding-fix"><b>어떻게 고치나</b> — ${escapeHtml(f.fix)}</p>
          </div>
        `;
      }
      html += '</div>';
    }

    html += `
      <div class="cta-inline diag-cta">
        <h3>발견된 문제들을 프로덕션 레벨로 고치고 싶다면</h3>
        <p>체크리스트에 답하면 이런 문제들을 미리 막는 규칙이 담긴 프롬프트를 만들어 드려요.</p>
        <a class="btn-hero" href="app.html">프롬프트 만들기 →</a>
      </div>
    `;

    box.innerHTML = html;
    box.hidden = false;
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('codeInput');
    const btn = document.getElementById('diagBtn');
    const resultBox = document.getElementById('diagResult');
    if (!textarea || !btn) return;

    btn.addEventListener('click', () => {
      const code = textarea.value || '';
      if (!code.trim()) {
        textarea.focus();
        return;
      }
      const result = scanCode(code);
      renderResult(result);
      if (resultBox) resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}
