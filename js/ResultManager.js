/* ResultManager —— 答题统计与错题集合
 * 结局判定（computeEnding）在 Phase 6 接入。
 */

export const STAGE_LABEL = {
  kindergarten: '幼儿园',
  primary: '小学',
  middle: '初中',
  high: '高中'
};

export const ENDINGS = {
  rhythm:   { name: '🏃 节奏大师', desc: '一次都没被点名，你踩着老师的节拍溜出了后门。' },
  english:  { name: '📘 英语大师', desc: '被抓过几次，但你全答对了，连老师都愣了一下。' },
  steady:   { name: '🚶 稳步前行', desc: '有对有错，但你稳住了节奏，最后还是摸到了后门。' },
  lucky:    { name: '🍀 侥幸脱身', desc: '错得比对得多，好在门就在眼前。' },
  detained: { name: '💀 留堂失败', desc: '羞愧值满了，你被留下来抄写单词。' }
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

  /* 结局判定：outcome = 'exit' | 'overload'
   * 到门优先于羞愧满，由调用方保证顺序。
   */
  computeEnding(outcome) {
    if (outcome === 'overload') return { key: 'detained', ...ENDINGS.detained };

    let key;
    if (this.total === 0) key = 'rhythm';
    else if (this.wrongCount === 0) key = 'english';
    else if (this.accuracy() >= 0.4) key = 'steady';
    else key = 'lucky';

    return { key, ...ENDINGS[key] };
  }
}
