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
import { Atlas } from './Atlas.js';

/* 美术单位：1 AU = 2 屏幕像素；每格 24 AU（= 48px，屏幕上与 v2.7 同尺寸，但颗粒更细） */
const T = 24;
const GYA = 24;          // 顶部立面余量（AU），网格从 y = 24 起画
const AW = 480;          // 960 / 2
const AH = 384;          // 768 / 2
export const UNIT = 2;

const P = {
  void: '#07090d',
  wall: '#2e2419',
  wallSeam: '#241b12',
  wallLight: '#4a3a2a',
  floorDark: '#1c1712',
  aisle: '#6d5740',
  aisleAlt: '#67513a',
  slate: '#3b332a',
  slateLight: '#3d4a5e',
  paper: '#e8eefc',
  mist: '#8b96ab',

  woodDark: '#241c14',
  wood: '#33251a',
  woodMid: '#4a3625',
  woodLight: '#6b4f33',
  deskTop: '#9a6f45',
  deskTopHi: '#c9a06d',
  deskFront: '#4a3320',
  deskLeg: '#31220f',

  seatClosed: '#22344c',
  seatOpen: '#3a5c90',
  blue: '#4f8cff',
  blueSoft: '#7fb0ff',
  uniform: '#2c3f63',

  exitDeep: '#224f38',
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

/* 画布内文字统一走「像素字」：宋体内嵌点阵 + 等宽，避免系统无衬线体的顺滑感 */
const FONT = '"SimSun", "宋体", "NSimSun", monospace';

const TEACHER_LABEL = { board: '板书', pace: '踱步', turn: '回头' };

/* 座椅面板的三种同族蓝：按「行」取色，看起来像分批采购的椅子，不花 */
const SEAT_TINTS = [
  { panel: '#3a5c90', edge: '#8bb4e8', dark: '#22344c' },
  { panel: '#35547f', edge: '#84a9d6', dark: '#1f3044' },
  { panel: '#41649a', edge: '#94bdf0', dark: '#26384f' }
];

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
const BOARD = { x: 144, y: 7, w: 192, h: 28 };
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
    this.atlas = new Atlas().load();
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

    // 全部场景在「美术像素」坐标系里绘制，1 AU = 2px
    ctx.setTransform(2, 0, 0, 2, 0, 0);

    const shameValue = shame ? shame.value : 0;
    if (!sm.isFrozen()) this.lighting.setShame(shameValue, now);
    this.lighting.update(now);
    const level = this.lighting.level;
    const flickerOn = this.lighting._flickerUntil > now;

    const showTeacher = sm.state !== GameState.IDLE && sm.state !== GameState.RESULT;

    // 静态层整图（960×768，1:1 屏幕像素）：命中就直接贴，省掉上千次 fillRect
    const bg = this.atlas && this.atlas.sceneReady ? this.atlas.sceneImg : null;
    this._bgPainted = !!bg;
    if (bg) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bg, 0, 0);
      ctx.setTransform(2, 0, 0, 2, 0, 0);
    }

    this._drawWallBand(map, now, level, beatIndex, flickerOn, teacher, showTeacher);
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

    // 可交互提示：相邻可拉座椅 / 出口，回到美术坐标保证像素对齐
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    this._drawInteractHints(map, player, now, beatIndex);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    this._drawTurnVignette(teacher, sm);
    this._drawPhaseBanner(teacher, sm, now);
    this._drawHint(now);
  }

  /* ================= 墙立面 ================= */

  _drawWallBand(map, now, level, beatIndex, flickerOn, teacher, showTeacher) {
    const ctx = this.ctx;

    // 静态层：有整图背景时直接跳过（背景里已含墙、窗、地板、墙裙）
    if (!this._bgPainted) {
      this._drawFloor(map);
      this._drawWallBase(beatIndex);
      this._drawWallStrips(map);
    }

    this._drawBoard(now, teacher, showTeacher);

    // 挂钟（左墙，第 1 行）
    this._drawClock(level);

    // 吊灯：L2 起逐盏点亮，按拍频闪
    this._drawLamps(level, beatIndex, flickerOn);

    // 后门（出口在 x = 18 列，门在墙面上，门缝光常亮）
    this._drawDoor(now);
  }

  /* ---- 静态墙体基座：墙身 + 竖缝 + 两组窗 + 底沿（可整体烘焙） ---- */
  _drawWallBase(beatIndex) {
    const ctx = this.ctx;

    // 墙体主体（覆盖第 0 行与顶部余量）：上深下浅，做出墙面的受光
    r(ctx, 0, 0, AW, GYA + T, P.wall);
    r(ctx, 0, 0, AW, 2, P.wallLight);
    r(ctx, 0, 1, AW, 1, '#3a2c1e');
    for (let y = 3; y < GYA + T; y += 3) {
      r(ctx, 0, y, AW, 1, 'rgba(0,0,0,0.05)');   // 涂料竖纹（细 1 AU）
    }

    // 竖向墙缝：每格一条，深 1 AU + 亮 1 AU，做出板墙的厚度
    for (let x = T; x < AW; x += T) {
      r(ctx, x, 3, 1, GYA + T - 6, P.wallSeam);
      r(ctx, x + 1, 3, 1, GYA + T - 6, 'rgba(255,224,170,0.05)');
    }

    // 窗洞（两组）
    for (const g of WIN_GROUPS) {
      this._drawCampusWindow(g.col * T, g.mirror, beatIndex);
    }

    // 墙体底沿（压住地板缝）
    r(ctx, 0, GYA + T - 3, AW, 1, P.wallSeam);
    r(ctx, 0, GYA + T - 2, AW, 1, '#3a2c1e');
    r(ctx, 0, GYA + T - 1, AW, 1, P.wallLight);
  }

  /* ---- 窗外光斑落到地板（三段梯形，静态层用） ---- */
  /* 地板：离窗越远越沉一点，避免整片木色糊成一块 */
  _drawFloorShade() {
    const ctx = this.ctx;
    const y0 = GYA + T, h = AH - T - GYA;
    const bands = 10;
    for (let i = 0; i < bands; i++) {
      const a = (i / bands) * 0.075;
      r(ctx, 0, y0 + i * (h / bands), AW, h / bands + 1, `rgba(38,24,12,${a.toFixed(3)})`);
    }
  }

  _drawSunPools() {
    const ctx = this.ctx;
    for (const g of WIN_GROUPS) {
      const x0 = g.col * T;
      r(ctx, x0 + 3, GYA + T, 90, 180, 'rgba(255,206,128,0.10)');
      r(ctx, x0 + 15, GYA + T, 66, 117, 'rgba(255,212,140,0.12)');
      r(ctx, x0 + 27, GYA + T, 42, 66, 'rgba(255,222,158,0.11)');
    }
  }

  /* ---- 窗外校园（近—中—远四层压扁） ---- */
  _drawCampusWindow(x0, mirror, beatIndex) {
    const ctx = this.ctx;
    ctx.save();
    if (mirror) {
      ctx.translate(x0 * 2 + 96, 0);
      ctx.scale(-1, 1);
    }

    // 窗框与纵深（外框 96 宽 42 高，1 AU = 2px 的细描边）
    r(ctx, x0, 3, 96, 42, P.void);
    r(ctx, x0 + 1, 4, 94, 40, P.slateLight);
    r(ctx, x0 + 1, 4, 94, 1, P.mist);
    r(ctx, x0 + 1, 43, 94, 1, P.ash);

    const sx = x0 + 6;
    const sy = 6;
    const sw = 84;
    const sh = 34;

    // 天空（三层压扁：顶亮 → 近树线微绿）
    r(ctx, sx, sy, sw, 9, '#cfe6e4');
    r(ctx, sx, sy, sw, 4, '#eaf4e6');
    r(ctx, sx, sy + 7, sw, 2, '#c3dcd8');
    // 云（极慢移动：6 拍一帧）
    const cloudShift = Math.floor(beatIndex / 6) % 2;
    r(ctx, sx + 8 + cloudShift, sy + 2, 12, 1, '#f4fbf4');
    r(ctx, sx + 11 + cloudShift, sy + 3, 6, 1, '#eaf4e6');
    r(ctx, sx + 51 + cloudShift, sy + 1, 15, 1, '#f4fbf4');
    r(ctx, sx + 56 + cloudShift, sy + 2, 8, 1, '#eaf4e6');

    // 远景树线（对岸）：两层深浅，2 AU 一株
    for (let i = 0; i < sw; i += 5) {
      r(ctx, sx + i, sy + 8, 4, 2, '#3c6234');
      r(ctx, sx + i + 1, sy + 7, 2, 1, '#4c7a3c');
    }
    for (let i = 2; i < sw; i += 7) {
      r(ctx, sx + i, sy + 7, 1, 1, '#5e8f46');
    }

    // 湖面（两段水色 + 岸线）
    r(ctx, sx, sy + 10, sw, 9, '#4f8fa8');
    r(ctx, sx, sy + 10, sw, 1, '#2f5f75');
    r(ctx, sx, sy + 15, sw, 1, '#3f7c94');
    r(ctx, sx, sy + 18, sw, 1, '#2f5f75');
    // 水面亮斑（每拍换位，细 1 AU）
    const glint = beatIndex % 3;
    r(ctx, sx + 10 + glint * 4, sy + 12, 6, 1, '#8fc4c8');
    r(ctx, sx + 11 + glint * 4, sy + 13, 3, 1, '#8fc4c8');
    r(ctx, sx + 40 + glint * 2, sy + 16, 8, 1, '#8fc4c8');
    r(ctx, sx + 64, sy + 12, 4, 1, '#7fb4bc');
    r(ctx, sx + 22, sy + 17, 5, 1, '#7fb4bc');

    // 对岸草地与近景草坡
    r(ctx, sx, sy + 20, sw, 14, '#6a9a48');
    r(ctx, sx, sy + 20, sw, 1, '#96c46a');
    r(ctx, sx + 6, sy + 24, 20, 6, '#42683a');
    r(ctx, sx + 52, sy + 24, 16, 5, '#42683a');
    r(ctx, sx, sy + 31, sw, 3, '#42683a');
    // 草叶（1 AU 的小竖线，密度低但有）
    for (let i = 0; i < sw; i += 6) {
      r(ctx, sx + i + 2, sy + 22 + (i % 3), 1, 2, '#96c46a');
      r(ctx, sx + i + 4, sy + 28 + (i % 2), 1, 2, '#78a850');
    }

    // 垂柳（左：树干 + 冠 + 垂枝）
    r(ctx, sx + 3, sy + 2, 3, 17, P.woodDark);
    r(ctx, sx + 3, sy + 2, 1, 17, '#4a3524');
    r(ctx, sx - 1, sy - 1, 14, 4, '#3f7a3c');
    r(ctx, sx + 1, sy - 2, 9, 2, '#78a850');
    r(ctx, sx + 3, sy - 1, 5, 1, '#96c46a');
    for (let i = 0; i < 8; i++) {
      const len = 4 + ((i + beatIndex) % 4);
      r(ctx, sx + i * 2, sy + 2, 1, len, i % 2 ? '#78a850' : '#63a047');
    }

    // 长椅 + 看书同学（近景草坡）
    const benchX = sx + 26;
    r(ctx, benchX, sy + 27, 19, 2, '#c9b58a');
    r(ctx, benchX, sy + 27, 19, 1, '#e0cda2');
    r(ctx, benchX + 2, sy + 29, 1, 3, '#b07a58');
    r(ctx, benchX + 16, sy + 29, 1, 3, '#b07a58');

    // 同学 A / B（翻页：4 拍一帧）
    const pageFlip = Math.floor(beatIndex / 4) % 2;
    this._drawReader(ctx, benchX + 5, sy + 18, pageFlip, false);
    this._drawReader(ctx, benchX + 12, sy + 17, pageFlip, true);

    // 鸭子（每 2 拍上下 1px）
    const bob = Math.floor(beatIndex / 2) % 2;
    this._drawDuck(ctx, sx + 18, sy + 12 + bob, false);
    this._drawDuck(ctx, sx + 33, sy + 15 - bob, true);
    this._drawDuck(ctx, sx + 60, sy + 12 + bob, false);

    // 窗棂（横向 + 竖向，3 AU 宽，带 1 AU 高光）
    r(ctx, sx + 38, sy, 3, sh, P.slateLight);
    r(ctx, sx + 38, sy, 1, sh, P.ashLight);
    r(ctx, sx, sy + 14, sw, 2, P.slateLight);
    r(ctx, sx, sy + 14, sw, 1, P.ashLight);
    r(ctx, sx, sy, 1, sh, P.ashLight);
    r(ctx, sx + sw - 2, sy, 2, sh, P.slateLight);

    // 玻璃反光（斜线阶梯）
    r(ctx, sx + 12, sy + 2, 8, 1, '#f4fbf4');
    r(ctx, sx + 9, sy + 3, 4, 1, '#f4fbf4');
    r(ctx, sx + 7, sy + 4, 2, 1, '#eaf4e6');

    // 窗台（厚 3 AU）+ 投影
    r(ctx, x0 + 2, 45, 92, 3, P.slateLight);
    r(ctx, x0 + 2, 45, 92, 1, P.ashLight);
    r(ctx, x0 + 2, 47, 92, 1, P.void);
    r(ctx, x0 + 6, 48, 84, 1, P.floorDark);

    // 窗台小盆栽：陶盆 + 五片叶
    const potX = x0 + (mirror ? 76 : 10);
    r(ctx, potX, 40, 8, 5, '#b07a58');
    r(ctx, potX, 40, 8, 1, '#c9a07a');
    r(ctx, potX + 1, 40, 1, 4, '#96694a');
    r(ctx, potX + 2, 36, 4, 4, '#4f8a3c');
    r(ctx, potX, 35, 3, 2, '#78a850');
    r(ctx, potX + 5, 35, 3, 2, '#78a850');
    r(ctx, potX + 3, 34, 2, 1, '#96c46a');
    r(ctx, potX + 2, 37, 1, 1, '#63a047');

    ctx.restore();
  }

  _drawReader(ctx, x, y, pageFlip, far) {
    const skin = P.skin;
    // 头 + 发 + 描边
    r(ctx, x, y, 5, 5, skin);
    r(ctx, x, y - 1, 5, 2, far ? '#2a2119' : '#3a2a1c');
    r(ctx, x, y + 4, 5, 1, '#d8b18a');
    // 身体（校服）+ 领口
    r(ctx, x - 2, y + 5, 9, 8, far ? '#2c3f63' : '#3d4a5e');
    r(ctx, x - 1, y + 5, 2, 1, P.paper);
    // 膝上的书（左页 / 右页 / 翻页）
    r(ctx, x - 2, y + 10, 8, 3, P.paper);
    r(ctx, x - 2, y + 10, 8, 1, P.mist);
    r(ctx, x + 1, y + 10, 1, 3, '#aab6cc');
    r(ctx, x + 5 + pageFlip, y + 10, 1 + pageFlip, 3, P.paper);
  }

  _drawDuck(ctx, x, y, flip) {
    // 身体（带 1 AU 描边）+ 头 + 橙喙 + 眼 + 尾迹
    r(ctx, x - 1, y - 1, 8, 6, '#2f5f75');
    r(ctx, x, y, 6, 4, '#f2e2b0');
    r(ctx, x, y, 6, 1, '#f8efcf');
    r(ctx, x, y + 3, 6, 1, '#d9c48c');
    const hx = flip ? x + 2 : x + 3;
    r(ctx, hx, y - 3, 3, 4, '#2f5f75');
    r(ctx, hx + 1, y - 2, 2, 3, '#f2e2b0');
    r(ctx, flip ? hx : hx + 2, y - 2, 1, 1, '#e8933f');
    r(ctx, flip ? hx - 1 : hx + 3, y - 2, 1, 1, '#e8933f');
    r(ctx, flip ? hx + 1 : hx + 2, y - 3, 1, 1, '#22323c');
    r(ctx, x - 2, y + 5, 9, 1, 'rgba(47,95,117,0.5)');
  }

  /* ---- 黑板 ---- */
  _drawBoard(now, teacher, showTeacher) {
    const ctx = this.ctx;
    const b = BOARD;

    // 木框（三层：外深 / 中木 / 内高光）
    r(ctx, b.x - 2, b.y - 2, b.w + 4, b.h + 4, P.woodDark);
    r(ctx, b.x - 1, b.y - 1, b.w + 2, b.h + 2, P.woodMid);
    r(ctx, b.x - 1, b.y - 1, b.w + 2, 1, P.woodLight);
    // 板面（上深下浅，像被擦过的墨绿）
    r(ctx, b.x, b.y, b.w, b.h, P.exitDeep);
    r(ctx, b.x, b.y, b.w, 2, '#1b4231');
    r(ctx, b.x, b.y + b.h - 4, b.w, 4, '#20493a');
    // 板面擦痕（1 AU 斜线，固定位置）
    for (let i = 0; i < 6; i++) {
      const cx = b.x + 18 + i * 29;
      r(ctx, cx, b.y + 3 + (i % 3) * 7, 14, 1, 'rgba(184,255,217,0.05)');
      r(ctx, cx + 4, b.y + 4 + (i % 3) * 7, 8, 1, 'rgba(184,255,217,0.03)');
    }

    // 粉笔字：三行，板书阶段最后一行逐段补齐
    const writing = showTeacher && teacher && teacher.phase === 'board';
    const rows = [
      { y: b.y + 6, segs: [[9, 69], [84, 33], [123, 51]] },
      { y: b.y + 13, segs: [[9, 45], [60, 60], [126, 27]] },
      { y: b.y + 20, segs: [[9, 54], [69, 42]] }
    ];
    rows.forEach((row, i) => {
      row.segs.forEach(([ox, len], j) => {
        const visible = !writing ? 1 : Math.min(1, (beatIndexSafe(now) + i + j) / 3);
        if (visible <= 0) return;
        r(ctx, b.x + ox, row.y, Math.round(len * Math.min(1, visible)), 1, P.mist);
        r(ctx, b.x + ox, row.y + 1, Math.round(len * Math.min(1, visible) * 0.6), 1,
          'rgba(139,150,171,0.35)');   // 字脚
      });
    });

    // 粉笔白点（老师写字的手边）
    if (writing) {
      r(ctx, b.x + b.w - 27, b.y + 8, 1, 1, P.paper);
      r(ctx, b.x + b.w - 39, b.y + 16, 1, 1, P.paper);
    }

    // 粉笔槽 + 板擦 + 粉笔头
    r(ctx, b.x - 2, b.y + b.h, b.w + 4, 3, P.woodDark);
    r(ctx, b.x - 2, b.y + b.h, b.w + 4, 1, P.woodMid);
    r(ctx, b.x - 1, b.y + b.h + 1, b.w + 2, 1, '#20150c');
    r(ctx, b.x + 12, b.y + b.h + 1, 9, 2, P.paper);
    r(ctx, b.x + 22, b.y + b.h + 1, 4, 2, '#e8eefc');
    r(ctx, b.x + 30, b.y + b.h + 1, 6, 2, P.paper);
    r(ctx, b.x + b.w - 33, b.y + b.h + 2, 11, 3, P.slate);
    r(ctx, b.x + b.w - 33, b.y + b.h + 2, 11, 1, P.slateLight);
    // 板槽下的粉笔灰
    r(ctx, b.x + 12, b.y + b.h + 3, 24, 1, 'rgba(232,238,252,0.25)');

    // 黑板右上角的小值日牌：让讲台区不止一块黑板
    const pc = b.x + b.w - 34, py = b.y + 3;
    r(ctx, pc, py, 22, 14, '#d8cbb0');
    r(ctx, pc, py, 22, 1, '#efe4cc');
    r(ctx, pc + 1, py + 2, 20, 1, 'rgba(90,70,50,0.35)');
    r(ctx, pc + 1, py + 5, 16, 1, 'rgba(90,70,50,0.25)');
    r(ctx, pc + 1, py + 8, 18, 1, 'rgba(90,70,50,0.25)');
    r(ctx, pc + 1, py + 11, 11, 1, 'rgba(90,70,50,0.20)');
  }

  /* ---- 挂钟（梯度跟着光档走，隐性时间） ---- */
  _drawClock(level) {
    const ctx = this.ctx;
    const x = 6, y = 27;
    // 外壳（1 AU 描边 + 内圈）
    r(ctx, x, y, 14, 14, P.wallSeam);
    r(ctx, x + 1, y + 1, 12, 12, '#8a755a');
    r(ctx, x + 2, y + 2, 10, 10, P.paper);
    r(ctx, x + 2, y + 2, 10, 1, P.mist);
    // 四个刻度点
    r(ctx, x + 6, y + 2, 1, 1, P.slate);
    r(ctx, x + 6, y + 11, 1, 1, P.slate);
    r(ctx, x + 2, y + 6, 1, 1, P.slate);
    r(ctx, x + 11, y + 6, 1, 1, P.slate);
    // 指针：档位越高走得越晚
    const hourLen = 3 + level;
    r(ctx, x + 6, y + 6 - hourLen + 1, 1, hourLen, P.slate);
    r(ctx, x + 6, y + 6, 5, 1, P.slate);
    r(ctx, x + 6, y + 6, 1, 1, P.void);
  }

  /* ---- 吊灯 ---- */
  _drawLamps(level, beatIndex, flickerOn) {
    const ctx = this.ctx;
    const litCount = level <= 1 ? 0 : level === 2 ? 1 : level === 3 ? 2 : 3;
    const lampX = [168, 240, 312];
    const flickerDiv = level >= 4 ? 2 : level >= 3 ? 4 : level >= 2 ? 8 : 0;
    const offThisFrame = flickerOn && flickerDiv > 0 && beatIndex % flickerDiv === 0;

    lampX.forEach((x, i) => {
      const lit = i < litCount && !offThisFrame;
      // 吊线 + 接线盒
      r(ctx, x, 0, 1, 3, P.void);
      r(ctx, x - 2, 3, 5, 1, P.woodDark);
      // 灯罩（顶面 / 南面 / 东面）
      r(ctx, x - 5, 3, 11, 1, P.woodMid);
      r(ctx, x - 5, 4, 11, 2, P.lampDeep);
      r(ctx, x + 6, 3, 1, 3, P.woodDark);
      r(ctx, x - 4, 4, 9, 1, 'rgba(255,212,121,0.18)');
      // 灯泡
      r(ctx, x - 2, 6, 4, 4, lit ? P.lamp : P.slateLight);
      r(ctx, x - 2, 6, 4, 1, lit ? '#fff0bf' : P.slate);
      r(ctx, x - 1, 9, 2, 1, lit ? P.lampDeep : P.slate);
      if (lit) {
        r(ctx, x - 8, 10, 16, 1, 'rgba(255,212,121,0.26)');
        r(ctx, x - 15, 11, 30, 1, 'rgba(255,212,121,0.12)');
      }
    });
  }

  /* ---- 后门（出口方向：门缝光常亮，全场最亮） ---- */
  _drawDoor(now) {
    const ctx = this.ctx;
    const x = DOOR.col * T;

    // 门洞与外框
    r(ctx, x, 3, 24, 45, P.void);
    r(ctx, x + 1, 4, 22, 42, P.woodDark);
    r(ctx, x + 3, 6, 18, 40, '#eaf4e6');           // 走廊亮面
    r(ctx, x + 3, 26, 18, 20, P.greenLight);       // 下半段稍暖
    r(ctx, x + 3, 39, 18, 7, P.grassDark);         // 走廊尽头的地面

    // 半开门扇（靠左，顶面 / 南面分色 + 木纹）
    r(ctx, x + 3, 6, 12, 40, P.woodMid);
    r(ctx, x + 3, 6, 12, 3, '#8a6a45');
    r(ctx, x + 3, 6, 1, 40, P.woodDark);
    r(ctx, x + 14, 6, 1, 40, P.woodDark);
    r(ctx, x + 5, 10, 8, 1, 'rgba(0,0,0,0.12)');
    r(ctx, x + 5, 20, 8, 1, 'rgba(0,0,0,0.12)');
    r(ctx, x + 5, 30, 8, 1, 'rgba(0,0,0,0.12)');
    // 门把手
    r(ctx, x + 12, 24, 2, 4, P.amber);
    r(ctx, x + 12, 24, 2, 1, P.lamp);

    // 门缝光带（3 段阶梯，越靠下越亮）
    r(ctx, x + 16, 9, 5, 37, P.green);
    r(ctx, x + 16, 9, 2, 37, P.greenLight);
    r(ctx, x + 18, 15, 3, 24, P.greenLight);

    // 门框内沿高光
    r(ctx, x, 3, 24, 1, P.woodMid);
    r(ctx, x, 3, 1, 45, P.woodDark);
    r(ctx, x + 23, 3, 1, 45, P.woodDark);
    r(ctx, x + 1, 4, 22, 1, P.woodDark);
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
        // 木地板：三块板（每 8 AU 一条横缝，竖向接头按行错位）
        const shift = (y % 2) * 6;
        for (let k = 1; k < 3; k++) {
          r(ctx, px, py + k * 8, T, 1, 'rgba(0,0,0,0.065)');
          r(ctx, px, py + k * 8 - 1, T, 1, 'rgba(255,224,170,0.04)');
        }
        r(ctx, px + shift, py, 1, 8, 'rgba(0,0,0,0.065)');
        r(ctx, px + shift + 12 > T ? shift - 12 : shift + 12, py + 8, 1, 8,
          'rgba(0,0,0,0.065)');
        r(ctx, px + shift + 6, py + 16, 1, 8, 'rgba(0,0,0,0.065)');
        // 板面高光（交错，错开板缝）
        if ((y * 2 + x) % 3 === 0) {
          r(ctx, px + shift + 2, py + 1, 14, 1, 'rgba(255,255,255,0.05)');
          r(ctx, px + shift + 1, py + 3, 6, 1, 'rgba(255,255,255,0.03)');
        }
        // 木纹碎点（按坐标确定性分布，不随帧闪）
        const grain = (x * 13 + y * 29) % 23;
        if (grain < 6) {
          r(ctx, px + 3 + grain, py + 4 + (grain % 5), 4, 1, 'rgba(0,0,0,0.09)');
        }
        if (grain === 7) {
          r(ctx, px + 15, py + 12, 6, 1, 'rgba(0,0,0,0.07)');
        }
        // 偶发磨损点（细小 1 AU）
        if ((x * 7 + y * 13) % 13 === 0) {
          r(ctx, px + 7, py + 15, 2, 1, P.floorDark);
          r(ctx, px + 16, py + 5, 1, 1, 'rgba(255,255,255,0.06)');
        }
        if ((x * 5 + y * 17) % 17 === 0) {
          r(ctx, px + 20, py + 19, 2, 1, P.floorDark);
        }
      }
    }

    // 起点格：暖光地砖
    const s = MAP.start;
    r(ctx, s.x * T, GYA + s.y * T, T, T, '#584c3e');
    r(ctx, s.x * T + 2, GYA + s.y * T + 2, T - 4, T - 4, '#5f5245');

    // 出口格：绿色地光（阶梯，不用渐变）
    const e = MAP.exit;
    const ex = e.x * T, ey = GYA + e.y * T;
    r(ctx, ex, ey, T, T, P.exitDeep);
    r(ctx, ex + 3, ey + 3, 18, 18, 'rgba(61,220,132,0.14)');
    r(ctx, ex + 6, ey + 6, 12, 12, 'rgba(61,220,132,0.16)');
    r(ctx, ex + 9, ey + 9, 6, 6, 'rgba(184,255,217,0.22)');

    // 门光铺到地面（往左下 3 段阶梯）
    for (let i = 0; i < 3; i++) {
      r(ctx, ex - 9 - i * 6, ey + 6 + i * 6, 9, 18 - i * 5,
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
    r(ctx, T - 3, top, 1, h, P.wallLight);
    r(ctx, 0, top, 1, h, P.wallSeam);
    // 左墙墙裙（深色踢脚线，压住地板缝）
    r(ctx, 3, top, 15, h, '#2a2219');
    r(ctx, 3, top, 15, 1, '#3a2f22');
    r(ctx, 3, top, 1, h, 'rgba(255,224,170,0.05)');
    for (let y = top; y < bottom; y += 33) {
      r(ctx, 3, y, 15, 1, P.wallSeam);       // 墙裙分缝
    }

    // 右墙
    r(ctx, AW - T, top, T, h, P.wall);
    r(ctx, AW - T + 2, top, 1, h, P.wallLight);
    r(ctx, AW - T + 6, top, 15, h, '#2a2219');
    r(ctx, AW - T + 6, top, 15, 1, '#3a2f22');
    for (let y = top; y < bottom; y += 33) {
      r(ctx, AW - T + 6, y, 15, 1, P.wallSeam);
    }

    // 下墙
    r(ctx, 0, bottom, AW, T, P.wall);
    r(ctx, 0, bottom, AW, 1, P.wallLight);
    r(ctx, 0, bottom + 3, AW, 1, P.wallSeam);
    r(ctx, 0, bottom + 5, AW, 13, '#2a2219');
    r(ctx, 0, bottom + 5, AW, 1, '#3a2f22');
    for (let x = 30; x < AW; x += 60) {
      r(ctx, x, bottom + 5, 1, 13, P.wallSeam);
    }

    // 墙脚投影（压向内 3 AU）
    r(ctx, T, top, 3, h, P.floorDark);
    r(ctx, AW - T - 3, top, 3, h, P.floorDark);
    r(ctx, 0, bottom - 3, AW, 3, P.floorDark);
  }

  /* 窗光斑：3 段阶梯，长度随光档递减，颜色只允许暖金 */
  _drawWindowBeams(level) {
    const ctx = this.ctx;
    const bands = [5, 4, 4, 3, 2][level];
    WIN_GROUPS.forEach((g) => {
      const x0 = g.col * T;
      for (let i = 0; i < bands; i++) {
        const y = GYA + T + i * 3;
        const alpha = Math.max(0.05, 0.20 - i * 0.035);
        r(ctx, x0 + 6 + i * 5, y, 87 - i * 6, 3,
          `rgba(255,233,168,${alpha.toFixed(2)})`);
      }
      r(ctx, x0 + 6, GYA + T, 84, 4, 'rgba(255,233,168,0.10)');
    });

    // 斜射进来的长光带（阶梯块，不用渐变）：光档越高越短越黄
    const steps = [7, 6, 5, 4, 3][level];
    WIN_GROUPS.forEach((g, gi) => {
      const x0 = g.col * T;
      for (let i = 0; i < steps; i++) {
        const y = GYA + T + 2 + i * 9;
        const x = x0 + 9 + i * 5 + gi * 3;
        const w = 93 - i * 8;
        const alpha = Math.max(0.04, 0.24 - i * 0.03);
        r(ctx, x, y, w, 6, `rgba(255,233,168,${alpha.toFixed(3)})`);
      }
    });
  }

  /* ================= 老师与讲台 ================= */

  _drawTeacherScene(ctx, teacher, now, beatIndex, level) {
    const cx = 240;
    const footY = GYA + T;     // 站在黑板前，脚底在第 1 行顶沿
    const phase = teacher.phase;

    // 老师（三态：板书背对 / 踱步侧身 / 回头正面）
    const sway = phase === 'pace' ? (Math.floor(now / 400) % 2 === 0 ? -3 : 3) : 0;
    const x = cx + sway - 9;
    const top = footY - 45;

    // 地面投影（阶梯矩形，随光档拉长）
    const shadowLen = 3 + level * 2;
    r(ctx, x + 4 + shadowLen, footY - 2, 15, 3, P.floorDark);
    r(ctx, x + 3 + shadowLen, footY - 1, 18, 1, 'rgba(28,23,18,0.55)');

    this._drawTeacherBodyAt(ctx, phase, x, top, footY, now);

    // 讲台（顶面 / 南面 / 东面）：画在老师之后，自然挡住脚部
    const podX = 201, podY = GYA + 18;
    r(ctx, podX + 3, podY + 3, 78, 6, P.floorDark);
    r(ctx, podX, podY, 78, 4, P.woodMid);
    r(ctx, podX, podY, 78, 1, P.woodLight);
    r(ctx, podX + 1, podY + 1, 76, 1, 'rgba(255,224,170,0.10)');
    r(ctx, podX, podY + 4, 78, 8, P.wood);
    r(ctx, podX, podY + 4, 78, 1, '#3d2a1b');
    r(ctx, podX + 78, podY + 4, 1, 8, P.woodDark);
    // 讲台前沿的木纹与抽屉
    r(ctx, podX + 4, podY + 7, 70, 1, 'rgba(0,0,0,0.18)');
    r(ctx, podX + 20, podY + 5, 16, 6, '#3f2c1c');
    r(ctx, podX + 20, podY + 5, 16, 1, P.woodMid);
    r(ctx, podX + 27, podY + 8, 2, 1, P.amber);
    // 讲台上的教案 + 粉笔盒
    r(ctx, podX + 6, podY - 2, 14, 2, P.paper);
    r(ctx, podX + 6, podY - 2, 14, 1, P.mist);
    r(ctx, podX + 9, podY - 1, 1, 1, '#9aa6bb');
    r(ctx, podX + 54, podY - 3, 10, 3, P.slate);
    r(ctx, podX + 54, podY - 3, 10, 1, P.slateLight);
    r(ctx, podX + 56, podY - 4, 6, 1, P.paper);
    if (level >= 2) {
      r(ctx, podX + 68, podY - 1, 4, 2, P.lamp);
      r(ctx, podX + 69, podY, 2, 3, P.lamp);
    }
  }

  /* 老师本体：优先图集，未加载完则回退程序绘制 */
  _drawTeacherBodyAt(ctx, phase, x, top, footY, now) {
    if (this.atlas) {
      const base = { board: 0, pace: 2, turn: 4 }[phase] || 0;
      const extra = phase === 'turn' ? (Math.floor(now / 200) % 2) : 0;
      if (this.atlas.draw(ctx, 'teacher', base + extra, x - 9, top - 12)) return;
    }
    this._drawTeacherBody(ctx, phase, x, top, footY, now);
  }

  /* 老师本体（不含投影与讲台）：可单独烘焙进图集 */
  _drawTeacherBody(ctx, phase, x, top, footY, now) {
    // 腿（深色西裤 + 描边 + 裤线，避免成两条黑棍）
    r(ctx, x + 1, footY - 14, 8, 14, P.void);
    r(ctx, x + 9, footY - 14, 8, 14, P.void);
    r(ctx, x + 2, footY - 13, 6, 12, '#2a3346');
    r(ctx, x + 10, footY - 13, 6, 12, '#2a3346');
    r(ctx, x + 4, footY - 13, 1, 10, '#212938');
    r(ctx, x + 12, footY - 13, 1, 10, '#212938');
    r(ctx, x + 2, footY - 3, 7, 3, '#131b26');
    r(ctx, x + 10, footY - 3, 7, 3, '#131b26');
    r(ctx, x + 2, footY - 2, 6, 1, '#3a4a63');

    // 身体（西装，顶面 / 南面分色）
    r(ctx, x - 2, top + 12, 21, 21, P.void);       // 描边
    r(ctx, x - 1, top + 13, 19, 17, '#5c6782');
    r(ctx, x - 1, top + 13, 19, 3, P.mist);
    r(ctx, x - 1, top + 13, 1, 17, '#4b5570');
    r(ctx, x + 17, top + 13, 1, 17, '#4b5570');
    r(ctx, x + 4, top + 13, 8, 2, P.paper);        // 白衬衫领
    r(ctx, x - 1, top + 29, 19, 3, P.woodDark);    // 下摆
    // 驳领 + 领带（正面才看得见）
    r(ctx, x + 3, top + 15, 2, 6, '#455070');
    r(ctx, x + 13, top + 15, 2, 6, '#455070');
    // 口袋 + 徽记
    r(ctx, x + 3, top + 24, 5, 1, '#455070');
    r(ctx, x + 15, top + 20, 2, 1, P.amber);

    // 头（外描边 + 皮肤，背面/正面在同一轮廓里换填充）
    r(ctx, x + 1, top, 17, 15, P.void);
    r(ctx, x + 2, top + 1, 15, 13, P.skin);
    r(ctx, x + 2, top + 1, 15, 1, '#f2d8b4');
    r(ctx, x + 2, top + 13, 15, 1, '#cba57e');

    if (phase === 'board') {
      // 背对：后脑（深棕而非近黑）+ 抬起的右臂从肩起，手边捏粉笔
      r(ctx, x + 2, top + 1, 15, 13, '#3a2a1c');
      r(ctx, x + 2, top + 1, 15, 2, '#5a4430');
      r(ctx, x + 4, top + 3, 10, 1, '#4a3624');
      r(ctx, x + 6, top + 7, 6, 1, P.wallSeam);     // 发缝
      r(ctx, x + 7, top + 13, 4, 2, P.paper);       // 后颈白领
      r(ctx, x + 15, top + 6, 4, 12, '#55607a');    // 上臂
      r(ctx, x + 15, top + 5, 4, 1, '#68738e');
      r(ctx, x + 15, top + 17, 4, 3, P.skin);       // 手
      r(ctx, x + 17, top + 14, 1, 4, P.paper);      // 粉笔
      r(ctx, x + 3, top + 28, 5, 1, P.wallSeam);
    } else if (phase === 'pace') {
      // 侧身：露半张脸 + 夹教案
      r(ctx, x + 2, top + 1, 8, 5, '#3a2a1c');
      r(ctx, x + 2, top + 1, 8, 1, '#5a4430');
      r(ctx, x + 10, top + 4, 3, 2, P.void);        // 侧脸轮廓
      r(ctx, x + 14, top + 15, 6, 9, P.paper);      // 教案
      r(ctx, x + 14, top + 15, 6, 1, P.mist);
      r(ctx, x + 16, top + 18, 2, 1, P.mist);
      r(ctx, x + 16, top + 21, 1, 2, P.mist);
      r(ctx, x + 13, top + 15, 1, 9, '#c8d2e6');
    } else {
      // 回头：正面，头发盖住上 4 行，眼镜压成 9 AU 深框 + 两点反光
      r(ctx, x + 2, top + 1, 15, 6, P.woodDark);
      r(ctx, x + 2, top + 1, 15, 2, P.woodMid);     // 发顶高光
      r(ctx, x + 3, top + 7, 12, 1, '#20262e');     // 镜框横梁
      r(ctx, x + 3, top + 7, 4, 3, '#20262e');
      r(ctx, x + 10, top + 7, 4, 3, '#20262e');
      r(ctx, x + 4, top + 8, 2, 1, P.paper);        // 镜片反光（左）
      r(ctx, x + 11, top + 8, 2, 1, P.paper);       // 镜片反光（右）
      r(ctx, x + 5, top + 11, 7, 1, '#8f5a4a');     // 嘴
      r(ctx, x + 3, top + 13, 12, 1, '#cba57e');    // 下巴投影
      const blink = Math.floor(now / 200) % 2 === 0;
      if (blink) {
        r(ctx, x + 6, top - 11, 3, 5, P.red);       // 感叹号竖笔
        r(ctx, x + 6, top - 4, 3, 2, P.red);        // 感叹号点
        r(ctx, x + 7, top - 10, 1, 3, P.redSoft);
      }
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
          items.push({
            sortY: footY + 3,
            draw: () => this._drawSeat(px, py, 'closed', now, beatIndex, { hint: false, variant: y % 3 })
          });
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

  /* ---- 课桌（朝南的立物：顶面 + 桌肚 + 桌腿，落在格子偏北） ---- */
  _drawDesk(px, py, variant = 0) {
    const ctx = this.ctx;
    if (this.atlas && this.atlas.ready && this.atlas.draw(ctx, 'desk', variant, px, py)) return;
    const topFill = variant ? '#8e6640' : P.deskTop;
    const topHi = variant ? '#b98f5e' : P.deskTopHi;
    const x = px + 2, w = 19;
    const topY = py + 3;
    const topH = 4;            // 桌面（俯视看到的面）
    const apronH = 4;          // 桌肚前板
    const legH = 6;

    // 落地投影：向镜头方向（下）并略向左，制造统一光源方向
    r(ctx, x - 2, topY + topH + apronH + legH, w + 1, 2, '#2e2419');
    r(ctx, x - 5, topY + topH + apronH + legH, 3, 2, '#2e2419');
    r(ctx, x + 1, topY + topH + apronH + legH + 2, w - 2, 1, 'rgba(24,18,12,0.45)');

    // 桌腿（两条前腿，3 AU 宽 + 内侧高光）
    r(ctx, x + 3, topY + topH + apronH, 3, legH, P.deskLeg);
    r(ctx, x + w - 6, topY + topH + apronH, 3, legH, P.deskLeg);
    r(ctx, x + 3, topY + topH + apronH, 1, legH, '#4a3520');
    r(ctx, x + w - 6, topY + topH + apronH, 1, legH, '#4a3520');

    // 桌肚前板：整块深木色，只留一道中缝和底部压深
    r(ctx, x - 1, topY, 1, topH + apronH, '#1e150e');
    r(ctx, x + w, topY, 1, topH + apronH, '#1e150e');
    r(ctx, x, topY + topH, w, apronH, P.deskFront);
    r(ctx, x, topY + topH, w, 1, '#6b4d31');
    r(ctx, x, topY + topH + apronH - 1, w, 1, '#26190f');
    r(ctx, x + Math.floor(w / 2), topY + topH + 1, 1, apronH - 2, '#3b2717');

    // 桌面：只留「顶边亮 / 前边暗」两道光，其余保持大面积平木
    r(ctx, x, topY, w, topH, topFill);
    r(ctx, x, topY, w, 1, topHi);
    r(ctx, x, topY + topH - 1, w, 1, '#6f4e2f');
    // 磨损小块（确定性，少量）
    const col = Math.round(px / T);
    const row = Math.round((py - GYA) / T);
    if ((col * 3 + row * 5) % 7 === 0) {
      r(ctx, x + 4, topY + 2, 3, 1, 'rgba(0,0,0,0.10)');
    }
    // 东侧厚度 2 AU
    r(ctx, x + w, topY, 2, topH + apronH, P.woodDark);
    r(ctx, x + w, topY, 1, topH + apronH, '#3a2618');

    // 桌面小物：按格子坐标确定性摆放，低饱和
    const propKind = (col * 7 + row * 11) % 9;
    if (propKind === 0) {
      r(ctx, x + 10, topY + 1, 5, 1, '#c9a270');        // 铅笔
      r(ctx, x + 15, topY + 1, 1, 1, '#e0916a');        // 笔尖
    } else if (propKind === 1) {
      r(ctx, x + 5, topY + 1, 8, 2, '#ded2b8');         // 摊开的本子
      r(ctx, x + 8, topY + 1, 1, 2, '#a89b80');         // 中缝
      r(ctx, x + 6, topY + 2, 2, 1, 'rgba(0,0,0,0.12)');
    } else if (propKind === 2) {
      r(ctx, x + 11, topY + 1, 6, 2, '#c4b89c');        // 试卷
      r(ctx, x + 12, topY + 2, 4, 1, 'rgba(0,0,0,0.10)');
    } else if (propKind === 3) {
      r(ctx, x + 4, topY + 1, 4, 2, '#b6563f');         // 课本
      r(ctx, x + 4, topY + 1, 4, 1, '#c66d51');
      r(ctx, x + 8, topY + 1, 3, 2, '#d8cbb0');
    } else if (propKind === 4) {
      r(ctx, x + 12, topY + 1, 5, 2, '#8b9bb5');        // 笔袋
      r(ctx, x + 13, topY + 1, 3, 1, '#a7b6cd');
    }
  }

  /* ---- 椅背（坐在桌子前侧，只露出上半截） ---- */
  _drawChairBack(px, py, extraH = 0, dy = 0, tint = null) {
    const ctx = this.ctx;
    const py0 = py + dy;
    const x = px + 7, w = 11;
    const top = py0 + 14 - extraH;
    const panel = tint ? tint.panel : P.seatOpen;
    const edge = tint ? tint.edge : P.blueSoft;
    const dark = tint ? tint.dark : P.seatClosed;

    // 椅背外框（1 AU 深藏青描边）
    r(ctx, x - 1, top - 1, w + 2, extraH + 8, '#131b26');
    // 上横梁（最亮，2 AU）
    r(ctx, x, top, w, 2, panel);
    r(ctx, x, top, w, 1, edge);
    // 竖条（3 道，中间留 1 AU 缝，读出「椅背」而不是「窗户」）
    const slatY = top + 2, slatH = extraH + 4;
    const slatW = 3, gap = 1;
    const total = slatW * 3 + gap * 2;
    const ox = Math.floor((w - total) / 2);
    for (let i = 0; i < 3; i++) {
      const sx = x + ox + i * (slatW + gap);
      r(ctx, sx, slatY, slatW, slatH, panel);
      r(ctx, sx, slatY, 1, slatH, edge);
      r(ctx, sx + slatW - 1, slatY, 1, slatH, dark);
    }
    // 下横梁
    r(ctx, x, top + extraH + 5, w, 2, panel);
    r(ctx, x, top + extraH + 6, w, 1, dark);
    // 坐面：从椅背下沿挑出 2 AU
    r(ctx, x - 2, py0 + 20 - extraH, w + 4, 2, '#131b26');
    r(ctx, x - 1, py0 + 20 - extraH, w + 2, 1, edge);
    r(ctx, x, py0 + 21 - extraH, w, 1, dark);
    // 椅腿（两条）
    r(ctx, x + 2, py0 + 22 - extraH, 2, 3, '#131b26');
    r(ctx, x + w - 4, py0 + 22 - extraH, 2, 3, '#131b26');
    r(ctx, x + 3, py0 + 23 - extraH, 1, 1, '#3d4a5e');
    r(ctx, x + w - 3, py0 + 23 - extraH, 1, 1, '#3d4a5e');
  }

  /* ---- 书本/书包 ---- */
  _drawClutter(px, py) {
    const ctx = this.ctx;
    const x = px + 4, y = py + 7;
    r(ctx, x + 1, y + 13, 16, 3, P.floorDark);
    // 三本书叠放（每本都有页边 + 书脊）
    r(ctx, x, y + 8, 16, 4, P.uniform);
    r(ctx, x + 1, y + 8, 14, 1, P.mist);
    r(ctx, x, y + 11, 16, 1, '#243456');
    r(ctx, x + 1, y + 4, 14, 4, P.woodLight);
    r(ctx, x + 1, y + 4, 14, 1, '#86653f');
    r(ctx, x, y, 16, 3, P.ashLight);
    r(ctx, x, y, 16, 1, '#6f7d99');
    // 书脊上的两道白线
    r(ctx, x + 2, y + 1, 5, 1, 'rgba(255,255,255,0.22)');
    r(ctx, x + 9, y + 1, 3, 1, 'rgba(255,255,255,0.16)');
    // 书包带（垂到地面）
    r(ctx, x + 14, y - 4, 3, 7, P.slateLight);
    r(ctx, x + 14, y - 4, 1, 7, '#6f829f');
  }

  /* ---- 起点：书包 + 暖光边（人不站在课桌上） ---- */
  _drawStartDesk(px, py, now) {
    const ctx = this.ctx;
    const x = px + 6, y = py + 8;
    // 地上的书包
    r(ctx, x, y + 2, 12, 3, P.floorDark);
    r(ctx, x + 1, y + 2, 10, 13, P.seatOpen);
    r(ctx, x + 1, y + 2, 10, 2, P.blueSoft);
    r(ctx, x + 1, y + 12, 10, 3, P.seatClosed);
    r(ctx, x + 3, y + 3, 6, 2, '#2a3f66');
    r(ctx, x + 4, y + 6, 4, 3, P.seatClosed);      // 前袋
    r(ctx, x + 5, y + 7, 2, 1, P.amber);           // 拉链头
    r(ctx, x + 11, y - 1, 2, 7, P.slateLight);     // 背带
    r(ctx, x + 11, y - 1, 1, 7, '#6f829f');
    // 2 AU 暖光边（淡金，按拍呼吸）
    const pulse = Math.floor(now / 400) % 2;
    r(ctx, px + 2, py + T - 3, T - 4, 2, pulse ? P.lamp : P.amber);
    r(ctx, px + 4, py + T - 5, T - 8, 1, 'rgba(255,212,121,0.35)');
  }

  /* ---- 座椅四态：靠「椅背高度 / 位置 / 是否有人」一眼区分 ---- */
  _drawSeat(px, py, state, now, beatIndex, opts = {}) {
    const ctx = this.ctx;
    const tintIdx = opts.variant !== undefined
      ? opts.variant
      : (Math.round((py - GYA) / T) % 3);
    const tint = SEAT_TINTS[tintIdx];

    // 图集优先：整格（桌 + 椅 + 人）一次 drawImage；帧序 = 变量×6 + 状态
    if (this.atlas && this.atlas.ready) {
      const stateSlot = { closed: 0, open: 1, broken: 2, occupied: 4 }[state];
      const flip = state === 'broken'
        ? (Math.floor(now / 320) % 2)
        : state === 'occupied'
          ? (Math.floor(now / 400) % 2 === 0 ? 0 : 1)
          : 0;
      if (this.atlas.draw(ctx, 'seats', tintIdx * 6 + stateSlot + flip, px, py - 9)) {
        if (opts.hint !== false && state === 'closed') {
          r(ctx, px + 6, py + T - 2, 12, 1, P.blue);
        }
        return;
      }
    }

    if (state === 'closed') {
      // 椅子收起：整只贴在桌前三格内，只露椅背
      this._drawDesk(px, py);
      this._drawChairBack(px, py, 0, 0, tint);
      if (opts.hint !== false) r(ctx, px + 6, py + T - 2, 12, 1, P.blue);
      return;
    }

    if (state === 'open') {
      // 椅子拉开：整只往镜头方向退 3 AU，桌与椅之间露出地面
      this._drawDesk(px, py);
      _dragMarks();
      this._drawChairBack(px, py, 2, 4, tint);
      return;
    }

    function _dragMarks() {
      r(ctx, px + 5, py + 21, 6, 1, 'rgba(0,0,0,0.22)');
      r(ctx, px + 15, py + 21, 5, 1, 'rgba(0,0,0,0.16)');
      r(ctx, px + 6, py + 22, 4, 1, 'rgba(0,0,0,0.12)');
    }

    if (state === 'broken') {
      // 椅子整只横躺在本格南侧（桌面保持完整），只留一道红色脉冲标「别站这儿」
      this._drawDesk(px, py);
      const frame = Math.floor(now / 320) % 2;
      const outline = frame ? P.red : P.redDeep;

      // 横躺的椅背（3 AU 厚）+ 椅腿翘起 + 断腿
      r(ctx, px + 3, py + 18, 18, 7, P.void);
      r(ctx, px + 4, py + 19, 16, 4, P.seatOpen);
      r(ctx, px + 4, py + 19, 16, 1, outline);
      r(ctx, px + 4, py + 21, 16, 1, P.seatClosed);
      r(ctx, px + 7, py + 20, 4, 1, P.blueSoft);
      // 翘起的椅腿（两根短竖条）
      r(ctx, px + 5, py + 15, 2, 4, '#131b26');
      r(ctx, px + 15, py + 15, 2, 4, '#131b26');
      r(ctx, px + 5, py + 16, 1, 3, P.seatClosed);
      r(ctx, px + 15, py + 16, 1, 3, P.seatClosed);
      // 断掉的一条腿滚在旁边
      r(ctx, px + 20, py + 20, 3, 2, P.woodDark);
      r(ctx, px + 20, py + 20, 3, 1, outline);
      return;
    }

    // occupied：桌后坐着的同学（先画人与头，再压桌与椅，做出「人在桌后」的遮挡）
    // 肩背剪影
    r(ctx, px + 3, py + 4, 17, 10, '#131b26');
    r(ctx, px + 4, py + 5, 15, 8, P.uniform);
    r(ctx, px + 4, py + 5, 15, 2, P.mist);
    r(ctx, px + 11, py + 8, 1, 4, P.ashLight);    // 背中线
    r(ctx, px + 5, py + 10, 3, 2, '#243456');
    // 头：后脑 + 发顶高光（3 种发色），10×11 的方头
    const hairIdx = (Math.round(px / T) * 5 + Math.round((py - GYA) / T) * 3) % 3;
    const hair = ['#43301f', '#3a2a1c', '#2a2119'][hairIdx];
    const hairHi = ['#6b5236', '#5a4430', '#4a3a2c'][hairIdx];
    const bob2 = Math.floor(now / 400) % 2 === 0 ? 0 : 1;
    r(ctx, px + 7, py - 5 + bob2, 11, 11, '#131b26');
    r(ctx, px + 8, py - 4 + bob2, 9, 9, hair);
    r(ctx, px + 8, py - 4 + bob2, 9, 2, hairHi);
    r(ctx, px + 11, py - 2 + bob2, 3, 1, hairHi);
    r(ctx, px + 8, py + 4 + bob2, 9, 1, P.skin);  // 后颈
    r(ctx, px + 9, py + 5 + bob2, 7, 1, '#cba57e');

    this._drawDesk(px, py);
    this._drawChairBack(px, py, 0, 0, tint);
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

    if (!(this.atlas && this.atlas.draw(ctx, 'player', { s: 0, n: 1, e: 2, w: 3 }[dir] * 2 + step,
      cx - 9, footY - 36 + (bob ? 1 : 0)))) {
      this._drawStudentSprite(ctx, cx, footY, dir, step, bob);
    }

    // 交互提示：脚下若是可拉开的座椅，画 1px 蓝箭头
    if (!player.isBusy() && player.map) {
      const below = { x: player.x, y: player.y + 1 };
      if (player.map.isPullable(below.x, below.y)) {
        r(ctx, cx - 1, footY + 2, 3, 1, P.blue);
      }
    }
  }

  _drawStudentSprite(ctx, cx, footY, dir, step, bob) {
    const x = cx - 9;
    const top = footY - 36 + (bob ? 1 : 0);

    // 地面投影
    r(ctx, cx - 7, footY - 1, 14, 3, P.floorDark);
    r(ctx, cx - 5, footY + 1, 10, 1, 'rgba(28,23,18,0.55)');

    // 腿 + 鞋（先画，后面身体压住腰线）
    const legY = top + 26;
    const legH = footY - top - 26 - 3;
    if (dir === 's' || dir === 'n') {
      r(ctx, x + 5, legY, 5, legH, P.skin);
      r(ctx, x + 10, legY - step, 5, legH, P.skin);
      r(ctx, x + 5, legY, 1, legH, '#d8b18a');
      r(ctx, x + 10, legY - step, 1, legH, '#d8b18a');
      // 白球鞋：鞋面 + 深色鞋底 + 鞋带
      r(ctx, x + 3, footY - 4, 7, 3, P.paper);
      r(ctx, x + 10, footY - 4 - step, 7, 3, P.paper);
      r(ctx, x + 3, footY - 1, 7, 1, '#9aa6b8');
      r(ctx, x + 10, footY - 1 - step, 7, 1, '#9aa6b8');
      r(ctx, x + 5, footY - 3, 3, 1, '#c8d2e2');
      r(ctx, x + 12, footY - 3 - step, 3, 1, '#c8d2e2');
    } else {
      r(ctx, x + 5, legY, 5, legH, P.skin);
      r(ctx, x + 9, legY, 5, legH, P.skin);
      r(ctx, x + 4 + step, footY - 4, 7, 3, P.paper);
      r(ctx, x + 9 + step, footY - 4, 7, 3, P.paper);
      r(ctx, x + 4 + step, footY - 1, 7, 1, '#9aa6b8');
      r(ctx, x + 9 + step, footY - 1, 7, 1, '#9aa6b8');
    }

    // 短裤
    r(ctx, x + 3, top + 24, 12, 4, '#1f2a44');
    r(ctx, x + 3, top + 27, 12, 1, '#182238');

    // 校服上衣：描边 + 主体 + 领口 + 门襟 + 校徽
    r(ctx, x + 2, top + 12, 14, 14, P.void);
    r(ctx, x + 3, top + 13, 12, 12, '#35507e');
    r(ctx, x + 3, top + 13, 12, 2, '#3f5c8d');
    r(ctx, x + 3, top + 23, 12, 2, '#2a4169');
    r(ctx, x + 6, top + 13, 6, 2, P.paper);          // 白衬衫领
    r(ctx, x + 6, top + 15, 1, 3, '#dbe3f2');
    r(ctx, x + 11, top + 15, 1, 3, '#dbe3f2');
    r(ctx, x + 8, top + 16, 2, 8, '#243456');        // 门襟
    r(ctx, x + 9, top + 18, 1, 1, '#9fb0cc');        // 纽扣
    r(ctx, x + 9, top + 21, 1, 1, '#9fb0cc');
    r(ctx, x + 4, top + 17, 3, 3, P.amber);          // 校徽
    r(ctx, x + 5, top + 18, 1, 1, '#fff0c0');
    r(ctx, x + 2, top + 15, 2, 8, '#243456');        // 左袖
    r(ctx, x + 15, top + 15, 2, 8, '#243456');       // 右袖
    r(ctx, x + 2, top + 23, 2, 2, P.skin);           // 手
    r(ctx, x + 15, top + 23, 2, 2, P.skin);

    // 双肩包（背在身后：背面视角画在身体之上，侧视角只露一条边）
    if (dir === 'n') {
      r(ctx, x + 2, top + 14, 14, 14, P.void);
      r(ctx, x + 3, top + 15, 12, 12, P.seatOpen);
      r(ctx, x + 3, top + 15, 12, 2, P.blueSoft);
      r(ctx, x + 6, top + 19, 6, 6, P.seatClosed);   // 前袋
      r(ctx, x + 7, top + 21, 4, 1, P.amber);        // 拉链
      r(ctx, x + 3, top + 25, 12, 1, '#22344c');
      r(ctx, x + 2, top + 15, 2, 12, '#2a3f66');     // 肩带
      r(ctx, x + 14, top + 15, 2, 12, '#2a3f66');
    } else if (dir === 'w' || dir === 'e') {
      const bx = dir === 'e' ? x + 12 : x + 2;
      r(ctx, bx, top + 14, 5, 14, P.void);
      r(ctx, bx + 1, top + 15, 3, 12, P.seatOpen);
      r(ctx, bx + 1, top + 15, 3, 2, P.blueSoft);
      r(ctx, bx + 1, top + 19, 3, 1, '#22344c');
    }

    // 头：深棕发 + 皮肤 + 描边（描边用深棕而不是纯黑，避免「黑框头」）
    r(ctx, x + 4, top, 11, 14, '#2a2119');
    r(ctx, x + 5, top + 1, 9, 3, '#4a3624');         // 发块
    r(ctx, x + 5, top + 1, 9, 1, '#6b5236');         // 发顶高光
    r(ctx, x + 5, top + 3, 9, 9, P.skin);           // 脸
    r(ctx, x + 5, top + 3, 9, 1, '#f2d8b4');
    r(ctx, x + 5, top + 3, 1, 9, P.woodDark);       // 左侧鬓角
    r(ctx, x + 13, top + 3, 1, 9, P.woodDark);      // 右侧鬓角
    r(ctx, x + 5, top + 10, 9, 1, '#cba57e');       // 下巴
    if (dir === 's') {
      r(ctx, x + 6, top + 5, 2, 1, P.void);         // 眼
      r(ctx, x + 11, top + 5, 2, 1, P.void);
      r(ctx, x + 6, top + 4, 2, 1, '#5a4430');      // 眉
      r(ctx, x + 11, top + 4, 2, 1, '#5a4430');
      r(ctx, x + 9, top + 9, 2, 1, '#b06a5a');      // 嘴
    } else if (dir === 'n') {
      // 后脑：整块头发 + 发旋 + 后颈
      r(ctx, x + 5, top + 1, 9, 11, '#4a3624');
      r(ctx, x + 5, top + 1, 9, 2, '#6b5236');
      r(ctx, x + 8, top + 4, 3, 1, '#2a2119');      // 发旋
      r(ctx, x + 7, top + 11, 5, 1, '#cba57e');     // 后颈
    } else {
      r(ctx, x + 5, top + 3, 7, 8, P.skin);
      r(ctx, dir === 'e' ? x + 10 : x + 5, top + 3, 2, 8, P.woodDark);
      r(ctx, dir === 'e' ? x + 11 : x + 6, top + 5, 1, 1, P.void);  // 侧脸一只眼
      r(ctx, dir === 'e' ? x + 11 : x + 6, top + 9, 2, 1, '#b06a5a');
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

  /* 相邻可拉座椅 / 出口 / 脚下破损座椅：角标提示，读得出「能做什么」 */
  _drawInteractHints(map, player, now, beatIndex) {
    if (!player) return;
    const ctx = this.ctx;
    const pulse = Math.floor(now / 400) % 2;

    // 相邻可拉座椅：琥珀角标 + 底部短线
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const x = player.x + dx, y = player.y + dy;
      if (!map.isInBounds(x, y)) continue;
      if (!map.isPullable(x, y)) continue;

      const px = x * T, py = GYA + y * T;
      const c = pulse ? P.amber : P.lamp;
      const len = 6;
      // 四角 L 形
      r(ctx, px + 1, py + 1, len, 1, c);
      r(ctx, px + 1, py + 1, 1, len, c);
      r(ctx, px + T - 1 - len, py + 1, len, 1, c);
      r(ctx, px + T - 2, py + 1, 1, len, c);
      r(ctx, px + 1, py + T - 2, len, 1, c);
      r(ctx, px + 1, py + T - 1 - len, 1, len, c);
      r(ctx, px + T - 1 - len, py + T - 2, len, 1, c);
      r(ctx, px + T - 2, py + T - 1 - len, 1, len, c);
    }

    // 出口：绿色斜角闪烁（每 2 拍一次）
    const e = MAP.exit;
    if (beatIndex % 4 === 0) {
      const ex = e.x * T, ey = GYA + e.y * T;
      r(ctx, ex + 2, ey + 2, 2, 1, P.greenLight);
      r(ctx, ex + 2, ey + 2, 1, 2, P.greenLight);
      r(ctx, ex + T - 3, ey + 2, 2, 1, P.greenLight);
      r(ctx, ex + T - 3, ey + 2, 1, 2, P.greenLight);
    }

    // 玩家站在破损座椅上：脚下红虚线圈
    if (player.isOnBrokenSeat && player.isOnBrokenSeat() && beatIndex % 2 === 0) {
      const px = player.x * T, py = GYA + player.y * T;
      r(ctx, px + 3, py + T - 3, 3, 1, P.redSoft);
      r(ctx, px + 8, py + T - 3, 3, 1, P.redSoft);
      r(ctx, px + 12, py + T - 3, 1, 1, P.redSoft);
    }
  }

  /* 阶段横幅：板书最后一拍预警 / 回头倒计时，放在画布顶部中央 */
  _drawPhaseBanner(teacher, sm, now) {
    if (!teacher || sm.state !== GameState.PLAYING) return;
    const inTurn = teacher.phase === 'turn';
    const aboutToTurn = teacher.phase === 'board' && teacher.beatsLeft <= 1;
    if (!inTurn && !aboutToTurn) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const text = inTurn
      ? `回头中 · 还剩 ${teacher.beatsLeft} 拍 —— 别动`
      : '老师要转身了 · 准备停下';
    const color = inTurn ? '#ff8f8f' : '#ffd479';

    ctx.font = `bold 14px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    const bw = Math.round(tw + 26);
    const bh = 24;
    const bx = Math.round((w - bw) / 2);
    const by = this.canvas.height - 104;   // 压在画布底部，不挡黑板与老师

    ctx.fillStyle = 'rgba(7,9,13,0.86)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = color;
    ctx.fillRect(bx, by, bw, 1);
    ctx.fillRect(bx, by + bh - 1, bw, 1);
    // 左端 3px 状态灯（按拍亮灭）
    const lit = Math.floor(now / 400) % 2 === 0;
    ctx.fillStyle = lit ? color : '#3a2719';
    ctx.fillRect(bx + 5, by + bh / 2 - 3, 3, 6);

    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, by + bh / 2 + 1);
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
      const beats = teacher.beatsLeft > 0 ? ` · 剩 ${teacher.beatsLeft} 拍` : '';
      d.phaseText.textContent = teacher.phase === 'turn' ? `${label}！${beats}` : `${label}${beats}`;

      // 按阶段染色，让「现在能不能动」一眼可读
      if (d.phaseText.classList) {
        d.phaseText.classList.toggle('phase-board', teacher.phase === 'board');
        d.phaseText.classList.toggle('phase-pace', teacher.phase === 'pace');
        d.phaseText.classList.toggle('phase-turn', teacher.phase === 'turn');
      }
    } else {
      d.phaseText.textContent = STATE_LABEL[sm.state] || sm.state;
    }

    if (d.statusText) {
      let text = '板书中，可以行动';
      if (player.isBusy()) {
        text = player.action && player.action.type === 'pull' ? '拉开座椅…' : '起身挪动中…';
      } else if (teacher && teacher.phase === 'turn') {
        text = `停下！老师回头了（剩 ${teacher.beatsLeft} 拍）`;
      } else if (teacher && teacher.phase === 'pace') {
        text = `老师踱步中，抓紧行动（剩 ${teacher.beatsLeft} 拍）`;
      } else if (teacher && teacher.phase === 'board' && teacher.beatsLeft <= 1) {
        text = '老师快转身了，先把动作落地';
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




