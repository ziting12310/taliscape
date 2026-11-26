/* QuizManager —— 统一答题面板（四六级 / 闪回）
 * 10 秒倒计时独立于节拍冻结：节拍停了，答题计时仍在走。
 */
import { GameState } from './GameState.js';
import { pickCET } from './QuizBank.js';
import { pickFlashback } from './FlashbackBank.js';
import { STAGE_LABEL } from './ResultManager.js';

export const QUIZ_TIME_MS = 10000;

const LETTERS = ['A', 'B', 'C', 'D'];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class QuizManager {
  constructor(sm, dom, { onFinish = null } = {}) {
    this.sm = sm;
    this.dom = dom;
    this.onFinish = onFinish;

    this.state = 'closed';       // closed | asking | revealed
    this.kind = null;
    this.stage = null;
    this.current = null;
    this._order = [];
    this._timerId = 0;
    this._deadline = 0;
    this._correct = false;

    this.dom.options.addEventListener('click', (e) => this._onOptionClick(e));
    this.dom.nextBtn.addEventListener('click', () => this._onNext());
  }

  get isOpen() {
    return this.state !== 'closed';
  }

  open(kind, stage = null) {
    if (this.isOpen) return false;

    const isFlashback = kind === 'flashback';
    const question = isFlashback ? pickFlashback(stage || 'kindergarten') : pickCET();
    if (!question) return false;

    const nextState = isFlashback ? GameState.FLASHBACK_QUIZ : GameState.QUIZ_OPEN;
    if (!this.sm.transition(nextState)) return false;

    this.kind = kind;
    this.stage = isFlashback ? (stage || 'kindergarten') : null;
    this.current = { ...question, stage: this.stage };
    this._order = shuffle(question.options.map((_, i) => i));
    this._correct = false;
    this.state = 'asking';

    this._renderShell();
    this._renderOptions();
    this._startTimer();
    return true;
  }

  /* 无回调地关闭（用于重置/开局） */
  cancel() {
    this._stopTimer();
    this.state = 'closed';
    this.kind = null;
    this.stage = null;
    this.current = null;
    this.dom.modal.classList.add('hidden');
    this.dom.nextBtn.classList.add('hidden');
  }

  /* ---------- 渲染 ---------- */

  _renderShell() {
    const d = this.dom;
    const isFlashback = this.kind === 'flashback';

    d.modal.classList.toggle('flashback', isFlashback);
    d.stageTag.textContent = isFlashback
      ? `${STAGE_LABEL[this.stage] || ''} · 回忆`
      : '四六级';
    d.question.textContent = this.current.question;

    d.feedback.textContent = '';
    d.feedback.classList.add('hidden');
    d.feedback.classList.remove('correct', 'wrong');

    d.timerFill.style.width = '100%';
    d.timerFill.classList.remove('low');

    d.leftEmoji.textContent = isFlashback ? '👩‍🏫' : '🧑‍🏫';
    d.rightEmoji.textContent = isFlashback ? '🧒' : '🧑‍🎓';
    d.leftTag.textContent = isFlashback ? '记忆里的老师' : '严厉的老师';
    d.rightTag.textContent = isFlashback ? '童年的你' : '现在的你';

    d.nextBtn.classList.add('hidden');
    d.modal.classList.remove('hidden');
  }

  _renderOptions() {
    const d = this.dom;
    d.options.innerHTML = '';

    this._order.forEach((originalIndex, position) => {
      const li = document.createElement('li');
      li.className = 'quiz-option';
      li.dataset.original = String(originalIndex);
      li.textContent = `${LETTERS[position]}. ${this.current.options[originalIndex]}`;
      d.options.appendChild(li);
    });
  }

  /* ---------- 计时 ---------- */

  _startTimer() {
    this._stopTimer();
    this._deadline = performance.now() + QUIZ_TIME_MS;

    const tick = () => {
      const remaining = this._deadline - performance.now();
      const ratio = Math.max(0, remaining) / QUIZ_TIME_MS;

      this.dom.timerFill.style.width = `${(ratio * 100).toFixed(1)}%`;
      this.dom.timerFill.classList.toggle('low', remaining <= 3000);

      if (remaining <= 0) {
        this._stopTimer();
        this._reveal(-1);
      }
    };

    tick();
    this._timerId = setInterval(tick, 50);
  }

  _stopTimer() {
    if (this._timerId) {
      clearInterval(this._timerId);
      this._timerId = 0;
    }
  }

  /* ---------- 作答 ---------- */

  _onOptionClick(e) {
    if (this.state !== 'asking') return;
    const li = e.target.closest('.quiz-option');
    if (!li || !this.dom.options.contains(li)) return;

    this._reveal(Number(li.dataset.original));
  }

  _reveal(chosenIndex) {
    if (this.state !== 'asking') return;

    this._stopTimer();
    this.state = 'revealed';

    const q = this.current;
    const correctIndex = q.answer;
    const correct = chosenIndex === correctIndex;
    this._correct = correct;

    for (const li of this.dom.options.children) {
      const originalIndex = Number(li.dataset.original);
      li.classList.add('disabled');
      if (originalIndex === correctIndex) li.classList.add('correct');
      else if (originalIndex === chosenIndex) li.classList.add('wrong');
    }

    const correctLetter = LETTERS[this._order.indexOf(correctIndex)];
    const head = correct
      ? '✅ 答对了'
      : (chosenIndex < 0 ? '⏰ 超时，判为答错' : '❌ 答错了');

    this.dom.feedback.textContent =
      `${head}　正确答案：${correctLetter}. ${q.options[correctIndex]}　${q.explain}　知识点：${q.point}`;
    this.dom.feedback.classList.remove('hidden');
    this.dom.feedback.classList.toggle('correct', correct);
    this.dom.feedback.classList.toggle('wrong', !correct);

    this.dom.nextBtn.classList.remove('hidden');
  }

  _onNext() {
    if (this.state !== 'revealed') return;

    const payload = {
      kind: this.kind,
      correct: this._correct,
      stage: this.stage,
      question: this.current
    };

    this.state = 'closed';
    this.dom.modal.classList.add('hidden');
    this.dom.nextBtn.classList.add('hidden');
    this.kind = null;
    this.stage = null;
    this.current = null;

    if (this.sm.state === GameState.QUIZ_OPEN || this.sm.state === GameState.FLASHBACK_QUIZ) {
      this.sm.transition(GameState.PLAYING);
    }

    if (this.onFinish) this.onFinish(payload);
  }
}
