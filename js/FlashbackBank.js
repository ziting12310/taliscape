/* FlashbackBank —— 四阶段闪回题库（幼儿园 / 小学 / 初中 / 高中） */

export const FLASHBACK_BANK = {
  kindergarten: [
    { id: 'k1', question: '🍎 这个水果用英语怎么说？', options: ['apple', 'banana', 'orange', 'grape'], answer: 0, explain: 'apple 意为“苹果”。', point: '单词' },
    { id: 'k2', question: '🐱 这个动物用英语怎么说？', options: ['cat', 'dog', 'bird', 'fish'], answer: 0, explain: 'cat 意为“猫”。', point: '单词' },
    { id: 'k3', question: '🔴 这个颜色用英语怎么说？', options: ['red', 'blue', 'green', 'yellow'], answer: 0, explain: 'red 意为“红色”。', point: '单词' },
    { id: 'k4', question: '数字 3 的英文是？', options: ['three', 'two', 'four', 'five'], answer: 0, explain: 'three 意为“三”。', point: '单词' },
    { id: 'k5', question: '👨‍🏫 这个职业用英语怎么说？', options: ['teacher', 'doctor', 'driver', 'farmer'], answer: 0, explain: 'teacher 意为“老师”。', point: '单词' }
  ],
  primary: [
    { id: 'p1', question: '— How are you? — ___', options: ["I'm fine, thank you.", "I'm ten.", "It's Monday.", 'Yes, I do.'], answer: 0, explain: 'How are you 的常见回答是 I\'m fine, thank you.', point: '短语' },
    { id: 'p2', question: "— What's your name? — ___", options: ['My name is Tom.', "I'm fine.", 'He is Tom.', 'Thank you.'], answer: 0, explain: '询问姓名用 My name is... 回答。', point: '短语' },
    { id: 'p3', question: '— How old are you? — ___', options: ["I'm ten years old.", "I'm in Class Two.", "It's ten o'clock.", 'I like ten.'], answer: 0, explain: '询问年龄用 I\'m ... years old 回答。', point: '短语' },
    { id: 'p4', question: '— Where is the library? — ___', options: ["It's next to the gym.", "It's Monday.", "I'm fine.", 'Yes, it is.'], answer: 0, explain: '询问位置用 It\'s next to... 回答。', point: '短语' },
    { id: 'p5', question: '— Thank you very much. — ___', options: ["You're welcome.", "I'm sorry.", 'Good morning.', 'See you.'], answer: 0, explain: '对感谢的回应是 You\'re welcome。', point: '短语' }
  ],
  middle: [
    { id: 'm1', question: 'He ___ to school by bike every day.', options: ['goes', 'go', 'going', 'went'], answer: 0, explain: '一般现在时第三人称单数用 goes。', point: '语法' },
    { id: 'm2', question: 'There ___ some milk in the fridge.', options: ['is', 'are', 'be', 'have'], answer: 0, explain: 'There be 句型就近一致，milk 不可数用 is。', point: '语法' },
    { id: 'm3', question: 'She is good ___ playing the piano.', options: ['at', 'in', 'on', 'for'], answer: 0, explain: 'be good at 表示“擅长”。', point: '短语' },
    { id: 'm4', question: 'If it ___ tomorrow, we will stay at home.', options: ['rains', 'rain', 'rained', 'will rain'], answer: 0, explain: '条件状语从句主将从现，从句用一般现在时。', point: '语法' },
    { id: 'm5', question: 'I have ___ this book for two weeks.', options: ['kept', 'borrowed', 'bought', 'lent'], answer: 0, explain: '与时间段连用需用延续性动词 kept。', point: '语法' }
  ],
  high: [
    { id: 'h1', question: '___ from the top, the city looks beautiful.', options: ['Seen', 'Seeing', 'To see', 'See'], answer: 0, explain: 'city 与 see 是被动关系，用过去分词作状语。', point: '语法' },
    { id: 'h2', question: 'The book, ___ cover is red, is mine.', options: ['whose', 'which', 'that', 'what'], answer: 0, explain: 'whose 引导定语从句表示所属关系。', point: '语法' },
    { id: 'h3', question: 'Not until he left ___ he realize the importance.', options: ['did', 'does', 'do', 'had'], answer: 0, explain: 'Not until 置于句首，主句部分倒装。', point: '语法' },
    { id: 'h4', question: 'It was in 2008 ___ the Olympic Games were held in Beijing.', options: ['that', 'which', 'when', 'where'], answer: 0, explain: '强调句型 It was ... that ...。', point: '语法' },
    { id: 'h5', question: 'Hardly ___ he arrived when it began to rain.', options: ['had', 'has', 'did', 'was'], answer: 0, explain: 'hardly...when 搭配过去完成时，且部分倒装。', point: '语法' }
  ]
};

export function pickFlashback(stage) {
  const list = FLASHBACK_BANK[stage] || FLASHBACK_BANK.kindergarten;
  if (!list || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}
