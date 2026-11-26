/* QuizBank —— 四六级题库（题干 / 四选项 / 正确答案 / 解析 / 知识点） */

export const CET_QUESTIONS = [
  { id: 'c1', question: '"abandon" 的意思最接近？', options: ['放弃', '建立', '改善', '借用'], answer: 0, explain: 'abandon 表示“放弃、抛弃”。', point: '单词' },
  { id: 'c2', question: '"inevitable" 的意思是？', options: ['不可避免的', '难以置信的', '无关紧要的', '不切实际的'], answer: 0, explain: 'inevitable 表示“必然发生的、不可避免的”。', point: '单词' },
  { id: 'c3', question: '"reluctant" 的意思是？', options: ['不情愿的', '可靠的', '充足的', '专心的'], answer: 0, explain: 'reluctant 表示“不情愿的、勉强的”。', point: '单词' },
  { id: 'c4', question: '"ambiguous" 的意思是？', options: ['模棱两可的', '雄心勃勃的', '明显的', '慷慨的'], answer: 0, explain: 'ambiguous 表示“含糊不清的、有歧义的”。', point: '单词' },
  { id: 'c5', question: '"deliberate" 作形容词时意为？', options: ['故意的', '精致的', '失望的', '危险的'], answer: 0, explain: 'deliberate 作形容词表示“故意的、深思熟虑的”。', point: '单词' },
  { id: 'c6', question: '"submit" 在商务语境中常表示？', options: ['提交', '反抗', '订阅', '替代'], answer: 0, explain: 'submit 常见义为“提交（文件、申请）”。', point: '单词' },
  { id: 'c7', question: '"compensate" 的意思是？', options: ['补偿', '比较', '竞争', '组成'], answer: 0, explain: 'compensate 表示“补偿、赔偿”。', point: '单词' },
  { id: 'c8', question: '"sufficient" 的意思是？', options: ['足够的', '效率高的', '表面的', '持续的'], answer: 0, explain: 'sufficient 表示“充足的、足够的”。', point: '单词' },
  { id: 'c9', question: 'The manager decided to ___ the meeting until next week.', options: ['postpone', 'postponed', 'postponing', 'postpones'], answer: 0, explain: 'decide to 后接动词原形。', point: '语法' },
  { id: 'c10', question: 'If I ___ you, I would accept the offer.', options: ['were', 'am', 'was', 'be'], answer: 0, explain: '与现在事实相反的虚拟语气用 were。', point: '语法' },
  { id: 'c11', question: 'Neither he nor I ___ ready for the exam.', options: ['am', 'is', 'are', 'be'], answer: 0, explain: 'neither...nor 遵循就近原则，靠近 I 用 am。', point: '语法' },
  { id: 'c12', question: 'Hardly ___ when the phone rang.', options: ['had I sat down', 'I had sat down', 'did I sit down', 'I sat down'], answer: 0, explain: 'hardly 置于句首要部分倒装，且用过去完成时。', point: '语法' },
  { id: 'c13', question: 'I look forward to ___ from you soon.', options: ['hearing', 'hear', 'heard', 'be heard'], answer: 0, explain: 'look forward to 中 to 是介词，后接动名词。', point: '语法' },
  { id: 'c14', question: 'The number of students ___ increasing every year.', options: ['is', 'are', 'were', 'have been'], answer: 0, explain: 'the number of + 复数名词作主语，谓语用单数。', point: '语法' },
  { id: 'c15', question: 'It is high time that we ___ the problem seriously.', options: ['took', 'take', 'will take', 'have taken'], answer: 0, explain: 'It is high time that 从句用过去式表示虚拟。', point: '语法' },
  { id: 'c16', question: 'give up 的意思是？', options: ['放弃', '赠送', '举起', '追赶'], answer: 0, explain: 'give up 表示“放弃”。', point: '短语' },
  { id: 'c17', question: 'take ... into account 的意思是？', options: ['考虑', '记账', '承担', '占据'], answer: 0, explain: 'take ... into account 表示“把……考虑在内”。', point: '短语' },
  { id: 'c18', question: 'put off 的意思是？', options: ['推迟', '放下', '穿上', '熄灭'], answer: 0, explain: 'put off 表示“推迟、拖延”。', point: '短语' },
  { id: 'c19', question: 'in terms of 的意思是？', options: ['就……而言', '以……为条件', '代替', '尽管'], answer: 0, explain: 'in terms of 表示“就……而言、从……角度”。', point: '短语' },
  { id: 'c20', question: 'be accustomed to ___ 中应填？', options: ['doing', 'do', 'did', 'be done'], answer: 0, explain: 'be accustomed to 中 to 为介词，后接动名词。', point: '短语' }
];

export function pickCET() {
  if (CET_QUESTIONS.length === 0) return null;
  return CET_QUESTIONS[Math.floor(Math.random() * CET_QUESTIONS.length)];
}
