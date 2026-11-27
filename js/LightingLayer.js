/* LightingLayer —— 五档光照原型（v2.1 规格）
 * 依据：.trae/documents/pixel_art_design.md 第四章
 * 职责：只读羞愧值，输出画面叠加；不改玩法、不碰 DOM，便于单测
 * 设计铁律：全程明亮（亮度差不做压迫感），焦虑来自色温 / 频闪 / 边缘红
 */

export const SHAME_MAX = 150;

/** 每升/降一档的动画间隔（3 帧阶梯 ≈ 100ms/档） */
export const STEP_MS = 100;

/** 降档迟滞：必须低于阈值再低 5 点才回落，防止边界闪烁 */
export const HYSTERESIS = 5;

/** 边缘暗红色（只做边缘，不覆盖画面中心） */
const EDGE_COLOR = '#7a2630';

export const LIGHT_LEVELS = [
  {
    id: 'L0', name: '午后', min: 0,
    layers: [{ color: '#ffe9a8', alpha: 0.14 }],
    edge: 0, flicker: 0, dim: 0,
    filter: 'none'
  },
  {
    id: 'L1', name: '斜阳', min: 30,
    layers: [{ color: '#ffd479', alpha: 0.10 }],
    edge: 0, flicker: 0, dim: 0,
    filter: 'saturate(0.97) brightness(0.99)'
  },
  {
    id: 'L2', name: '低斜阳', min: 60,
    layers: [{ color: '#ffb020', alpha: 0.12 }],
    edge: 0.04, flicker: 8, dim: 0.05,
    filter: 'saturate(0.92) brightness(0.97)'
  },
  {
    id: 'L3', name: '病态黄', min: 90,
    layers: [
      { color: '#e8b25a', alpha: 0.15 },
      { color: '#b8a24a', alpha: 0.03 }
    ],
    edge: 0.06, flicker: 4, dim: 0.05,
    filter: 'saturate(0.88) brightness(0.98) contrast(1.02)'
  },
  {
    id: 'L4', name: '黄昏', min: 120,
    layers: [
      { color: '#f0b264', alpha: 0.17 },
      { color: '#b8a24a', alpha: 0.04 }
    ],
    edge: 0.09, flicker: 2, dim: 0.05,
    filter: 'saturate(0.80) brightness(0.97) contrast(1.03)'
  }
];

/** 纯函数：羞愧值 → 目标档位（不含迟滞） */
export function levelForShame(value) {
  if (value >= 120) return 4;
  if (value >= 90) return 3;
  if (value >= 60) return 2;
  if (value >= 30) return 1;
  return 0;
}

export class LightingLayer {
  constructor() {
    this.reset();
  }

  reset() {
    this.shame = 0;
    this.level = 0;
    this.target = 0;
    this._stepAt = 0;
    this._armedBeat = -1;
    this._flickerUntil = 0;
  }

  /**
   * 写入羞愧值。升档立即排队，降档带迟滞。
   * @param {number} value 0–150
   * @param {number} now 毫秒时间戳（用同一时间基准）
   */
  setShame(value, now = 0) {
    const v = Math.max(0, Math.min(SHAME_MAX, value));
    this.shame = v;

    let next = levelForShame(v);

    // 迟滞：只有当羞愧值跌到「当前档阈值 − 5」以下，才允许降档
    if (next < this.level && v > LIGHT_LEVELS[this.level].min - HYSTERESIS) {
      next = this.level;
    }

    if (next !== this.target) {
      this.target = next;
      this._stepAt = now;           // 第一档立刻生效，后续按 STEP_MS 递增
    }
    if (next === this.level) this._stepAt = 0;
  }

  /** 按时间推进阶梯升降，一次只走一档 */
  update(now) {
    if (this.level === this.target) {
      this._stepAt = 0;
      return;
    }
    let guard = 0;
    while (this.level !== this.target && now >= this._stepAt && guard++ < 10) {
      this.level += this.target > this.level ? 1 : -1;
      this._stepAt += STEP_MS;
    }
  }

  /** 当前档位描述 */
  describe() {
    const lv = LIGHT_LEVELS[this.level];
    return {
      level: this.level,
      id: lv.id,
      name: lv.name,
      target: this.target,
      shame: this.shame,
      flickering: Boolean(this._flickerState)
    };
  }

  /** 当前档位的整体滤镜（亮度 / 饱和 / 对比），由渲染层挂到 canvas 上 */
  cssFilter() {
    return LIGHT_LEVELS[this.level].filter || 'none';
  }

  /**
   * 绘制叠加层。调用方负责在场景之后、HUD 与回头强红之前调用。
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w @param {number} h 画布尺寸
   * @param {{beatIndex?:number, now?:number}} opts
   */
  draw(ctx, w, h, { beatIndex = 0, now = 0 } = {}) {
    const lv = LIGHT_LEVELS[this.level];
    this._tickFlicker(lv, beatIndex, now);

    ctx.save();

    // 色温层：overlay 混合——只改色温不改明度，避免高羞愧档「越玩越黑」
    ctx.globalCompositeOperation = 'overlay';
    for (const layer of lv.layers) {
      ctx.globalAlpha = layer.alpha;
      ctx.fillStyle = layer.color;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = 'source-over';

    // 频闪：按拍掉落 1 帧，模拟灯管不稳（不是全屏爆闪）
    const flickerOn = this._flickerUntil > now;
    if (flickerOn && lv.dim > 0) {
      ctx.globalAlpha = lv.dim;
      ctx.fillStyle = '#1a1206';
      ctx.fillRect(0, 0, w, h);
    }

    ctx.globalAlpha = 1;
    if (lv.edge > 0) this._drawEdge(ctx, w, h, lv.edge);

    ctx.restore();

    this._flickerState = flickerOn;
  }

  /** 频闪计时：只在跨拍的第一帧掉落 */
  _tickFlicker(lv, beatIndex, now) {
    if (!lv.flicker) {
      this._armedBeat = -1;
      this._flickerUntil = 0;
      return;
    }
    if (this._armedBeat !== beatIndex) {
      this._armedBeat = beatIndex;
      if (beatIndex % lv.flicker === 0) this._flickerUntil = now + 60;
    }
  }

  /** 三层阶梯暗角（固定 alpha，不用渐变） */
  _drawEdge(ctx, w, h, alpha) {
    const bands = [
      [0.075, 1],
      [0.045, 0.62],
      [0.028, 0.32]
    ];
    for (const [ratio, weight] of bands) {
      const t = Math.max(3, Math.round(h * ratio));
      ctx.globalAlpha = alpha * weight;
      ctx.fillStyle = EDGE_COLOR;
      ctx.fillRect(0, 0, w, t);
      ctx.fillRect(0, h - t, w, t);
      ctx.fillRect(0, 0, t, h);
      ctx.fillRect(w - t, 0, t, h);
    }
  }
}


