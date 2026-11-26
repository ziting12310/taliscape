# 《桃李？逃离！》任务清单 v2.0

> 依赖顺序自上而下；Phase 内部可并行。
> 规则口径以 `plan.md` 第二节为准。

---

## Phase 0：清理旧实现（必须最先做）

- [x] T0.1 删除 `js/GridManager.js`（随机 10×8 地图）
- [x] T0.2 删除 `js/TeacherTimer.js`（毫秒倒计时 / 预警 / 判定）
- [x] T0.3 删除 `js/FlashbackManager.js` 与 `js/FlashbackData.js`（覆盖层闪回）
- [x] T0.4 移除 `Player.rollback()` 与「答错回退最近安全格」全部调用（新流程无回退）
- [x] T0.5 移除鼠标点击移动路径（`canvas.addEventListener('click')` 整段）；键盘输入于 Phase 2 接入
- [x] T0.6 清理 `main.js` 中对旧模块的 import 与实例化，保证项目可启动且无红错

## Phase 1：骨架与时间基准

- [x] T1.1 `GameState.js`：定义 `IDLE / PLAYING / QUIZ_OPEN / FLASHBACK_QUIZ / RESULT`，白名单转换表，`isFrozen() = QUIZ_OPEN | FLASHBACK_QUIZ | RESULT`
- [x] T1.2 `BeatClock.js`：`beatMs=400`、`tick(deltaMs)` 累计、`onBeat` 回调、`reset()`、`beatProgress`
- [x] T1.3 `index.html` 重写：canvas、HUD（阶段提示 / 节拍指示 / 羞愧条）、答题面板三栏骨架、开始页、结局页
- [x] T1.4 `css/main.css` 重写：布局、三栏答题面板、结局页、压力视觉变量

## Phase 2：地图与玩家动作

- [x] T2.1 `MapData.js`：地图尺寸、各格子类型生成权重、起点/出口坐标与禁区半径、格子类型常量
- [x] T2.2 `MapManager.generate()`：墙体边界 → 环形与主通道过道 → 座位区按权重铺设 → 课桌本体 → 过道撒书本（避开交叉口）→ 起点/出口 3 格强制过道
- [x] T2.3 连通性校验：免费通行 BFS 起点可达出口；屏蔽最短路径后再 BFS 仍可达（双路线）；失败重生成，最多 50 次
- [x] T2.4 兜底：50 次失败时打通曼哈顿走廊并把沿途障碍改为 `aisle`
- [x] T2.5 `MapManager` 查询接口：`getCell` / `isPassable` / `isAdjacent` / `isExit` / `reset`
- [x] T2.6 `MapManager.pullSeat(x,y)`：仅相邻 + `seatClosed` + 无人 → `seatOpen`（相邻性由 Player.startPull 校验）
- [x] T2.7 `Player.js`：`startMove(tx,ty)` 1.5 拍、`startPull(tx,ty)` 1 拍、`action` 状态、`isMidAction()`
- [x] T2.8 `Player.tickAction(deltaMs, beatMs)`：按 deltaMs 累加推进，动作完成时才更新位置并回调落地结果
- [x] T2.9 `main.js` 键盘输入：方向键 / WASD → 计算目标格 → 分发移动或拉椅；动作期间忽略输入
- [x] T2.10 落地判定：出口 → 通关；`seatBroken` → 交给异响模块；其余仅更新位置
- [x] T2.11 每局重置时重新生成地图（座椅状态随地图一起重排）

## Phase 3：老师 AI 与回头判定

- [ ] T3.1 `TeacherAI.js`：`board`（4–6 拍随机）/ `pace`（2 或 3 拍随机）/ `turn`（瞬时）
- [ ] T3.2 `TeacherAI.tickBeat()`：每拍推进，拍数耗尽切换阶段并回调
- [ ] T3.3 `TeacherAI.forcePace()`：异响时强制切踱步并重掷拍数
- [ ] T3.4 破损座椅异响：仅 `board` 阶段、移动落地到 `seatBroken`、50% 概率触发；不打断玩家动作
- [ ] T3.5 回头判定实现，严格按顺序：① 已在出口 → 通关；② 羞愧 ≥150 → 失败；③ 抓捕成立？动作未落地 / 静止站破损座椅
- [ ] T3.6 抓捕分流：动作未落地 → 四六级；静止在破损座椅 → 羞愧≥30 闪回 / 否则四六级
- [ ] T3.7 未成立抓捕 → 回 `board`；答题结束 → 回 `pace` 并重掷拍数

## Phase 4：羞愧值与统计

- [ ] T4.1 `ShameTracker.js`：`value` 0–150 钳制、`failCount`、四六级递增曲线（+10/+20/+35/+50）、答对 −10
- [ ] T4.2 `ShameTracker.applyFlashback(correct)`：答对 −20、答错/超时 +10，不计入 `failCount`
- [ ] T4.3 `ShameTracker.getFlashbackStage()`：按羞愧区间加权随机返回 幼儿园/小学/初中/高中
- [ ] T4.4 `ShameTracker.isOverload()`
- [ ] T4.5 `ResultManager.js` 统计：总答题、四六级对/错、闪回对/错、错题集合（单词/短语/语法点）

## Phase 5：题库与答题面板

- [ ] T5.1 `QuizBank.js`：四六级题库，每题含题干、四选项、正确项、解析、知识点标签
- [ ] T5.2 `FlashbackBank.js`：四阶段题库（幼儿园识图/简单词、小学短句配对、初中单选、高中语法填空）
- [ ] T5.3 `QuizManager.open('cet' | 'flashback', stage?)`：三栏面板渲染、选项随机顺序
- [ ] T5.4 10s 倒计时：超时判错；倒计时使用独立计时，不受节拍冻结影响
- [ ] T5.5 提交与反馈：高亮正确/错误、显示解析、关闭后回调 `{ correct, kind, stage }`
- [ ] T5.6 两套视觉区分：四六级（当前教室 / 严厉老师 / 现在的自己）与闪回（低饱和 / 童年老师 / 童年的自己）
- [ ] T5.7 答题期间锁定键盘输入、节拍时钟冻结

## Phase 6：结局与流程闭环

- [ ] T6.1 `ResultManager.computeEnding()`：节奏大师 / 英语大师 / 稳步前行 / 侥幸脱身 / 留堂失败
- [ ] T6.2 结局页展示：结局名、描述、统计、错题知识点列表
- [ ] T6.3 开始 / 再来一次：重置羞愧、failCount、统计、错题、地图座椅状态、老师状态、节拍时钟
- [ ] T6.4 重置时清空所有残留队列与弹窗 DOM

## Phase 7：渲染与反馈

- [ ] T7.1 `Renderer` 主循环：`requestAnimationFrame` 渲染；逻辑推进（BeatClock / Player.tickAction / TeacherAI）在非冻结时执行
- [ ] T7.2 地图分层：地板 / 过道 / 课桌 / 墙体 / 出口 / 座椅三态 / 书本 / 同学
- [ ] T7.3 玩家：待机呼吸、拉椅、跨格移动（按动作进度插值）
- [ ] T7.4 老师：板书（背对+抬手）、踱步（左右重心晃动）、回头（正面注视）
- [ ] T7.5 HUD：阶段文字提示、节拍指示器、羞愧条（绿→黄→红）、压力视觉（边缘压暗 / 灰雾 / 轻微抖动）
- [ ] T7.6 状态提示文案：板书中可行动 / 老师踱步小心 / 停下老师回头了 / 拉开座椅 / 起身挪动中 / 座椅异响 / 书本挡路

## Phase 8：验证与调优

- [ ] T8.1 按 `checklist.md` 全量走查
- [ ] T8.2 调参：`beatMs`、板书/踱步拍数、异响概率、题库难度
- [ ] T8.3 观察闪回出现频率，决定是否启用「任何被抓 + 羞愧≥30 按概率转闪回」的放宽方案
