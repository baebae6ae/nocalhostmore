/**
 * gen-icons.js
 * 의존성 없이 PNG 아이콘을 생성한다. (Node 내장 zlib만 사용)
 * 보라→파랑 그라디언트 라운드 사각형 + 위로 향하는 로켓/화살표 마크.
 *   "더 이상 로컬호스트는 그만 → 프로덕션으로 이륙" 을 상징.
 *
 * 실행: node scripts/gen-icons.js
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// 브랜드 컬러
const PURPLE = [124, 92, 255];
const BLUE = [79, 140, 255];
const WHITE = [255, 255, 255];

function renderIcon(size) {
  const w = size;
  const h = size;
  const buf = Buffer.alloc(w * h * 4); // RGBA

  const radius = size * 0.24; // 라운드 정도
  const cx = w / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;

      // 라운드 사각형 마스크 (모서리 밖은 투명)
      const inside = insideRoundRect(x + 0.5, y + 0.5, w, h, radius);
      if (inside <= 0) {
        buf[i + 3] = 0;
        continue;
      }

      // 대각선 그라디언트 배경
      const t = (x / w + y / h) / 2;
      let col = mix(PURPLE, BLUE, t);

      // 위로 향하는 화살표(로켓 노즈) 그리기
      const arrow = arrowMask(x + 0.5, y + 0.5, size, cx);
      if (arrow > 0) {
        col = mix(col, WHITE, arrow);
      }

      buf[i] = Math.round(col[0]);
      buf[i + 1] = Math.round(col[1]);
      buf[i + 2] = Math.round(col[2]);
      buf[i + 3] = Math.round(255 * Math.min(1, inside));
    }
  }
  return encodePNG(buf, w, h);
}

// 라운드 사각형 내부 판정(가장자리 안티앨리어싱 위해 0~1 반환)
function insideRoundRect(x, y, w, h, r) {
  const dxl = x;
  const dxr = w - x;
  const dyt = y;
  const dyb = h - y;
  // 모서리 원 중심까지의 거리 기반
  let dist;
  const nx = Math.min(dxl, dxr);
  const ny = Math.min(dyt, dyb);
  if (nx < r && ny < r) {
    dist = r - Math.hypot(r - nx, r - ny);
  } else {
    dist = Math.min(nx, ny);
  }
  // 가장자리 1px 부드럽게
  return Math.max(0, Math.min(1, dist));
}

// 위로 향하는 화살표/촉 모양 마스크 (0~1)
function arrowMask(x, y, size, cx) {
  const px = x / size; // 0~1
  const py = y / size;
  // 화살표 삼각형: 위 꼭지점 (0.5, 0.22), 좌하 (0.28, 0.6), 우하 (0.72, 0.6)
  const top = { x: 0.5, y: 0.24 };
  const bl = { x: 0.27, y: 0.62 };
  const br = { x: 0.73, y: 0.62 };
  let inTri = pointInTriangle(px, py, top, bl, br) ? 1 : 0;
  // 화살표 몸통(세로 막대): x 0.42~0.58, y 0.55~0.8
  let inBar =
    px > 0.42 && px < 0.58 && py > 0.55 && py < 0.82 ? 1 : 0;
  const m = Math.max(inTri, inBar);
  // 살짝 부드럽게
  return m;
}

function pointInTriangle(px, py, a, b, c) {
  const d1 = sign(px, py, a, b);
  const d2 = sign(px, py, b, c);
  const d3 = sign(px, py, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}
function sign(px, py, p1, p2) {
  return (px - p2.x) * (p1.y - p2.y) - (p1.x - p2.x) * (py - p2.y);
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

  // raw scanlines with filter byte 0
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

// CRC32
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
