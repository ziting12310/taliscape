/* 2. 题库 —— 拆分自原单文件，业务代码不变 */
export const QUIZ_BANK = [
  { q: "The word 'ubiquitous' most nearly means:", o: ["rare", "present everywhere", "hidden", "ancient"], c: 1, e: "Ubiquitous = present or found everywhere." },
  { q: "Choose the correct form: 'If I ___ you, I would study harder.'", o: ["am", "was", "were", "be"], c: 2, e: "Subjunctive mood uses 'were' for all persons in second conditional." },
  { q: "Which is closest in meaning to 'diligent'?", o: ["lazy", "careful", "hard-working", "confident"], c: 2, e: "Diligent = having or showing care in one's work; hard-working." },
  { q: "'The report was ___.' Choose the correct adjective:", o: ["interesting", "interested", "interest", "interestingly"], c: 0, e: "-ing adjectives describe things that cause a feeling." },
  { q: "What does 'ephemeral' mean?", o: ["eternal", "fleeting", "solid", "secret"], c: 1, e: "Ephemeral = lasting for a very short time." },
  { q: "Choose the correct preposition: 'She is afraid ___ dogs.'", o: ["with", "of", "to", "from"], c: 1, e: "afraid of is the correct collocation." },
  { q: "'Resilient' means:", o: ["weak", "able to recover quickly", "stubborn", "dangerous"], c: 1, e: "Resilient = able to recover quickly from difficulties." },
  { q: "Which sentence is grammatically correct?", o: ["He don't like it.", "He doesn't likes it.", "He doesn't like it.", "He not like it."], c: 2, e: "Third person singular uses 'doesn't' + bare infinitive." },
  { q: "'Candid' means:", o: ["silent", "honest and straightforward", "deceptive", "eager"], c: 1, e: "Candid = truthful and straightforward; frank." },
  { q: "Choose the correct verb tense: 'By the time we arrived, they ___.'", o: ["leave", "left", "have left", "had left"], c: 3, e: "Past perfect describes an action before another past action." },
  { q: "'Inevitable' is closest in meaning to:", o: ["uncertain", "avoidable", "certain to happen", "surprising"], c: 2, e: "Inevitable = certain to happen; unavoidable." },
  { q: "Which word means 'to make something clear'?", o: ["obscure", "clarify", "complicate", "summarize"], c: 1, e: "Clarify = make (something) clear and easier to understand." },
  { q: "'Aesthetic' relates to:", o: ["economics", "beauty and art", "science", "politics"], c: 1, e: "Aesthetic = concerned with beauty or the appreciation of beauty." },
  { q: "Choose the correct article: 'I saw ___ elephant at the zoo.'", o: ["a", "an", "the", "—"], c: 1, e: "Use 'an' before words beginning with a vowel sound." },
  { q: "'Ambiguous' means:", o: ["clear", "having more than one meaning", "simple", "generous"], c: 1, e: "Ambiguous = open to more than one interpretation." },
  { q: "Which is a synonym of 'abundant'?", o: ["scarce", "plentiful", "expensive", "hidden"], c: 1, e: "Abundant = existing in large quantities; plentiful." },
  { q: "'If she ___ studied, she would have passed.' Choose the correct form:", o: ["has", "have", "had", "would"], c: 2, e: "Third conditional: if + past perfect → would have + past participle." },
  { q: "'Benevolent' means:", o: ["cruel", "charitable and kind", "selfish", "brave"], c: 1, e: "Benevolent = well-meaning and kindly." },
  { q: "Which word means 'to become smaller or less'?", o: ["expand", "diminish", "maintain", "increase"], c: 1, e: "Diminish = make or become smaller or less." },
  { q: "'Pragmatic' means:", o: ["idealistic", "dealing with things sensibly and realistically", "lazy", "impossible"], c: 1, e: "Pragmatic = dealing with things sensibly and realistically." },
  { q: "Choose the correct conjunction: 'It was raining, ___ we stayed home.'", o: ["but", "so", "although", "because"], c: 1, e: "'So' indicates result or consequence." },
  { q: "'Eloquent' describes someone who is:", o: ["quiet", "fluent or persuasive in speaking", "angry", "young"], c: 1, e: "Eloquent = fluent or persuasive in speaking or writing." },
  { q: "Which word is an antonym of 'pristine'?", o: ["dirty", "clean", "pure", "fresh"], c: 0, e: "Pristine = in its original condition; unspoiled. Antonym = dirty." },
  { q: "'She suggested ___ to the park.' Choose the correct form:", o: ["to go", "going", "go", "went"], c: 1, e: "After 'suggest', use the gerund (-ing form), not the infinitive." },
  { q: "'Tenacious' means:", o: ["weak", "holding firmly; persistent", "slow", "quiet"], c: 1, e: "Tenacious = holding firmly; not easily giving up." }
];
export function pickQuiz() { return QUIZ_BANK[Math.floor(Math.random() * QUIZ_BANK.length)]; }
