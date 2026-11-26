/* 6. ShameTracker —— 拆分自原单文件，业务代码不变 */
export const SHAME_THRESHOLD = 100;

export class ShameTracker {
  constructor() {
    this.value = 0;
    this.onThreshold = null;     // 触发闪回回调
    this._flashbackArmed = false; // 是否已经"填过一次阈值"，等待消费
  }
  reset() {
    this.value = 0;
    this._flashbackArmed = false;
  }
  applyQuizResult(correct) {
    if (correct) {
      this.value = Math.max(0, this.value - 10);
    } else {
      this.value += 25;
    }
    if (this.value >= SHAME_THRESHOLD && !this._flashbackArmed) {
      this._flashbackArmed = true;
      this.onThreshold?.();
    }
  }
  consumeFlashback() {
    this.value = Math.max(0, this.value - SHAME_THRESHOLD);
    this._flashbackArmed = false;
  }
}
