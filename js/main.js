/* main.js —— Phase 5：真实题库 + 10 秒倒计时答题面板
 * 结算与结局判定在 Phase 6 接入。
 */
import { GameState, StateMachine } from './GameState.js';
import { BeatClock } from './BeatClock.js';
import { CellType } from './MapData.js';
import { MapManager } from './MapManager.js';
import { Player } from './Player.js';
import { TeacherAI } from './TeacherAI.js';
import { ShameTracker, FLASHBACK_MIN_SHAME } from './ShameTracker.js';
import { ResultManager, STAGE_LABEL } from './ResultManager.js';
import { QuizManager } from './QuizManager.js';
import { Renderer } from './Renderer.js';

/* ---------- 可调参数 ---------- */
const BEAT_MS = 400;        // 1 拍时长
const CREAK_CHANCE = 0.5;   // 破损座椅异响概率
const MAX_FRAME_MS = 250;   // 单帧最大步进（切后台回来时防止拍数瞬跳）

/* ---------- 实例化 ---------- */
const sm = new StateMachine();
const beat = new BeatClock(BEAT_MS);
const map = new MapManager();
const player = new Player(map);
const shame = new ShameTracker();
const result = new ResultManager();

const canvas = document.getElementById('gameCanvas');

const teacher = new TeacherAI({
  onTurn: handleTurn,
  onPhaseChange: null
});

beat.onBeat = () => {
  if (sm.isFrozen() || sm.state !== GameState.PLAYING) return;
  teacher.tickBeat();
};

/* ---------- DOM ---------- */
const stageWrap = document.getElementById('stageWrap');
const phaseText = document.getElementById('phaseText');
const statusText = document.getElementById('statusText');
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

const renderer = new Renderer(canvas, {
  stageWrap,
  phaseText,
  statusText,
  beatFill,
  beatCount,
  shameFill,
  shameText
});

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
      && Math.random() < CREAK_CHANCE) {
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
    quiz.open('cet');
    return;
  }
  if (shame.value >= FLASHBACK_MIN_SHAME) {
    quiz.open('flashback', shame.getFlashbackStage());
  } else {
    quiz.open('cet');
  }
}

/* ---------- 答题面板 ---------- */
const quiz = new QuizManager(
  sm,
  {
    modal: quizModal,
    stageTag: quizStageTag,
    question: quizQuestion,
    options: quizOptions,
    feedback: quizFeedback,
    timerFill: quizTimerFill,
    nextBtn: quizNextBtn,
    leftEmoji: quizLeftEmoji,
    rightEmoji: quizRightEmoji,
    leftTag: quizLeftTag,
    rightTag: quizRightTag
  },
  {
    onFinish: ({ kind, correct, stage, question }) => {
      if (kind === 'flashback') shame.applyFlashback(correct);
      else shame.applyCET(correct);

      result.record(kind, correct, question);

      if (shame.isOverload()) {
        finishByOverload();
        return;
      }
      teacher.enterPaceAfterQuiz();
    }
  }
);

/* ---------- 结局结算 ---------- */
function renderResultStats() {
  resultStats.innerHTML = result.statsItems()
    .map(([label, value]) => `<div class="result-stat">${label}<b>${value}</b></div>`)
    .join('');
}

function renderWrongList() {
  if (result.wrongList.length === 0) {
    resultWrongList.innerHTML = '<div class="result-wrong-item">本局没有答错的题目。</div>';
    return;
  }

  resultWrongList.innerHTML = result.wrongList.map((w) => {
    const stage = w.stage ? `（${STAGE_LABEL[w.stage] || w.stage}）` : '';
    const point = w.point ? ` · ${w.point}` : '';
    return `<div class="result-wrong-item">${w.question}${stage}${point}</div>`;
  }).join('');
}

function showResult(title, desc) {
  resultTitle.textContent = title;
  resultDesc.textContent = desc;
  renderResultStats();
  renderWrongList();
  resultScreen.classList.remove('hidden');
}

function finishByExit() {
  if (sm.state !== GameState.PLAYING) return;
  sm.transition(GameState.RESULT);

  const ending = result.computeEnding('exit');
  showResult(ending.name, ending.desc);
}

function finishByOverload() {
  if (sm.state !== GameState.PLAYING) return;
  sm.transition(GameState.RESULT);

  const ending = result.computeEnding('overload');
  showResult(ending.name, ending.desc);
}

/* ---------- 主循环 ---------- */
let lastTs = 0;

function loop(ts) {
  const delta = lastTs ? Math.min(ts - lastTs, MAX_FRAME_MS) : 0;
  lastTs = ts;

  try {
    if (!sm.isFrozen() && sm.state === GameState.PLAYING) {
      beat.tick(delta);
      const ev = player.tick(delta, beat.beatMs);
      if (ev) onActionDone(ev);
    }
    renderer.updateHud({ sm, teacher, player, beat, shame });
    renderer.draw(map, player, sm, teacher, ts);
  } catch (err) {
    console.error('[loop]', err);
  } finally {
    requestAnimationFrame(loop);
  }
}

/* ---------- 开始 / 重置 ---------- */
function begin() {
  // 避免隐藏后的按钮仍持有焦点，被空格/回车再次触发重置
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }

  startScreen.classList.add('hidden');
  stayScreen.classList.add('hidden');
  resultScreen.classList.add('hidden');
  quiz.cancel();

  map.reset();
  player.reset();
  shame.reset();
  result.reset();
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
renderer.updateHud({ sm, teacher, player, beat, shame });
renderer.setHint('点击「开始逃课」进入教室', 4000);
requestAnimationFrame(loop);
