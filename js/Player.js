/* Player —— 玩家位置与按拍动作（移动 1.5 拍 / 拉椅 1 拍） */
import { MAP, CellType } from './MapData.js';

export const MOVE_BEATS = 1.5;
export const PULL_BEATS = 1;

export class Player {
  constructor(map) {
    this.map = map;
    this.reset();
  }

  reset() {
    this.x = MAP.start.x;
    this.y = MAP.start.y;
    this.facing = 'n';     // 开场朝黑板方向
    this.action = null;
  }

  /* 动作锁：动作期间屏蔽输入，不排队 */
  isBusy() { return this.action !== null; }

  /* 回头判定用：动作是否尚未落地 */
  isMidAction() { return this.action !== null; }

  startMove(tx, ty) {
    if (this.isBusy()) return { started: false, reason: 'busy' };
    if (!this.map.isInBounds(tx, ty)) return { started: false, reason: 'out_of_bounds' };
    if (!this.map.isAdjacent(this.x, this.y, tx, ty)) return { started: false, reason: 'not_adjacent' };
    if (!this.map.isPassable(tx, ty)) return { started: false, reason: 'blocked' };

    const dx = tx - this.x;
    const dy = ty - this.y;
    this.action = { type: 'move', tx, ty, beats: MOVE_BEATS, elapsedMs: 0, progress: 0 };
    this.facing = dy < 0 ? 'n' : dy > 0 ? 's' : dx < 0 ? 'w' : 'e';
    return { started: true, type: 'move' };
  }

  startPull(tx, ty) {
    if (this.isBusy()) return { started: false, reason: 'busy' };
    if (!this.map.isAdjacent(this.x, this.y, tx, ty)) return { started: false, reason: 'not_adjacent' };
    if (!this.map.isPullable(tx, ty)) return { started: false, reason: 'not_pullable' };

    this.action = { type: 'pull', tx, ty, beats: PULL_BEATS, elapsedMs: 0, progress: 0 };
    return { started: true, type: 'pull' };
  }

  /* 每帧推进；动作完成时返回落地事件，否则 null */
  tick(deltaMs, beatMs) {
    if (!this.action) return null;

    const need = this.action.beats * beatMs;
    this.action.elapsedMs += deltaMs;
    this.action.progress = Math.min(1, this.action.elapsedMs / need);

    if (this.action.elapsedMs < need) return null;

    const done = this.action;
    this.action = null;

    if (done.type === 'move') {
      this.x = done.tx;
      this.y = done.ty;
      return {
        type: 'moveDone',
        x: this.x,
        y: this.y,
        cellType: this.map.getCell(this.x, this.y).type
      };
    }

    this.map.pullSeat(done.tx, done.ty);
    return { type: 'pullDone', x: done.tx, y: done.ty };
  }

  /* 供渲染插值使用 */
  actionProgress() {
    return this.action ? this.action.progress : 1;
  }

  /* 当前所在格是否为破损座椅（回头判定用） */
  isOnBrokenSeat() {
    return this.map.getCell(this.x, this.y).type === CellType.SEAT_BROKEN;
  }
}
