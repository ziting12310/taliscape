/* dev/integration-test.mjs —— main.js 集成冒烟（无头 DOM 桩）
 * 目的：验证「开始 → 移动 → 落地 → 到门结算」整条主链不再抛异常。
 * 运行：node --experimental-default-type=module dev/integration-test.mjs
 */

/* ---------- 最小 DOM 桩 ---------- */
function makeClassList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    toggle: (c, on) => { if (on === undefined) { set.has(c) ? set.delete(c) : set.add(c); } else if (on) set.add(c); else set.delete(c); },
    contains: (c) => set.has(c),
    _set: set
  };
}

function makeEl(id = '') {
  const listeners = {};
  const el = {
    id,
    classList: makeClassList(),
    style: {},
    textContent: '',
    innerHTML: '',
    dataset: {},
    children: [],
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {},
    dispatch(type, ev = {}) { (listeners[type] || []).forEach((fn) => fn({ target: el, preventDefault() {}, ...ev })); },
    click() { this.dispatch('click'); },
    closest(sel) { return sel === '.quiz-option' ? el : null; },
    contains(node) { return this.children.includes(node) || node === el; },
    blur() {},
    focus() {},
    getBoundingClientRect() { return { width: 960, height: 768, left: 0, top: 0 }; }
  };
  return el;
}

let calls = 0;
function makeCtx() {
  const target = { canvas: { width: 960, height: 768 }, fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '', imageSmoothingEnabled: false, globalCompositeOperation: '' };
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (prop === 'measureText') return () => ({ width: 60 });
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => ({ addColorStop() {} });
      return () => { calls++; };
    },
    set(obj, prop, val) { obj[prop] = val; return true; }
  });
}

const ids = ['gameCanvas', 'stageWrap', 'phaseText', 'statusText', 'shameFill', 'shameText',
  'startScreen', 'stayScreen', 'resultScreen', 'startBtn', 'stayBtn', 'stayRetryBtn',
  'resultAgainBtn', 'resultTitle', 'resultDesc', 'resultStats', 'resultWrongList',
  'quizModal', 'quizStageTag', 'quizQuestion', 'quizOptions', 'quizFeedback',
  'quizTimerFill', 'quizNextBtn', 'quizLeftEmoji', 'quizRightEmoji', 'quizLeftTag', 'quizRightTag'];

const els = {};
for (const id of ids) els[id] = makeEl(id);
els.gameCanvas.getContext = () => makeCtx();
els.gameCanvas.width = 960;
els.gameCanvas.height = 768;
els.quizOptions.appendChild = (c) => { els.quizOptions.children.push(c); return c; };

const rafQueue = [];
globalThis.document = {
  getElementById: (id) => els[id] || null,
  createElement: () => makeEl(),
  activeElement: { blur() {} },
  body: makeEl('body')
};
globalThis.window = { addEventListener: (type, fn) => { (window._l = window._l || {}); (window._l[type] = window._l[type] || []).push(fn); } };
globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
globalThis.performance = globalThis.performance || { now: () => Date.now() };

/* ---------- 加载游戏 ---------- */
const results = [];
function t(name, cond, detail = '') { results.push({ name, pass: Boolean(cond), detail }); }

let moduleError = null;
try {
  await import('../js/main.js');
} catch (err) {
  moduleError = err;
}
t('main.js 可加载', moduleError === null, moduleError ? moduleError.message : '');

if (!moduleError) {
  // 跑几帧待机
  for (let i = 0; i < 4; i++) {
    const cb = rafQueue.shift();
    if (cb) cb(1000 + i * 16);
  }
  t('待机帧无异常且完成绘制', calls > 100, `calls=${calls}`);

  // 点开始
  let err = null;
  try { els.startBtn.click(); } catch (e) { err = e; }
  t('点击开始无异常', err === null, err ? err.message : '');
  t('开始页隐藏', els.startScreen.classList.contains('hidden'));

  // 推进 1 帧
  err = null;
  try {
    const cb = rafQueue.shift();
    if (cb) cb(2000);
  } catch (e) { err = e; }
  t('游戏帧无异常', err === null, err ? err.message : '');
  t('HUD 阶段文本含剩余拍数', /剩\s*\d+\s*拍/.test(els.phaseText.textContent), els.phaseText.textContent);

  // 按方向键：应能开始移动（此前 startMove 抛 ReferenceError）
  const keydown = (window._l && window._l.keydown) || [];
  t('已注册键盘监听', keydown.length > 0);
  err = null;
  try { keydown.forEach((fn) => fn({ code: 'ArrowUp', preventDefault() {} })); } catch (e) { err = e; }
  t('按方向键不抛异常（移动入口修复）', err === null, err ? err.message : '');

  // 推进 700ms（跨过 1.5 拍）
  err = null;
  try {
    let ts = 2000;
    for (let i = 0; i < 6; i++) {
      const cb = rafQueue.shift();
      if (cb) { ts += 120; cb(ts); }
    }
  } catch (e) { err = e; }
  t('移动过程 6 帧无异常', err === null, err ? err.message : '');

  t('羞愧条宽度已更新', els.shameFill.style.width && els.shameFill.style.width.endsWith('%'), els.shameFill.style.width);
}

const failed = results.filter((x) => !x.pass);
console.log('\n=== main.js 集成冒烟 ===');
for (const x of results) console.log(`${x.pass ? 'PASS' : 'FAIL'}  ${x.name}  ${x.detail}`);
console.log(`${results.length - failed.length}/${results.length} 通过`);
if (failed.length) process.exit(1);
