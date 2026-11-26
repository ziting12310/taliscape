/* main.js —— Phase 3：老师三板式 + 回头判定 + 破损座椅异响
 * 答题面板仍为占位（Phase 5 接入真实题库与倒计时）。
 */
import { GameState, StateMachine } from './GameState.js';
import { BeatClock } from './BeatClock.js';
import { CellType } from './MapData.js';
import { MapManager } from './MapManager.js';
import { Player } from './Player.js';
import { TeacherAI } from './TeacherAI.js';
import { ShameTracker, SHAME_MAX, FLASHBACK_MIN_SHAME } from './ShameTracker.js';
import { Renderer } from './Renderer.js';

/* ---------- 实例化 ---------- */
const sm = new StateMachine();
const beat = new BeatClock(400);
const map = new MapManager();
const player = new Player(map);
const shame = new ShameTracker();

const canvas = document.getElementById('gameCanvas');
const renderer = new Renderer(canvas);

const teacher = new TeacherAI({
  onTurn: handleTurn,
  onPhaseChange: null
});

beat.onBeat = () => {
  if (sm.isFrozen() || sm.state !== GameState.PLAYING) return;
  teacher.tickBeat();
};

/* ---------- DOM ---------- */
const phaseText = document.getElementById('phaseText');
const beatFill = document.getElementById('beatFill');
const beatCount = document.getElementById('beatCount');
const shameFill = document.getElementById('shameFill');
const shameText = document.getElementById('shameText');

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

const quizModal = document.getElementById('quizModal');
const quizStageTag = document.getElementById('quizStageTag');
const quizQuestion = document.getElementById('quizQuestion');
const quizOptions = document.getElementById('quizOptions');
const quizFeedback = document.getElementById('quizFeedback');
const quizTimerFill = document.getElementById('quizTimerFill');
const quizNextBtn = document.getElementById('quizNextBtn');
const quizLeftEmoji = document.getElementById('quizLeftEmoji');
const quizRightEmoji = document.getElementById('quizRightEmoji');
const quizLeftTag = document.getElementById('quizLeftTag');
const quizRightTag = document.getElementById('quizRightTag');

const STATE_LABEL = {
  [GameState.IDLE]: '待机',
  [GameState.PLAYING]: '上课中',
  [GameState.QUIZ_OPEN]: '答题中',
  [GameState.FLASHBACK_QUIZ]: '回忆中',
  [GameState.RESULT]: '结算'
};

const TEACHER_LABEL = {
  board: '📖 板书',
  pace: '🚶 踱步',
  turn: '👀 回头'
};

/* ---------- HUD ---------- */
function updateHud() {
  if (sm.state === GameState.PLAYING) {
    const label = TEACHER_LABEL[teacher.phase] || teacher.phase;
    phaseText.textContent = teacher.phase === 'turn'
      ? `${label}！`
      : `${label} · 还剩 ${teacher.beatsLeft} 拍`;
  } else {
    phaseText.textContent = STATE_LABEL[sm.state] || sm.state;
  }

  beatFill.style.width = `${(beat.beatProgress() * 100).toFixed(1)}%`;
  beatCount.textContent = `拍 ${beat.beatIndex}`;

  const ratio = shame.value / SHAME_MAX;
  shameFill.style.width = `${(ratio * 100).toFixed(1)}%`;
  shameFill.style.backgroundPosition = `${(ratio * 100).toFixed(1)}% 0%`;
  shameText.textContent = `${shame.value} / ${SHAME_MAX}`;
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

  if (ev.type !== 'moveDone') return;

  if (ev.cellType === CellType.EXIT) {
    finishByExit();
    return;
  }

  // 破损座椅异响：仅板书阶段、50% 概率、老师强制切踱步
  if (ev.cellType === CellType.SEAT_BROKEN
      && teacher.phase === 'board'
      && Math.random() < 0.5) {
    teacher.forcePace();
    renderer.setHint('座椅发出刺耳的异响！老师停下了脚步……', 1800);
  }
}

/* ---------- 回头判定 ---------- */
function handleTurn() {
  if (sm.state !== GameState.PLAYING) return;

  // ① 已到出口 → 通关
  if (map.isExit(player.x, player.y)) {
    finishByExit();
    return;
  }

  // ② 羞愧满 → 留堂失败
  if (shame.isOverload()) {
    finishByOverload();
    return;
  }

  // ③ 抓捕成立：动作未落地 / 静止站在破损座椅
  const caughtMidAction = player.isMidAction();
  const caughtOnBrokenSeat = !caughtMidAction && player.isOnBrokenSeat();

  if (!caughtMidAction && !caughtOnBrokenSeat) {
    teacher.backToBoard();
    return;
  }

  // ④ 分流：动作未落地 → 四六级；破损座椅静止 → 羞愧≥30 闪回 / 否则四六级
  if (caughtMidAction) {
    openQuiz('cet');
    return;
  }
  openQuiz(shame.value >= FLASHBACK_MIN_SHAME ? 'flashback' : 'cet');
}

/* ---------- 答题面板（占位，Phase 5 替换） ---------- */
let currentQuizKind = null;

function openQuiz(kind) {
  const nextState = kind === 'flashback' ? GameState.FLASHBACK_QUIZ : GameState.QUIZ_OPEN;
  if (!sm.transition(nextState)) return;

  currentQuizKind = kind;
  const isFlashback = kind === 'flashback';

  quizModal.classList.toggle('flashback', isFlashback);
  quizStageTag.textContent = isFlashback ? '闪回' : '四六级';
  quizQuestion.textContent = isFlashback
    ? '一段回忆涌了上来……（闪回答题将在 Phase 5 接入）'
    : '被老师抓住了！（答题面板将在 Phase 5 接入）';
  quizOptions.innerHTML = '';
  quizFeedback.textContent = '';
  quizFeedback.classList.add('hidden');
  quizTimerFill.style.width = '100%';
  quizTimerFill.classList.remove('low');

  quizLeftEmoji.textContent = isFlashback ? '👩‍🏫' : '🧑‍🏫';
  quizRightEmoji.textContent = isFlashback ? '🧒' : '🧑‍🎓';
  quizLeftTag.textContent = isFlashback ? '记忆里的老师' : '老师';
  quizRightTag.textContent = isFlashback ? '童年的你' : '你';

  quizNextBtn.classList.remove('hidden');
  quizModal.classList.remove('hidden');
}

quizNextBtn.addEventListener('click', () => {
  quizModal.classList.add('hidden');
  currentQuizKind = null;

  if (sm.state === GameState.QUIZ_OPEN || sm.state === GameState.FLASHBACK_QUIZ) {
    sm.transition(GameState.PLAYING);
  }

  if (shame.isOverload()) {
    finishByOverload();
    return;
  }
  teacher.enterPaceAfterQuiz();
});

/* ---------- 结算占位（Phase 6 接入） ---------- */
function showResult(title, desc) {
  resultTitle.textContent = title;
  resultDesc.textContent = desc;
  resultStats.innerHTML = '';
  resultWrongList.innerHTML = '<div class="result-wrong-item">结算与结局判定将在 Phase 6 接入。</div>';
  resultScreen.classList.remove('hidden');
}

function finishByExit() {
  if (sm.state !== GameState.PLAYING) return;
  sm.transition(GameState.RESULT);
  showResult('🎉 逃出去了！', '你摸到了后门，老师还没反应过来。');
}

function finishByOverload() {
  if (sm.state !== GameState.PLAYING) return;
  sm.transition(GameState.RESULT);
  showResult('💀 留堂了……', '羞愧值满 150，你被老师留下来抄写单词。');
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
  quizModal.classList.add('hidden');

  map.reset();
  player.reset();
  shame.reset();
  teacher.reset();

  if (sm.state === GameState.RESULT) sm.transition(GameState.IDLE);
  if (sm.state === GameState.IDLE) sm.transition(GameState.PLAYING);

  beat.reset();
  lastTs = 0;
  renderer.setHint('老师板书时可以放心行动，回头瞬间别还在移动', 2600);
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
