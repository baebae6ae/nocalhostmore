/**
 * site.js — 웹사이트 생성기 페이지(app.html) 전용 컨트롤러.
 *
 * - 결과 화면에 Pro 기능(스타터 레포 zip 다운로드) 버튼을 추가한다.
 * - 생성 결과를 히스토리(localStorage, 무료)에 저장/표시한다.
 * - Pro 페이월 모달과 광고 슬롯을 관리한다.
 *
 * app.js 의 finish() 가 window.NCH_resultHook 을 호출한다. 이 파일은
 * app.js 보다 먼저 로드되어 훅을 정의한다. (확장 팝업엔 이 파일이 없다.)
 */
import { buildRepo } from './repoBuilder.js';
import { makeZipBlob } from './zip.js';
import { initAds } from './ads.js';

const PRO_KEY = 'nch_pro';
const HIST_KEY = 'nch_history';
const HIST_MAX = 12;

const isPro = () => localStorage.getItem(PRO_KEY) === '1';
const setPro = () => localStorage.setItem(PRO_KEY, '1');

/* ---------- 히스토리 ---------- */
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HIST_KEY)) || [];
  } catch {
    return [];
  }
}
function saveHistory(entry) {
  const list = loadHistory().filter((e) => e.prompt !== entry.prompt);
  list.unshift(entry);
  localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, HIST_MAX)));
}
function renderHistory() {
  const box = document.getElementById('history');
  if (!box) return;
  const list = loadHistory();
  if (list.length === 0) {
    box.innerHTML = '<p class="hist-empty">아직 생성한 프롬프트가 없어요.<br />첫 프롬프트를 만들어보세요 👉</p>';
    return;
  }
  box.innerHTML = '';
  list.forEach((e) => {
    const item = document.createElement('button');
    item.className = 'hist-item';
    item.innerHTML = `<span class="hist-idea"></span><span class="hist-meta"></span>`;
    item.querySelector('.hist-idea').textContent = e.idea || '(제목 없음)';
    item.querySelector('.hist-meta').textContent = new Date(e.ts).toLocaleString('ko-KR');
    item.title = '클릭하면 프롬프트가 복사됩니다';
    item.addEventListener('click', async () => {
      await copy(e.prompt);
      toast('📋 복사됐어요');
    });
    box.appendChild(item);
  });
}

/* ---------- 레포 zip 다운로드 (Pro) ---------- */
function downloadRepo(spec, prompt, idea) {
  const { projectName, files } = buildRepo(spec, prompt, idea);
  const prefixed = files.map((f) => ({ path: `${projectName}/${f.path}`, content: f.content }));
  const blob = makeZipBlob(prefixed);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- 페이월 모달 ---------- */
function openPaywall(onUnlock) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <button class="modal-close" aria-label="닫기">✕</button>
      <h3>⬇️ 스타터 레포 다운로드는 <span class="pro-tag">Pro</span></h3>
      <p class="modal-sub">프롬프트만이 아니라, 답변에 맞춘 <b>실행 가능한 프로젝트 뼈대</b>(폴더 구조·.gitignore·.env.example·가드레일 반영 코드)를 zip으로 바로 받으세요.</p>
      <div class="plan-grid">
        <div class="plan">
          <div class="plan-name">무료</div>
          <ul><li>마스터 프롬프트 생성</li><li>생성 히스토리</li><li>가이드 문서</li></ul>
        </div>
        <div class="plan pro">
          <div class="plan-name">Pro</div>
          <ul><li>✓ 무료의 모든 기능</li><li>✓ 스타터 레포 zip</li><li>✓ (예정) 영어 출력·팀 프리셋</li></ul>
        </div>
      </div>
      <button class="btn-primary modal-cta">🎉 베타 기간 무료로 활성화</button>
      <p class="modal-foot">베타 기간에는 무료입니다. 이후 유료 전환 시 결제(Stripe·Gumroad 등)를 연결하세요.</p>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('.modal-cta').addEventListener('click', () => {
    setPro();
    close();
    toast('✨ Pro 활성화됨');
    onUnlock && onUnlock();
  });
}

/* ---------- 결과 훅 (app.js 가 호출) ---------- */
window.NCH_resultHook = ({ spec, prompt, answers, summary, actions }) => {
  const idea = (answers.idea || '').trim();

  // 1) 히스토리 저장(무료)
  saveHistory({ ts: Date.now(), idea, summary, prompt });
  renderHistory();

  // 2) Pro: 스타터 레포 다운로드 버튼
  const repoBtn = document.createElement('button');
  repoBtn.className = 'btn-secondary repo-btn';
  repoBtn.innerHTML = '⬇️ 스타터 레포 <span class="pro-tag">Pro</span>';
  repoBtn.addEventListener('click', () => {
    if (isPro()) {
      downloadRepo(spec, prompt, idea);
      toast('⬇️ 레포를 내려받았어요');
    } else {
      openPaywall(() => downloadRepo(spec, prompt, idea));
    }
  });
  actions.appendChild(repoBtn);
};

/* ---------- 유틸 ---------- */
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}
let toastTimer;
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

/* ---------- 초기화 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  renderHistory();
  initAds();
});
