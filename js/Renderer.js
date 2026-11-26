/* Renderer —— Phase 2 最小渲染：地图 + 玩家 + 提示条
 * （老师、HUD 动效、压力视觉在 Phase 7 扩展）
 */
import { MAP, CellType } from './MapData.js';

const COLORS = {
  [CellType.WALL]:          '#12151c',
  [CellType.AISLE]:         '#232a36',
  [CellType.CLUTTER]:       '#41301f',
  [CellType.DESK]:          '#33251a',
  [CellType.SEAT_CLOSED]:   '#1b2436',
  [CellType.SEAT_OPEN]:     '#1f3a5c',
  [CellType.SEAT_BROKEN]:   '#4a1f24',
  [CellType.SEAT_OCCUPIED]: '#2a2f38',
  [CellType.EXIT]:          '#1e4d33',
  [CellType.START]:         '#1e3355'
};

const EMOJI = {
  [CellType.CLUTTER]:       '📚',
  [CellType.DESK]:          '🪑',
  [CellType.SEAT_CLOSED]:   '💺',
  [CellType.SEAT_OPEN]:     '💺',
  [CellType.SEAT_BROKEN]:   '💺',
  [CellType.SEAT_OCCUPIED]: '👤',
  [CellType.EXIT]:          '🚪'
};

const FONT = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hint = '';
    this.hintUntil = 0;
  }

  setHint(text, ms = 1600) {
    this.hint = text;
    this.hintUntil = performance.now() + ms;
  }

  draw(map, player, sm, now) {
    const ctx = this.ctx;
    const T = MAP.tile;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let y = 0; y < MAP.rows; y++) {
      for (let x = 0; x < MAP.cols; x++) {
        const cell = map.getCell(x, y);
        const px = x * T;
        const py = y * T;

        ctx.fillStyle = COLORS[cell.type] || '#232a36';
        ctx.fillRect(px, py, T, T);

        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);

        if (cell.type === CellType.SEAT_CLOSED) {
          ctx.save();
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = '#3a4a66';
          ctx.strokeRect(px + 3.5, py + 3.5, T - 7, T - 7);
          ctx.restore();
        }

        if (cell.type === CellType.SEAT_BROKEN) {
          ctx.save();
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = 'rgba(255,93,93,0.55)';
          ctx.strokeRect(px + 3.5, py + 3.5, T - 7, T - 7);
          ctx.restore();
          ctx.font = `12px ${FONT}`;
          ctx.fillStyle = '#ff8f8f';
          ctx.fillText('❗', px + T - 9, py + T - 9);
        }

        const emoji = EMOJI[cell.type];
        if (emoji) {
          ctx.font = `22px ${FONT}`;
          ctx.fillStyle = '#e8eefc';
          ctx.fillText(emoji, px + T / 2, py + T / 2 + 1);
        }
      }
    }

    // 玩家（移动动作期间按进度插值；逻辑位置仍以落地为准）
    let vx = player.x;
    let vy = player.y;
    if (player.action && player.action.type === 'move') {
      const p = player.action.progress || 0;
      vx = player.x + (player.action.tx - player.x) * p;
      vy = player.y + (player.action.ty - player.y) * p;
    }

    ctx.beginPath();
    ctx.fillStyle = 'rgba(79,140,255,0.18)';
    ctx.arc(vx * T + T / 2, vy * T + T / 2, 19, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = `26px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('🧑‍🎓', vx * T + T / 2, vy * T + T / 2 + 2);

    // 提示条
    if (this.hint && now < this.hintUntil) {
      ctx.font = `13px ${FONT}`;
      const tw = ctx.measureText(this.hint).width;
      const bw = tw + 28;
      const bh = 30;
      const bx = (w - bw) / 2;
      const by = h - 46;

      ctx.fillStyle = 'rgba(10,13,19,0.9)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = 'rgba(120,170,255,0.3)';
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

      ctx.fillStyle = '#d7e0f2';
      ctx.font = `13px ${FONT}`;
      ctx.fillText(this.hint, w / 2, by + bh / 2 + 1);
    }
  }
}
