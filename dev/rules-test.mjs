/* dev/rules-test.mjs —— 规则对齐自检（对照 .trae/documents/plan.md 第二章）
 * 运行：node --experimental-default-type=module dev/rules-test.mjs
 */
import { BeatClock } from '../js/BeatClock.js';
import { MapManager } from '../js/MapManager.js';
import { Player, MOVE_BEATS, PULL_BEATS } from '../js/Player.js';
import { TeacherAI } from '../js/TeacherAI.js';
import { ShameTracker, SHAME_MAX } from '../js/ShameTracker.js';
import { ResultManager } from '../js/ResultManager.js';
import { decideTurnEntry, decideTurnMove, TURN_OUTCOME } from '../js/TurnJudge.js';
import { CellType, MAP } from '../js/MapData.js';

const results = [];
function t(name, cond, detail = '') {
  results.push({ name, pass: Boolean(cond), detail });
}
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

/* ---------- 节拍 ---------- */
{
  const beat = new BeatClock(400);
  let beats = 0;
  beat.onBeat = () => beats++;
  beat.tick(1200);
  t('1 拍 = 400ms，1200ms 走 3 拍', beats === 3, `beats=${beats}`);
}

/* ---------- 动作耗时与锁定 ---------- */
{
  const map = new MapManager();
  const player = new Player(map);
  t('移动 1.5 拍', MOVE_BEATS === 1.5);
  t('拉椅 1 拍', PULL_BEATS === 1);

  const target = DIRS.map(([dx, dy]) => ({ x: player.x + dx, y: player.y + dy }))
    .find((c) => map.isPassable(c.x, c.y));
  t('起点周围有可通行格', Boolean(target));

  if (target) {
    const r = player.startMove(target.x, target.y);
    t('移动能开始（不再抛异常）', r.started === true, JSON.stringify(r));
    t('移动中锁定输入', player.isBusy() === true && player.isMidAction() === true);

    const early = player.tick(599, 400);
    t('1.5 拍前不落地', early === null);
    const done = player.tick(1, 400);
    t('满 1.5 拍落地并更新位置', done && done.type === 'moveDone' && player.x === target.x && player.y === target.y);
    t('落地后解除锁定', player.isBusy() === false);

    const expect = target.y < MAP.start.y ? 'n' : target.y > MAP.start.y ? 's' : target.x < MAP.start.x ? 'w' : 'e';
    t('朝向随移动方向更新', player.facing === expect, `facing=${player.facing} expect=${expect}`);
  }
}

/* ---------- 拉椅 ---------- */
{
  const map = new MapManager();
  const player = new Player(map);
  let pulled = null;
  outer: for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      if (map.getCell(x, y).type !== CellType.SEAT_CLOSED) continue;
      for (const [dx, dy] of DIRS) {
        const px = x + dx, py = y + dy;
        if (!map.isInBounds(px, py) || !map.isPassable(px, py)) continue;
        player.x = px; player.y = py;
        if (player.startPull(x, y).started) { pulled = { x, y }; break outer; }
      }
    }
  }
  t('可从相邻格拉椅', Boolean(pulled));
  if (pulled) {
    player.tick(400, 400);
    t('1 拍后椅子变 seatOpen', map.getCell(pulled.x, pulled.y).type === CellType.SEAT_OPEN);
    t('seatOpen 不再可拉', map.isPullable(pulled.x, pulled.y) === false);
  }
}

/* ---------- 老师状态机 ---------- */
{
  const teacher = new TeacherAI({});
  const counts = { board: [], pace: [], turn: [] };
  let turns = 0;
  teacher.onPhaseChange = (phase) => counts[phase].push(teacher.beatsLeft);
  teacher.onTurn = () => turns++;
  for (let i = 0; i < 400; i++) {
    teacher.beatsLeft = 1;
    teacher.tickBeat();
  }
  const inRange = (arr, min, max) => arr.length > 0 && arr.every((v) => v >= min && v <= max);
  t('板书 2–3 拍', inRange(counts.board, 2, 3));
  t('踱步 3–4 拍', inRange(counts.pace, 3, 4));
  t('回头 2–3 拍', inRange(counts.turn, 2, 3));
  t('回头次数 > 100', turns > 100, `turns=${turns}`);

  const t2 = new TeacherAI({});
  t2.beatsLeft = 1;
  t2.tickBeat();
  t('板书结束进入踱步', t2.phase === 'pace');
  t2.enterPaceAfterQuiz();
  t('答题结束回到踱步并重掷 3–4 拍', t2.phase === 'pace' && t2.beatsLeft >= 3 && t2.beatsLeft <= 4);
  const t3 = new TeacherAI({});
  t3.forcePace();
  t('异响强制切踱步', t3.phase === 'pace');
}

/* ---------- 羞愧值 ---------- */
{
  const s = new ShameTracker();
  s.applyCET(false); const p1 = s.value;
  s.applyCET(false); const p2 = s.value - p1;
  s.applyCET(false); const p3 = s.value - p1 - p2;
  s.applyCET(false); const p4 = s.value - p1 - p2 - p3;
  t('四六级错 10/20/35/50', p1 === 10 && p2 === 20 && p3 === 35 && p4 === 50, `${p1}/${p2}/${p3}/${p4}`);
  s.applyCET(true);
  t('四六级对 −10', s.value === 115 - 10);

  const f = new ShameTracker();
  f.value = 20;
  f.applyFlashback(true);
  t('闪回对 −20 且不低于 0', f.value === 0);
  f.applyFlashback(false);
  t('闪回错 +10', f.value === 10);

  const cap = new ShameTracker();
  for (let i = 0; i < 10; i++) cap.applyCET(false);
  t('羞愧上限 150', cap.value === SHAME_MAX && cap.isOverload());

  const acc = new ShameTracker();
  acc.applyCET(true);
  acc.applyCET(false);
  t('failCount 只统计四六级错且答对不清零', acc.failCount === 1);
}

/* ---------- 闪回加权 ---------- */
{
  const s = new ShameTracker();
  const pickDominant = (c) => Object.keys(c).reduce((a, b) => (c[a] >= c[b] ? a : b));
  for (const range of [[30, 55], [60, 85], [90, 115], [120, 149]]) {
    const counts = { kindergarten: 0, primary: 0, middle: 0, high: 0 };
    for (let i = 0; i < 4000; i++) {
      s.value = range[0] + Math.random() * (range[1] - range[0]);
      counts[s.getFlashbackStage()]++;
    }
    const dominant = pickDominant(counts);
    const expect = { 30: 'kindergarten', 60: 'primary', 90: 'middle', 120: 'high' }[range[0]];
    t(`羞愧 ${range[0]}–${range[1]} 抽 ${expect} 为主`, dominant === expect, JSON.stringify(counts));
  }
}

/* ---------- 回头判定 ---------- */
{
  const base = { atExit: false, overload: false, midAction: false, onBrokenSeat: false, shame: 40 };
  t('到门优先于羞愧满', decideTurnEntry({ ...base, atExit: true, overload: true }) === TURN_OUTCOME.EXIT);
  t('羞愧满 → 留堂', decideTurnEntry({ ...base, overload: true }) === TURN_OUTCOME.OVERLOAD);
  t('动作未落地 → 四六级', decideTurnEntry({ ...base, midAction: true }) === TURN_OUTCOME.CET);
  t('破损座椅 + 羞愧 40 → 闪回', decideTurnEntry({ ...base, onBrokenSeat: true }) === TURN_OUTCOME.FLASHBACK);
  t('破损座椅 + 羞愧 20 → 四六级', decideTurnEntry({ ...base, onBrokenSeat: true, shame: 20 }) === TURN_OUTCOME.CET);
  t('静止普通格 → 保持窗口', decideTurnEntry(base) === TURN_OUTCOME.WINDOW);
  t('窗口内可走 → 被抓', decideTurnMove({ passable: true }) === TURN_OUTCOME.CET);
  t('窗口内可拉椅 → 被抓', decideTurnMove({ pullable: true }) === TURN_OUTCOME.CET);
  t('窗口内撞墙 → 不触发', decideTurnMove({}) === TURN_OUTCOME.WINDOW);
}

/* ---------- 结局 ---------- */
{
  const r = new ResultManager();
  t('零答题 → 节奏大师', r.computeEnding('exit').key === 'rhythm');
  r.record('cet', true);
  t('全对 → 英语大师', r.computeEnding('exit').key === 'english');
  r.record('cet', false);
  t('2 题 1 对 → 稳步前行', r.computeEnding('exit').key === 'steady');
  const r2 = new ResultManager();
  for (let i = 0; i < 3; i++) r2.record('cet', false);
  r2.record('cet', true);
  t('答对率 25% → 侥幸脱身', Math.abs(r2.accuracy() - 0.25) < 1e-9 && r2.computeEnding('exit').key === 'lucky');
  t('羞愧满 → 留堂失败', r2.computeEnding('overload').key === 'detained');
}

const failed = results.filter((x) => !x.pass);
console.log('\n=== 规则对齐自检 ===');
for (const x of failed) console.log(`FAIL  ${x.name}  ${x.detail}`);
console.log(`${results.length - failed.length}/${results.length} 通过`);
if (failed.length) process.exit(1);
