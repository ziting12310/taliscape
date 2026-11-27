/* Renderer —— 像素美术渲染（v2.2 规格）
 * 依据：.trae/documents/pixel_art_design.md
 *   美术基准：16×16 AU，×3 → 48px/格，画布 960×768（顶部 48px 立面余量）
 *   视角：约 20° 轻微立体俯视、平行投影，立物画「顶面 / 南面 / 东面」三面
 * 绘制顺序：墙立面（窗景 / 黑板 / 门）→ 地板 → 墙侧 → 窗光斑 → 老师与讲台
 *          → 道具与玩家（按 sortY 排序）→ 光照层 → 回头强红 → 提示条
 */
import { MAP, CellType } from './MapData.js';
import { GameState } from './GameState.js';
import { SHAME_MAX } from './ShameTracker.js';
import { LightingLayer } from './LightingLayer.js';

/* 美术单位：1 AU = 3 屏幕像素；每格 16 AU */
const T = 16;
const GYA = 16;          // 顶部立面余量（AU），网格从 y = 16 起画
const AW = 320;          // 960 / 3
const AH = 256;          // 768 / 3

const P = {
  void: '#07090d',
  wall: '#201b16',
  wallSeam: '#191510',
  wallLight: '#3b332a',
  floorDark: '#1c1712',
  aisle: '#5c4d3c',
  aisleAlt: '#564838',
  slate: '#3b332a',
  slateLight: '#3d4a5e',
  paper: '#e8eefc',
  mist: '#8b96ab',

  woodDark: '#241c14',
  wood: '#33251a',
  woodMid: '#4a3625',
  woodLight: '#6b4f33',
  deskTop: '#7d5c3c',
  deskTopHi: '#a8814f',
  deskFront: '#3a2719',
  deskLeg: '#251a10',

  seatClosed: '#1b2436',
  seatOpen: '#1f3a5c',
  blue: '#4f8cff',
  blueSoft: '#7fb0ff',
  uniform: '#2c3f63',

  exitDeep: '#1e4d33',
  green: '#3ddc84',
  greenLight: '#b8ffd9',

  brokenDeep: '#4a1f24',
  redDeep: '#7a2630',
  red: '#ff5d5d',
  redSoft: '#ff8f8f',

  lampDeep: '#8a5a1f',
  amber: '#ffb020',
  lamp: '#ffd479',
  sunbeam: '#ffe9a8',

  ash: '#2a2f38',
  ashLight: '#55607a',

  skin: '#e8c9a0'
};

const FONT = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif';

const TEACHER_LABEL = { board: '📖 板书', pace: '🚶 踱步', turn: '👀 回头' };

const STATE_LABEL = {
  [GameState.IDLE]: '待机',
  [GameState.PLAYING]: '上课中',
  [GameState.QUIZ_OPEN]: '答题中',
  [GameState.FLASHBACK_QUIZ]: '回忆中',
  [GameState.RESULT]: '结算'
};

/* 顶部墙固定布局（列号换算成 AU：列 × 16） */
const WIN_GROUPS = [
  { col: 2, mirror: false },
  { col: 14, mirror: true }
];
const BOARD = { x: 96, y: 5, w: 128, h: 19 };
const DOOR = { col: 18 };

/* 简单的整数像素矩形 */
function r(ctx, x, y, w, h, color) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
export class Renderer {
  constructor(canvas, dom = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dom = dom;
    this.hint = '';
    this.hintUntil = 0;
    this.lighting = new LightingLayer();
    this._lightFilter = '';
  }

  setHint(text, ms = 1600) {
    this.hint = text;
    this.hintUntil = performance.now() + ms;
  }

  /* ================= 主入口 ================= */

  draw(map, player, sm, teacher, now, shame = null, beatIndex = 0) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 全部场景在「美术像素」坐标系里绘制，1 AU = 3px
    ctx.setTransform(3, 0, 0, 3, 0, 0);

    const shameValue = shame ? shame.value : 0;
    if (!sm.isFrozen()) this.lighting.setShame(shameValue, now);
    this.lighting.update(now);
    const level = this.lighting.level;
    const flickerOn = this.lighting._flickerUntil > now;

    const showTeacher = sm.state !== GameState.IDLE && sm.state !== GameState.RESULT;

    this._drawWallBand(map, now, level, beatIndex, flickerOn, teacher, showTeacher);
    this._drawFloor(map);
    this._drawWallStrips(map);
    this._drawWindowBeams(level);

    if (showTeacher && teacher) this._drawTeacherScene(ctx, teacher, now, beatIndex, level);

    const items = this._collect(map, player, now, beatIndex);
    items.sort((a, b) => a.sortY - b.sortY);
    for (const item of items) item.draw();

    // ---- 回到屏幕像素坐标系做叠加层 ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const filter = this.lighting.cssFilter();
    if (filter !== this._lightFilter) {
      this._lightFilter = filter;
      this.canvas.style.filter = filter === 'none' ? '' : filter;
    }

    this.lighting.draw(ctx, this.canvas.width, this.canvas.height, { beatIndex, now });

    this._drawTurnVignette(teacher, sm);
    this._drawHint(now);
  }

  /* ================= 墙立面 ================= */

  _drawWallBand(map, now, level, beatIndex, flickerOn, teacher, showTeacher) {
    const ctx = this.ctx;

    // 墙体主体（覆盖第 0 行与顶部余量）
    r(ctx, 0, 0, AW, GYA + T, P.wall);
    r(ctx, 0, 0, AW, 1, P.wallLight);

    // 竖向墙缝
    for (let x = T; x < AW; x += T) {
      r(ctx, x, 2, 1, GYA + T - 4, P.wallSeam);
    }

    // 窗洞（两组）
    for (const g of WIN_GROUPS) {
      this._drawCampusWindow(g.col * T, g.mirror, beatIndex);
    }

    this._drawBoard(now, teacher, showTeacher);

    // 挂钟（左墙，第 1 行）
    this._drawClock(level);

    // 吊灯：L2 起逐盏点亮，按拍频闪
    this._drawLamps(level, beatIndex, flickerOn);

    // 后门（出口在 x = 18 列，门在墙面上，门缝光常亮）
    this._drawDoor(now);

    // 墙体底沿
    r(ctx, 0, GYA + T - 2, AW, 1, P.wallSeam);
    r(ctx, 0, GYA + T - 1, AW, 1, P.wallLight);
  }

  /* ---- 窗外校园（近—中—远四层压扁） ---- */
  _drawCampusWindow(x0, mirror, beatIndex) {
    const ctx = this.ctx;
    ctx.save();
    if (mirror) {
      ctx.translate(x0 * 2 + 64, 0);
      ctx.scale(-1, 1);
    }

    // 窗框与纵深
    r(ctx, x0, 2, 64, 28, P.void);
    r(ctx, x0 + 1, 3, 62, 26, P.slateLight);
    r(ctx, x0 + 1, 3, 62, 1, P.mist);

    const sx = x0 + 4;
    const sy = 4;
    const sw = 56;
    const sh = 23;

    // 天空（两层）
    r(ctx, sx, sy, sw, 6, '#cfe6e4');
    r(ctx, sx, sy, sw, 3, '#eaf4e6');
    // 云（极慢移动：6 拍一帧）
    const cloudShift = Math.floor(beatIndex / 6) % 2;
    r(ctx, sx + 5 + cloudShift, sy + 2, 8, 1, '#eaf4e6');
    r(ctx, sx + 9 + cloudShift, sy + 3, 4, 1, '#cfe6e4');
    r(ctx, sx + 34 + cloudShift, sy + 2, 10, 1, '#eaf4e6');
    r(ctx, sx + 38 + cloudShift, sy + 3, 5, 1, '#cfe6e4');

    // 远景树线（对岸）
    for (let i = 0; i < sw; i += 4) {
      r(ctx, sx + i, sy + 5, 3, 2, '#42683a');
      r(ctx, sx + i + 1, sy + 4, 1, 1, '#3f7a3c');
    }

    // 湖面
    r(ctx, sx, sy + 7, sw, 7, '#4f8fa8');
    r(ctx, sx, sy + 7, sw, 1, '#2f5f75');
    r(ctx, sx, sy + 13, sw, 1, '#2f5f75');
    // 水面亮斑（每拍换位的 1px 阶梯）
    const glint = beatIndex % 3;
    r(ctx, sx + 8 + glint * 3, sy + 8, 4, 1, '#8fc4c8');
    r(ctx, sx + 8 + glint * 3, sy + 9, 2, 1, '#8fc4c8');
    r(ctx, sx + 28 + glint * 2, sy + 11, 5, 1, '#8fc4c8');
    r(ctx, sx + 44, sy + 9, 3, 1, '#8fc4c8');

    // 对岸草地与近景草坡
    r(ctx, sx, sy + 14, sw, 9, '#6a9a48');
    r(ctx, sx, sy + 14, sw, 1, '#96c46a');
    r(ctx, sx + 4, sy + 16, 14, 4, '#42683a');
    r(ctx, sx + 34, sy + 16, 12, 3, '#42683a');
    r(ctx, sx, sy + 21, sw, 2, '#42683a');

    // 垂柳（左：树干 + 冠 + 垂枝）
    r(ctx, sx + 2, sy + 2, 2, 11, P.woodDark);
    r(ctx, sx - 1, sy, 9, 3, '#3f7a3c');
    r(ctx, sx + 1, sy - 1, 6, 2, '#78a850');
    for (let i = 0; i < 6; i++) {
      const len = 3 + ((i + beatIndex) % 3);
      r(ctx, sx + i, sy + 3, 1, len, '#78a850');
    }

    // 长椅 + 看书同学（近景草坡）
    const benchX = sx + 17;
    r(ctx, benchX, sy + 18, 12, 1, '#c9b58a');
    r(ctx, benchX + 1, sy + 19, 1, 2, '#b07a58');
    r(ctx, benchX + 10, sy + 19, 1, 2, '#b07a58');

    // 同学 A（翻页：4 拍一帧）
    const pageFlip = Math.floor(beatIndex / 4) % 2;
    this._drawReader(ctx, benchX + 3, sy + 13, pageFlip, false);
    // 同学 B（稍远）
    this._drawReader(ctx, benchX + 8, sy + 12, pageFlip, true);

    // 鸭子（每 2 拍上下 1px）
    const bob = Math.floor(beatIndex / 2) % 2;
    this._drawDuck(ctx, sx + 12, sy + 8 + bob, false);
    this._drawDuck(ctx, sx + 22, sy + 10 - bob, true);
    this._drawDuck(ctx, sx + 40, sy + 8 + bob, false);

    // 窗棂（横向 + 竖向）
    r(ctx, sx + 27, sy, 2, sh, P.slateLight);
    r(ctx, sx, sy + 10, sw, 1, P.slateLight);
    r(ctx, sx, sy, 1, sh, P.ashLight);
    r(ctx, sx + sw - 1, sy, 1, sh, P.ashLight);

    // 玻璃反光（1px 斜线）
    r(ctx, sx + 8, sy + 2, 5, 1, '#eaf4e6');
    r(ctx, sx + 6, sy + 3, 2, 1, '#eaf4e6');

    // 窗台（厚 6px = 2 AU）+ 投影
    r(ctx, x0 + 2, 27, 60, 2, P.slateLight);
    r(ctx, x0 + 2, 27, 60, 1, P.ashLight);
    r(ctx, x0 + 2, 29, 60, 1, P.void);
    r(ctx, x0 + 4, 30, 56, 1, P.floorDark);

    ctx.restore();
  }

  _drawReader(ctx, x, y, pageFlip, far) {
    const skin = P.skin;
    // 头 + 发
    r(ctx, x, y, 3, 3, skin);
    r(ctx, x, y - 1, 3, 1, P.void);
    // 身体（校服）
    r(ctx, x - 1, y + 3, 4, 5, far ? '#2c3f63' : '#3d4a5e');
    // 膝上的书
    r(ctx, x - 1, y + 6, 4, 2, P.paper);
    r(ctx, x - 1, y + 6, 4, 1, P.mist);
    // 翻页：右侧多 1px
    r(ctx, x + 3 + pageFlip, y + 6, 1, 2, P.paper);
  }

  _drawDuck(ctx, x, y, flip) {
    r(ctx, x, y, 3, 2, '#f2e2b0');
    r(ctx, x + (flip ? -1 : 3), y - 1, 2, 1, '#f2e2b0');
    r(ctx, x + (flip ? -2 : 4), y - 1, 1, 1, '#e8933f');
    r(ctx, x + (flip ? 0 : 1), y - 1, 1, 1, '#2f5f75');
    r(ctx, x, y + 2, 3, 1, '#2f5f75');
  }

  /* ---- 黑板 ---- */
  _drawBoard(now, teacher, showTeacher) {
    const ctx = this.ctx;
    const b = BOARD;

    // 木框 + 板面
    r(ctx, b.x - 1, b.y - 1, b.w + 2, b.h + 2, P.woodDark);
    r(ctx, b.x, b.y, b.w, b.h, P.exitDeep);
    r(ctx, b.x, b.y, b.w, 1, 'rgba(61,220,132,0.12)');
    r(ctx, b.x, b.y + b.h - 2, b.w, 2, P.woodMid);   // 粉笔槽

    // 粉笔字：三行，板书阶段补齐最后一行
    const writing = showTeacher && teacher && teacher.phase === 'board';
    const rows = [
      { y: b.y + 4, segs: [[6, 46], [56, 22], [82, 34]] },
      { y: b.y + 9, segs: [[6, 30], [40, 40], [84, 18]] },
      { y: b.y + 14, segs: [[6, 36], [46, 28]] }
    ];
    rows.forEach((row, i) => {
      row.segs.forEach(([ox, len], j) => {
        const visible = !writing ? 1 : Math.min(1, (beatIndexSafe(now) + i + j) / 3);
        if (visible <= 0) return;
        r(ctx, b.x + ox, row.y, Math.round(len * Math.min(1, visible)), 1, P.mist);
      });
    });

    // 粉笔白点（老师写字的手边）
    if (writing) {
      r(ctx, b.x + b.w - 18, b.y + 6, 1, 1, P.paper);
      r(ctx, b.x + b.w - 26, b.y + 11, 1, 1, P.paper);
    }
  }

  /* ---- 挂钟（梯度跟着光档走，隐性时间） ---- */
  _drawClock(level) {
    const ctx = this.ctx;
    const x = 4, y = 18;
    r(ctx, x, y, 9, 9, P.wallSeam);
    r(ctx, x + 1, y + 1, 7, 7, P.paper);
    r(ctx, x + 1, y + 1, 7, 1, P.mist);
    r(ctx, x + 1, y + 7, 7, 1, P.mist);
    // 刻度
    r(ctx, x + 4, y + 1, 1, 1, P.slate);
    r(ctx, x + 4, y + 7, 1, 1, P.slate);
    // 指针：档位越高走得越晚
    const hourLen = 2 + level;
    r(ctx, x + 4, y + 4 - hourLen + 1, 1, hourLen, P.slate);
    r(ctx, x + 4, y + 4, 3, 1, P.slate);
  }

  /* ---- 吊灯 ---- */
  _drawLamps(level, beatIndex, flickerOn) {
    const ctx = this.ctx;
    const litCount = level <= 1 ? 0 : level === 2 ? 1 : level === 3 ? 2 : 3;
    const lampX = [112, 160, 208];
    const flickerDiv = level >= 4 ? 2 : level >= 3 ? 4 : level >= 2 ? 8 : 0;
    const offThisFrame = flickerOn && flickerDiv > 0 && beatIndex % flickerDiv === 0;

    lampX.forEach((x, i) => {
      const lit = i < litCount && !offThisFrame;
      // 吊线
      r(ctx, x, 0, 1, 2, P.void);
      // 灯罩（顶面 / 南面 / 东面）
      r(ctx, x - 3, 2, 7, 1, P.woodMid);
      r(ctx, x - 3, 3, 7, 1, P.lampDeep);
      r(ctx, x + 4, 2, 1, 2, P.woodDark);
      // 灯泡
      r(ctx, x - 1, 4, 2, 3, lit ? P.lamp : P.slateLight);
      r(ctx, x - 1, 4, 1, 1, P.void);
      if (lit) {
        r(ctx, x - 5, 7, 10, 1, 'rgba(255,212,121,0.26)');
        r(ctx, x - 10, 8, 20, 1, 'rgba(255,212,121,0.12)');
      }
    });
  }

  /* ---- 后门（出口方向：门缝光常亮，全场最亮） ---- */
  _drawDoor(now) {
    const ctx = this.ctx;
    const x = DOOR.col * T;

    // 门洞与外框
    r(ctx, x, 3, 16, 30, P.void);
    r(ctx, x + 1, 4, 14, 28, P.woodDark);
    r(ctx, x + 2, 5, 12, 26, '#eaf4e6');          // 走廊亮面
    r(ctx, x + 2, 18, 12, 13, P.greenLight);      // 下半段稍暖
    r(ctx, x + 2, 26, 12, 5, P.grassDark);        // 走廊尽头的地面

    // 半开门扇（靠左，顶面 / 南面分色）
    r(ctx, x + 2, 5, 8, 26, P.woodMid);
    r(ctx, x + 2, 5, 8, 2, '#8a6a45');
    r(ctx, x + 2, 5, 1, 26, P.woodDark);
    r(ctx, x + 9, 5, 1, 26, P.woodDark);
    // 门把手
    r(ctx, x + 8, 16, 1, 3, P.amber);

    // 门缝光带（3 段阶梯，越靠下越亮）
    r(ctx, x + 11, 6, 3, 25, P.green);
    r(ctx, x + 11, 6, 1, 25, P.greenLight);
    r(ctx, x + 12, 10, 2, 16, P.greenLight);

    // 门框内沿高光
    r(ctx, x, 3, 16, 1, P.woodMid);
    r(ctx, x, 3, 1, 30, P.woodDark);
    r(ctx, x + 15, 3, 1, 30, P.woodDark);
  }

  /* ================= 地板 ================= */

  _drawFloor(map) {
    const ctx = this.ctx;

    for (let y = 0; y < MAP.rows; y++) {
      for (let x = 0; x < MAP.cols; x++) {
        const type = map.getCell(x, y).type;
        if (type === CellType.WALL) continue;

        const px = x * T;
        const py = GYA + y * T;
        const base = type === CellType.EXIT
          ? P.exitDeep
          : (x + y) % 2 === 0 ? P.aisle : P.aisleAlt;

        r(ctx, px, py, T, T, base);
        // 木地板：横向板缝（每 8 拍一半格）+ 极轻的格缝
        r(ctx, px, py + 7, T, 1, 'rgba(0,0,0,0.10)');
        r(ctx, px, py + T - 1, T, 1, 'rgba(0,0,0,0.20)');
        r(ctx, px + T - 1, py, 1, T, 'rgba(0,0,0,0.12)');
        // 板面高光（隔行错开）
        if ((y * 2 + x) % 3 === 0) {
          r(ctx, px + 2, py + 1, T - 4, 1, 'rgba(255,255,255,0.045)');
        }
        // 偶发磨损点
        if ((x * 7 + y * 13) % 11 === 0) {
          r(ctx, px + 5, py + 9, 2, 1, P.floorDark);
        }
      }
    }

    // 起点格：暖光地砖
    const s = MAP.start;
    r(ctx, s.x * T, GYA + s.y * T, T, T, '#584c3e');

    // 出口格：绿色地光（阶梯，不用渐变）
    const e = MAP.exit;
    const ex = e.x * T, ey = GYA + e.y * T;
    r(ctx, ex, ey, T, T, P.exitDeep);
    r(ctx, ex + 2, ey + 2, 12, 12, 'rgba(61,220,132,0.16)');
    r(ctx, ex + 4, ey + 4, 8, 8, 'rgba(184,255,217,0.22)');

    // 门光铺到地面（往左下 3 段阶梯）
    for (let i = 0; i < 3; i++) {
      r(ctx, ex - 6 - i * 4, ey + 4 + i * 4, 6, 12 - i * 3,
        `rgba(61,220,132,${(0.10 - i * 0.03).toFixed(2)})`);
    }
  }

  /* 左右墙与下墙：只画可见的顶面 + 内侧亮边 */
  _drawWallStrips(map) {
    const ctx = this.ctx;
    const top = GYA + T;             // 第 1 行顶
    const bottom = AH - T;           // 第 14 行顶
    const h = bottom - top;

    // 左墙
    r(ctx, 0, top, T, h, P.wall);
    r(ctx, T - 2, top, 1, h, P.wallLight);
    r(ctx, 0, top, 1, h, P.wallSeam);
    // 右墙
    r(ctx, AW - T, top, T, h, P.wall);
    r(ctx, AW - T + 1, top, 1, h, P.wallLight);
    // 下墙
    r(ctx, 0, bottom, AW, T, P.wall);
    r(ctx, 0, bottom, AW, 1, P.wallLight);
    r(ctx, 0, bottom + 2, AW, 1, P.wallSeam);

    // 墙脚投影（压向内 2px）
    r(ctx, T, top, 2, h, P.floorDark);
    r(ctx, AW - T - 2, top, 2, h, P.floorDark);
    r(ctx, 0, bottom - 2, AW, 2, P.floorDark);
  }

  /* 窗光斑：3 段阶梯，长度随光档递减，颜色只允许暖金 */
  _drawWindowBeams(level) {
    const ctx = this.ctx;
    const bands = [5, 4, 4, 3, 2][level];
    WIN_GROUPS.forEach((g) => {
      const x0 = g.col * T;
      for (let i = 0; i < bands; i++) {
        const y = GYA + T + i * 2;
        const alpha = Math.max(0.05, 0.20 - i * 0.035);
        r(ctx, x0 + 4 + i * 3, y, 58 - i * 4, 2,
          `rgba(255,233,168,${alpha.toFixed(2)})`);
      }
      // 窗正下方的地面亮斑
      r(ctx, x0 + 4, GYA + T, 56, 3, 'rgba(255,233,168,0.10)');
    });

    // 斜射进来的长光带（阶梯块，不用渐变）：光档越高越短越黄
    const steps = [7, 6, 5, 4, 3][level];
    WIN_GROUPS.forEach((g, gi) => {
      const x0 = g.col * T;
      for (let i = 0; i < steps; i++) {
        const y = GYA + T + 1 + i * 6;
        const x = x0 + 6 + i * 3 + gi * 2;
        const w = 62 - i * 5;
        const alpha = Math.max(0.04, 0.24 - i * 0.03);
        r(ctx, x, y, w, 4, `rgba(255,233,168,${alpha.toFixed(3)})`);
      }
    });
  }

  /* ================= 老师与讲台 ================= */

  _drawTeacherScene(ctx, teacher, now, beatIndex, level) {
    const cx = 160;
    const footY = GYA + T;     // 站在黑板前，脚底在第 1 行顶沿
    const phase = teacher.phase;

    // 老师（三态：板书背对 / 踱步侧身 / 回头正面）
    const sway = phase === 'pace' ? (Math.floor(now / 400) % 2 === 0 ? -2 : 2) : 0;
    const x = cx + sway - 6;
    const top = footY - 30;

    // 地面投影（阶梯矩形，随光档拉长）
    const shadowLen = 2 + level;
    r(ctx, x + 2 + shadowLen, footY - 1, 10, 2, P.floorDark);

    // 腿
    r(ctx, x + 2, footY - 8, 3, 8, P.void);
    r(ctx, x + 7, footY - 8, 3, 8, P.void);

    // 身体（西装，顶面 / 南面分色）
    r(ctx, x - 1, top + 8, 12, 14, P.void);       // 描边
    r(ctx, x, top + 9, 10, 11, '#5c6782');
    r(ctx, x, top + 9, 10, 2, P.mist);
    r(ctx, x + 3, top + 9, 4, 1, P.paper);        // 白衬衫领
    r(ctx, x, top + 19, 10, 2, P.woodDark);       // 下摆

    // 头
    r(ctx, x + 1, top + 1, 8, 7, P.skin);

    if (phase === 'board') {
      // 背对：整颗后脑、抬右臂（手边有粉笔）
      r(ctx, x + 1, top + 1, 8, 7, P.woodDark);
      r(ctx, x + 1, top + 1, 8, 1, P.slateLight);
      r(ctx, x + 3, top + 4, 4, 1, P.wallSeam);
      r(ctx, x + 10, top + 1, 2, 6, '#55607a');
      r(ctx, x + 10, top, 2, 1, P.skin);
      r(ctx, x + 11, top - 2, 1, 2, P.paper);     // 粉笔
      r(ctx, x + 2, top + 18, 3, 1, P.wallSeam);
    } else if (phase === 'pace') {
      // 侧身：露半张脸 + 夹教案
      r(ctx, x + 1, top + 1, 6, 2, P.void);
      r(ctx, x + 5, top + 3, 2, 1, P.void);
      r(ctx, x + 9, top + 10, 3, 5, P.paper);     // 教案
      r(ctx, x + 9, top + 10, 3, 1, P.mist);
      r(ctx, x + 10, top + 12, 1, 2, P.mist);
    } else {
      // 回头：正面 + 眼镜白条 + 「!」
      r(ctx, x + 1, top, 8, 3, P.void);
      r(ctx, x + 1, top + 4, 8, 1, P.paper);      // 眼镜
      r(ctx, x + 1, top + 4, 2, 1, P.paper);
      r(ctx, x + 3, top + 7, 4, 1, P.void);       // 嘴角
      const blink = Math.floor(now / 200) % 2 === 0;
      if (blink) {
        r(ctx, x + 4, top - 6, 1, 5, P.red);
        r(ctx, x + 3, top - 3, 3, 1, P.red);
      }
    }

    // 讲台（顶面 / 南面 / 东面）：画在老师之后，自然挡住脚部
    const podX = 134, podY = GYA + 12;
    r(ctx, podX + 2, podY + 2, 52, 4, P.floorDark);
    r(ctx, podX, podY, 52, 3, P.woodMid);
    r(ctx, podX, podY, 52, 1, P.woodLight);
    r(ctx, podX, podY + 3, 52, 5, P.wood);
    r(ctx, podX + 52, podY + 3, 1, 5, P.woodDark);
    if (level >= 2) {
      r(ctx, podX + 45, podY - 1, 3, 1, P.lamp);
      r(ctx, podX + 46, podY, 1, 2, P.lamp);
    }
  }

  /* ================= 道具与角色（sortY 排序） ================= */

  _collect(map, player, now, beatIndex) {
    const items = [];

    for (let y = 1; y < MAP.rows - 1; y++) {
      for (let x = 1; x < MAP.cols - 1; x++) {
        const type = map.getCell(x, y).type;
        if (type === CellType.AISLE) continue;

        const px = x * T;
        const py = GYA + y * T;
        const footY = py + T;

        if (type === CellType.DESK) {
          items.push({ sortY: footY + 3, draw: () => this._drawDesk(px, py) });
        } else if (type === CellType.CLUTTER) {
          items.push({ sortY: footY + 2, draw: () => this._drawClutter(px, py) });
        } else if (type === CellType.START) {
          items.push({ sortY: footY + 2, draw: () => this._drawStartDesk(px, py, now) });
        } else if (type === CellType.SEAT_CLOSED) {
          items.push({ sortY: footY + 2, draw: () => this._drawSeat(px, py, 'closed', now, beatIndex) });
        } else if (type === CellType.SEAT_OPEN) {
          items.push({ sortY: footY + 4, draw: () => this._drawSeat(px, py, 'open', now, beatIndex) });
        } else if (type === CellType.SEAT_BROKEN) {
          items.push({ sortY: footY + 4, draw: () => this._drawSeat(px, py, 'broken', now, beatIndex) });
        } else if (type === CellType.SEAT_OCCUPIED) {
          items.push({ sortY: footY + 6, draw: () => this._drawSeat(px, py, 'occupied', now, beatIndex) });
        }
      }
    }

    // 玩家
    const p = this._playerFoot(player);
    items.push({
      sortY: p.footY + 7,
      draw: () => this._drawPlayer(player, now, beatIndex)
    });

    return items;
  }

  _playerFoot(player) {
    let vx = player.x;
    let vy = player.y;
    if (player.action && player.action.type === 'move') {
      const prog = player.action.progress || 0;
      vx = player.x + (player.action.tx - player.x) * prog;
      vy = player.y + (player.action.ty - player.y) * prog;
    }
    return {
      cx: vx * T + T / 2,
      footY: GYA + (vy + 1) * T
    };
  }

  /* ---- 课桌（南面朝镜头：顶面 + 桌肚 + 桌腿） ---- */
  _drawDesk(px, py) {
    const ctx = this.ctx;
    const x = px + 2, w = 12;
    const topY = py + 8, topH = 3, frontH = 2;

    // 投影
    r(ctx, x + 1, topY + topH + frontH + 1, w, 1, P.floorDark);
    r(ctx, x + 2, topY + topH + frontH, w - 2, 1, 'rgba(0,0,0,0.22)');

    // 顶面（比地板亮，木纹一道）
    r(ctx, x, topY, w, topH, P.deskTop);
    r(ctx, x, topY, w, 1, P.deskTopHi);
    r(ctx, x + 1, topY + 1, w - 2, 1, P.woodMid);
    r(ctx, x + w - 1, topY, 1, topH, P.woodMid);

    // 桌肚：压深，让桌面立起来
    r(ctx, x, topY + topH, w, frontH, P.deskFront);
    r(ctx, x, topY + topH, w, 1, P.woodMid);
    r(ctx, x + w - 1, topY + topH, 1, frontH, P.woodDark);

    // 两条桌腿
    r(ctx, x + 1, topY + topH + frontH, 2, 2, P.deskLeg);
    r(ctx, x + w - 3, topY + topH + frontH, 2, 2, P.deskLeg);
  }

  /* ---- 桌上露出的椅背（收起 / 落座共用） ---- */
  _drawChairBack(px, py, extraH) {
    const ctx = this.ctx;
    const x = px + 4, w = 8;
    const top = py + 5 - extraH;

    r(ctx, x - 1, top - 1, w + 2, extraH + 4, P.void);
    r(ctx, x, top, w, extraH + 3, P.seatClosed);
    r(ctx, x, top, w, 1, P.slateLight);
    r(ctx, x, top + 1, w, 1, P.seatOpen);
    // 椅背竖棱
    r(ctx, x + 3, top + 2, 1, extraH + 1, P.seatClosed);
    r(ctx, x + 6, top + 2, 1, extraH + 1, P.seatClosed);
    // 露出的坐面一角
    r(ctx, x, py + 7, w, 1, P.seatOpen);
  }

  /* ---- 书本/书包 ---- */
  _drawClutter(px, py) {
    const ctx = this.ctx;
    const x = px + 3, y = py + 5;
    r(ctx, x + 1, y + 8, 10, 2, P.floorDark);
    // 三本书叠放
    r(ctx, x, y + 5, 10, 3, P.uniform);
    r(ctx, x + 1, y + 2, 9, 3, P.woodLight);
    r(ctx, x, y, 10, 2, P.ashLight);
    r(ctx, x, y + 5, 10, 1, P.mist);
    r(ctx, x + 1, y + 2, 9, 1, P.woodMid);
    r(ctx, x, y, 10, 1, P.slateLight);
    // 书包带
    r(ctx, x + 9, y - 2, 2, 4, P.slateLight);
  }

  /* ---- 起点：书包 + 暖光边（人不站在课桌上） ---- */
  _drawStartDesk(px, py, now) {
    const ctx = this.ctx;
    const x = px + 4, y = py + 5;
    // 地上的书包
    r(ctx, x, y + 1, 8, 2, P.floorDark);
    r(ctx, x + 1, y + 1, 7, 8, P.seatOpen);
    r(ctx, x + 1, y + 1, 7, 1, P.blueSoft);
    r(ctx, x + 3, y + 4, 3, 2, P.seatClosed);
    r(ctx, x + 8, y - 1, 1, 4, P.slateLight);
    // 2px 暖光边（2 AU 淡金）
    const pulse = Math.floor(now / 400) % 2;
    r(ctx, px + 1, py + T - 2, T - 2, 1, pulse ? P.lamp : P.amber);
  }

  /* ---- 座椅四态：靠「椅背高度 / 位置 / 是否有人」一眼区分 ---- */
  _drawSeat(px, py, state, now, beatIndex) {
    const ctx = this.ctx;

    if (state === 'closed') {
      // 椅子收起：贴桌，只露出低矮椅背
      this._drawDesk(px, py);
      this._drawChairBack(px, py, 0);
      // 可交互提示：底部 1px 蓝线
      r(ctx, px + 4, py + T - 1, 8, 1, P.blue);
      return;
    }

    if (state === 'open') {
      // 椅子拉开：桌后空出来，椅子整只站在桌子前面
      this._drawDesk(px, py);
      r(ctx, px + 4, py + 5, 8, 1, 'rgba(0,0,0,0.35)');   // 桌后空位的暗影

      const cx = px + 3;
      // 拖动痕
      r(ctx, cx + 4, py + 3, 6, 1, 'rgba(0,0,0,0.30)');
      r(ctx, cx + 5, py + 6, 4, 1, 'rgba(0,0,0,0.22)');

      // 椅背（整只可见）
      r(ctx, cx + 1, py + 15, 10, 1, 'rgba(0,0,0,0.30)');
      r(ctx, cx - 1, py + 9, 10, 8, P.void);
      r(ctx, cx, py + 10, 8, 6, P.seatClosed);
      r(ctx, cx, py + 10, 8, 1, P.slateLight);
      r(ctx, cx, py + 11, 8, 1, P.seatOpen);
      r(ctx, cx + 3, py + 12, 1, 4, P.seatClosed);
      r(ctx, cx + 6, py + 12, 1, 4, P.seatClosed);

      // 坐面（顶面亮一档）
      r(ctx, cx - 1, py + 17, 10, 1, P.void);
      r(ctx, cx, py + 17, 8, 1, P.seatOpen);
      r(ctx, cx, py + 17, 8, 1, P.blueSoft);
      // 椅腿
      r(ctx, cx + 1, py + 18, 1, 1, P.slateLight);
      r(ctx, cx + 7, py + 18, 1, 1, P.slateLight);
      return;
    }

    if (state === 'broken') {
      // 一条腿断开、椅面倾斜 15°，红描边 2 帧脉冲
      this._drawDesk(px, py);
      const cx = px + 4;
      const frame = Math.floor(now / 320) % 2;
      const outline = frame ? P.red : P.redDeep;

      // 倾斜的靠背（逐级右移，做出 15° 斜度）
      r(ctx, cx + 1, py + 3, 2, 2, P.seatOpen);
      r(ctx, cx + 2, py + 5, 3, 2, P.seatOpen);
      r(ctx, cx + 3, py + 7, 4, 2, P.seatOpen);
      r(ctx, cx + 4, py + 7, 3, 1, outline);       // 靠背红边
      // 坐面
      r(ctx, cx, py + 9, 9, 2, P.seatOpen);
      r(ctx, cx, py + 9, 9, 1, P.blueSoft);
      // 一条完好的腿
      r(ctx, cx + 1, py + 11, 2, 2, P.slateLight);
      // 断腿横躺在地上
      r(ctx, cx + 5, py + 13, 4, 1, P.woodDark);
      r(ctx, cx + 5, py + 12, 1, 1, outline);
      // 断裂口
      r(ctx, cx + 8, py + 9, 1, 2, outline);
      // 小感叹号（不用 emoji）
      r(ctx, cx + 11, py + 1, 1, 3, P.redSoft);
      r(ctx, cx + 11, py + 5, 1, 1, P.redSoft);
      return;
    }

    // occupied：椅背抬高 + 同学上身 + 头（靠「有没有人」一眼区分）
    this._drawDesk(px, py);
    const cx = px + 4;
    const w = 8;
    this._drawChairBack(px, py, 2);
    // 校服肩背（宽出椅背 1 AU 的剪影）
    r(ctx, cx - 1, py + 2, w + 2, 3, P.uniform);
    r(ctx, cx - 1, py + 2, w + 2, 1, P.mist);
    r(ctx, cx + 3, py + 3, 1, 2, P.ashLight);     // 背中线
    // 头：深棕头发 + 后颈
    r(ctx, cx + 1, py - 2, 6, 5, P.void);
    r(ctx, cx + 2, py - 1, 5, 4, P.woodDark);
    r(ctx, cx + 2, py - 1, 5, 1, P.woodMid);      // 发顶高光
    r(ctx, cx + 2, py + 3, 5, 1, P.skin);         // 后颈
    // 点头（2 帧：发顶高光下移 1px）
    if (Math.floor(now / 400) % 2 === 0) {
      r(ctx, cx + 2, py, 5, 1, P.woodMid);
    }
    // 挂椅背的书包
    r(ctx, cx + w, py + 4, 3, 3, P.seatOpen);
    r(ctx, cx + w, py + 4, 3, 1, P.blueSoft);
  }

  /* ---- 玩家 ---- */
  _drawPlayer(player, now, beatIndex) {
    const ctx = this.ctx;
    const f = this._playerFoot(player);
    const cx = Math.round(f.cx);
    const footY = Math.round(f.footY);

    // 站位光：阶梯矩形，不用渐变
    const breathe = player.isBusy() ? 0 : Math.floor(now / 400) % 2;
    r(ctx, cx - 9, footY - 2, 18, 1, `rgba(79,140,255,${0.10 + breathe * 0.04})`);
    r(ctx, cx - 6, footY - 1, 12, 1, `rgba(159,196,255,${0.16 + breathe * 0.06})`);

    // 移动时脚下尘土（整像素 2×2）
    if (player.action && player.action.type === 'move') {
      const frame = Math.floor((player.action.progress || 0) * 4);
      r(ctx, cx - 8, footY - 1, 2, 2, P.slateLight);
      r(ctx, cx + 6 - frame, footY - 2, 2, 2, P.slateLight);
    }

    // 拉椅目标高亮
    if (player.action && player.action.type === 'pull') {
      const tp = Math.floor(now / 160) % 2;
      const tx = player.action.tx * T, ty = GYA + player.action.ty * T;
      r(ctx, tx + 2, ty + 2, 12, 1, tp ? P.amber : P.lamp);
      r(ctx, tx + 2, ty + 13, 12, 1, tp ? P.amber : P.lamp);
      r(ctx, tx + 2, ty + 2, 1, 12, tp ? P.amber : P.lamp);
      r(ctx, tx + 13, ty + 2, 1, 12, tp ? P.amber : P.lamp);
    }

    const dir = player.facing || 's';
    const walking = player.action && player.action.type === 'move';
    const step = walking ? Math.floor((player.action.progress || 0) * 4) % 2 : 0;
    const bob = walking ? step : Math.floor(now / 400) % 2;

    this._drawStudentSprite(ctx, cx, footY, dir, step, bob);

    // 交互提示：脚下若是可拉开的座椅，画 1px 蓝箭头
    if (!player.isBusy() && player.map) {
      const below = { x: player.x, y: player.y + 1 };
      if (player.map.isPullable(below.x, below.y)) {
        r(ctx, cx - 1, footY + 2, 3, 1, P.blue);
      }
    }
  }

  _drawStudentSprite(ctx, cx, footY, dir, step, bob) {
    const x = cx - 5;
    const top = footY - 22 + (bob ? 1 : 0);

    // 投影
    r(ctx, cx - 5, footY - 1, 10, 2, P.floorDark);

    // 腿
    const legY = footY - 6;
    if (dir === 's' || dir === 'n') {
      r(ctx, x + 2, legY, 3, 6, P.seatClosed);
      r(ctx, x + 5, legY - step, 3, 6, P.seatClosed);
      r(ctx, x + 2, footY - 1, 3, 1, P.paper);
      r(ctx, x + 5, footY - 1 - step, 3, 1, P.paper);
    } else {
      r(ctx, x + 1, legY, 4, 6, P.seatClosed);
      r(ctx, x + 5, legY, 4, 6, P.seatClosed);
      r(ctx, x + 1 + step, footY - 1, 4, 1, P.paper);
      r(ctx, x + 5 + step, footY - 1, 4, 1, P.paper);
    }

    // 双肩包（背面 / 侧面第二剪影）
    if (dir === 'n') r(ctx, x + 2, top + 9, 6, 7, P.seatOpen);
    if (dir === 'w' || dir === 'e') {
      r(ctx, dir === 'e' ? x - 1 : x + 10, top + 9, 2, 6, P.seatOpen);
    }

    // 身体（校服）+ 1px 描边，保证在暗地板上可读
    r(ctx, x - 1, top + 6, 12, 12, P.void);
    r(ctx, x, top + 7, 10, 10, '#35507e');
    r(ctx, x, top + 7, 10, 1, P.blueSoft);
    r(ctx, x + 4, top + 8, 2, 9, '#243456');
    // 手臂
    r(ctx, x - 1, top + 8, 1, 6, P.uniform);
    r(ctx, x + 10, top + 8, 1, 6, P.uniform);
    r(ctx, x - 1, top + 8, 1, 1, P.blueSoft);
    r(ctx, x + 10, top + 8, 1, 1, P.blueSoft);

    // 头
    r(ctx, x, top, 10, 9, P.void);
    r(ctx, x + 1, top + 1, 8, 7, P.skin);
    if (dir === 's') {
      r(ctx, x + 1, top, 8, 3, P.void);
      r(ctx, x, top + 1, 1, 4, P.void);
      r(ctx, x + 9, top + 1, 1, 4, P.void);
      r(ctx, x + 3, top + 4, 1, 1, P.void);
      r(ctx, x + 6, top + 4, 1, 1, P.void);
    } else if (dir === 'n') {
      r(ctx, x + 1, top, 8, 6, P.void);
      r(ctx, x + 3, top + 6, 4, 1, P.skin);
    } else {
      r(ctx, x + 1, top, 8, 3, P.void);
      r(ctx, x + (dir === 'e' ? 8 : 1), top + 3, 1, 4, P.void);
      r(ctx, x + (dir === 'e' ? 6 : 3), top + 4, 1, 1, P.void);
    }
  }

  /* ================= 氛围叠加 ================= */

  _drawTurnVignette(teacher, sm) {
    if (sm.state !== GameState.PLAYING || !teacher || teacher.phase !== 'turn') return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 三层阶梯暗角（固定 alpha，不用渐变）
    const bands = [
      { t: 96, a: 0.18 },
      { t: 56, a: 0.10 },
      { t: 30, a: 0.05 }
    ];
    for (const b of bands) {
      ctx.globalAlpha = b.a;
      ctx.fillStyle = '#7a2630';
      ctx.fillRect(0, 0, w, b.t);
      ctx.fillRect(0, h - b.t, w, b.t);
      ctx.fillRect(0, 0, b.t, h);
      ctx.fillRect(w - b.t, 0, b.t, h);
    }
    ctx.globalAlpha = 1;
  }

  _drawHint(now) {
    if (!this.hint || now >= this.hintUntil) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.font = `13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(this.hint).width;
    const bw = Math.round(tw + 28);
    const bh = 30;
    const bx = Math.round((w - bw) / 2);
    const by = h - 60;

    ctx.fillStyle = 'rgba(7,9,13,0.92)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#3d4a5e';
    ctx.fillRect(bx, by, bw, 1);
    ctx.fillRect(bx, by + bh - 1, bw, 1);
    ctx.fillRect(bx, by, 1, bh);
    ctx.fillRect(bx + bw - 1, by, 1, bh);

    ctx.fillStyle = '#e8eefc';
    ctx.fillText(this.hint, w / 2, by + bh / 2 + 1);
  }

  /* ================= HUD ================= */

  updateHud({ sm, teacher, player, shame }) {
    const d = this.dom;
    if (!d.phaseText) return;

    if (sm.state === GameState.PLAYING && teacher) {
      const label = TEACHER_LABEL[teacher.phase] || teacher.phase;
      d.phaseText.textContent = teacher.phase === 'turn' ? `${label}！` : label;
    } else {
      d.phaseText.textContent = STATE_LABEL[sm.state] || sm.state;
    }

    if (d.statusText) {
      let text = '板书中，可以行动';
      if (player.isBusy()) {
        text = player.action && player.action.type === 'pull' ? '拉开座椅…' : '起身挪动中…';
      } else if (teacher && teacher.phase === 'turn') {
        text = '停下！老师回头了';
      } else if (teacher && teacher.phase === 'pace') {
        text = '老师踱步中，抓紧行动';
      }
      d.statusText.textContent = sm.state === GameState.PLAYING ? text : '';
    }

    const ratio = shame.value / SHAME_MAX;
    if (d.shameFill) {
      d.shameFill.style.width = `${(ratio * 100).toFixed(1)}%`;
      d.shameFill.classList.toggle('mid', shame.value >= 60 && shame.value < 120);
      d.shameFill.classList.toggle('high', shame.value >= 120);
    }
    if (d.shameText) d.shameText.textContent = `${shame.value} / ${SHAME_MAX}`;

    if (d.stageWrap) {
      d.stageWrap.classList.toggle(
        'shake',
        sm.state === GameState.PLAYING && teacher && teacher.phase === 'turn'
      );
    }
  }
}

/* 板书逐字出现的进度：按当前时间粗分 3 段（与拍无强绑定，仅视觉） */
function beatIndexSafe(now) {
  return Math.floor(now / 400) % 3;
}




