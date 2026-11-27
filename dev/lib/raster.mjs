/* dev/lib/raster.mjs —— 极简 RGBA 光栅 + PNG 编码（只支持 fillRect，够 sprite 用） */
import { deflateSync } from 'node:zlib';

function parseColor(c) {
  if (typeof c !== 'string') return [255, 0, 255, 255];
  const s = c.trim();
  if (s[0] === '#') {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, hex.length === 8 ? n & 255 : 255];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map((v) => parseFloat(v));
    return [parts[0] | 0, parts[1] | 0, parts[2] | 0, Math.round((parts[3] === undefined ? 1 : parts[3]) * 255)];
  }
  return [255, 0, 255, 255];
}

export class Raster {
  constructor(widthAU, heightAU, scale = 3) {
    this.auW = widthAU;
    this.auH = heightAU;
    this.unit = scale;   // 每 AU 的像素数（不能叫 scale，会和 ctx.scale 方法撞名）
    this.width = widthAU * scale;
    this.height = heightAU * scale;
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
    this._color = [0, 0, 0, 255];
    // 最小变换栈：只支持 translate / scale（供镜像窗景之类的绘制用）
    this._stack = [];
    this._tx = 0;
    this._ty = 0;
    this._sx = 1;
    this._sy = 1;
  }

  save() {
    this._stack.push([this._tx, this._ty, this._sx, this._sy]);
  }

  restore() {
    const s = this._stack.pop();
    if (s) [this._tx, this._ty, this._sx, this._sy] = s;
  }

  translate(x, y) {
    this._tx += x * this._sx;
    this._ty += y * this._sy;
  }

  scale(x, y) {
    this._sx *= x;
    this._sy *= y;
  }

  set fillStyle(c) { this._color = parseColor(c); }
  get fillStyle() { return this._color; }

  fillRect(x, y, w, h) {
    const s = this.unit;
    const ax = this._tx + x * this._sx;
    const ay = this._ty + y * this._sy;
    const bx = this._tx + (x + w) * this._sx;
    const by = this._ty + (y + h) * this._sy;
    let x0 = Math.round(Math.min(ax, bx)) * s;
    let y0 = Math.round(Math.min(ay, by)) * s;
    let x1 = Math.round(Math.max(ax, bx)) * s;
    let y1 = Math.round(Math.max(ay, by)) * s;
    if (x1 === x0) x1 = x0 + s;
    if (y1 === y0) y1 = y0 + s;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(this.width, x1); y1 = Math.min(this.height, y1);
    const [r, g, b, a] = this._color;
    if (a === 255) {
      for (let py = y0; py < y1; py++) {
        let idx = (py * this.width + x0) * 4;
        for (let px = x0; px < x1; px++, idx += 4) {
          this.data[idx] = r; this.data[idx + 1] = g; this.data[idx + 2] = b; this.data[idx + 3] = 255;
        }
      }
      return;
    }
    const af = a / 255;
    for (let py = y0; py < y1; py++) {
      let idx = (py * this.width + x0) * 4;
      for (let px = x0; px < x1; px++, idx += 4) {
        const sa = af;
        const da = this.data[idx + 3] / 255;
        const outA = sa + da * (1 - sa);
        if (outA <= 0) continue;
        this.data[idx] = (r * sa + this.data[idx] * da * (1 - sa)) / outA;
        this.data[idx + 1] = (g * sa + this.data[idx + 1] * da * (1 - sa)) / outA;
        this.data[idx + 2] = (b * sa + this.data[idx + 2] * da * (1 - sa)) / outA;
        this.data[idx + 3] = outA * 255;
      }
    }
  }

  /* 把另一张光栅的指定像素区域贴到本图 (dx,dy) */
  blit(src, sx, sy, sw, sh, dx, dy) {
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const si = ((sy + y) * src.width + (sx + x)) * 4;
        const di = ((dy + y) * this.width + (dx + x)) * 4;
        const a = src.data[si + 3] / 255;
        if (a <= 0) continue;
        this.data[di] = src.data[si];
        this.data[di + 1] = src.data[si + 1];
        this.data[di + 2] = src.data[si + 2];
        this.data[di + 3] = 255;
      }
    }
  }
}

/* ---------- PNG 编码（RGBA8，filter 0） ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

export function encodePNG(raster) {
  const { width, height, data } = raster;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width * 4; x++) raw[rowStart + 1 + x] = data[y * width * 4 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
