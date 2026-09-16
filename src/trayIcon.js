'use strict';

const zlib = require('zlib');

/** 组装一个 PNG chunk：长度 + 类型 + 数据 + CRC。Node 24 内置 zlib.crc32。 */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(typed) >>> 0);
  return Buffer.concat([len, typed, crc]);
}

/**
 * 用代码画一个 RGBA PNG，避免往项目里塞二进制资源。
 * pixel(x, y) 返回 [r, g, b, a]，a 取 0-255。
 */
function makePng(size, pixel) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);

  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter type 0 (None)
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const p = rowStart + 1 + x * 4;
      raw[p] = r; raw[p + 1] = g; raw[p + 2] = b; raw[p + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 点到线段的最短距离，用来画对勾。 */
function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return Math.hypot(dx, dy);
}

/**
 * 图标图案：圆角方块底 + 白色对勾。
 * 所有坐标按 size 归一化到 0-1，这样同一套逻辑能出 16/32/256 各档。
 */
function drawIcon(size) {
  const s = size;
  const u = v => v * s;                     // 归一化坐标 -> 像素
  const radius = u(0.22);
  const inset = u(0.06);
  const lo = inset, hi = s - inset;

  // 对勾三点
  const ax = u(0.26), ay = u(0.52);
  const bx = u(0.43), by = u(0.69);
  const cx = u(0.75), cy = u(0.33);
  const strokeW = Math.max(1, u(0.085));

  return (x, y) => {
    const px = x + 0.5, py = y + 0.5;

    // 圆角矩形底：内部点到矩形边界的有符号距离
    const qx = Math.abs(px - s / 2) - (s / 2 - inset - radius);
    const qy = Math.abs(py - s / 2) - (s / 2 - inset - radius);
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
    const bgA = Math.max(0, Math.min(1, 0.5 - d));       // 1px 抗锯齿
    if (bgA <= 0) return [0, 0, 0, 0];

    const inside = px >= lo && px <= hi && py >= lo && py <= hi;

    // 底：蓝紫渐变
    const t = (px + py) / (2 * s);
    let r = Math.round(58 + t * 45);
    let g = Math.round(120 + t * 40);
    let b = Math.round(235 - t * 20);
    let a = 255;

    if (inside) {
      const dCheck = Math.min(
        distToSegment(px, py, ax, ay, bx, by),
        distToSegment(px, py, bx, by, cx, cy),
      );
      const checkA = Math.max(0, Math.min(1, strokeW / 2 - dCheck + 0.5));
      if (checkA > 0) {
        r = Math.round(r * (1 - checkA) + 255 * checkA);
        g = Math.round(g * (1 - checkA) + 255 * checkA);
        b = Math.round(b * (1 - checkA) + 255 * checkA);
      }
    }

    return [r, g, b, a + Math.round((0 - a) * (1 - bgA))];
  };
}

function iconPng(size) {
  return makePng(size, drawIcon(size));
}

/** 把 PNG 塞进 ICO 容器（Vista+ 支持 PNG payload），用于 electron-packager --icon。 */
function pngToIco(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count

  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size; // 256 用 0 表示
  entry[1] = size >= 256 ? 0 : size;
  entry[2] = 0;                      // 调色板数
  entry[3] = 0;                      // reserved
  entry.writeUInt16LE(1, 4);         // color planes
  entry.writeUInt16LE(32, 6);        // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, png]);
}

module.exports = { makePng, iconPng, pngToIco, drawIcon };
