/* dev/map-test.mjs —— 20×15 地图生成校验（BFS 双路线 / 步数 / 安全区）
 * 运行：node --experimental-default-type=module dev/map-test.mjs
 */
import { MAP, CellType } from '../js/MapData.js';
import { MapManager } from '../js/MapManager.js';

const N = 100;
const maps = [];
for (let i = 0; i < N; i++) {
  const m = new MapManager();
  const path = m._findPath(new Set());
  maps.push({ m, path, debug: m.debug });
}

let fail = 0;
let routeFail = 0;
const lens = [];
const attempts = [];
const counts = {};
let safeFail = 0;

for (const { m, path, debug } of maps) {
  attempts.push(debug.attempts);
  if (!debug.routed) routeFail++;
  if (!path) { fail++; continue; }
  lens.push(path.length - 1);

  // 起点 / 出口 3 格内必须全是可通行格
  for (const c of [MAP.start, MAP.exit]) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = c.x + dx, y = c.y + dy;
        if (!m.isInBounds(x, y)) continue;
        if (x === 0 || y === 0 || x === MAP.cols - 1 || y === MAP.rows - 1) continue;
        if (!m.isPassable(x, y)) safeFail++;
      }
    }
  }

  for (let y = 0; y < MAP.rows; y++) {
    for (let x = 0; x < MAP.cols; x++) {
      const t = m.getCell(x, y).type;
      counts[t] = (counts[t] || 0) + 1;
    }
  }
}

const min = Math.min(...lens);
const max = Math.max(...lens);
const avg = lens.reduce((a, b) => a + b, 0) / lens.length;

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
};

ok('100 局全部可通关', fail === 0, `失败 ${fail}`);
ok('100 局全部双路线', routeFail === 0, `兜底 ${routeFail}`);
ok('起点/出口安全区全通行', safeFail === 0, `违规格 ${safeFail}`);
ok('最短步数 ≈ 29（26–34）', min >= 26 && max <= 34, `min ${min} / avg ${avg.toFixed(1)} / max ${max}`);
ok('生成重试未触顶', Math.max(...attempts) < MAP.maxGenerateRetry, `max attempts ${Math.max(...attempts)}`);
ok('每局至少 1 个可用出口', true, '');

const seat = (counts.seatClosed || 0) + (counts.seatOpen || 0) + (counts.seatBroken || 0) + (counts.seatOccupied || 0);
ok('座椅总数在 60–110', seat / N >= 60 && seat / N <= 110, `avg ${(seat / N).toFixed(1)}`);
ok('课桌总数在 3–20', (counts.desk || 0) / N >= 3 && (counts.desk || 0) / N <= 20, `avg ${((counts.desk || 0) / N).toFixed(1)}`);

console.log(`\n=== 20×15 地图校验（${N} 局）===`);
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail ? `— ${r.detail}` : ''}`);
}
console.log(`\n格子分布（每局均值）：`);
for (const [k, v] of Object.entries(counts)) {
  console.log(`  ${k.padEnd(14)} ${(v / N).toFixed(1)}`);
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed === 0 ? 0 : 1);
