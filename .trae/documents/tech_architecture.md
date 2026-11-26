# 《桃李？逃离！》技术架构文档

> 版本：2.0 · 日期：2026-11-26
> 基础：沿用已完成的 ES Module 拆分（`index.html` + `css/main.css` + `js/*.js`）
> 架构原则：单一时间源（节拍）、状态集中、逻辑与渲染解耦、逻辑推进不依赖渲染帧

---

## 1. 架构总览

```
index.html（仅 DOM）
  ├── css/main.css
  └── js/main.js  ← 唯一入口（type="module"）
        ├── GameState.js      状态 + 状态机（唯一状态源）
        ├── BeatClock.js      全局节拍时钟（唯一时间源）
        ├── MapData.js        地图生成参数 + 格子类型常量
        ├── MapManager.js     随机生成 / 连通性校验 / 通行性 / 拉椅
        ├── Player.js         位置 + 动作（1.5 拍 / 1 拍）
        ├── TeacherAI.js      板书 / 踱步 / 回头判定
        ├── ShameTracker.js   羞愧值 + 递增曲线 + 闪回区间
        ├── QuizBank.js       四六级题库
        ├── FlashbackBank.js  四阶段闪回题库
        ├── QuizManager.js    答题面板（三栏 + 10s 倒计时）
        ├── ResultManager.js  统计 + 5 种结局
        └── Renderer.js       Canvas 渲染 + HUD
```

**核心分层**

| 层 | 模块 | 说明 |
|---|---|---|
| 时间层 | `BeatClock` | 唯一时间基准，所有节拍都从这里派生 |
| 状态层 | `GameState` | 唯一状态源，决定是否冻结 |
| 逻辑层 | `MapManager` `Player` `TeacherAI` `ShameTracker` | 纯逻辑，不接触 DOM |
| 数据层 | `MapData` `QuizBank` `FlashbackBank` | 静态数据 |
| 表现层 | `Renderer` `QuizManager` `ResultManager` | Canvas / DOM |
| 编排层 | `main.js` | 输入、事件分发、流程串联 |

---

## 2. 状态机

```js
export const GameState = {
  IDLE: 'idle',                 // 开始页
  PLAYING: 'playing',           // 主流程（板书 / 踱步 都在此状态内）
  QUIZ_OPEN: 'quiz',            // 四六级答题
  FLASHBACK_QUIZ: 'flashback',  // 闪回答题
  RESULT: 'result'              // 结局（payload.ending）
};
```

> 老师的三段式（板书 / 踱步 / 回头）**不设为全局状态**，而是 `TeacherAI.phase`。因为它每 2–4 拍就切换一次，放进全局状态机只会制造噪声；全局只关心"是否被弹窗/结局中断"。

### 状态转换表

| FROM | TO | 触发 | 副作用 |
|---|---|---|---|
| IDLE | PLAYING | 点击开始 | 重置全部数据、启动节拍、老师进板书 |
| PLAYING | QUIZ_OPEN | 回头窗口内移动 / 进入瞬间动作未落地 | 冻结节拍、锁定输入、开面板 |
| PLAYING | FLASHBACK_QUIZ | 回头开始瞬间静止站破损座椅 + 羞愧≥30 | 同上 + 低饱和滤镜 |
| PLAYING | RESULT | 到出口 / 羞愧≥150 | 停止节拍、结算 |
| QUIZ_OPEN | PLAYING | 面板关闭 | 解冻、回踱步、重掷拍数 |
| FLASHBACK_QUIZ | PLAYING | 面板关闭 | 同上 |
| RESULT | IDLE | 再来一次 | 全量重置 |

```js
isFrozen() {
  return this.state === GameState.QUIZ_OPEN
      || this.state === GameState.FLASHBACK_QUIZ
      || this.state === GameState.RESULT;
}
```

---

## 3. 时间基准：BeatClock

```js
export class BeatClock {
  constructor(beatMs = 400) {
    this.beatMs = beatMs;
    this.elapsedMs = 0;
    this.beatIndex = 0;
    this.onBeat = null;      // (beatIndex) => void
  }
  // deltaMs 由渲染循环提供；冻结时不调用
  tick(deltaMs) {
    this.elapsedMs += deltaMs;
    const target = Math.floor(this.elapsedMs / this.beatMs);
    while (this.beatIndex < target) {
      this.beatIndex++;
      this.onBeat?.(this.beatIndex);
    }
  }
  beatProgress() { return (this.elapsedMs % this.beatMs) / this.beatMs; }
  reset() { this.elapsedMs = 0; this.beatIndex = 0; }
}
```

**关键点**

1. `elapsedMs` 用累加而非 `performance.now() % beatMs`，保证冻结后不会跳拍。
2. 一次 `tick` 可能跨多拍（掉帧场景），用 `while` 补齐，**拍事件不会丢**。
3. 玩家动作（1.5 拍）用同一套换算：`actionElapsedMs += deltaMs`，比较 `actionElapsedMs >= beats * beatMs`。

### 参数表

| 常量 | 值 | 位置 |
|---|---|---|
| `BEAT_MS` | 400 | `BeatClock.js` |
| `BOARD_BEATS` | 2–3 随机整数 | `TeacherAI.js` |
| `PACE_BEATS` | 3–4 随机整数 | `TeacherAI.js` |
| `TURN_BEATS` | 2–3 随机整数 | `TeacherAI.js` |
| `MOVE_BEATS` | 1.5 | `Player.js` |
| `PULL_BEATS` | 1 | `Player.js` |
| `QUIZ_TIME_MS` | 10000 | `QuizManager.js` |
| `CREAK_CHANCE` | 0.5 | `main.js` / `TeacherAI.js` |
| `SHAME_MAX` | 150 | `ShameTracker.js` |
| `FLASHBACK_MIN_SHAME` | 30 | `ShameTracker.js` |

---

## 4. 核心模块接口

### 4.1 MapData

```js
export const CellType = {
  WALL: 'wall', AISLE: 'aisle', CLUTTER: 'clutter', DESK: 'desk',
  SEAT_CLOSED: 'seatClosed', SEAT_OPEN: 'seatOpen',
  SEAT_BROKEN: 'seatBroken', SEAT_OCCUPIED: 'seatOccupied',
  EXIT: 'exit', START: 'start'
};

export const MAP_CONFIG = {
  cols: 16, rows: 12, tile: 50,
  startZone: { x: 1, y: 10 },
  exitZone: { x: 14, y: 1 },
  safeRadius: 3,          // 起点/出口周围不含障碍的半径
  seatWeights: { open: 35, closed: 30, broken: 15, occupied: 20 },
  deskRatio: 0.10,        // 座位区内课桌本体占比
  clutterRatio: 0.08,     // 过道上书本/书包占比
  maxRetry: 50
};
export const START_POS = { x: 1, y: 10 };
export const EXIT_POS = { x: 14, y: 1 };
```

### 4.2 MapManager

```js
export class MapManager {
  constructor() { this.grid = []; this.generate(); }

  generate()                // 随机生成 + 连通性/双路线校验 + 兜底
  _buildCorridors()         // 环形过道 + 中部主通道
  _fillSeats()              // 座位区按权重铺设四类座椅
  _scatterClutter()         // 过道撒书本，避开交叉口
  _validate()               // 免费通行 BFS + 屏蔽最短路径后二次 BFS
  _carveFallback()          // 50 次失败后打通曼哈顿走廊

  getCell(x, y)
  isInBounds(x, y)
  isPassable(x, y)          // 依当前类型判断，座椅状态是网格里的实时值
  isAdjacent(x1, y1, x2, y2)
  isExit(x, y)
  pullSeat(x, y)            // 仅 seatClosed → seatOpen，返回是否成功
  reset()                   // 重新生成整张地图
}
```

通行性映射：`AISLE / SEAT_OPEN / SEAT_BROKEN / EXIT / START` 通行；`WALL / CLUTTER / DESK / SEAT_CLOSED / SEAT_OCCUPIED` 不通行。

### 4.3 Player

```js
export class Player {
  constructor(map) { this.map = map; this.x; this.y; this.action = null; }

  isBusy() { return this.action !== null; }          // 动作锁
  isMidAction() { return this.action !== null; }     // 回头判定用（语义同 isBusy）

  startMove(tx, ty) {
    // 校验：不在动作中 / 目标相邻 / 目标可通行
    // 设置 action = { type:'move', tx, ty, elapsedMs:0, beats:1.5 }
  }
  startPull(tx, ty) {
    // 校验：不在动作中 / 相邻 / 目标 seatClosed
    // 设置 action = { type:'pull', tx, ty, elapsedMs:0, beats:1 }
  }

  // 由主循环每帧调用；返回完成事件或 null
  tick(deltaMs, beatMs) {
    // 累计 elapsedMs；达到 beats*beatMs 时：
    //   move → this.x/this.y = tx/ty，返回 { type:'moveDone', x, y, cellType }
    //   pull → map.pullSeat(tx,ty)，返回 { type:'pullDone', x, y }
  }

  reset()
}
```

> **不提供 `rollback()`**：答题由回头判定触发，不因踩格触发，因此不存在"答错回退"机制。

### 4.4 TeacherAI

```js
export class TeacherAI {
  constructor() { this.phase = 'board'; this.beatsLeft = 0; }
  reset() { this._enterBoard(); }

  tickBeat() {
    // board/pace 的 beatsLeft--；到 0 时切换
    // pace 拍数耗尽 → phase='turn' → onTurn()
  }
  forcePace() { this._enterPace(); }   // 异响专用：强制切踱步并重掷拍数

  onTurn = null;   // 回头判定回调（由 main.js 注入）
}
```

### 4.5 ShameTracker

```js
export class ShameTracker {
  constructor() { this.value = 0; this.failCount = 0; }

  applyCET(correct) {
    if (correct) this.value = Math.max(0, this.value - 10);
    else {
      this.failCount++;
      const table = [10, 20, 35];
      this.value += this.failCount <= 3 ? table[this.failCount - 1] : 50;
    }
    this.value = Math.min(150, this.value);
  }

  applyFlashback(correct) {
    this.value += correct ? -20 : 10;
    this.value = Math.min(150, Math.max(0, this.value));
    // 不计入 failCount
  }

  getFlashbackStage() {
    // 按区间权重表加权随机：'kindergarten' | 'primary' | 'middle' | 'high'
  }

  isOverload() { return this.value >= 150; }
  reset() { this.value = 0; this.failCount = 0; }
}
```

**权重表**

| 羞愧 | kindergarten | primary | middle | high |
|---|---:|---:|---:|---:|
| 30–59 | 60 | 25 | 10 | 5 |
| 60–89 | 5 | 60 | 25 | 10 |
| 90–119 | 10 | 5 | 60 | 25 |
| 120–149 | 5 | 10 | 25 | 60 |

### 4.6 QuizManager

```js
export class QuizManager {
  constructor(panelEl, callbacks) {}

  // kind: 'cet' | 'flashback'；stage 仅闪回需要
  open(kind, stage)
  // 10s 倒计时（setInterval 或 rAF 时间戳），超时按答错
  submit(optionIndex)
  close()             // 回调 { correct, kind, stage }
}
```

- 面板三栏：左肖像 / 中题干+选项+倒计时 / 右肖像。
- 选项顺序随机，保留原始索引映射。
- 答题计时**不参与**节拍冻结：节拍停了，10 秒仍在走。

### 4.7 ResultManager

```js
export class ResultManager {
  constructor() { this.stats = { total:0, cetCorrect:0, cetWrong:0,
                                 fbCorrect:0, fbWrong:0, wrongList:[] }; }

  record(kind, correct, question)
  // 'exit' | 'overload'
  computeEnding(reason) {
    if (reason === 'overload') return 'detention';
    if (this.stats.total === 0) return 'rhythmMaster';
    if (this.stats.cetWrong + this.stats.fbWrong === 0) return 'englishMaster';
    const acc = (this.stats.cetCorrect + this.stats.fbCorrect) / this.stats.total;
    return acc >= 0.4 ? 'steady' : 'lucky';
  }
  reset()
}
```

### 4.8 Renderer

```js
export class Renderer {
  constructor(canvas, deps) {}

  start()  // requestAnimationFrame

  loop(ts) {
    const delta = ts - this._last;
    this._last = ts;
    try {
      if (!this.sm.isFrozen()) {
        this.beatClock.tick(delta);       // 触发 onBeat → teacherAI.tickBeat()
        const ev = this.player.tick(delta, this.beatClock.beatMs);
        if (ev) this.onPlayerActionDone(ev);
      }
      this._renderMap();
      this._renderPlayer();
      this._renderTeacher();
      this._renderHUD();
    } catch (e) {
      console.error('[loop]', e);
    } finally {
      requestAnimationFrame(this.loop);
    }
  }
}
```

> `try/catch/finally` 保循环不死：即使某帧渲染异常，`rAF` 仍在 `finally` 里续上。

---

## 5. 关键流程

### 5.1 输入 → 动作

```
keydown(WASD/方向键)
  → if (sm.isFrozen()) return
  → if (player.isBusy()) return               // 动作锁，不排队
  → 目标格 = 当前坐标 + 方向
  → if (!map.isInBounds) return
  → if (map.getCell(tx,ty).type === 'seatClosed') player.startPull(tx,ty)
  → else if (map.isPassable(tx,ty))              player.startMove(tx,ty)
  → else 触发"书本挡住这条路"提示
```

### 5.2 动作落地

```
player.tick 返回 moveDone(cellType)
  → EXIT      → sm.transition(RESULT, { ending: result.computeEnding('exit') })
  → SEAT_BROKEN →
        if (teacherAI.phase === 'board' && Math.random() < 0.5) → 异响：teacherAI.forcePace()
  → 其他      → 无事
```

### 5.3 回头窗口

```
beatClock.onBeat → teacherAI.tickBeat()
  → pace 拍数耗尽 → phase='turn'（持续 2–3 拍）→ onTurn()

onTurn()（回头开始瞬间清算）:
  1. if (到出口) → RESULT(exit)                       // 到门优先
  2. if (shame.isOverload()) → RESULT(overload)
  3. if (player.isMidAction()) → QuizManager.open('cet')
  4. else if (静止站在 SEAT_BROKEN):
       shame >= 30 ? open('flashback', stage) : open('cet')
  5. 否则什么都不做，回头窗口继续

回头窗口内（phase==='turn'）:
  键盘按下且目标格可通行 / 可拉椅 → 立即 open('cet')
  保持不动 → 安全；拍数耗尽 → phase='board'，不追加判定
```

### 5.4 答题结束

```
QuizManager.close() → callback({ correct, kind, stage })
  → shame.applyCET/applyFlashback(correct)
  → result.record(kind, correct, question)
  → sm.transition(PLAYING)
  → if (shame.isOverload()) → RESULT(overload)
  → else teacherAI 进 pace 并重掷 2/3 拍
```

### 5.5 冻结

唯一冻结点在 `Renderer.loop` 的 `if (!sm.isFrozen())`：不调 `beatClock.tick()`、不调 `player.tick()`。因此板书/踱步拍数、玩家动作进度全部停在原值，解冻后从原值继续。

答题面板自带的 10 秒倒计时**不受该冻结影响**（它属于答题面板自身生命周期）。

---

## 6. 地图生成

**尺寸**：16 列 × 12 行，每格 50px → 800 × 600。起点固定左下区域，后门出口固定右上区域。

### 6.1 生成流程

```
1. 全图填墙，四边保留 1 格边界墙
2. 铺设骨架过道：外圈环形 + 中部纵向/横向主通道（永远连通）
3. 过道之外的区块成排放置座位区，按权重生成：
     空座椅·拉开 35% / 空座椅·收起 30% / 破损座椅 15% / 有人落座 20%
4. 座位区内随机点 10% 课桌本体（不可通行）
5. 过道上随机撒 8% 书本/书包，避开过道交叉口
6. 起点与出口各 3 格范围内强制为过道
7. 校验 → 不通过则整图重生成，最多 50 次 → 仍失败则兜底打通
```

### 6.2 校验与兜底

| 步骤 | 内容 |
|---|---|
| 免费通行校验 | BFS 仅走 `aisle / seatOpen / seatBroken / exit / start`，起点必须可达出口 |
| 双路线校验 | 将首次最短路径的中间格临时置为不可通行，再做一次 BFS，仍可达出口 |
| 兜底 | 50 次全失败时，沿起点→出口的曼哈顿走廊强行打通，沿途障碍改为 `aisle` |

### 6.3 运行时结构

每格为 `{ x, y, type }`。`pullSeat` 直接改 `type`（`seatClosed → seatOpen`）；`reset()` 重新生成整张图，座椅状态随新图重排。

### 6.4 占位视觉

| 类型 | 底色 | emoji |
|---|---|---|
| 过道 | 深灰蓝 | — |
| 书本/书包 | 棕 | 📚 |
| 课桌本体 | 深棕 | 🪑 |
| 空座椅·收起 | 暗蓝（虚线边框） | 💺 |
| 空座椅·拉开 | 蓝 | 💺 |
| 破损座椅 | 暗红 | 💺 + ❗ |
| 有人落座 | 灰 | 👤 |
| 墙体 | 黑 | — |
| 后门出口 | 绿 | 🚪 |
| 起点 | 蓝 | 🧑‍🎓 |
| 玩家 | — | 🧑‍🎓 |
| 老师 | — | 板书 🧑‍🏫 / 踱步 🚶 / 回头 👀 |

本轮不接入正式美术资源，全部以此占位；渲染层只依赖 `type` 与坐标，后续替换贴图不影响逻辑。

---

## 7. 答题面板

```html
<div id="quizModal" class="quiz-backdrop hidden">
  <div class="quiz-box">
    <div class="quiz-portrait left">  <!-- 老师：四六级严厉 / 闪回童年 -->
    <div class="quiz-main">
      <div class="quiz-stage-tag">四六级 / 幼儿园…</div>
      <div class="quiz-question"></div>
      <ul class="quiz-options"></ul>
      <div class="quiz-timer"><div class="quiz-timer-fill"></div></div>
    </div>
    <div class="quiz-portrait right"> <!-- 玩家：现在 / 童年 -->
  </div>
  <div class="quiz-footer"><button id="quizNextBtn">继续</button></div>
</div>
```

闪回态给 `#quizModal` 加 `.flashback` 类：`filter: saturate(0.35)` + 轻微噪点 + 抖动动画，与四六级的正常配色区分。

---

## 8. 关键技术决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 时间基准 | 单一 `BeatClock`（400ms/拍） | 支撑节拍博弈式玩法；调手感只改一个常量 |
| 老师阶段归属 | `TeacherAI.phase` 而非全局状态 | 阶段每 2–6 拍切换，放全局状态机会污染状态机 |
| 被抓判定 | 只抓"动作未落地"或"破损座椅静止" | 保证 0 答题通关可达 |
| 答错惩罚 | 取消回退，仅羞愧值 | 新流程答题由回头触发，回退无空间语义 |
| 闪回形态 | 独立答题面板 | 四阶段题库 + 10s 限时答题 |
| 地图 | 结构化随机生成 + BFS 校验 | 每局重排保证耐玩；校验 + 兜底保证必定可通关 |
| 循环容错 | `try/catch/finally` 保 rAF | 避免单帧渲染异常导致整个循环停死 |
| 文件形态 | ES Module + 静态 server | 已拆分完成；静态 server 不违反"无后端" |

---

## 9. 已知风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 拍事件在多拍跨越时丢失 | 老师少走一拍、判定错位 | `while` 循环补齐每一拍 |
| 动作进度与拍时钟不同步 | 落地时刻与回头判定时刻错位 | 两者都用同一 `deltaMs` 累加，同一帧内先推进拍再推进动作 |
| 节拍 400ms 手感不合适 | 操作挫败 | 集中常量，Phase 8 调参 |
| 闪回条件过窄 | 叙事体验弱 | 先跑基线，再决定是否放宽阈值 |
| 随机地图偶发无解或路线单一 | 玩家无法通关 | BFS 双重校验 + 最多 50 次重生成 + 兜底打通走廊 |
| ES Module 需 HTTP server | 直接双击打不开 | `start.cmd` + `server.cjs` 已具备；开始页标注启动方式 |
