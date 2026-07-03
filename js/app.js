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

const screen = document.getElementById('screen');
const progressBar = document.getElementById('progressBar');
const backBtn = document.getElementById('backBtn');
const stepLabel = document.getElementById('stepLabel');

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
    stepLabel.textContent = '완료';
    // 결과 화면에서도 직전 답을 고칠 수 있게 '이전'은 남겨둔다.
    backBtn.hidden = state.history.length === 0;
    return;
  }
  // 방문 경로 기준 대략적 진행률 (총 질문 수는 분기로 가변이라 근사치)
  const answeredCount = state.history.length;
  const est = Math.min(0.95, answeredCount / QUESTIONS.length);
  progressBar.style.width = `${Math.max(0.06, est) * 100}%`;
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

  const title = el('h2', 'q-title', q.title);
  screen.appendChild(title);
  if (q.hint) screen.appendChild(el('p', 'q-hint', q.hint));

  if (q.type === 'text') {
    renderText(q);
  } else {
    renderSingle(q);
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
  ta.focus();
}

function renderSingle(q) {
  const wrap = el('div', 'options');
  q.options.forEach((opt) => {
    wrap.appendChild(buildOption(q, opt, false));
  });
  screen.appendChild(wrap);

  // "잘 모르겠어요"
  const unsure = document.createElement('button');
  unsure.className = 'unsure-btn';
  unsure.textContent = '🤔 잘 모르겠어요 — 추천해 주세요';
  unsure.addEventListener('click', () => showRecommendation(q, wrap, unsure));
  screen.appendChild(unsure);
}

function buildOption(q, opt, isRecommended) {
  const btn = document.createElement('button');
  btn.className = 'option' + (isRecommended ? ' recommended' : '');
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
    state.answers[q.id] = opt.value;
    goNext(q, opt.value);
  });
  return btn;
}

function showRecommendation(q, wrap, unsureBtn) {
  // 이미 추천 패널이 열려 있으면 무시
  if (screen.querySelector('.reco')) return;
  unsureBtn.hidden = true;

  const recoOpt = q.options.find((o) => o.value === q.recommend) || q.options[0];

  const panel = el('div', 'reco');
  panel.appendChild(el('div', 'reco-title', '💡 이 경우엔 이렇게 추천해요'));
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
  const { prompt, summary, notes } = buildPrompt(state.answers);
  screen.innerHTML = '';
  screen.scrollTop = 0;

  const head = el('div', 'result-head');
  head.appendChild(el('h2', null, '🚀 마스터 프롬프트 완성!'));
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
  copyBtn.textContent = '📋 프롬프트 복사';
  copyBtn.addEventListener('click', () => copyPrompt(prompt, copyBtn));
  const restartBtn = document.createElement('button');
  restartBtn.className = 'btn-secondary';
  restartBtn.textContent = '다시';
  restartBtn.addEventListener('click', restart);
  actions.appendChild(copyBtn);
  actions.appendChild(restartBtn);
  screen.appendChild(actions);

  screen.appendChild(
    el(
      'div',
      'tip',
      '💡 팁: 이 프롬프트로 뼈대를 먼저 잡은 뒤, 세부 기능은 "이 구조를 지키면서 ○○ 기능 추가해줘"라고 이어서 요청하세요.'
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
  btn.textContent = '✅ 복사됐어요!';
  setTimeout(() => (btn.textContent = orig), 1600);
}

function restart() {
  state.answers = {};
  state.history = [];
  state.currentId = START_ID;
  state.finished = false;
  render();
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

// 시작
render();
