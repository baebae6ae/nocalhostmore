/**
 * site.js — 웹사이트 생성기 페이지(app.html) 전용 컨트롤러.
 *
 * - 결과 화면에 Pro 기능(스타터 레포 zip 다운로드) 버튼을 추가한다.
 * - 생성 결과를 히스토리(localStorage, 무료)에 저장/표시한다.
 * - Pro 페이월 모달과 광고 슬롯을 관리한다.
 * - 결과 화면에 절제된 톤의 후원/추천 인프라 링크를 덧붙인다.
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

// 후원 링크. 실제 URL이 준비되면 채우세요. 둘 다 비어 있으면 섹션 자체를 표시하지 않고,
// 하나만 채워도 그것만 보여줍니다. (ads.js 의 ADSENSE_CLIENT 와 같은 플레이스홀더 패턴)
const DONATE_URLS = {
  toss: '', // 토스 후원 링크 (toss.me/... 형태)
  bmc: '', // Buy Me a Coffee 링크 (buymeacoffee.com/... 형태)
};

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
function removeHistoryEntry(ts) {
  const list = loadHistory().filter((e) => e.ts !== ts);
  localStorage.setItem(HIST_KEY, JSON.stringify(list));
}
function clearHistory() {
  localStorage.removeItem(HIST_KEY);
}
function renderHistory() {
  const box = document.getElementById('history');
  if (!box) return;
  const list = loadHistory();
  if (list.length === 0) {
    box.innerHTML = '<p class="hist-empty">아직 생성한 프롬프트가 없어요.<br />첫 프롬프트를 만들어보세요 →</p>';
    return;
  }
  box.innerHTML = '';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'hist-clear';
  clearBtn.textContent = '전체 지우기';
  clearBtn.addEventListener('click', () => {
    clearHistory();
    renderHistory();
  });
  box.appendChild(clearBtn);

  list.forEach((e) => {
    const row = document.createElement('div');
    row.className = 'hist-row';

    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'hist-item';
    item.innerHTML = `<span class="hist-idea"></span><span class="hist-meta"></span>`;
    item.querySelector('.hist-idea').textContent = e.idea || '(제목 없음)';
    item.querySelector('.hist-meta').textContent = new Date(e.ts).toLocaleString('ko-KR');
    item.title = '클릭하면 프롬프트가 복사됩니다';
    item.addEventListener('click', async () => {
      await copy(e.prompt);
      toast('복사됨');
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'hist-del';
    delBtn.textContent = '×';
    delBtn.setAttribute('aria-label', '이 기록 삭제');
    delBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      removeHistoryEntry(e.ts);
      renderHistory();
    });

    row.appendChild(item);
    row.appendChild(delBtn);
    box.appendChild(row);
  });
}

/* ---------- 레포 zip 다운로드 (Pro) ---------- */
function downloadRepo(spec, prompt, idea, btn, onDone) {
  const build = () => {
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
    onDone && onDone();
  };

  if (!btn) {
    build();
    return;
  }

  // 버튼에 로딩 상태를 보여준 뒤(다음 프레임) 실제 생성 작업을 수행한다.
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = '생성 중…';
  setTimeout(() => {
    try {
      build();
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }, 20);
}

/* ---------- 페이월 모달 ---------- */
function openPaywall(triggerEl, onUnlock) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="paywallTitle">
      <button class="modal-close" aria-label="닫기">✕</button>
      <h3 id="paywallTitle">스타터 레포 다운로드 — <span class="pro-tag">Pro</span></h3>
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
      <button class="btn-primary modal-cta">베타 기간 무료로 활성화</button>
      <p class="modal-foot">베타 기간에는 무료입니다. 이후 유료 전환 시 결제(Stripe·Gumroad 등)를 연결하세요.</p>
    </div>`;
  document.body.appendChild(overlay);

  const modal = overlay.querySelector('.modal');

  const getFocusable = () =>
    Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(
      (el) => !el.disabled
    );

  const close = () => {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
    if (triggerEl && typeof triggerEl.focus === 'function') triggerEl.focus();
  };

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      const items = getFocusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  document.addEventListener('keydown', onKeydown);

  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('.modal-cta').addEventListener('click', () => {
    setPro();
    close();
    toast('Pro 활성화됨');
    onUnlock && onUnlock();
  });

  // 열리면 닫기 버튼으로 포커스 이동
  overlay.querySelector('.modal-close').focus();
}

/* ---------- 후원 링크 (절제된 톤) ---------- */
function buildDonateLine() {
  const entries = [
    DONATE_URLS.toss && { href: DONATE_URLS.toss, label: '토스 후원' },
    DONATE_URLS.bmc && { href: DONATE_URLS.bmc, label: 'Buy Me a Coffee' },
  ].filter(Boolean);
  if (entries.length === 0) return null;

  const p = document.createElement('p');
  p.className = 'donate-line';
  p.append('이 프롬프트가 시간을 아꼈다면, ');
  entries.forEach((entry, i) => {
    const a = document.createElement('a');
    a.href = entry.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = entry.label;
    p.append(a);
    if (i < entries.length - 1) p.append(' 또는 ');
  });
  p.append('으로 응원할 수 있어요.');
  return p;
}

/* ---------- 추천 인프라 (제휴 스캐폴드) ---------- */
function buildInfraSection(spec) {
  if (!spec) return null;
  const links = [];
  if (spec.stack === 'web') {
    links.push({ name: 'Vercel', href: 'https://vercel.com', note: '정적 배포 무료' });
    links.push({ name: 'Netlify', href: 'https://www.netlify.com', note: '정적 배포 무료' });
  } else {
    links.push({ name: 'Streamlit Community Cloud', href: 'https://streamlit.io/cloud', note: '무료로 시작' });
    if (spec.persist === 'db') {
      links.push({ name: 'Supabase', href: 'https://supabase.com', note: 'Postgres 무료 티어' });
    }
    if (spec.filePermanent) {
      links.push({ name: 'AWS S3', href: 'https://aws.amazon.com/s3/', note: '오브젝트 스토리지' });
    }
  }
  if (links.length === 0) return null;

  const wrap = document.createElement('div');
  wrap.className = 'infra-reco';
  const title = document.createElement('p');
  title.className = 'infra-reco-title';
  title.textContent = '이 구성에 맞는 배포처';
  wrap.appendChild(title);

  const ul = document.createElement('ul');
  links.forEach((l) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    // TODO: 제휴 파라미터(예: ?ref=nocalhostmore)는 실제 제휴 계약 체결 후 여기에 추가하세요.
    a.href = l.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = l.name;
    li.append(a, ' — ' + l.note);
    ul.appendChild(li);
  });
  wrap.appendChild(ul);
  return wrap;
}

/* ---------- 결과 훅 (app.js 가 호출) ---------- */
window.NCH_resultHook = ({ spec, prompt, answers, summary, actions, screen }) => {
  const idea = (answers.idea || '').trim();

  // 1) 히스토리 저장(무료)
  saveHistory({ ts: Date.now(), idea, summary, prompt });
  renderHistory();

  // 2) Pro: 스타터 레포 다운로드 버튼
  const repoBtn = document.createElement('button');
  repoBtn.className = 'btn-secondary repo-btn';
  repoBtn.innerHTML = '스타터 레포 <span class="pro-tag">Pro</span>';
  repoBtn.addEventListener('click', () => {
    if (isPro()) {
      downloadRepo(spec, prompt, idea, repoBtn, () => toast('레포 다운로드됨'));
    } else {
      openPaywall(repoBtn, () =>
        downloadRepo(spec, prompt, idea, repoBtn, () => toast('레포 다운로드됨'))
      );
    }
  });
  actions.appendChild(repoBtn);

  // 3) 후원 링크 + 추천 인프라 — 결과 화면 하단에 담백하게
  const target = screen || actions.parentElement;
  if (target) {
    const donate = buildDonateLine();
    if (donate) target.appendChild(donate);
    const infra = buildInfraSection(spec);
    if (infra) target.appendChild(infra);
  }
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
    t.setAttribute('aria-live', 'polite');
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
