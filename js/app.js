/**
 * app.js — 위저드 컨트롤러
 * 질문을 한 화면씩 렌더링하고, 답변을 모아 마스터 프롬프트를 생성한다.
 */
import {
  QUESTIONS,
  getQuestion,
  resolveNext,
  START_ID,
  STEP_LABELS,
} from './questions.js';
import { buildPrompt } from './promptBuilder.js';
import { encodeAnswers, decodeAnswers } from './share.js';

const screen = document.getElementById('screen');
const progressBar = document.getElementById('progressBar');
const backBtn = document.getElementById('backBtn');
const stepLabel = document.getElementById('stepLabel');

// 확장 팝업(chrome-extension://...)은 주소창이 없어 링크 공유가 무의미하다.
// 웹(app.html, http/https)에서만 공유 링크 관련 기능을 노출한다.
function isWebContext() {
  return typeof location !== 'undefined' && location.protocol !== 'chrome-extension:';
}

const state = {
  answers: {},
  history: [], // 방문한 질문 id 스택 (뒤로가기용)
  currentId: START_ID,
  finished: false,
};

/* ---------- 진행률 계산 ---------- */
function updateProgress() {
  if (state.finished) {
    progressBar.style.width = '100%';
    progressBar.setAttribute('aria-valuenow', '100');
    stepLabel.textContent = '완료';
    // 결과 화면에서도 직전 답을 고칠 수 있게 '이전'은 남겨둔다.
    backBtn.hidden = state.history.length === 0;
    return;
  }
  // 방문 경로 기준 대략적 진행률 (총 질문 수는 분기로 가변이라 근사치)
  const answeredCount = state.history.length;
  const est = Math.min(0.95, answeredCount / QUESTIONS.length);
  const pct = Math.max(0.06, est) * 100;
  progressBar.style.width = `${pct}%`;
  progressBar.setAttribute('aria-valuenow', String(Math.round(pct)));
  const q = getQuestion(state.currentId);
  stepLabel.textContent = q ? q.step ? labelForStep(q.step) : '' : '';
  backBtn.hidden = state.history.length === 0;
}

function labelForStep(key) {
  return STEP_LABELS[key] || '';
}

/* ---------- 렌더링 ---------- */
function render() {
  const q = getQuestion(state.currentId);
  if (!q) return;
  screen.innerHTML = '';
  screen.scrollTop = 0;

  const titleId = `q-title-${q.id}`;
  const title = el('h2', 'q-title', q.title);
  title.id = titleId;
  screen.appendChild(title);
  if (q.hint) screen.appendChild(el('p', 'q-hint', q.hint));

  if (q.type === 'text') {
    renderText(q);
  } else {
    renderSingle(q, titleId);
  }
  updateProgress();
}

function renderText(q) {
  const ta = document.createElement('textarea');
  ta.className = 'q-textarea';
  ta.placeholder = q.placeholder || '';
  ta.value = state.answers[q.id] || '';
  screen.appendChild(ta);

  const next = document.createElement('button');
  next.className = 'btn-primary';
  next.textContent = '다음 →';
  const sync = () => {
    next.disabled = q.required && ta.value.trim().length === 0;
  };
  ta.addEventListener('input', sync);
  sync();
  next.addEventListener('click', () => {
    state.answers[q.id] = ta.value.trim();
    goNext(q, ta.value.trim());
  });
  screen.appendChild(next);

  // 모바일에서 즉시 focus()하면 키보드가 바로 올라와 히어로/타이틀을 가린다.
  // 좁은 화면에서는 약간 지연시켜 화면을 먼저 보여준 뒤 포커스한다.
  if (typeof window !== 'undefined' && window.innerWidth < 480) {
    setTimeout(() => ta.focus(), 300);
  } else {
    ta.focus();
  }
}

function renderSingle(q, titleId) {
  const wrap = el('div', 'options');
  wrap.setAttribute('role', 'radiogroup');
  if (titleId) wrap.setAttribute('aria-labelledby', titleId);
  q.options.forEach((opt) => {
    wrap.appendChild(buildOption(q, opt, false));
  });
  screen.appendChild(wrap);

  // "잘 모르겠어요"
  const unsure = document.createElement('button');
  unsure.className = 'unsure-btn';
  unsure.textContent = '잘 모르겠어요 — 추천 보기';
  unsure.addEventListener('click', () => showRecommendation(q, wrap, unsure));
  screen.appendChild(unsure);
}

function buildOption(q, opt, isRecommended) {
  const btn = document.createElement('button');
  btn.className = 'option' + (isRecommended ? ' recommended' : '');
  btn.setAttribute('role', 'radio');
  btn.setAttribute('aria-checked', 'false');
  const label = el('div', 'option-label');
  label.appendChild(document.createTextNode(opt.label));
  // 추천 패널 안에서는 '✓ 추천' 배지가 옵션 자체 태그를 대신하므로 중복 표기하지 않는다.
  if (opt.tag && !isRecommended) {
    const badge = document.createElement('span');
    const cls =
      opt.tag.includes('주의') || opt.tag.includes('다중')
        ? 'badge warn'
        : opt.tag === '추천' || opt.tag.includes('추천')
        ? 'badge good'
        : 'badge';
    badge.className = cls;
    badge.textContent = opt.tag;
    label.appendChild(badge);
  }
  if (isRecommended) {
    const badge = document.createElement('span');
    badge.className = 'badge good';
    badge.textContent = '✓ 추천';
    label.appendChild(badge);
  }
  btn.appendChild(label);
  if (opt.desc) btn.appendChild(el('div', 'option-desc', opt.desc));
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    // 클릭했다는 시각적 피드백을 잠깐 준 뒤(120ms) 다음 화면으로 넘어간다.
    btn.disabled = true;
    btn.classList.add('selected');
    btn.setAttribute('aria-checked', 'true');
    state.answers[q.id] = opt.value;
    setTimeout(() => goNext(q, opt.value), 120);
  });
  return btn;
}

function showRecommendation(q, wrap, unsureBtn) {
  // 이미 추천 패널이 열려 있으면 무시
  if (screen.querySelector('.reco')) return;
  unsureBtn.hidden = true;

  const recoOpt = q.options.find((o) => o.value === q.recommend) || q.options[0];

  const panel = el('div', 'reco');
  panel.appendChild(el('div', 'reco-title', '이 경우엔 이렇게 추천합니다'));
  panel.appendChild(
    el(
      'p',
      'reco-reason',
      q.recommendReason || '초보자에게 가장 무난하고 안전한 선택입니다.'
    )
  );
  // 추천 옵션을 강조해서 보여주고 바로 선택 가능하게
  panel.appendChild(buildOption(q, recoOpt, true));
  screen.appendChild(panel);
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------- 진행 ---------- */
function goNext(q, value) {
  const nextId = resolveNext(q, value, state.answers);
  state.history.push(q.id);
  if (nextId) {
    state.currentId = nextId;
    render();
  } else {
    finish();
  }
}

function goBack() {
  if (state.history.length === 0) return;
  if (state.finished) state.finished = false;
  const prevId = state.history.pop();
  state.currentId = prevId;
  render();
}

/* ---------- 결과 화면 ---------- */
function finish() {
  state.finished = true;
  const { prompt, summary, notes, tip, spec } = buildPrompt(state.answers);
  screen.innerHTML = '';
  screen.scrollTop = 0;

  // 웹(app.html)에서는 결과에 도달할 때마다 주소창 URL을 답변으로 갱신해둔다.
  // 이렇게 하면 "링크 복사" 버튼 없이 주소창 URL을 그대로 공유해도 복원된다.
  if (isWebContext() && typeof history !== 'undefined') {
    try {
      history.replaceState(null, '', `#${encodeAnswers(state.answers)}`);
    } catch (e) {
      // replaceState 실패는 무시 — 공유 링크 기능만 못 쓸 뿐 결과 화면엔 영향 없음
    }
  }

  const head = el('div', 'result-head');
  head.appendChild(el('h2', null, '프롬프트 완성'));
  screen.appendChild(head);
  screen.appendChild(
    el(
      'p',
      'result-sub',
      '아래 프롬프트를 복사해서 Cursor · Claude · ChatGPT 등 AI에게 "가장 먼저" 붙여넣으세요.'
    )
  );

  // 요약 칩
  const chips = el('div', 'summary-chips');
  summary.forEach((sText) => chips.appendChild(el('span', 'chip', sText)));
  screen.appendChild(chips);

  // 비용/무료 안내
  (notes || []).forEach((n) => {
    const note = el('div', 'note');
    note.innerHTML = mdBold(n);
    screen.appendChild(note);
  });

  // 프롬프트 박스
  const box = el('div', 'prompt-box');
  box.textContent = prompt;
  screen.appendChild(box);

  // 액션 버튼
  const actions = el('div', 'result-actions');
  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn-primary';
  copyBtn.textContent = '프롬프트 복사';
  copyBtn.addEventListener('click', () => copyPrompt(prompt, copyBtn));
  actions.appendChild(copyBtn);

  // 웹에서만 "링크 복사" — 확장 팝업은 주소창이 없어 공유 링크가 의미 없다.
  if (isWebContext()) {
    const shareBtn = document.createElement('button');
    shareBtn.className = 'btn-secondary';
    shareBtn.textContent = '링크 복사';
    shareBtn.addEventListener('click', () => copyShareLink(shareBtn));
    actions.appendChild(shareBtn);
  }

  const restartBtn = document.createElement('button');
  restartBtn.className = 'btn-secondary';
  restartBtn.textContent = '다시';
  attachTwoStepConfirm(restartBtn, restart, '정말요? 다시 클릭', 1200);
  actions.appendChild(restartBtn);
  screen.appendChild(actions);

  // 웹사이트(app.html)에서만 정의되는 확장 훅 — Pro 기능(레포 zip·히스토리) 등.
  // 확장 팝업에는 훅이 없으므로 아무 일도 일어나지 않는다.
  if (typeof window !== 'undefined' && typeof window.NCH_resultHook === 'function') {
    try {
      window.NCH_resultHook({ spec, prompt, answers: { ...state.answers }, summary, screen, actions });
    } catch (e) {
      console.error('resultHook error', e);
    }
  }

  screen.appendChild(
    el(
      'div',
      'tip',
      tip ||
        '팁 — 이 프롬프트로 뼈대를 먼저 잡은 뒤, 세부 기능은 "이 구조를 지키면서 ○○ 기능 추가해줘"라고 이어서 요청하세요.'
    )
  );

  updateProgress();
}

async function copyPrompt(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // 폴백
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const orig = btn.textContent;
  btn.textContent = '복사됨';
  setTimeout(() => (btn.textContent = orig), 1600);
}

/** 현재 결과 화면의 공유 링크(주소 + 답변 프래그먼트)를 클립보드에 복사한다. */
async function copyShareLink(btn) {
  const hash = encodeAnswers(state.answers);
  const url = `${location.origin}${location.pathname}#${hash}`;
  try {
    await navigator.clipboard.writeText(url);
  } catch (e) {
    // 폴백
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const orig = btn.textContent;
  btn.textContent = '복사됨';
  setTimeout(() => (btn.textContent = orig), 1600);
}

function restart() {
  state.answers = {};
  state.history = [];
  state.currentId = START_ID;
  state.finished = false;
  render();
}

/**
 * 2단계 확인 버튼: 첫 클릭 시 confirmText 로 잠깐 바뀌고,
 * 그 안에 다시 누르면 onConfirm 실행, 시간이 지나면 원래 텍스트로 복귀한다.
 */
function attachTwoStepConfirm(btn, onConfirm, confirmText, ms) {
  const orig = btn.textContent;
  let timer = null;
  btn.addEventListener('click', () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      btn.textContent = orig;
      onConfirm();
      return;
    }
    btn.textContent = confirmText;
    timer = setTimeout(() => {
      btn.textContent = orig;
      timer = null;
    }, ms);
  });
}

/* ---------- 유틸 ---------- */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// **굵게** → <strong> (앱 내부 고정 문자열에만 사용)
function mdBold(s) {
  const esc = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

backBtn.addEventListener('click', goBack);

/**
 * URL에 공유된 답변(#s=...)이 있으면 그 상태로 복원해 곧바로 결과 화면을 보여준다.
 * 파싱 실패/데이터 없음이면 평소처럼 처음 질문부터 시작한다.
 */
function restoreFromHash() {
  if (typeof location === 'undefined') return false;
  const restored = decodeAnswers(location.hash);
  if (!restored) return false;
  state.answers = restored;
  state.history = [];
  state.currentId = START_ID;
  finish();
  return true;
}

// 시작
if (!restoreFromHash()) {
  render();
}
