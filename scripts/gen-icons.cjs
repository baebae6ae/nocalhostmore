/**
 * gen-icons.cjs
 * 의존성 없이 PNG 아이콘을 생성한다. (Node 내장 zlib만 사용)
 * 평평한 잉크색 배경 + 터미널 프롬프트 글리프(`>_`).
 *   그라디언트 화살표(전형적인 "AI가 만든 앱" 아이콘) 대신, 브랜드가
 *   실제로 다루는 대상인 "터미널/로컬호스트"를 직접적으로 가리킨다.
 *
 * 실행: node scripts/gen-icons.cjs
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// 브랜드 컬러 (assets/components.css 의 다크 모드 값과 맞춤)
const INK = [24, 20, 15]; // --bg (dark)
const CREAM = [241, 233, 219]; // --text (dark)
const ACCENT = [226, 128, 63]; // --accent (dark)

function renderIcon(size) {
  const w = size;
  const h = size;
  const buf = Buffer.alloc(w * h * 4); // RGBA
  const radius = size * 0.17; // 각진 느낌 유지 (터미널 창 느낌)
  const stroke = Math.max(1.4, size * 0.075);

  // 프롬프트 ">" 셰브런 두 선분 + "_" 밑줄 (정규화 좌표 0~1)
  const p1 = { x: 0.3, y: 0.32 };
  const p2 = { x: 0.5, y: 0.5 };
  const p3 = { x: 0.3, y: 0.68 };
  const underscoreY = 0.72;
  const underscoreX0 = 0.54;
  const underscoreX1 = 0.76;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inside = insideRoundRect(x + 0.5, y + 0.5, w, h, radius);
      if (inside <= 0) {
        buf[i + 3] = 0;
        continue;
      }

      const px = (x + 0.5) / size;
      const py = (y + 0.5) / size;
      const strokeN = stroke / size;

      const dChevron = Math.min(
        distToSegment(px, py, p1.x, p1.y, p2.x, p2.y),
        distToSegment(px, py, p2.x, p2.y, p3.x, p3.y)
      );
      const dUnderscore = distToSegment(px, py, underscoreX0, underscoreY, underscoreX1, underscoreY);

      let col = INK;
      const chevronMask = smooth(dChevron, strokeN);
      const underscoreMask = smooth(dUnderscore, strokeN);
      if (chevronMask > 0) col = mix(col, CREAM, chevronMask);
      if (underscoreMask > 0) col = mix(col, ACCENT, underscoreMask);

      buf[i] = Math.round(col[0]);
      buf[i + 1] = Math.round(col[1]);
      buf[i + 2] = Math.round(col[2]);
      buf[i + 3] = Math.round(255 * Math.min(1, inside));
    }
  }
  return encodePNG(buf, w, h);
}

function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

// 거리 → 0~1 마스크 (경계 1px 정도 부드럽게)
function smooth(dist, strokeHalf) {
  const edge = strokeHalf * 0.35;
  if (dist <= strokeHalf - edge) return 1;
  if (dist >= strokeHalf + edge) return 0;
  return 1 - (dist - (strokeHalf - edge)) / (edge * 2);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const lenSq = abx * abx + aby * aby;
  let t = lenSq > 0 ? (apx * abx + apy * aby) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

// 라운드 사각형 내부 판정(가장자리 안티앨리어싱 위해 0~1 반환)
function insideRoundRect(x, y, w, h, r) {
  const dxl = x;
  const dxr = w - x;
  const dyt = y;
  const dyb = h - y;
  let dist;
  const nx = Math.min(dxl, dxr);
  const ny = Math.min(dyt, dyb);
  if (nx < r && ny < r) {
    dist = r - Math.hypot(r - nx, r - ny);
  } else {
    dist = Math.min(nx, ny);
  }
  return Math.max(0, Math.min(1, dist));
}

/* ---------- 최소 PNG 인코더 ---------- */
function encodePNG(rgba, w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idatData = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return c ^ 0xffffffff;
}

/* ---------- 출력 ---------- */
const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
[16, 32, 48, 128].forEach((sz) => {
  const png = renderIcon(sz);
  fs.writeFileSync(path.join(outDir, `icon${sz}.png`), png);
  console.log(`icons/icon${sz}.png (${png.length} bytes)`);
});
console.log('done.');
