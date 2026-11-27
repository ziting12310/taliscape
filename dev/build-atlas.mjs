/* dev/build-atlas.mjs —— 用 Renderer 现有绘制逻辑烘焙像素图集（纯 Node，无浏览器）
 * 输出：assets/atlas/{player,teacher,seats,desk}.png（1 AU = 3px）
 * 运行：node --experimental-default-type=module dev/build-atlas.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Raster, encodePNG } from './lib/raster.mjs';
import { Renderer } from '../js/Renderer.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../assets/atlas');

/* Renderer 只用到 canvas.getContext，喂一个空壳即可 */
const canvas = { width: 960, height: 768, style: {}, getContext: () => null };
const renderer = new Renderer(canvas, {});
const drawCtx = (raster) => raster; // 光栅自身即 ctx（有 fillStyle/fillRect）

/* cell 尺寸（AU） */
const CELL = {
  player: { w: 18, h: 36 },
  teacher: { w: 36, h: 60 },
  seats: { w: 24, h: 36 },
  desk: { w: 24, h: 30 }
};

const SCALE = 2;

function bakeRow(name, cells) {
  const { w, h } = CELL[name];
  const sheet = new Raster(w * cells.length, h, SCALE);
  cells.forEach((paint, i) => {
    const cell = new Raster(w, h, SCALE);
    renderer.ctx = cell;
    paint(drawCtx(cell));
    sheet.blit(cell, 0, 0, cell.width, cell.height, i * w * SCALE, 0);
  });
  const file = resolve(OUT, `${name}.png`);
  writeFileSync(file, encodePNG(sheet));
  return { file, w, h, frames: cells.length };
}

/* ---------- 场景整图背景：地板 + 墙身 + 两组窗景 + 墙裙（960×768） ---------- */
/* 地板绘制只关心「是不是 WALL」，给一个全是普通格子的假地图即可 */
const dummyMap = {
  rows: 15,
  cols: 20,
  getCell: () => ({ type: 'floor' })
};

function bakeScene() {
  const raster = new Raster(480, 384, SCALE);   // 480×384 AU → 960×768 px
  renderer.ctx = raster;
  renderer._drawFloor(dummyMap);
  renderer._drawSunPools();
  renderer._drawFloorShade();
  renderer._drawWallBase(0);                    // 窗景取 beatIndex=0 的定格帧
  renderer._drawWallStrips(dummyMap);
  const file = resolve(OUT, 'scene_bg.png');
  writeFileSync(file, encodePNG(raster));
  return { file, w: 480, h: 384 };
}

mkdirSync(OUT, { recursive: true });

/* ---------- 玩家：4 向 × 2 步（脚底在 y = 24，左右居中在 x = 6） ---------- */
const playerCells = [];
for (const dir of ['s', 'n', 'e', 'w']) {
  for (const step of [0, 1]) {
    playerCells.push((ctx) => renderer._drawStudentSprite(ctx, 9, 36, dir, step, 0));
  }
}

/* ---------- 老师：三态 × 2 帧（身体左上角 x=6，脚底 y=36） ---------- */
const teacherCells = [];
for (const phase of ['board', 'pace', 'turn']) {
  for (const t of [0, 200]) {
    teacherCells.push(((p, n) => (ctx) => {
      renderer._drawTeacherBody(ctx, p, 9, 12, 54, n);
    })(phase, t));
  }
}

/* ---------- 座椅：收起/拉开/破损×2/有人×2 ---------- */
const seatCells = [];
for (let v = 0; v < 3; v++) {
  const o = { hint: false, variant: v };
  seatCells.push(
    (ctx) => renderer._drawSeat(0, 9, 'closed', 0, 0, o),
    (ctx) => renderer._drawSeat(0, 9, 'open', 0, 0, o),
    (ctx) => renderer._drawSeat(0, 9, 'broken', 0, 0, o),
    (ctx) => renderer._drawSeat(0, 9, 'broken', 320, 0, o),
    (ctx) => renderer._drawSeat(0, 9, 'occupied', 0, 0, o),
    (ctx) => renderer._drawSeat(0, 9, 'occupied', 400, 0, o)
  );
}

/* ---------- 课桌 ---------- */
const deskCell = (ctx) => renderer._drawDesk(0, 0);

/* 课桌烘焙时内容在 y=8..16，这里把 16×24 的区域裁成 16×20 输出 */
const deskCells = [(ctx) => renderer._drawDesk(0, 0, 0), (ctx) => renderer._drawDesk(0, 0, 1)];

const built = [
  bakeRow('player', playerCells),
  bakeRow('teacher', teacherCells),
  bakeRow('seats', seatCells),
  bakeRow('desk', deskCells)
];

const scene = bakeScene();

for (const b of built) {
  console.log(`${b.file}  ${b.frames} 帧 · cell ${b.w}×${b.h} AU`);
}
console.log(`${scene.file}  场景整图 ${scene.w}×${scene.h} AU（960×768 px，1:1）`);
console.log('\n图集构建完成（1 AU = 2px）');
