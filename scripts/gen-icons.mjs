// 离线 APP（PWA）图标生成脚本 —— 纯 Node 实现，无第三方依赖。
// 程序化绘制「品牌色圆角方块 + 白色翻开书本」图标并编码为 PNG：
//   public/icon-192.png          常规图标（manifest / apple-touch-icon）
//   public/icon-512.png          常规图标（安装弹窗 / 商店展示）
//   public/icon-maskable-512.png maskable 图标（Android 自适应圆形裁切，内容缩入安全区）
// 用法：node scripts/gen-icons.mjs（图标为静态产物，仅在需要改动设计时重新生成）
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, "public");

// 品牌色（与 src/assets/styles/_tokens.scss 的 --accent 浅色主题一致）
const ACCENT = [0x5b, 0x6c, 0xff, 255];
const WHITE = [255, 255, 255, 255];

// 翻开书本的两页（单位坐标空间 0..1，凸四边形）
const LEFT_PAGE = [
  [0.17, 0.32],
  [0.47, 0.25],
  [0.47, 0.75],
  [0.17, 0.68],
];
const RIGHT_PAGE = [
  [0.83, 0.32],
  [0.53, 0.25],
  [0.53, 0.75],
  [0.83, 0.68],
];

// ---------- 几何判定 ----------

/** 圆角矩形 SDF ≤ 0 判定（cx/cy 中心，hw/hh 半宽半高，r 圆角半径）。 */
function inRoundedRect(u, v, cx, cy, hw, hh, r) {
  const qx = Math.abs(u - cx) - hw + r;
  const qy = Math.abs(v - cy) - hh + r;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(ox, oy) <= r;
}

/** 凸四边形内点判定（对每条边做叉积，符号一致即在内部）。 */
function inQuad(u, v, pts) {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const cross = (bx - ax) * (v - ay) - (by - ay) * (u - ax);
    if (cross !== 0) {
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

/**
 * 绘制图标，返回 RGBA 像素缓冲。
 * maskable=true 时背景满铺、书本内容缩入中央安全区（Android 图标裁切要求）。
 */
function drawIcon(size, maskable) {
  const data = Buffer.alloc(size * size * 4);
  const scale = maskable ? 0.62 : 1; // 内容缩放比例
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;

      let pixel = [0, 0, 0, 0];
      const inBg = maskable
        ? true // 满铺正方形，由系统裁切成任意形状
        : inRoundedRect(u, v, 0.5, 0.5, 0.5, 0.5, 0.22);
      if (inBg) pixel = ACCENT;

      // 书本坐标：非 maskable 直接取单位坐标；maskable 围绕中心放大采样（内容缩小）
      const bu = 0.5 + (u - 0.5) / scale;
      const bv = 0.5 + (v - 0.5) / scale;
      if (inQuad(bu, bv, LEFT_PAGE) || inQuad(bu, bv, RIGHT_PAGE)) {
        pixel = WHITE;
      }

      const idx = (y * size + x) * 4;
      data[idx] = pixel[0];
      data[idx + 1] = pixel[1];
      data[idx + 2] = pixel[2];
      data[idx + 3] = pixel[3];
    }
  }
  return data;
}

// ---------- PNG 编码（IHDR + IDAT + IEND，RGBA 8bit，filter 0） ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  // 每行前置 filter 字节（0 = None）
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- 生成 ----------

const targets = [
  { file: "favicon-32.png", size: 32, maskable: false },
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
];

for (const { file, size, maskable } of targets) {
  const png = encodePng(size, drawIcon(size, maskable));
  writeFileSync(join(publicDir, file), png);
  console.log(`[gen-icons] ${file} (${size}x${size}${maskable ? ", maskable" : ""}) ${png.length} bytes`);
}
console.log("[gen-icons] done.");
