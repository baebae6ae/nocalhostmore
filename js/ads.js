/**
 * ads.js — Google AdSense 슬롯 헬퍼.
 *
 * 발급받은 ADSENSE_CLIENT 를 채우면 실제 광고가 로드된다.
 * 그 전(심사 대기 중 포함)에는 광고 슬롯을 **완전히 숨긴다** — Google의 심사
 * 기준상 빈 광고 박스나 "광고 영역" 같은 표시는 사이트가 "미완성(under
 * construction)"으로 보이게 해 반려 사유가 될 수 있다
 * (참고: support.google.com/adsense/answer/81904 "site not approved" 사유).
 * 레이아웃 확인이 필요하면 URL에 `?adsdebug=1` 을 붙여 플레이스홀더를 볼 수 있다.
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
  } else if (isDebugMode()) {
    // 개발자용 레이아웃 확인 (?adsdebug=1 일 때만). 실제 방문자에겐 보이지 않는다.
    el.classList.add('ad-placeholder');
    el.innerHTML = '<span>광고 영역 (디버그 전용 미리보기)</span>';
  } else {
    // 광고가 없을 땐 자리 자체를 완전히 숨겨, 심사 중에도 "미완성" 인상을 주지 않는다.
    el.style.display = 'none';
  }
}

function isDebugMode() {
  try {
    return new URLSearchParams(window.location.search).get('adsdebug') === '1';
  } catch (e) {
    return false;
  }
}

/** 페이지의 모든 .ad-slot 을 렌더 */
export function initAds() {
  document.querySelectorAll('.ad-slot').forEach(renderAd);
}
