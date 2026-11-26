/* MapManager —— 随机地图生成、连通性校验、通行性与拉椅 */
import {
  MAP, CellType,
  AISLE_COLS, AISLE_ROWS,
  SEAT_COL_BLOCKS, SEAT_ROW_BLOCKS
} from './MapData.js';

// 免费通行（不含需要拉开的收起座椅）
const FREE_TYPES = new Set([
  CellType.AISLE,
  CellType.SEAT_OPEN,
  CellType.SEAT_BROKEN,
  CellType.EXIT,
  CellType.START
]);

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class MapManager {
  constructor() {
    this.cols = MAP.cols;
    this.rows = MAP.rows;
    this.grid = [];
    this.debug = { attempts: 0, routed: true };
    this.generate();
  }

  /* ---------- 生成 ---------- */

  generate() {
    let riskRetries = 0;

    for (let attempt = 1; attempt <= MAP.maxGenerateRetry; attempt++) {
      this._build();

      const first = this._findPath(new Set());
      if (!first) continue;

      // 屏蔽首条路径的中间格，验证仍存在第二条路线
      const blocked = new Set();
      for (let i = 1; i < first.length - 1; i++) {
        blocked.add(this._key(first[i].x, first[i].y));
      }
      const second = this._findPath(blocked);
      if (!second) continue;

      // 短路线上破损座椅密度应高于绕行路线；不达标重掷最多 4 次
      if (!this._riskFavoursShortLine(first, second) && riskRetries < 4) {
        riskRetries++;
        continue;
      }

      this.debug = { attempts: attempt, routed: true, riskRetries };
      return;
    }

    this._build();
    this._carveFallback();
    this.debug = { attempts: MAP.maxGenerateRetry, routed: false, riskRetries };
  }

  _riskFavoursShortLine(shortPath, detourPath) {
    const countBroken = (path) => path.reduce(
      (n, p) => n + (this.grid[p.y][p.x].type === CellType.SEAT_BROKEN ? 1 : 0),
      0
    );

    const shortBroken = countBroken(shortPath);
    const detourBroken = countBroken(detourPath);

    // 交叉相乘比较密度，避免除零
    return shortBroken * detourPath.length >= detourBroken * shortPath.length;
  }

  reset() { this.generate(); }

  _build() {
    const { cols, rows } = this;

    // 1) 全图填墙，内部为过道
    this.grid = Array.from({ length: rows }, (_, y) =>
      Array.from({ length: cols }, (_, x) => ({
        x,
        y,
        type: (x === 0 || y === 0 || x === cols - 1 || y === rows - 1)
          ? CellType.WALL
          : CellType.AISLE
      }))
    );

    // 2) 座位区块按权重铺设四类座椅
    for (const [y0, y1] of SEAT_ROW_BLOCKS) {
      for (const [x0, x1] of SEAT_COL_BLOCKS) {
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            this.grid[y][x].type = this._pickSeatType();
          }
        }
      }
    }

    // 3) 座位区内随机点课桌本体
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const t = this.grid[y][x].type;
        if (t !== CellType.SEAT_OPEN && t !== CellType.SEAT_CLOSED
            && t !== CellType.SEAT_BROKEN && t !== CellType.SEAT_OCCUPIED) continue;
        if (Math.random() < MAP.deskRatio) this.grid[y][x].type = CellType.DESK;
      }
    }

    // 4) 过道撒书本/书包（避开过道交叉口，避免堵死）
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        if (this.grid[y][x].type !== CellType.AISLE) continue;
        if (AISLE_ROWS.includes(y) && AISLE_COLS.includes(x)) continue; // 交叉口
        if (Math.random() < MAP.clutterRatio) this.grid[y][x].type = CellType.CLUTTER;
      }
    }

    // 5) 起点与出口安全区
    this._clearSafeZone(MAP.start);
    this._clearSafeZone(MAP.exit);

    // 6) 标记起点与出口
    this.grid[MAP.start.y][MAP.start.x].type = CellType.START;
    this.grid[MAP.exit.y][MAP.exit.x].type = CellType.EXIT;
  }

  _pickSeatType() {
    const weights = MAP.seatWeights;
    const total = weights.reduce((sum, [, w]) => sum + w, 0);
    let r = Math.random() * total;
    for (const [type, w] of weights) {
      r -= w;
      if (r <= 0) return type;
    }
    return weights[0][0];
  }

  _clearSafeZone(center) {
    const r = MAP.safeRadius;
    for (let y = 1; y <= this.rows - 2; y++) {
      for (let x = 1; x <= this.cols - 2; x++) {
        if (Math.max(Math.abs(x - center.x), Math.abs(y - center.y)) <= r) {
          this.grid[y][x].type = CellType.AISLE;
        }
      }
    }
  }

  /* ---------- 校验 ---------- */

  _key(x, y) { return `${x},${y}`; }

  _findPath(blocked) {
    const startKey = this._key(MAP.start.x, MAP.start.y);
    const endKey = this._key(MAP.exit.x, MAP.exit.y);

    const prev = new Map([[startKey, null]]);
    const queue = [[MAP.start.x, MAP.start.y]];
    let head = 0;

    while (head < queue.length) {
      const [x, y] = queue[head++];

      if (this._key(x, y) === endKey) {
        const path = [];
        let cursor = endKey;
        while (cursor !== null) {
          const [px, py] = cursor.split(',').map(Number);
          path.push({ x: px, y: py });
          cursor = prev.get(cursor);
        }
        return path.reverse();
      }

      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.isInBounds(nx, ny)) continue;
        const nk = this._key(nx, ny);
        if (prev.has(nk)) continue;
        if (blocked.has(nk)) continue;
        if (!FREE_TYPES.has(this.grid[ny][nx].type)) continue;
        prev.set(nk, this._key(x, y));
        queue.push([nx, ny]);
      }
    }

    return null;
  }

  _carveFallback() {
    const { start, exit } = MAP;

    for (let x = Math.min(start.x, exit.x); x <= Math.max(start.x, exit.x); x++) {
      this._setAisle(x, start.y);
    }
    for (let y = Math.min(start.y, exit.y); y <= Math.max(start.y, exit.y); y++) {
      this._setAisle(exit.x, y);
    }

    this.grid[start.y][start.x].type = CellType.START;
    this.grid[exit.y][exit.x].type = CellType.EXIT;
  }

  _setAisle(x, y) {
    if (x <= 0 || y <= 0 || x >= this.cols - 1 || y >= this.rows - 1) return;
    this.grid[y][x].type = CellType.AISLE;
  }

  /* ---------- 查询与交互 ---------- */

  getCell(x, y) { return this.grid[y][x]; }

  isInBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  isPassable(x, y) {
    return this.isInBounds(x, y) && FREE_TYPES.has(this.grid[y][x].type);
  }

  isAdjacent(x1, y1, x2, y2) {
    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);
    return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
  }

  isExit(x, y) {
    return this.isInBounds(x, y) && this.grid[y][x].type === CellType.EXIT;
  }

  isPullable(x, y) {
    return this.isInBounds(x, y) && this.grid[y][x].type === CellType.SEAT_CLOSED;
  }

  // 仅对「收起座椅」生效；相邻性由 Player.startPull 负责
  pullSeat(x, y) {
    if (!this.isPullable(x, y)) return false;
    this.grid[y][x].type = CellType.SEAT_OPEN;
    return true;
  }
}
