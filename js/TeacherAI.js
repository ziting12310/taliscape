/* TeacherAI —— 板书 / 踱步 / 回头 三段式，按拍推进 */

const BOARD_MIN = 4;
const BOARD_MAX = 6;
const PACE_MIN = 2;
const PACE_MAX = 3;

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export class TeacherAI {
  constructor({ onTurn = null, onPhaseChange = null } = {}) {
    this.onTurn = onTurn;
    this.onPhaseChange = onPhaseChange;
    this.phase = 'board';
    this.beatsLeft = 0;
    this.turnCount = 0;
    this._enterBoard();
  }

  reset() {
    this.turnCount = 0;
    this._enterBoard();
  }

  /* 每拍推进一次；回头判定在踱步最后一拍结束时瞬时触发 */
  tickBeat() {
    if (this.phase === 'turn') return;
    if (this.beatsLeft <= 0) return;

    this.beatsLeft--;
    if (this.beatsLeft > 0) return;

    if (this.phase === 'board') this._enterPace();
    else if (this.phase === 'pace') this._enterTurn();
  }

  /* 破损座椅异响：强制切换踱步并重掷拍数（不打断玩家动作） */
  forcePace() {
    if (this.phase === 'turn') return;
    this._enterPace();
  }

  /* 回头判定未成立 → 回板书 */
  backToBoard() {
    this._enterBoard();
  }

  /* 答题结束 → 回踱步并重掷拍数 */
  enterPaceAfterQuiz() {
    this._enterPace();
  }

  _enterBoard() {
    this.phase = 'board';
    this.beatsLeft = randInt(BOARD_MIN, BOARD_MAX);
    this._emit();
  }

  _enterPace() {
    this.phase = 'pace';
    this.beatsLeft = randInt(PACE_MIN, PACE_MAX);
    this._emit();
  }

  _enterTurn() {
    this.phase = 'turn';
    this.beatsLeft = 0;
    this.turnCount++;
    this._emit();
    if (this.onTurn) this.onTurn();
  }

  _emit() {
    if (this.onPhaseChange) this.onPhaseChange(this.phase, this.beatsLeft);
  }
}
