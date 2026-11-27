/* Atlas.js —— 运行时像素图集（由 dev/build-atlas.mjs 烘焙）
 * 1 AU = 2px；Renderer 在 2× 变换下用 drawImage 把图集放大回 AU 尺寸。
 * 图集未加载完成时，Renderer 继续走程序化绘制，不会白屏。
 */

export const ATLAS_CELL = {
  player: { w: 18, h: 36, frames: 8 },   // s/n/e/w × 2 步
  teacher: { w: 36, h: 60, frames: 6 },  // board/pace/turn × 2
  seats: { w: 24, h: 36, frames: 18 },   // 3 种面板色 × (closed / open / broken×2 / occupied×2)
  desk: { w: 24, h: 30, frames: 2 }      // 两种木色
};

/* 1 AU = 2 屏幕像素（v2.8 小颗粒化） */
export const UNIT = 2;

const FILES = {
  player: 'player.png',
  teacher: 'teacher.png',
  seats: 'seats.png',
  desk: 'desk.png'
};

const SCENE_BG = 'scene_bg.png';

export class Atlas {
  constructor() {
    this.ready = false;
    this.images = {};
    this._pending = 0;
    // 场景整图背景（960×768，1:1 屏幕像素，静态层：地板 / 墙 / 窗景 / 墙裙）
    this.sceneReady = false;
    this.sceneImg = null;
  }

  load() {
    if (typeof Image === 'undefined') return this;
    const base = new URL('../assets/atlas/', import.meta.url);
    for (const [key, file] of Object.entries(FILES)) {
      const img = new Image();
      img.onload = () => {
        this._pending--;
        if (this._pending <= 0) this.ready = true;
      };
      img.onerror = () => {
        this._pending--;
      };
      img.src = new URL(file, base).href;
      this.images[key] = img;
      this._pending++;
    }
    const bg = new Image();
    bg.onload = () => { this.sceneReady = true; };
    bg.src = new URL(SCENE_BG, base).href;
    this.sceneImg = bg;
    return this;
  }

  /** 把第 index 帧画到 (dx,dy)，尺寸按 AU 原尺寸 */
  draw(ctx, key, index, dx, dy) {
    const cell = ATLAS_CELL[key];
    const img = this.images[key];
    if (!img || !this.ready) return false;
    const i = Math.max(0, Math.min(cell.frames - 1, index | 0));
    const sx = i * cell.w * UNIT;
    ctx.drawImage(img, sx, 0, cell.w * UNIT, cell.h * UNIT, dx, dy, cell.w, cell.h);
    return true;
  }
}
