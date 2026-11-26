/* GameState —— 全局状态与状态机（唯一状态源） */

export const GameState = {
  IDLE:          'idle',          // 开始页
  PLAYING:       'playing',       // 主流程（老师板书 / 踱步都在此状态内）
  QUIZ_OPEN:     'quiz',          // 四六级答题
  FLASHBACK_QUIZ:'flashback',     // 闪回答题
  RESULT:        'result'         // 结局结算
};

export class StateMachine {
  constructor() {
    this.state = GameState.IDLE;
    this.listeners = [];
    this._transitions = {
      [GameState.IDLE]:           [GameState.PLAYING],
      [GameState.PLAYING]:        [GameState.QUIZ_OPEN, GameState.FLASHBACK_QUIZ, GameState.RESULT],
      [GameState.QUIZ_OPEN]:      [GameState.PLAYING, GameState.RESULT],
      [GameState.FLASHBACK_QUIZ]: [GameState.PLAYING, GameState.RESULT],
      [GameState.RESULT]:         [GameState.IDLE]
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

  // 冻结条件：答题面板与结局页期间，节拍与动作全部暂停
  isFrozen() {
    return this.state === GameState.QUIZ_OPEN
        || this.state === GameState.FLASHBACK_QUIZ
        || this.state === GameState.RESULT;
  }

  onChange(cb) { this.listeners.push(cb); }
}
