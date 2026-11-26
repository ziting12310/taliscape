/* main.js —— Phase 2：地图生成 + 键盘移动 / 拉椅 + 动作按拍推进 */
import { GameState, StateMachine } from './GameState.js';
import { BeatClock } from './BeatClock.js';
import { CellType } from './MapData.js';
import { MapManager } from './MapManager.js';
import { Player } from './Player.js';
import { Renderer } from './Renderer.js';

/* ---------- 实例化 ---------- */
const sm = new StateMachine();
const beat = new BeatClock(400);
const map = new MapManager();
const player = new Player(map);

const canvas = document.getElementById('gameCanvas');
const renderer = new Renderer(canvas);

beat.onBeat = (beatIndex) => {
  // Phase 3 起：老师状态机按拍推进
  void beatIndex;
};

/* ---------- DOM ---------- */
const phaseText = document.getElementById('phaseText');
const beatFill = document.getElementById('beatFill');
const beatCount = document.getElementById('beatCount');

const startScreen = document.getElementById('startScreen');
const stayScreen = document.getElementById('stayScreen');
const resultScreen = document.getElementById('resultScreen');
const startBtn = document.getElementById('startBtn');
const stayBtn = document.getElementById('stayBtn');
const stayRetryBtn = document.getElementById('stayRetryBtn');
const resultAgainBtn = document.getElementById('resultAgainBtn');
const resultTitle = document.getElementById('resultTitle');
const resultDesc = document.getElementById('resultDesc');
const resultStats = document.getElementById('resultStats');
const resultWrongList = document.getElementById('resultWrongList');

const STATE_LABEL = {
  [GameState.IDLE]: '待机',
  [GameState.PLAYING]: '上课中',
  [GameState.QUIZ_OPEN]: '答题中',
  [GameState.FLASHBACK_QUIZ]: '回忆中',
  [GameState.RESULT]: '结算'
};

/* ---------- HUD ---------- */
function updateHud() {
  phaseText.textContent = STATE_LABEL[sm.state] || sm.state;
  beatFill.style.width = `${(beat.beatProgress() * 100).toFixed(1)}%`;
  beatCount.textContent = `拍 ${beat.beatIndex}`;
}

/* ---------- 键盘输入 ---------- */
const KEY_DIRS = {
  ArrowUp: { x: 0, y: -1 }, KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }, KeyS: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }, KeyD: { x: 1, y: 0 }
};

const BLOCK_HINT = {
  [CellType.WALL]: '前面是墙',
  [CellType.DESK]: '课桌挡路',
  [CellType.CLUTTER]: '书本挡路，绕一下吧',
  [CellType.SEAT_OCCUPIED]: '座位上有人'
};

window.addEventListener('keydown', (e) => {
  const dir = KEY_DIRS[e.code];
  if (!dir) return;
  e.preventDefault();

  if (sm.isFrozen() || sm.state !== GameState.PLAYING) return;
  if (player.isBusy()) return;

  const tx = player.x + dir.x;
  const ty = player.y + dir.y;
  if (!map.isInBounds(tx, ty)) return;

  const cell = map.getCell(tx, ty);

  // 收起座椅：按方向键即拉开（1 拍，位置不变）
  if (cell.type === CellType.SEAT_CLOSED) {
    const r = player.startPull(tx, ty);
    if (r.started) renderer.setHint('拉开座椅…', 1000);
    return;
  }

  if (map.isPassable(tx, ty)) {
    player.startMove(tx, ty);
    return;
  }

  renderer.setHint(BLOCK_HINT[cell.type] || '走不过去', 1200);
});

/* ---------- 动作落地 ---------- */
function onActionDone(ev) {
  if (ev.type === 'pullDone') {
    renderer.setHint('座椅拉开了', 900);
    return;
  }

  if (ev.type === 'moveDone') {
    if (ev.cellType === CellType.EXIT) {
      finishByExit();
      return;
    }
    if (ev.cellType === CellType.SEAT_BROKEN) {
      // Phase 3 接入异响判定；此处只给听觉化的文字提示
      renderer.setHint('破损的座椅发出吱呀声……', 1400);
    }
  }
}

/* ---------- 通关占位（结算在 Phase 6 接入） ---------- */
function finishByExit() {
  if (sm.state !== GameState.PLAYING) return;
  sm.transition(GameState.RESULT);

  resultTitle.textContent = '🎉 逃出去了！';
  resultDesc.textContent = '你摸到了后门，老师还没反应过来。';
  resultStats.innerHTML = '';
  resultWrongList.innerHTML = '<div class="result-wrong-item">结算与结局判定将在 Phase 6 接入。</div>';
  resultScreen.classList.remove('hidden');
}

/* ---------- 主循环 ---------- */
let lastTs = 0;

function loop(ts) {
  const delta = lastTs ? ts - lastTs : 0;
  lastTs = ts;

  try {
    if (!sm.isFrozen() && sm.state === GameState.PLAYING) {
      beat.tick(delta);
      const ev = player.tick(delta, beat.beatMs);
      if (ev) onActionDone(ev);
    }
    updateHud();
    renderer.draw(map, player, sm, ts);
  } catch (err) {
    console.error('[loop]', err);
  } finally {
    requestAnimationFrame(loop);
  }
}

/* ---------- 开始 / 重置 ---------- */
function begin() {
  startScreen.classList.add('hidden');
  stayScreen.classList.add('hidden');
  resultScreen.classList.add('hidden');

  map.reset();       // 每局重新生成地图，座椅状态随图重排
  player.reset();

  if (sm.state === GameState.RESULT) sm.transition(GameState.IDLE);
  if (sm.state === GameState.IDLE) sm.transition(GameState.PLAYING);

  beat.reset();
  lastTs = 0;
  renderer.setHint('方向键 / WASD 移动，走不到的路会提示原因', 2400);
}

startBtn.addEventListener('click', begin);

stayBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  stayScreen.classList.remove('hidden');
});

stayRetryBtn.addEventListener('click', begin);

resultAgainBtn.addEventListener('click', () => {
  resultScreen.classList.add('hidden');
  if (sm.state === GameState.RESULT) sm.transition(GameState.IDLE);
  startScreen.classList.remove('hidden');
  beat.reset();
  lastTs = 0;
});

/* 启动 */
updateHud();
renderer.setHint('点击「开始逃课」进入教室', 4000);
requestAnimationFrame(loop);
