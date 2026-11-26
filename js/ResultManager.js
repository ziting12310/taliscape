/* ResultManager —— 答题统计与错题集合
 * 结局判定（computeEnding）在 Phase 6 接入。
 */

export const STAGE_LABEL = {
  kindergarten: '幼儿园',
  primary: '小学',
  middle: '初中',
  high: '高中'
};

export class ResultManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.total = 0;
    this.cetCorrect = 0;
    this.cetWrong = 0;
    this.fbCorrect = 0;
    this.fbWrong = 0;
    this.wrongList = [];
  }

  /* kind: 'cet' | 'flashback'
   * question: { question, options, answer, explain, point }（闪回题另带 stage）
   */
  record(kind, correct, question = null) {
    this.total++;

    if (kind === 'flashback') {
      if (correct) this.fbCorrect++;
      else this.fbWrong++;
    } else {
      if (correct) this.cetCorrect++;
      else this.cetWrong++;
    }

    if (!correct && question) {
      const answerText = Array.isArray(question.options)
        ? question.options[question.answer]
        : '';

      this.wrongList.push({
        kind,
        stage: question.stage || null,
        question: question.question || '',
        answer: answerText || '',
        point: question.point || ''
      });
    }
  }

  get correctCount() { return this.cetCorrect + this.fbCorrect; }
  get wrongCount() { return this.cetWrong + this.fbWrong; }

  accuracy() {
    return this.total === 0 ? 0 : this.correctCount / this.total;
  }

  /* 结局页统计卡数据 */
  statsItems() {
    return [
      ['总答题', `${this.total}`],
      ['四六级 对/错', `${this.cetCorrect} / ${this.cetWrong}`],
      ['闪回 对/错', `${this.fbCorrect} / ${this.fbWrong}`],
      ['答对率', `${Math.round(this.accuracy() * 100)}%`]
    ];
  }
}
