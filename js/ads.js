/**
 * ads.js — Google AdSense 슬롯 헬퍼.
 *
 * 실제 게시자 ID를 넣기 전까지는 '광고 자리' 플레이스홀더를 보여준다.
 * 승인/발급 후 아래 ADSENSE_CLIENT 와 각 슬롯의 data-ad-slot 를 채우면
 * 자동으로 실제 광고가 로드된다.
 *
 * ⚠️ AdSense 정책: 콘텐츠가 얇은 페이지엔 승인이 어렵다. guides/ 의 글이
 *    광고 지면 역할을 한다. 도구 페이지엔 과한 광고를 넣지 말 것.
 */

// TODO: 발급받은 값으로 교체하세요. 예) "ca-pub-1234567890123456"
export const ADSENSE_CLIENT = '';

let scriptLoaded = false;

function loadAdSenseScript() {
  if (scriptLoaded || !ADSENSE_CLIENT) return;
  scriptLoaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.src =
    'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' +
    encodeURIComponent(ADSENSE_CLIENT);
  s.crossOrigin = 'anonymous';
  document.head.appendChild(s);
}

/**
 * 광고 슬롯을 렌더한다.
 * @param {HTMLElement} el  data-ad-slot 속성을 가진 .ad-slot 컨테이너
 */
export function renderAd(el) {
  if (!el) return;
  if (ADSENSE_CLIENT && el.dataset.adSlot) {
    loadAdSenseScript();
    el.innerHTML = '';
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', ADSENSE_CLIENT);
    ins.setAttribute('data-ad-slot', el.dataset.adSlot);
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    el.appendChild(ins);
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      /* noop */
    }
  } else {
    // 플레이스홀더 (레이아웃 확인용)
    el.classList.add('ad-placeholder');
    el.innerHTML = '<span>광고 영역 (AdSense 승인 후 표시)</span>';
  }
}

/** 페이지의 모든 .ad-slot 을 렌더 */
export function initAds() {
  document.querySelectorAll('.ad-slot').forEach(renderAd);
}
