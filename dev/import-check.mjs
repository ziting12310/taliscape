/* dev/import-check.mjs —— 逐个 import 全部游戏模块，检查语法与顶层依赖 */
const mods = ['MapData.js', 'MapManager.js', 'Player.js', 'TeacherAI.js', 'GameState.js',
  'BeatClock.js', 'ShameTracker.js', 'ResultManager.js', 'LightingLayer.js', 'Renderer.js', 'QuizBank.js', 'QuizManager.js', 'FlashbackBank.js'];
let fail = 0;
for (const m of mods) {
  try {
    await import(`../js/${m}`);
    console.log(`ok   ${m}`);
  } catch (err) {
    fail++;
    console.log(`FAIL ${m} — ${err.message}`);
  }
}
console.log(`\n${mods.length - fail}/${mods.length} 模块可正常加载`);
if (fail) process.exit(1);
