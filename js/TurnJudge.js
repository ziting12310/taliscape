/* TurnJudge —— 回头窗口的纯规则判定（与渲染/DOM 无关，可单测）
 * 口径见 .trae/documents/plan.md 2.4：
 *   ① 已在出口 → 通关
 *   ② 羞愧 ≥150 → 留堂失败
 *   ③ 动作未落地 → 四六级
 *   ④ 静止站在破损座椅 → 羞愧≥30 闪回，否则四六级
 *   其余 → 保持窗口
 */

export const TURN_OUTCOME = {
  EXIT: 'exit',
  OVERLOAD: 'overload',
  CET: 'cet',
  FLASHBACK: 'flashback',
  WINDOW: 'window'
};

export function decideTurnEntry({
  atExit = false,
  overload = false,
  midAction = false,
  onBrokenSeat = false,
  shame = 0,
  flashbackMinShame = 30
} = {}) {
  if (atExit) return TURN_OUTCOME.EXIT;
  if (overload) return TURN_OUTCOME.OVERLOAD;
  if (midAction) return TURN_OUTCOME.CET;
  if (onBrokenSeat) {
    return shame >= flashbackMinShame ? TURN_OUTCOME.FLASHBACK : TURN_OUTCOME.CET;
  }
  return TURN_OUTCOME.WINDOW;
}

/* 窗口内玩家试图行动时的判定：真正会产生动作 → 被抓 */
export function decideTurnMove({ passable = false, pullable = false } = {}) {
  return passable || pullable ? TURN_OUTCOME.CET : TURN_OUTCOME.WINDOW;
}
