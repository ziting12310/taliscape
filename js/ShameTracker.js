/* ShameTracker —— 羞愧值 0–150、递增惩罚曲线、闪回阶段抽取 */

export const SHAME_MAX = 150;
export const FLASHBACK_MIN_SHAME = 30;

const CET_PENALTY = [10, 20, 35];   // 第 1/2/3 次答错
const CET_PENALTY_MAX = 50;         // 第 4 次及以后
const CET_REWARD = 10;
const FLASHBACK_REWARD = 20;
const FLASHBACK_PENALTY = 10;

export class ShameTracker {
  constructor() {
    this.value = 0;
    this.failCount = 0;
  }

  reset() {
    this.value = 0;
    this.failCount = 0;
  }

  applyCET(correct) {
    if (correct) {
      this.value = Math.max(0, this.value - CET_REWARD);
    } else {
      this.failCount++;
      const delta = this.failCount <= 3
        ? CET_PENALTY[this.failCount - 1]
        : CET_PENALTY_MAX;
      this.value += delta;
    }
    this._clamp();
  }

  applyFlashback(correct) {
    this.value += correct ? -FLASHBACK_REWARD : FLASHBACK_PENALTY;
    this._clamp();
  }

  isOverload() {
    return this.value >= SHAME_MAX;
  }

  /* 按当前羞愧区间加权抽取回忆阶段 */
  getFlashbackStage() {
    const v = this.value;
    let table;

    if (v < 60) {
      table = [[60, 'kindergarten'], [25, 'primary'], [10, 'middle'], [5, 'high']];
    } else if (v < 90) {
      table = [[5, 'kindergarten'], [60, 'primary'], [25, 'middle'], [10, 'high']];
    } else if (v < 120) {
      table = [[10, 'kindergarten'], [5, 'primary'], [60, 'middle'], [25, 'high']];
    } else {
      table = [[5, 'kindergarten'], [10, 'primary'], [25, 'middle'], [60, 'high']];
    }

    let r = Math.random() * 100;
    for (const [weight, stage] of table) {
      r -= weight;
      if (r < 0) return stage;
    }
    return 'high';
  }

  _clamp() {
    if (this.value < 0) this.value = 0;
    if (this.value > SHAME_MAX) this.value = SHAME_MAX;
  }
}
