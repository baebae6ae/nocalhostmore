/**
 * ads-init.js — 정적 콘텐츠 페이지(랜딩·가이드)용 광고 초기화 부트스트랩.
 * app.html 은 site.js 가 자체적으로 initAds() 를 호출하므로 이 파일을 쓰지 않는다.
 */
import { initAds } from './ads.js';

document.addEventListener('DOMContentLoaded', initAds);
