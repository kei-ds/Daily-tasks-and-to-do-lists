'use strict';

const path = require('path');
const { BrowserWindow, ipcMain, screen } = require('electron');

const MIN_W = 240;
const MIN_H = 180;
const SAVE_BOUNDS_DEBOUNCE = 500;
// 缩放手柄用主进程轮询实现。加个上限，防止 mouseup 丢失时会话永远不结束。
const RESIZE_MAX_MS = 60 * 1000;
// 光标静止这么久就认为已经松手（见下面 endResize 的说明）。
const RESIZE_IDLE_MS = 1500;

let win = null;
let saveTimer = null;
let session = null;
let clickThrough = false;
// 锁定后整窗鼠标穿透，但解锁按钮那一小块得保持可点。
// 靠主进程轮询光标位置来判断（和缩放手柄同一套做法）。
const LOCK_POLL_MS = 50;
const LOCK_PAD = 3; // 外扩几像素，按钮本身才 22px，不扩很难点中
let lockTimer = null;
let lockHitRect = null; // 锁按钮相对窗口内容区的位置，由渲染进程上报

function setClickThrough(enabled) {
  if (!win || win.isDestroyed()) return;
  const next = !!enabled;
  if (next === clickThrough) return;
  clickThrough = next;
  // 这里不能用 forward: true —— 实测在 transparent 窗口上 Electron 并不会
  // 把 mousemove 转发给渲染进程（事件计数始终为 0），所以只能自己轮询。
  win.setIgnoreMouseEvents(clickThrough);
}

function isClickThrough() {
  return clickThrough;
}

/** 渲染进程上报锁按钮的位置，坐标是相对窗口内容区的 CSS 像素。 */
function setLockHitRect(rect) {
  lockHitRect = rect && typeof rect.left === 'number' ? rect : null;
}

function startLockPolling() {
  if (lockTimer) return;
  lockTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !lockHitRect) return;
    const b = win.getBounds();
    const p = screen.getCursorScreenPoint();
    // 无边框窗口的内容区原点就是窗口原点，两边都是 DIP，直接减即可
    const x = p.x - b.x;
    const y = p.y - b.y;
    const r = lockHitRect;
    const over = x >= r.left - LOCK_PAD && x <= r.right + LOCK_PAD
              && y >= r.top - LOCK_PAD && y <= r.bottom + LOCK_PAD;
    setClickThrough(!over);
  }, LOCK_POLL_MS);
}

function stopLockPolling() {
  if (lockTimer) {
    clearInterval(lockTimer);
    lockTimer = null;
  }
}

/**
 * 恢复上次的位置和尺寸。若窗口已经完全落在所有显示器之外
 * （比如副屏被拔掉了），就只恢复尺寸，位置交给系统决定。
 */
function restoreBounds(saved) {
  const fallback = { width: saved.width || 460, height: saved.height || 400 };
  if (typeof saved.x !== 'number' || typeof saved.y !== 'number') return fallback;

  const b = { x: saved.x, y: saved.y, width: saved.width, height: saved.height };
  const { workArea } = screen.getDisplayMatching(b);
  const margin = 40;
  const visible =
    b.x < workArea.x + workArea.width - margin &&
    b.x + b.width > workArea.x + margin &&
    b.y < workArea.y + workArea.height - margin &&
    b.y + b.height > workArea.y + margin;

  return visible ? b : fallback;
}

function scheduleSaveBounds(store) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) return;
    const b = win.getBounds();
    store.data.window = { ...store.data.window, x: b.x, y: b.y, width: b.width, height: b.height };
    store.saveSoon();
  }, SAVE_BOUNDS_DEBOUNCE);
}

function endResize(store) {
  if (!session) return;
  clearInterval(session.timer);
  session = null;
  scheduleSaveBounds(store);
}

function registerResizeIpc(store) {
  ipcMain.on('resize:start', (_e, dir) => {
    if (!win || win.isDestroyed()) return;
    if (session) endResize(store);
    if (typeof dir !== 'string' || !/^[nsew]{1,2}$/.test(dir)) return;

    session = {
      dir,
      base: win.getBounds(),
      start: screen.getCursorScreenPoint(),
      startedAt: Date.now(),
      last: screen.getCursorScreenPoint(),
      idleMs: 0,
      timer: null,
    };

    session.timer = setInterval(() => {
      if (!session || !win || win.isDestroyed()) return;
      if (Date.now() - session.startedAt > RESIZE_MAX_MS) return endResize(store);

      const p = screen.getCursorScreenPoint();

      // 鼠标移出窗口后松手，renderer 收不到 mouseup，会话会一直挂着继续跟着鼠标缩放。
      // 光标静止一段时间就当作已经松手，把会话收掉——比窗口失控要温和得多。
      if (p.x === session.last.x && p.y === session.last.y) {
        session.idleMs += 16;
        if (session.idleMs > RESIZE_IDLE_MS) return endResize(store);
      } else {
        session.idleMs = 0;
        session.last = p;
      }

      const dx = p.x - session.start.x;
      const dy = p.y - session.start.y;
      let { x, y, width, height } = session.base;

      // dir 只由 n/s/e/w 组成，includes 判断不会有假阳性
      if (session.dir.includes('e')) width = session.base.width + dx;
      if (session.dir.includes('s')) height = session.base.height + dy;
      if (session.dir.includes('w')) { width = session.base.width - dx; x = session.base.x + dx; }
      if (session.dir.includes('n')) { height = session.base.height - dy; y = session.base.y + dy; }

      // 触底时锚定对边，否则继续拖动会让窗口"跳"回去
      if (width < MIN_W) {
        if (session.dir.includes('w')) x = session.base.x + session.base.width - MIN_W;
        width = MIN_W;
      }
      if (height < MIN_H) {
        if (session.dir.includes('n')) y = session.base.y + session.base.height - MIN_H;
        height = MIN_H;
      }

      win.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }, false);
    }, 16);
  });

  ipcMain.on('resize:end', () => endResize(store));
}

function createWindow(store) {
  const saved = store.data.window;
  const bounds = restoreBounds(saved);

  win = new BrowserWindow({
    ...bounds,
    minWidth: MIN_W,
    minHeight: MIN_H,
    frame: false,
    // 注意：transparent 会让 Electron 强制去掉 WS_THICKFRAME，
    // 所以窗口没有原生缩放边框，边缘缩放由 renderer 的手柄 + 上面的 IPC 实现。
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    show: false,
    title: '每日及代办',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.once('ready-to-show', () => win.show());
  win.on('resize', () => scheduleSaveBounds(store));
  win.on('move', () => scheduleSaveBounds(store));

  // 窗口自身的失焦/隐藏也要结束缩放会话，作为 mouseup 丢失时的兜底
  win.on('blur', () => endResize(store));
  win.on('hide', () => endResize(store));

  win.on('closed', () => { win = null; clickThrough = false; });

  return win;
}

function getWindow() {
  return win;
}

function showWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function toggleWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible() && !win.isMinimized()) win.hide();
  else showWindow();
}

module.exports = {
  createWindow, registerResizeIpc, getWindow, showWindow, toggleWindow,
  setClickThrough, isClickThrough, setLockHitRect, startLockPolling, stopLockPolling,
};
