/* 7. QuizManager —— 拆分自原单文件，业务代码不变 */
import { GameState } from './GameState.js';
import { pickQuiz } from './QuizBank.js';

export class QuizManager {
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
