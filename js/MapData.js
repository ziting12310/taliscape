/* MapData —— 地图参数与格子类型常量 */

export const CellType = {
  WALL:          'wall',
  AISLE:         'aisle',
  CLUTTER:       'clutter',
  DESK:          'desk',
  SEAT_CLOSED:   'seatClosed',
  SEAT_OPEN:     'seatOpen',
  SEAT_BROKEN:   'seatBroken',
  SEAT_OCCUPIED: 'seatOccupied',
  EXIT:          'exit',
  START:         'start'
};

export const MAP = {
  cols: 16,
  rows: 12,
  tile: 50,

  start: { x: 1, y: 10 },
  exit:  { x: 14, y: 1 },

  safeRadius: 3,           // 起点/出口周围强制为过道的半径（切比雪夫距离）
  maxGenerateRetry: 50,

  // 座位区四类座椅的生成权重
  seatWeights: [
    [CellType.SEAT_OPEN,     35],
    [CellType.SEAT_CLOSED,   30],
    [CellType.SEAT_BROKEN,   15],
    [CellType.SEAT_OCCUPIED, 20]
  ],

  deskRatio:    0.10,      // 座位区内课桌本体占比
  clutterRatio: 0.08       // 过道上书本/书包占比
};

// 骨架过道位置（生成时使用）
export const AISLE_COLS = [1, 5, 8, 11, 14];
export const AISLE_ROWS = [1, 6, 10];

// 座位区块范围 [起始, 结束]
export const SEAT_COL_BLOCKS = [[2, 4], [6, 7], [9, 10], [12, 13]];
export const SEAT_ROW_BLOCKS = [[2, 5], [7, 9]];
