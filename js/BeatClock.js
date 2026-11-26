/* BeatClock —— 全局节拍时钟（唯一时间基准）
 * 用累加而非取模，保证冻结后不跳拍；一次 tick 跨多拍时逐拍回调，不丢事件。
 */

export class BeatClock {
  constructor(beatMs = 400) {
    this.beatMs = beatMs;
    this.elapsedMs = 0;
    this.beatIndex = 0;
    this.onBeat = null;   // (beatIndex) => void
  }

  tick(deltaMs) {
    if (!(deltaMs > 0)) return;
    this.elapsedMs += deltaMs;
    const target = Math.floor(this.elapsedMs / this.beatMs);
    while (this.beatIndex < target) {
      this.beatIndex++;
      if (this.onBeat) this.onBeat(this.beatIndex);
    }
  }

  // 当前拍内进度 0–1
  beatProgress() {
    return (this.elapsedMs % this.beatMs) / this.beatMs;
  }

  reset() {
    this.elapsedMs = 0;
    this.beatIndex = 0;
  }
}
