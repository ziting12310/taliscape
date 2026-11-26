/* Renderer —— 场景渲染与 HUD
 * 分层：地板 → 墙体 → 家具 → 出口 → 老师 → 玩家 → 回头红色氛围 → 提示条
 */
import { MAP, CellType } from './MapData.js';
import { GameState } from './GameState.js';
import { SHAME_MAX } from './ShameTracker.js';

const FLOOR = {
  [CellType.AISLE]:         '#232a36',
  [CellType.CLUTTER]:       '#2b2a22',
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

const TEACHER_EMOJI = { board: '🧑‍🏫', pace: '🚶', turn: '👀' };
const TEACHER_LABEL = { board: '📖 板书', pace: '🚶 踱步', turn: '👀 回头' };

const STATE_LABEL = {
  [GameState.IDLE]: '待机',
  [GameState.PLAYING]: '上课中',
  [GameState.QUIZ_OPEN]: '答题中',
  [GameState.FLASHBACK_QUIZ]: '回忆中',
  [GameState.RESULT]: '结算'
};

export class Renderer {
  constructor(canvas, dom = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dom = dom;
    this.hint = '';
    this.hintUntil = 0;
  }

  setHint(text, ms = 1600) {
    this.hint = text;
    this.hintUntil = performance.now() + ms;
  }

  /* ================= 场景 ================= */

  draw(map, player, sm, teacher, now) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    this._drawFloor(map);
    this._drawWalls(map);
    this._drawProps(map, now);
    this._drawExit(map, now);
    this._drawTeacher(teacher, sm, now);
    this._drawPlayer(player, now);
    this._drawTurnVignette(teacher, sm);
    this._drawHint(now);
  }

  _drawFloor(map) {
    const ctx = this.ctx;
    const T = MAP.tile;

    for (let y = 0; y < MAP.rows; y++) {
      for (let x = 0; x < MAP.cols; x++) {
        const cell = map.getCell(x, y);
        if (cell.type === CellType.WALL) continue;

        const px = x * T;
        const py = y * T;

        ctx.fillStyle = FLOOR[cell.type] || '#232a36';
        ctx.fillRect(px, py, T, T);

        // 地板细纹
        ctx.strokeStyle = 'rgba(255,255,255,0.035)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py + T / 2);
        ctx.lineTo(px + T, py + T / 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
      }
    }
  }

  _drawWalls(map) {
    const ctx = this.ctx;
    const T = MAP.tile;

    for (let y = 0; y < MAP.rows; y++) {
      for (let x = 0; x < MAP.cols; x++) {
        if (map.getCell(x, y).type !== CellType.WALL) continue;

        const px = x * T;
        const py = y * T;

        ctx.fillStyle = '#0d1016';
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = 'rgba(255,255,255,0.035)';
        ctx.fillRect(px, py, T, 3);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
      }
    }
  }

  _drawProps(map, now) {
    const ctx = this.ctx;
    const T = MAP.tile;

    for (let y = 0; y < MAP.rows; y++) {
      for (let x = 0; x < MAP.cols; x++) {
        const cell = map.getCell(x, y);
        const px = x * T;
        const py = y * T;

        if (cell.type === CellType.DESK) {
          ctx.fillStyle = '#2b1f15';
          ctx.fillRect(px + 6, py + 8, T - 12, T - 16);
          ctx.fillStyle = '#4a3625';
          ctx.fillRect(px + 6, py + 8, T - 12, 7);
        }

        if (cell.type === CellType.SEAT_CLOSED) {
          ctx.save();
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = '#3a4a66';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(px + 3.5, py + 3.5, T - 7, T - 7);
          ctx.restore();
        }

        if (cell.type === CellType.SEAT_BROKEN) {
          const pulse = 0.45 + 0.25 * Math.sin(now / 320);
          ctx.save();
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = `rgba(255,93,93,${pulse})`;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(px + 3.5, py + 3.5, T - 7, T - 7);
          ctx.restore();

          ctx.font = `12px ${FONT}`;
          ctx.fillStyle = '#ff8f8f';
          ctx.fillText('❗', px + T - 9, py + T - 9);
        }

        if (cell.type === CellType.SEAT_OCCUPIED) {
          ctx.beginPath();
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.arc(px + T / 2, py + T / 2, 15, 0, Math.PI * 2);
          ctx.fill();
        }

        const emoji = EMOJI[cell.type];
        if (emoji) {
          ctx.font = `${cell.type === CellType.DESK ? 18 : 22}px ${FONT}`;
          ctx.fillStyle = '#e8eefc';
          const ey = cell.type === CellType.DESK ? py + T - 15 : py + T / 2 + 1;
          ctx.fillText(emoji, px + T / 2, ey);
        }
      }
    }
  }

  _drawExit(map, now) {
    const ctx = this.ctx;
    const T = MAP.tile;

    for (let y = 0; y < MAP.rows; y++) {
      for (let x = 0; x < MAP.cols; x++) {
        if (map.getCell(x, y).type !== CellType.EXIT) continue;

        const px = x * T;
        const py = y * T;
        const pulse = 0.5 + 0.5 * Math.sin(now / 380);

        ctx.fillStyle = `rgba(61,220,132,${0.10 + 0.10 * pulse})`;
        ctx.fillRect(px, py, T, T);
        ctx.strokeStyle = `rgba(61,220,132,${0.35 + 0.35 * pulse})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 4, py + 4, T - 8, T - 8);

        ctx.font = `24px ${FONT}`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText('🚪', px + T / 2, py + T / 2 + 1);
      }
    }
  }

  /* ================= 老师 ================= */

  _drawTeacher(teacher, sm, now) {
    if (sm.state === GameState.IDLE || sm.state === GameState.RESULT) return;
    if (!teacher) return;

    const ctx = this.ctx;
    const sway = teacher.phase === 'pace' ? Math.sin(now / 240) * 26 : 0;
    const tx = 400 + sway;

    // 讲台
    ctx.fillStyle = '#241c14';
    ctx.fillRect(250, 0, 300, 44);
    ctx.fillStyle = '#3a2b1d';
    ctx.fillRect(250, 40, 300, 6);

    // 板书阶段的粉笔字（淡入淡出）
    if (teacher.phase === 'board') {
      ctx.strokeStyle = `rgba(226,236,255,${0.22 + 0.12 * Math.sin(now / 600)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(300, 14);
      ctx.lineTo(452, 14);
      ctx.moveTo(300, 24);
      ctx.lineTo(408, 24);
      ctx.stroke();
    }

    // 回头阶段：头顶警示
    if (teacher.phase === 'turn') {
      ctx.font = `16px ${FONT}`;
      ctx.fillStyle = '#ff6b6b';
      ctx.fillText('!', tx, 8);
    }

    ctx.font = `30px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(TEACHER_EMOJI[teacher.phase] || '🧑‍🏫', tx, 32);
  }

  /* ================= 玩家 ================= */

  _drawPlayer(player, now) {
    const ctx = this.ctx;
    const T = MAP.tile;

    let vx = player.x;
    let vy = player.y;
    if (player.action && player.action.type === 'move') {
      const p = player.action.progress || 0;
      vx = player.x + (player.action.tx - player.x) * p;
      vy = player.y + (player.action.ty - player.y) * p;
    }

    const cx = vx * T + T / 2;
    const cy = vy * T + T / 2;

    // 拉椅目标高亮
    if (player.action && player.action.type === 'pull') {
      const tp = 0.5 + 0.5 * Math.sin(now / 160);
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = `rgba(255,206,84,${0.45 + 0.4 * tp})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        player.action.tx * T + 4,
        player.action.ty * T + 4,
        T - 8,
        T - 8
      );
      ctx.restore();
    }

    // 待机呼吸光圈
    const breathe = player.isBusy() ? 0 : Math.sin(now / 420) * 1.6;
    ctx.beginPath();
    ctx.fillStyle = 'rgba(79,140,255,0.18)';
    ctx.arc(cx, cy, 19 + breathe, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = `26px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('🧑‍🎓', cx, cy + 2);

    // 移动时脚下拖影
    if (player.action && player.action.type === 'move') {
      ctx.beginPath();
      ctx.fillStyle = 'rgba(79,140,255,0.25)';
      ctx.ellipse(cx, cy + 15, 12, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawTurnVignette(teacher, sm) {
    if (sm.state !== GameState.PLAYING || !teacher || teacher.phase !== 'turn') return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    const grad = ctx.createRadialGradient(w / 2, 0, 90, w / 2, 0, h * 1.05);
    grad.addColorStop(0, 'rgba(255,70,70,0.20)');
    grad.addColorStop(0.55, 'rgba(200,30,30,0.07)');
    grad.addColorStop(1, 'rgba(120,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  _drawHint(now) {
    if (!this.hint || now >= this.hintUntil) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

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
    ctx.fillText(this.hint, w / 2, by + bh / 2 + 1);
  }

  /* ================= HUD ================= */

  updateHud({ sm, teacher, player, beat, shame }) {
    const d = this.dom;
    if (!d.phaseText) return;

    // 阶段文字
    if (sm.state === GameState.PLAYING && teacher) {
      const label = TEACHER_LABEL[teacher.phase] || teacher.phase;
      d.phaseText.textContent = teacher.phase === 'turn'
        ? `${label}！`
        : `${label} · 还剩 ${teacher.beatsLeft} 拍`;
    } else {
      d.phaseText.textContent = STATE_LABEL[sm.state] || sm.state;
    }

    // 行为提示
    if (d.statusText) {
      let text = '板书中，可以行动';
      if (player.isBusy()) {
        text = player.action && player.action.type === 'pull' ? '拉开座椅…' : '起身挪动中…';
      } else if (teacher && teacher.phase === 'turn') {
        text = '停下！老师回头了';
      } else if (teacher && teacher.phase === 'pace') {
        text = '老师踱步中，小心节拍';
      }
      d.statusText.textContent = sm.state === GameState.PLAYING ? text : '';
    }

    // 节拍
    if (d.beatFill) d.beatFill.style.width = `${(beat.beatProgress() * 100).toFixed(1)}%`;
    if (d.beatCount) d.beatCount.textContent = `拍 ${beat.beatIndex}`;

    // 羞愧条与压力
    const ratio = shame.value / SHAME_MAX;
    if (d.shameFill) {
      d.shameFill.style.width = `${(ratio * 100).toFixed(1)}%`;
      d.shameFill.style.backgroundPosition = `${(ratio * 100).toFixed(1)}% 0%`;
    }
    if (d.shameText) d.shameText.textContent = `${shame.value} / ${SHAME_MAX}`;

    if (d.stageWrap) {
      d.stageWrap.style.setProperty('--pressure', ratio.toFixed(3));
      d.stageWrap.classList.toggle(
        'shake',
        sm.state === GameState.PLAYING && teacher && teacher.phase === 'turn'
      );
    }
  }
}
