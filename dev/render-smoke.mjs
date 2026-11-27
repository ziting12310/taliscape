/* dev/render-smoke.mjs —— 渲染层冒烟测试（无浏览器）
 * 用最小 Canvas 2D 桩跑一遍 Renderer.draw：五档光照 × 三种老师姿态 × 玩家的四个朝向。
 * 断言：不抛异常、不出现 NaN 坐标、每帧都有实际绘制调用。
 * 运行：node --experimental-default-type=module dev/render-smoke.mjs
 */
import { StateMachine, GameState } from '../js/GameState.js';
import { MapManager } from '../js/MapManager.js';
import { Player } from '../js/Player.js';
import { TeacherAI } from '../js/TeacherAI.js';
import { ShameTracker } from '../js/ShameTracker.js';
import { Renderer } from '../js/Renderer.js';

let calls = 0;
let badCoords = [];

function makeCtx() {
  const check = (name, args) => {
    for (const a of args) {
      if (typeof a === 'number' && (!Number.isFinite(a))) {
        badCoords.push({ name, args });
      }
    }
  };
  const target = {
    canvas: { width: 960, height: 768 },
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    imageSmoothingEnabled: false
  };

  const handler = {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (prop === 'measureText') return () => ({ width: 60 });
      if (prop === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
      return (...args) => {
        calls++;
        check(String(prop), args);
      };
    },
    set(obj, prop, value) { obj[prop] = value; return true; }
  };
  return new Proxy(target, handler);
}

const canvas = {
  width: 960,
  height: 768,
  style: {},
  getContext: () => makeCtx()
};

const sm = new StateMachine();
sm.transition(GameState.PLAYING);
const renderer = new Renderer(canvas, {
  phaseText: { textContent: '' },
  statusText: { textContent: '' },
  shameFill: { style: {}, classList: { toggle() {} } },
  shameText: { textContent: '' },
  stageWrap: { classList: { toggle() {} } }
});

const results = [];
function caseRun(name, fn, minCalls = 20) {
  calls = 0;
  badCoords = [];
  try {
    fn();
    results.push({ name, pass: calls >= minCalls && badCoords.length === 0, detail: `${calls} 次绘制调用` });
  } catch (err) {
    results.push({ name, pass: false, detail: `异常：${err.message}` });
  }
}

for (let i = 0; i < 6; i++) {
  const map = new MapManager();
  const player = new Player(map);
  const teacher = new TeacherAI({});
  const shame = new ShameTracker();
  const value = [0, 45, 75, 105, 150, 20][i];

  for (const phase of ['board', 'pace', 'turn']) {
    caseRun(`地图${i} · ${phase} · 羞愧${value}`, () => {
      teacher.phase = phase;
      shame.value = value;
      for (let f = 0; f < 3; f++) {
        renderer.draw(map, player, sm, teacher, 1000 + f * 400, shame, f);
      }
    });
  }

  for (const dir of ['s', 'n', 'e', 'w']) {
    caseRun(`地图${i} · 朝向 ${dir}`, () => {
      player.facing = dir;
      player.action = { type: 'move', tx: player.x, ty: player.y, progress: 0.6 };
      renderer.draw(map, player, sm, teacher, 2000, shame, 2);
      player.action = null;
    });
  }

  caseRun(`地图${i} · 拉椅中`, () => {
    player.action = { type: 'pull', tx: player.x + 1, ty: player.y, progress: 0.4 };
    renderer.draw(map, player, sm, teacher, 2400, shame, 3);
    player.action = null;
  });

  caseRun(`地图${i} · HUD`, () => {
    renderer.updateHud({ sm, teacher, player, shame });
  }, 0);
}

console.log('\n=== 渲染冒烟测试 ===');
for (const r of results) {
  if (!r.pass || process.env.VERBOSE) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  — ${r.detail}`);
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log('首个失败详情：', JSON.stringify(failed[0], null, 2));
  process.exit(1);
}

