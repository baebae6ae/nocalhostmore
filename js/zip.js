/**
 * zip.js — 의존성 없는 최소 ZIP 생성기 (store 방식, 무압축).
 * 브라우저에서 파일 여러 개를 하나의 .zip Blob 으로 묶는다.
 *
 * makeZipBlob([{ path, content }]) → Blob
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function enc(str) {
  return new TextEncoder().encode(str);
}

function u16(n) {
  return [n & 0xff, (n >>> 8) & 0xff];
}
function u32(n) {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

/** DOS 시각(고정값 사용 — 재현 가능성 위해) */
const DOS_TIME = 0;
const DOS_DATE = 0x21; // 1980-01-01

/** 핵심: 파일 목록 → 단일 Uint8Array (Node/브라우저 공통) */
export function makeZipBytes(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc(f.path);
    const dataBytes = enc(f.content);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local file header
    const local = [
      ...u32(0x04034b50),
      ...u16(20), // version needed
      ...u16(0), // flags
      ...u16(0), // method 0 = store
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(size), // compressed
      ...u32(size), // uncompressed
      ...u16(nameBytes.length),
      ...u16(0), // extra len
    ];
    const localHeader = new Uint8Array(local);
    chunks.push(localHeader, nameBytes, dataBytes);

    // Central directory record
    const cen = [
      ...u32(0x02014b50),
      ...u16(20), // version made by
      ...u16(20), // version needed
      ...u16(0),
      ...u16(0),
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0), // extra
      ...u16(0), // comment
      ...u16(0), // disk
      ...u16(0), // internal attrs
      ...u32(0), // external attrs
      ...u32(offset), // local header offset
    ];
    central.push({ header: new Uint8Array(cen), name: nameBytes });

    offset += localHeader.length + nameBytes.length + dataBytes.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) {
    chunks.push(c.header, c.name);
    centralSize += c.header.length + c.name.length;
  }

  // End of central directory
  const eocd = new Uint8Array([
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(central.length),
    ...u16(central.length),
    ...u32(centralSize),
    ...u32(centralStart),
    ...u16(0),
  ]);
  chunks.push(eocd);

  // 단일 Uint8Array 로 합치기
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

/** 브라우저 다운로드용: Blob 반환 */
export function makeZipBlob(files) {
  return new Blob([makeZipBytes(files)], { type: 'application/zip' });
}
