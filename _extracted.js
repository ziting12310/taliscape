'use strict';

/* ================================================================
 *  1. StateMachine —— 唯一状态源
 * ================================================================ */
const GameState = {
  IDLE:         'idle',
  PLAYING:      'playing',
  TEACHER_WARN: 'warn',
  TEACHER_CHECK:'check',
  QUIZ_OPEN:    'quiz',
  FLASHBACK:    'flashback',
  WIN:          'win',
  LOSE:         'lose'
};

class StateMachine {
  constructor() {
    this.state = GameState.IDLE;
    this.listeners = [];
    // 白名单状态转换表
    this._transitions = {
      [GameState.IDLE]:          [GameState.PLAYING],
      [GameState.PLAYING]:       [GameState.TEACHER_WARN, GameState.QUIZ_OPEN, GameState.FLASHBACK, GameState.WIN, GameState.LOSE],
      // FIX-1: 补上 warn → check 的合法跳转（TeacherTimer 在 tick 内触发 onCheckEnter 时需要）
      [GameState.TEACHER_WARN]:  [GameState.PLAYING, GameState.QUIZ_OPEN, GameState.TEACHER_CHECK],
      [GameState.TEACHER_CHECK]: [GameState.PLAYING, GameState.QUIZ_OPEN],
      [GameState.QUIZ_OPEN]:     [GameState.PLAYING],
      [GameState.FLASHBACK]:     [GameState.PLAYING],
      [GameState.WIN]:           [GameState.IDLE],
      [GameState.LOSE]:          [GameState.IDLE]
    };
  }
  canTransition(next) {
    const allowed = this._transitions[this.state] || [];
    return allowed.includes(next);
  }
  transition(next, payload = {}) {
    if (!this.canTransition(next)) {
      console.warn(`[StateMachine] 非法跳转: ${this.state} → ${next}`);
      return false;
    }
    const prev = this.state;
    this.state = next;
    for (const cb of this.listeners) cb(prev, next, payload);
    return true;
  }
  isFrozen() {
    return this.state === GameState.QUIZ_OPEN || this.state === GameState.FLASHBACK;
  }
  isTeacherDanger() {
    return this.state === GameState.TEACHER_WARN || this.state === GameState.TEACHER_CHECK;
  }
  onChange(cb) { this.listeners.push(cb); }
}

/* ================================================================
 *  2. 题库 —— 四六级难度英语选择题（词汇 + 语法）
 * ================================================================ */
const QUIZ_BANK = [
  { q: "The word 'ubiquitous' most nearly means:", o: ["rare", "present everywhere", "hidden", "ancient"], c: 1, e: "Ubiquitous = present or found everywhere." },
  { q: "Choose the correct form: 'If I ___ you, I would study harder.'", o: ["am", "was", "were", "be"], c: 2, e: "Subjunctive mood uses 'were' for all persons in second conditional." },
  { q: "Which is closest in meaning to 'diligent'?", o: ["lazy", "careful", "hard-working", "confident"], c: 2, e: "Diligent = having or showing care in one's work; hard-working." },
  { q: "'The report was ___.' Choose the correct adjective:", o: ["interesting", "interested", "interest", "interestingly"], c: 0, e: "-ing adjectives describe things that cause a feeling." },
  { q: "What does 'ephemeral' mean?", o: ["eternal", "fleeting", "solid", "secret"], c: 1, e: "Ephemeral = lasting for a very short time." },
  { q: "Choose the correct preposition: 'She is afraid ___ dogs.'", o: ["with", "of", "to", "from"], c: 1, e: "afraid of is the correct collocation." },
  { q: "'Resilient' means:", o: ["weak", "able to recover quickly", "stubborn", "dangerous"], c: 1, e: "Resilient = able to recover quickly from difficulties." },
  { q: "Which sentence is grammatically correct?", o: ["He don't like it.", "He doesn't likes it.", "He doesn't like it.", "He not like it."], c: 2, e: "Third person singular uses 'doesn't' + bare infinitive." },
  { q: "'Candid' means:", o: ["silent", "honest and straightforward", "deceptive", "eager"], c: 1, e: "Candid = truthful and straightforward; frank." },
  { q: "Choose the correct verb tense: 'By the time we arrived, they ___.'", o: ["leave", "left", "have left", "had left"], c: 3, e: "Past perfect describes an action before another past action." },
  { q: "'Inevitable' is closest in meaning to:", o: ["uncertain", "avoidable", "certain to happen", "surprising"], c: 2, e: "Inevitable = certain to happen; unavoidable." },
  { q: "Which word means 'to make something clear'?", o: ["obscure", "clarify", "complicate", "summarize"], c: 1, e: "Clarify = make (something) clear and easier to understand." },
  { q: "'Aesthetic' relates to:", o: ["economics", "beauty and art", "science", "politics"], c: 1, e: "Aesthetic = concerned with beauty or the appreciation of beauty." },
  { q: "Choose the correct article: 'I saw ___ elephant at the zoo.'", o: ["a", "an", "the", "—"], c: 1, e: "Use 'an' before words beginning with a vowel sound." },
  { q: "'Ambiguous' means:", o: ["clear", "having more than one meaning", "simple", "generous"], c: 1, e: "Ambiguous = open to more than one interpretation." },
  { q: "Which is a synonym of 'abundant'?", o: ["scarce", "plentiful", "expensive", "hidden"], c: 1, e: "Abundant = existing in large quantities; plentiful." },
  { q: "'If she ___ studied, she would have passed.' Choose the correct form:", o: ["has", "have", "had", "would"], c: 2, e: "Third conditional: if + past perfect → would have + past participle." },
  { q: "'Benevolent' means:", o: ["cruel", "charitable and kind", "selfish", "brave"], c: 1, e: "Benevolent = well-meaning and kindly." },
  { q: "Which word means 'to become smaller or less'?", o: ["expand", "diminish", "maintain", "increase"], c: 1, e: "Diminish = make or become smaller or less." },
  { q: "'Pragmatic' means:", o: ["idealistic", "dealing with things sensibly and realistically", "lazy", "impossible"], c: 1, e: "Pragmatic = dealing with things sensibly and realistically." },
  { q: "Choose the correct conjunction: 'It was raining, ___ we stayed home.'", o: ["but", "so", "although", "because"], c: 1, e: "'So' indicates result or consequence." },
  { q: "'Eloquent' describes someone who is:", o: ["quiet", "fluent or persuasive in speaking", "angry", "young"], c: 1, e: "Eloquent = fluent or persuasive in speaking or writing." },
  { q: "Which word is an antonym of 'pristine'?", o: ["dirty", "clean", "pure", "fresh"], c: 0, e: "Pristine = in its original condition; unspoiled. Antonym = dirty." },
  { q: "'She suggested ___ to the park.' Choose the correct form:", o: ["to go", "going", "go", "went"], c: 1, e: "After 'suggest', use the gerund (-ing form), not the infinitive." },
  { q: "'Tenacious' means:", o: ["weak", "holding firmly; persistent", "slow", "quiet"], c: 1, e: "Tenacious = holding firmly; not easily giving up." }
];
function pickQuiz() { return QUIZ_BANK[Math.floor(Math.random() * QUIZ_BANK.length)]; }

/* ================================================================
 *  3. GridManager —— 10×8 网格生成 + 查询
 * ================================================================ */
const COLS = 10, ROWS = 8;
const CELL_W = 80, CELL_H = 75;   // 10*80=800, 8*75=600

class GridManager {
  constructor() {
    this.cols = COLS;
    this.rows = ROWS;
    this.grid = [];
    this._generate();
  }
  _generate() {
    // 循环直到存在 safe 路径
    let attempts = 0;
    do {
      this.grid = [];
      for (let y = 0; y < ROWS; y++) {
        const row = [];
        for (let x = 0; x < COLS; x++) {
          let type = 'safe';
          if (x === 0 && y === ROWS - 1) type = 'start';
          else if (x === COLS - 1 && y === 0) type = 'goal';
          else type = Math.random() < 0.28 ? 'exposed' : 'safe';
          row.push({ x, y, type });
        }
        this.grid.push(row);
      }
      // 固定起点终点为 safe
      this.grid[ROWS - 1][0].type = 'start';
      this.grid[0][COLS - 1].type = 'goal';
      // 生成挪椅子格子（5 个，safe 类型但有概率答题）
      let chairsPlaced = 0, chairAttempts = 0;
      while (chairsPlaced < 5 && chairAttempts < 100) {
        const cx = 1 + Math.floor(Math.random() * (COLS - 2));
        const cy = 1 + Math.floor(Math.random() * (ROWS - 2));
        if (this.grid[cy][cx].type === 'safe') {
          this.grid[cy][cx].type = 'chair';
          chairsPlaced++;
        }
        chairAttempts++;
      }
      // 生成 desk 同桌障碍格（3-5 个，不可通行），避开起点终点及它们的相邻格
      const isDeskForbidden = (x, y) => {
        // 起点 (0, ROWS-1)、终点 (COLS-1, 0)
        const forbidden = [[0, ROWS-1], [COLS-1, 0]];
        for (const [fx, fy] of forbidden) {
          if (x === fx && y === fy) return true;
          if (Math.abs(x - fx) + Math.abs(y - fy) === 1) return true; // 相邻格
        }
        return false;
      };
      const deskCount = 3 + Math.floor(Math.random() * 3); // 3-5 个
      let desksPlaced = 0, deskAttempts = 0;
      while (desksPlaced < deskCount && deskAttempts < 200) {
        const dx = 1 + Math.floor(Math.random() * (COLS - 2));
        const dy = 1 + Math.floor(Math.random() * (ROWS - 2));
        if (this.grid[dy][dx].type === 'safe' && !isDeskForbidden(dx, dy)) {
          this.grid[dy][dx].type = 'desk';
          desksPlaced++;
        }
        deskAttempts++;
      }
      attempts++;
    } while (!this._hasSafePath() && attempts < 50);
    // D1 兜底：若仍无 safe 路径，将 exposed 和 desk 全部改为 safe，杜绝完全无解地图
    if (!this._hasSafePath()) {
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) {
          const t = this.grid[y][x].type;
          if (t === 'exposed' || t === 'desk') this.grid[y][x].type = 'safe';
        }
    }
  }
  // BFS 验证从起点到终点存在非 exposed 路径
  _hasSafePath() {
    const sx = 0, sy = ROWS - 1;
    const gx = COLS - 1, gy = 0;
    const visited = new Set([`${sx},${sy}`]);
    const queue = [[sx, sy]];
    while (queue.length) {
      const [x, y] = queue.shift();
      if (x === gx && y === gy) return true;
      for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nx = x + dx, ny = y + dy;
        const key = `${nx},${ny}`;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        if (visited.has(key)) continue;
        if (this.grid[ny][nx].type === 'exposed' || this.grid[ny][nx].type === 'desk') continue;
        visited.add(key);
        queue.push([nx, ny]);
      }
    }
    return false;
  }
  getCell(x, y) { return this.grid[y][x]; }
  isInBounds(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }
  // BFS 搜索最近非 exposed 格
  findNearestSafe(x, y) {
    const queue = [{ x, y, steps: 0 }];
    const visited = new Set([`${x},${y}`]);
    while (queue.length) {
      const cur = queue.shift();
      const cell = this.grid[cur.y][cur.x];
      if (cur.steps > 0 && cell.type !== 'exposed' && cell.type !== 'desk') return { x: cur.x, y: cur.y };
      for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const key = `${nx},${ny}`;
        if (!this.isInBounds(nx, ny) || visited.has(key)) continue;
        visited.add(key);
        queue.push({ x: nx, y: ny, steps: cur.steps + 1 });
      }
    }
    return { x: 0, y: ROWS - 1 }; // 兜底回起点
  }
}

/* ================================================================
 *  4. Player
 * ================================================================ */
class Player {
  constructor(grid) {
    this.grid = grid;
    this.reset();
  }
  reset() { this.x = 0; this.y = ROWS - 1; }
  // 四方向相邻校验
  isAdjacent(tx, ty) {
    const dx = Math.abs(tx - this.x), dy = Math.abs(ty - this.y);
    return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
  }
  // 尝试移动，返回 { moved, cellType, reason }
  tryMove(tx, ty, stateMachine) {
    if (!this.grid.isInBounds(tx, ty)) return { moved: false, reason: 'out_of_bounds' };
    if (!this.isAdjacent(tx, ty)) return { moved: false, reason: 'not_adjacent' };
    if (stateMachine.isFrozen()) return { moved: false, reason: 'frozen' };
    // desk（同桌）不可通行
    const cell = this.grid.getCell(tx, ty);
    if (cell.type === 'desk') return { moved: false, reason: 'blocked' };

    // 瞬间更新位置（动画不阻塞逻辑）
    this.x = tx;
    this.y = ty;

    return { moved: true, cellType: cell.type };
  }
  rollback() {
    const safe = this.grid.findNearestSafe(this.x, this.y);
    this.x = safe.x;
    this.y = safe.y;
  }
}

/* ================================================================
 *  5. TeacherTimer —— 三阶段 + 冻结
 * ================================================================ */
class TeacherTimer {
  constructor(stateMachine) {
    this.sm = stateMachine;
    this.phase = 'idle';        // idle | countdown | warn | check
    this.remaining = 0;         // 毫秒
    this.duration = 0;          // 当前阶段总时长
    this._lastTickTime = 0;
    this.onWarnEnter = null;
    this.onCheckEnter = null;
    this.onPhaseEnd = null;     // 正常完成整个周期（回到下一轮 countdown）
    this.onPlayerMovedInDanger = null; // 外部在移动时通知
  }
  start() {
    this.phase = 'countdown';
    this._setCountdown();
  }
  resetToIdle() {
    this.phase = 'idle';
    this.remaining = 0;
    this.duration = 0;
  }
  _setCountdown() {
    // 3-5 秒随机
    this.duration = 3000 + Math.random() * 2000;
    this.remaining = this.duration;
    this.phase = 'countdown';
  }
  _enterWarn() {
    this.phase = 'warn';
    this.duration = 300;  // warn 预警窗口从 600ms 缩短到 300ms
    this.remaining = this.duration;
    this.onWarnEnter?.();
  }
  _enterCheck() {
    this.phase = 'check';
    this.duration = 1500 + Math.random() * 1000;
    this.remaining = this.duration;
    this.onCheckEnter?.();
  }
  tick(deltaMs) {
    // 唯一冻结检查点
    if (this.sm.isFrozen()) return;

    if (this.phase === 'idle') return;

    this.remaining -= deltaMs;
    if (this.remaining > 0) return;

    // 阶段切换
    if (this.phase === 'countdown') {
      this._enterWarn();
    } else if (this.phase === 'warn') {
      this._enterCheck();
    } else if (this.phase === 'check') {
      // 完整一轮结束 → 回到下一轮 countdown
      this.onPhaseEnd?.();
      this._setCountdown();
    }
  }
  // 返回当前进度 0~1，用于 HUD 渲染
  progress() {
    if (this.duration <= 0) return 1;
    return Math.max(0, Math.min(1, this.remaining / this.duration));
  }
}

/* ================================================================
 *  6. ShameTracker
 * ================================================================ */
const SHAME_THRESHOLD = 75;

class ShameTracker {
  constructor() {
    this.value = 0;
    this.onThreshold = null;     // 触发闪回回调
    this._flashbackArmed = false; // 是否已经"填过一次阈值"，等待消费
  }
  reset() {
    this.value = 0;
    this._flashbackArmed = false;
  }
  applyQuizResult(correct) {
    if (correct) {
      this.value = Math.max(0, this.value - 10);
    } else {
      this.value += 25;
    }
    if (this.value >= SHAME_THRESHOLD && !this._flashbackArmed) {
      this._flashbackArmed = true;
      this.onThreshold?.();
    }
  }
  consumeFlashback() {
    this.value = Math.max(0, this.value - SHAME_THRESHOLD);
    this._flashbackArmed = false;
  }
}

/* ================================================================
 *  7. QuizManager —— 统一答题入口
 * ================================================================ */
class QuizManager {
  constructor(stateMachine, quizModalEl, explainEl, optionsEl, closeBtn, sourceTagEl, questionEl) {
    this.sm = stateMachine;
    this.el = quizModalEl;
    this.explainEl = explainEl;
    this.optionsEl = optionsEl;
    this.closeBtn = closeBtn;
    this.sourceTagEl = sourceTagEl;
    this.questionEl = questionEl;
    this.pendingSource = null;
    this._answered = false;

    this.closeBtn.addEventListener('click', () => this._close());
  }
  // source: 'exposed' | 'chair' | 'teacher_caught'
  trigger(source) {
    if (this.sm.state === GameState.FLASHBACK) {
      // 排队等待
      this.pendingSource = source;
      return;
    }
    if (this.sm.state === GameState.QUIZ_OPEN) return; // 已打开，忽略

    this.sm.transition(GameState.QUIZ_OPEN, { source });
    this._answered = false;

    const sourceMap = {
      exposed:         { title: "⚠️ 踩暴露格了！", desc: "老师注意到你了，快答！" },
      chair:           { title: "⚠️ 挪椅子被发现！", desc: "椅子吱呀响了一声..." },
      teacher_caught:  { title: "👩‍🏫 被老师抓现行！", desc: "老师回头看到你了，答题！" }
    };
    const src = sourceMap[source] || { title: "⚠️ 答题！", desc: "答对就没事..." };
    this.sourceTagEl.textContent = src.title;

    const quiz = pickQuiz();
    this._current = quiz;
    this.questionEl.textContent = quiz.q;
    this.explainEl.classList.remove('show');
    this.explainEl.textContent = '';
    this.closeBtn.style.display = 'none';

    this.optionsEl.innerHTML = '';
    // 随机选项顺序（保留正确答案的映射）
    const indices = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    this._shuffledCorrectIdx = indices.indexOf(quiz.c);
    indices.forEach((origIdx, displayIdx) => {
      const li = document.createElement('li');
      li.textContent = String.fromCharCode(65 + displayIdx) + '. ' + quiz.o[origIdx];
      li.dataset.origIdx = origIdx;
      li.addEventListener('click', () => this._select(origIdx, displayIdx));
      this.optionsEl.appendChild(li);
    });

    this.el.classList.remove('hidden');
  }
  _select(origIdx, displayIdx) {
    if (this._answered) return;
    this._answered = true;
    const correct = origIdx === this._current.c;

    // 高亮正确/错误选项
    const lis = this.optionsEl.querySelectorAll('li');
    lis.forEach((li, i) => {
      if (i === displayIdx && correct) li.classList.add('correct');
      else if (i === displayIdx && !correct) li.classList.add('wrong');
      else if (parseInt(li.dataset.origIdx) === this._current.c) li.classList.add('correct');
      li.style.pointerEvents = 'none';
    });

    this.explainEl.textContent = (correct ? '✅ 答对了！' : '❌ 答错了！') + ' ' + this._current.e;
    this.explainEl.classList.add('show');
    this.closeBtn.style.display = 'inline-block';

    // 延迟一帧后让外部处理对错
    this._lastCorrect = correct;
  }
  _close() {
    const correct = this._answered ? this._lastCorrect : false;
    // 通过外部钩子（Main 层注册）处理羞愧值、回退
    this.onSubmit?.(correct);
    this.el.classList.add('hidden');
    this.sm.transition(GameState.PLAYING);
  }
  finishFlashbackAndTrigger() {
    if (this.pendingSource) {
      const s = this.pendingSource;
      this.pendingSource = null;
      setTimeout(() => this.trigger(s), 50);
    }
  }
}

/* ================================================================
 *  8. FlashbackManager
 * ================================================================ */
const FLASHBACK_TYPES = {
  kindergarten: {
    icon: "🧸",
    title: "🏫 幼儿园闪回",
    desc: "记得你当年因为怕老师罚站，躲在小床底下，结果被生活阿姨从被子里拽出来的场景吗？\n\n羞愧 +25 还在...继续加油！",
    color: "linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)"
  },
  highschool: {
    icon: "📚",
    title: "📚 高中闪回",
    desc: "那次月考你偷看同桌答案，结果被监考老师用扩音喇叭当众点名，全班同学齐刷刷转头看你的画面...\n\n羞愧 +25 还在...振作！",
    color: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
  }
};

class FlashbackManager {
  constructor(stateMachine, overlayEl, iconEl, titleEl, descEl, skipBtn) {
    this.sm = stateMachine;
    this.overlayEl = overlayEl;
    this.iconEl = iconEl;        // 闪回大 emoji 图标
    this.titleEl = titleEl;
    this.descEl = descEl;
    this.skipBtn = skipBtn;
    this._autoTimer = null;
    this.skipBtn.addEventListener('click', () => this.finish());
  }
  trigger() {
    if (this.sm.state === GameState.QUIZ_OPEN) {
      // 答题中排队（答题关闭后 Main 会再触发闪回）
      this._pendingFlashback = true;
      return;
    }
    const type = Math.random() < 0.5 ? 'kindergarten' : 'highschool';
    const fb = FLASHBACK_TYPES[type];
    this.sm.transition(GameState.FLASHBACK, { type });

    // 设置 icon + 标题 + 描述 + 背景色
    this.iconEl.textContent = fb.icon;

    this.titleEl.textContent = fb.title;
    this.descEl.textContent = fb.desc;
    this.descEl.style.whiteSpace = 'pre-line';
    this.overlayEl.style.background = fb.color;
    this.overlayEl.classList.add('show');

    this._autoTimer = setTimeout(() => this.finish(), 3500);
  }
  finish() {
    if (this._autoTimer) { clearTimeout(this._autoTimer); this._autoTimer = null; }
    this.overlayEl.classList.remove('show');
    this.sm.transition(GameState.PLAYING);
    // 通知外部羞愧值重置
    this.onFinish?.();
    // 检查是否有排队的答题
    this._pendingFlashback = false;
  }
  triggerIfPending() {
    if (this._pendingFlashback) {
      this._pendingFlashback = false;
      this.trigger();
    }
  }
}

/* ================================================================
 *  9. Renderer —— Canvas 主循环
 * ================================================================ */
class Renderer {
  constructor(canvas, stateMachine, grid, player, teacherTimer, shameTracker, warnEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sm = stateMachine;
    this.grid = grid;
    this.player = player;
    this.tt = teacherTimer;
    this.st = shameTracker;
    this.warnEl = warnEl;
    this._lastTime = 0;
    this._warnActive = false;
    // FIX-5: 非相邻格闪框的状态（Renderer 在 _renderGrid 末尾检查并绘制）
    this._flashCell = null;
    this._flashUntil = 0;
    // 老师移动状态（countdown 阶段左右平滑移动）
    this.teacherX = 400;
    this._teacherDir = 1;       // 1 向右，-1 向左
    this._warnBlinkOn = true;   // warn 阶段 ⚠️ 是否可见（闪烁）
    this._warnBlinkTick = 0;    // 内部累计，驱动闪烁
  }
  start() {
    requestAnimationFrame((t) => { this._lastTime = t; this.loop(t); });
  }
  loop(ts) {
    const delta = ts - this._lastTime;
    this._lastTime = ts;

    try {
      // 逻辑 tick（冻结时跳过）
      if (!this.sm.isFrozen()) {
        this.tt.tick(delta);
        // 老师左右移动：仅 countdown 阶段
        if (this.tt.phase === 'countdown') {
          this.teacherX += this._teacherDir * 0.04 * delta; // 40 px/s
          if (this.teacherX >= 550) { this.teacherX = 550; this._teacherDir = -1; }
          else if (this.teacherX <= 250) { this.teacherX = 250; this._teacherDir = 1; }
        }
        // warn 阶段内部累计驱动 ⚠️ 闪烁（4Hz）
        if (this.tt.phase === 'warn') {
          this._warnBlinkTick += delta;
          if (this._warnBlinkTick >= 125) {
            this._warnBlinkTick = 0;
            this._warnBlinkOn = !this._warnBlinkOn;
          }
        } else {
          this._warnBlinkOn = true;
        }
      }
      // 渲染层始终运行
      this._renderGrid();
      this._renderPlayer();
      this._renderTeacher();
      this._updateWarnOverlay();
      this._updateHUD();
    } catch (err) {
      console.error('[Renderer.loop] 渲染异常，已捕获:', err);
    } finally {
      // 保证即使某一帧抛错，下一帧仍然会请求，循环不会死
      requestAnimationFrame((t) => this.loop(t));
    }
  }
  _renderGrid() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 800, 600);

    // 教室地板底色
    ctx.fillStyle = '#3a3a54';
    ctx.fillRect(0, 0, 800, 600);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = this.grid.getCell(x, y);
        const px = x * CELL_W, py = y * CELL_H;

        // 格子底色
        let bg;
        switch (cell.type) {
          case 'start':   bg = '#1565c0'; break; // 蓝 - 起点/角落
          case 'goal':    bg = '#2e7d32'; break; // 绿 - 门
          case 'exposed': bg = '#616161'; break; // 灰 - 暴露
          case 'chair':   bg = '#388e3c'; break; // 绿 - 挪椅（safe）
          default:        bg = '#4caf50'; break; // 绿 - safe
        }

        ctx.fillStyle = bg;
        ctx.fillRect(px + 2, py + 2, CELL_W - 4, CELL_H - 4);

        // 边框
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 2, py + 2, CELL_W - 4, CELL_H - 4);

        // 特殊标记
        if (cell.type === 'start') {
          // 小桌子 + "我"字
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 22px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🧑‍🎓', px + CELL_W/2, py + CELL_H/2 - 8);
          ctx.font = '12px sans-serif';
          ctx.fillText('起点', px + CELL_W/2, py + CELL_H/2 + 14);
        } else if (cell.type === 'goal') {
          // 门
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 28px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🚪', px + CELL_W/2, py + CELL_H/2 - 8);
          ctx.font = '12px sans-serif';
          ctx.fillText('门口', px + CELL_W/2, py + CELL_H/2 + 18);
        } else if (cell.type === 'exposed') {
          // 暴露格：斜杠阴影 + 感叹号
          ctx.fillStyle = 'rgba(244,67,54,0.35)';
          ctx.fillRect(px + 2, py + 2, CELL_W - 4, CELL_H - 4);
          ctx.fillStyle = '#ffccbc';
          ctx.font = 'bold 20px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('!', px + CELL_W/2, py + CELL_H/2);
        } else if (cell.type === 'chair') {
          // 挪椅：黄色点缀 + 椅子 emoji
          ctx.fillStyle = '#ffc107';
          ctx.beginPath();
          ctx.arc(px + 12, py + 12, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = '20px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🪑', px + CELL_W/2, py + CELL_H/2 + 2);
        } else if (cell.type === 'desk') {
          // desk 同桌障碍格：深棕色底 + 👤，不可通行
          ctx.fillStyle = '#4e342e';
          ctx.fillRect(px + 2, py + 2, CELL_W - 4, CELL_H - 4);
          ctx.strokeStyle = '#8d6e63';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 4, py + 4, CELL_W - 8, CELL_H - 8);
          ctx.font = '26px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('👤', px + CELL_W/2, py + CELL_H/2);
          // 小红色标记角，表示"有人挡路"
          ctx.fillStyle = '#e53935';
          ctx.beginPath();
          ctx.arc(px + CELL_W - 14, py + 14, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 教室墙（顶部 + 两侧）
    ctx.fillStyle = '#1e1e2d';
    ctx.fillRect(0, 0, 800, 10);
    ctx.fillRect(0, 0, 10, 600);
    ctx.fillRect(790, 0, 10, 600);

    // FIX-5: 非相邻格点击的红色闪框反馈（Renderer 持续渲染直到 _flashUntil 到期）
    if (this._flashCell && performance.now() < this._flashUntil) {
      ctx.strokeStyle = '#f44336';
      ctx.lineWidth = 5;
      ctx.strokeRect(this._flashCell.x * CELL_W + 4, this._flashCell.y * CELL_H + 4, CELL_W - 8, CELL_H - 8);
    } else {
      this._flashCell = null;
    }
  }
  _renderPlayer() {
    const ctx = this.ctx;
    const px = this.player.x * CELL_W + CELL_W / 2;
    const py = this.player.y * CELL_H + CELL_H / 2;

    // 玩家脚下标记（圆）
    ctx.beginPath();
    ctx.arc(px, py + 15, 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fill();

    // 玩家 emoji
    ctx.font = '36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏃', px, py);
  }
  // 老师移动 / 回头 / 预警 / 判定 视线扇形（按 tt.phase 分支）
  _renderTeacher() {
    const ctx = this.ctx;
    const tx = this.teacherX;
    const ty = 55;   // 画布顶部讲台区 y≈55

    // 讲台矩形
    ctx.fillStyle = '#2c2c40';
    ctx.fillRect(0, 70, 800, 15);

    ctx.save();
    ctx.font = '32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const phase = this.tt.phase;

    if (phase === 'idle') {
      // idle：灰显不动
      ctx.globalAlpha = 0.35;
      ctx.fillText('🧑‍🏫', tx, ty);
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }

    if (phase === 'countdown') {
      // countdown：背对玩家，左右移动
      ctx.fillText('🧑‍🏫', tx, ty);
      ctx.restore();
      return;
    }

    if (phase === 'warn') {
      // warn：老师停下，身体左右抖动（Math.sin 驱动），讲台边缘闪橙光，不画视线
      const offset = Math.sin(performance.now() / 30) * 4;  // 抖动频率 ~5.3Hz，幅度 ±4px
      ctx.fillText('🧑‍🏫', tx + offset, ty);
      // 讲台边缘闪橙光
      ctx.fillStyle = 'rgba(255,152,0,0.30)';
      ctx.fillRect(0, 62, 800, 6);
      ctx.restore();
      return;
    }

    if (phase === 'check') {
      // check：转身面向玩家 👀，向下画半透明红色视线扇形覆盖上半屏
      ctx.fillText('👀', tx, ty);
      // 视线扇形：从老师位置向下 120px 半径，角度 ±30°
      ctx.save();
      ctx.fillStyle = 'rgba(244,67,54,0.25)';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.arc(tx, ty, 120, Math.PI * 0.25, Math.PI * 0.75); // 30°~150° 覆盖正下方
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // 讲台红线
      ctx.fillStyle = 'rgba(244,67,54,0.40)';
      ctx.fillRect(0, 62, 800, 6);
    }

    ctx.restore();
  }
  _updateWarnOverlay() {
    const shouldWarn = this.sm.state === GameState.TEACHER_WARN;
    if (shouldWarn !== this._warnActive) {
      this._warnActive = shouldWarn;
      this.warnEl.classList.toggle('active', shouldWarn);
    }
  }
  _updateHUD() {
    // 空值保护：任何 DOM id 缺失都跳过并 warn，不让渲染循环死掉
    const barFill = document.getElementById('teacherBarFill');
    const phaseEl = document.getElementById('teacherPhase');
    const iconEl = document.getElementById('teacherIcon');
    const shameFill = document.getElementById('shameFill');
    const shameText = document.getElementById('shameText');

    const phaseMap = {
      idle:     { icon: '⏳', txt: '等待开始' },
      countdown:{ icon: '⏳', txt: '倒计时中...' },
      warn:     { icon: '⚠️', txt: '⚠️ 老师要回头了！' },
      check:    { icon: '👀', txt: '👩‍🏫 老师回头中！动就答题！' }
    };
    const info = phaseMap[this.tt.phase] || phaseMap.idle;

    if (iconEl) iconEl.textContent = info.icon;
    else console.warn('[HUD] 缺少元素: teacherIcon');
    if (phaseEl) phaseEl.textContent = info.txt;
    else console.warn('[HUD] 缺少元素: teacherPhase');
    if (barFill) {
      barFill.style.width = (this.tt.progress() * 100) + '%';
      if (this.tt.phase === 'countdown') barFill.style.background = 'linear-gradient(90deg, #4caf50, #ffc107)';
      else if (this.tt.phase === 'warn') barFill.style.background = '#ff5722';
      else if (this.tt.phase === 'check') barFill.style.background = '#f44336';
    } else {
      console.warn('[HUD] 缺少元素: teacherBarFill');
    }

    const pct = Math.min(100, (this.st.value / SHAME_THRESHOLD) * 100);
    if (shameFill) shameFill.style.width = pct + '%';
    else console.warn('[HUD] 缺少元素: shameFill');
    if (shameText) shameText.textContent = `${this.st.value} / ${SHAME_THRESHOLD}`;
    else console.warn('[HUD] 缺少元素: shameText');
  }
}

/* ================================================================
 *  10. Main —— 初始化 + 事件绑定
 * ================================================================ */
(function main() {
  const canvas = document.getElementById('gameCanvas');
  const sm = new StateMachine();
  const grid = new GridManager();
  const player = new Player(grid);
  const tt = new TeacherTimer(sm);
  const st = new ShameTracker();

  // DOM 引用
  const quizModalEl = document.getElementById('quizModal');
  const quizExplainEl = document.getElementById('quizExplain');
  const quizOptionsEl = document.getElementById('quizOptions');
  const quizCloseBtn = document.getElementById('quizCloseBtn');
  const quizSourceTagEl = document.getElementById('quizSourceTag');
  const quizQuestionEl = document.getElementById('quizQuestion');

  const flashOverlayEl = document.getElementById('flashbackOverlay');
  const flashbackIconEl = document.getElementById('flashbackIcon');
  const flashTitleEl = document.getElementById('flashbackTitle');
  const flashDescEl = document.getElementById('flashbackDesc');
  const flashSkipBtn = document.getElementById('flashbackSkipBtn');

  const startScreen = document.getElementById('startScreen');
  const winScreen   = document.getElementById('winScreen');
  const startBtn    = document.getElementById('startBtn');
  const winAgainBtn = document.getElementById('winAgainBtn');
  const warnOverlay = document.getElementById('warnOverlay');

  // 子模块
  const quiz = new QuizManager(sm, quizModalEl, quizExplainEl, quizOptionsEl, quizCloseBtn, quizSourceTagEl, quizQuestionEl);
  const flash = new FlashbackManager(sm, flashOverlayEl, flashbackIconEl, flashTitleEl, flashDescEl, flashSkipBtn);
  const renderer = new Renderer(canvas, sm, grid, player, tt, st, warnOverlay);

  let _teacherCaughtThisMove = false;

  /* ---------- StateMachine 监听 ---------- */
  sm.onChange((prev, next, payload) => {
    // 老师阶段切换
    if (prev === GameState.PLAYING && next === GameState.TEACHER_WARN) {
      // TeacherTimer 进入 warn 由 tick 驱动 state transition
    }
    if (next === GameState.QUIZ_OPEN) {
      // QuizManager.trigger 已负责 DOM
    }
    if (next === GameState.FLASHBACK) {
      // FlashbackManager.trigger 已负责 DOM
    }
    if (prev === GameState.FLASHBACK && next === GameState.PLAYING) {
      // Flashback 结束 → 处理羞愧值 + 排队的 quiz
      st.consumeFlashback();
      quiz.finishFlashbackAndTrigger();
    }
    if (prev === GameState.QUIZ_OPEN && next === GameState.PLAYING) {
      // 答题弹窗刚关闭 → 检查排队的闪回
      flash.triggerIfPending();
    }
    if (next === GameState.WIN) {
      winScreen.classList.remove('hidden');
    }
  });

  /* ---------- TeacherTimer 回调 ---------- */
  tt.onWarnEnter = () => { sm.transition(GameState.TEACHER_WARN); };
  tt.onCheckEnter = () => {
    // 从 warn → check
    sm.transition(GameState.TEACHER_CHECK);
  };
  tt.onPhaseEnd = () => {
    // 完整一轮结束 → 回到 PLAYING（如果还在 check 状态）
    if (sm.state === GameState.TEACHER_CHECK) {
      sm.transition(GameState.PLAYING);
    }
  };

  /* ---------- ShameTracker 阈值 ---------- */
  st.onThreshold = () => flash.trigger();

  /* ---------- FlashbackManager 完成回调 ---------- */
  flash.onFinish = () => { /* consumeFlashback 在 sm.onChange 里统一处理 */ };

  /* ---------- QuizManager 提交回调 ---------- */
  quiz.onSubmit = (correct) => {
    // 1. 应用羞愧值
    st.applyQuizResult(correct);
    // 2. 答错回退
    if (!correct) player.rollback();
    // 3. 如果这个答题是在 TEACHER_WARN/CHECK 期间触发的，
    //    答题关闭后恢复到 PLAYING 状态
    //    （StateMachine 已自动从 QUIZ_OPEN → PLAYING）
    _teacherCaughtThisMove = false;
  };

  /* ---------- Canvas 点击事件 ---------- */
  canvas.addEventListener('click', (e) => {
    if (sm.isFrozen()) return;
    if (sm.state === GameState.IDLE) return;
    if (sm.state === GameState.WIN || sm.state === GameState.LOSE) return;

    const rect = canvas.getBoundingClientRect();
    // FIX-4: 扣除 canvas.clientLeft / clientTop 偏移，避免 border 导致边缘格子点击偏移
    const cx = (e.clientX - rect.left - canvas.clientLeft) * (canvas.width / canvas.clientWidth);
    const cy = (e.clientY - rect.top - canvas.clientTop) * (canvas.height / canvas.clientHeight);
    const tx = Math.floor(cx / CELL_W);
    const ty = Math.floor(cy / CELL_H);
    if (!grid.isInBounds(tx, ty)) return;

    // FIX-2: 只在老师"回头中"（CHECK 阶段）移动才被抓，WARN 只是视觉预警可以安全移动
    const wasTeacherDanger = sm.state === GameState.TEACHER_CHECK;

    const result = player.tryMove(tx, ty, sm);
      // FIX-5: 非相邻格点击给一个红色闪框，提示玩家只能点相邻格；desk 同桌也闪红
    if (!result.moved) {
      if (result.reason === 'not_adjacent' || result.reason === 'blocked') {
        renderer._flashCell = { x: tx, y: ty };
        renderer._flashUntil = performance.now() + 200;
      }
      return;
    }

    const cellType = result.cellType;

    // 先处理 123木头人被抓（优先级最高）
    if (wasTeacherDanger) {
      // 移动发生在危险阶段 → 被抓
      quiz.trigger('teacher_caught');
      return;
    }

    // 终点 → WIN
    if (cellType === 'goal') {
      sm.transition(GameState.WIN);
      return;
    }

    // 暴露格 → 触发答题
    if (cellType === 'exposed') {
      quiz.trigger('exposed');
      return;
    }

    // 挪椅 → 概率答题 30%
    if (cellType === 'chair') {
      if (Math.random() < 0.30) {
        quiz.trigger('chair');
      }
      return;
    }

    // safe / start → 什么都不做
    // 但如果当前在 TEACHER_WARN 阶段且玩家移动了（这里 wasTeacherDanger 已提前判断，所以不会到这里）
  });

  /* ---------- 开始 / 重置 ---------- */
  startBtn.addEventListener('click', () => {
    startScreen.classList.add('hidden');
    _resetAndStart();
  });
  winAgainBtn.addEventListener('click', () => {
    winScreen.classList.add('hidden');
    _resetAndStart();
  });

  function _resetAndStart() {
    // 重建 GridManager 让格子随机
    const newGrid = new GridManager();
    grid.grid = newGrid.grid;

    player.reset();
    st.reset();
    tt.resetToIdle();
    // FIX-3: WIN / LOSE 直接跳 PLAYING 不在白名单，必须先回 IDLE 再进 PLAYING
    if (sm.state !== GameState.IDLE) sm.transition(GameState.IDLE);
    sm.transition(GameState.PLAYING);
    tt.start();
  }

  // 启动渲染循环
  renderer.start();
})();
