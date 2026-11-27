/* LightingLayer 逻辑自检
 * 运行：node --experimental-default-type=module dev/lighting-test.mjs
 */
import { LightingLayer, levelForShame } from '../js/LightingLayer.js';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) passed++;
  else failures.push(`${name}: 实际 ${actual}，期望 ${expected}`);
}

// 1. 阈值
for (const [value, expected] of [
  [0, 0], [29, 0], [30, 1], [59, 1], [60, 2], [89, 2],
  [90, 3], [119, 3], [120, 4], [150, 4]
]) {
  const layer = new LightingLayer();
  layer.setShame(value, 0);
  layer.update(10000);
  check(`阈值 ${value} → L${expected}`, layer.level, expected);
  check(`纯函数 ${value}`, levelForShame(value), expected);
}

// 2. 跨档时按 100ms 逐档推进
{
  const layer = new LightingLayer();
  layer.setShame(150, 0);
  check('t=0 起步到 L1', (layer.update(0), layer.level), 1);
  check('t=50 保持 L1', (layer.update(50), layer.level), 1);
  check('t=100 到 L2', (layer.update(100), layer.level), 2);
  check('t=300 到 L4', (layer.update(300), layer.level), 4);
}

// 3. 降档迟滞（L1 阈值为 30，需跌到 25 才回落）
{
  const layer = new LightingLayer();
  layer.setShame(35, 0);
  layer.update(10000);
  check('35 → L1', layer.level, 1);

  layer.setShame(34, 10000);
  layer.update(10100);
  check('34 不回落（迟滞）', layer.level, 1);

  layer.setShame(25, 10100);
  layer.update(10200);
  check('25 回落 L0', layer.level, 0);
}

// 4. reset 归零
{
  const layer = new LightingLayer();
  layer.setShame(150, 0);
  layer.update(10000);
  layer.reset();
  check('reset 后 L0', layer.level, 0);
}

// 5. 目标档描述
{
  const layer = new LightingLayer();
  layer.setShame(95, 0);
  layer.update(10000);
  check('95 描述档位', layer.describe().id, 'L3');
  check('95 名称', layer.describe().name, '病态黄');
}

if (failures.length) {
  console.error(`✗ ${failures.length} 项未通过 / 共 ${passed + failures.length} 项`);
  for (const f of failures) console.error('  - ' + f);
  process.exitCode = 1;
} else {
  console.log(`✓ 全部 ${passed} 项通过`);
}
