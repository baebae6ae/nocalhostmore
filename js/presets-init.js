/**
 * presets-init.js
 * ------------------------------------------------------------------
 * app.html 전용 아주 작은 부트스트랩.
 *
 * `presets/index.html`의 "이 프리셋으로 시작하기" 링크는
 * `app.html?preset=<slug>` 같은 읽기 쉬운 쿼리 링크를 가리킨다.
 * 이 파일은 그 쿼리를 읽어서:
 *   1) 해당 프리셋의 답변을 localStorage(nch_preset_prefill)에 남겨두고
 *   2) 답변을 base64 JSON 프래그먼트(#s=...)로 인코딩해 location.hash 에 반영한다.
 *
 * 프래그먼트(#s=...)를 실제로 읽어 위저드 답변을 자동으로 채우는 로직은
 * 이 저장소의 "공유 링크" 기능(다른 브랜치, js/app.js 쪽) 이 병합되면
 * 자연히 동작한다. 이 파일은 js/app.js 를 건드리지 않고도 그 전 단계인
 * "프리셋 → 프래그먼트 인코딩"까지만 책임진다.
 * ------------------------------------------------------------------
 */
import { getPreset } from './presets.js';
import { encodeAnswers } from './share.js';

const PREFILL_KEY = 'nch_preset_prefill';

function applyPresetFromQuery() {
  const params = new URLSearchParams(location.search);
  const slug = params.get('preset');
  if (!slug) return;

  const preset = getPreset(slug);
  if (!preset) return;

  try {
    localStorage.setItem(PREFILL_KEY, JSON.stringify(preset.answers));
  } catch (e) {
    // localStorage 를 못 쓰는 환경(프라이빗 모드 등)이어도 프래그먼트 반영은 계속한다.
  }

  location.hash = encodeAnswers(preset.answers); // encodeAnswers 가 이미 "s=" 프리픽스를 포함한다
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyPresetFromQuery);
} else {
  applyPresetFromQuery();
}
