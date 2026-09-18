'use strict';

const fs = require('fs');
const path = require('path');
const { app, ipcMain, powerMonitor } = require('electron');

const logic = require('./logic.js');
const { Store } = require('./store.js');
const {
  createWindow, registerResizeIpc, getWindow, showWindow,
  setClickThrough, setLockHitRect, startLockPolling, stopLockPolling,
} = require('./window.js');
const { createTray, destroyTray } = require('./tray.js');
const autostart = require('./autostart.js');

const MIN_ALPHA = 0.1;
const MAX_ALPHA = 1;

const SELFTEST = process.argv.includes('--selftest');

// 两个进程同时写同一个 data.json 会写坏，对开机自启的应用尤其要防。
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const dataDir = app.getPath('userData');
const dataFile = path.join(dataDir, 'data.json');
const store = new Store(dataFile);
let quitting = false;
let trayApi = null;

function snapshot() {
  return {
    daily: store.data.daily,
    todo: store.data.todo,
    window: store.data.window,
    settings: store.data.settings,
    ttl: logic.TTL,
  };
}

function broadcast() {
  const win = getWindow();
  if (win && !win.isDestroyed()) win.webContents.send('state:changed', snapshot());
}

/** 每秒跑一次：跨过 4:00 就重置每日事项，到点的代办就清掉。 */
function tick() {
  let changed = false;
  if (logic.applyDailyReset(store.data)) changed = true;
  if (logic.sweepExpired(store.data)) changed = true;
  if (!changed) return;
  store.saveSoon();
  broadcast();
}

function findItem(listName, id) {
  const list = store.data[listName];
  if (!Array.isArray(list)) return null;
  return list.find(it => it.id === id) || null;
}

function registerItemIpc() {
  ipcMain.handle('state:get', () => snapshot());

  ipcMain.handle('item:add', (_e, { list, text }) => {
    const trimmed = String(text || '').trim();
    if (!trimmed || !Array.isArray(store.data[list])) return snapshot();
    store.data[list].push(logic.makeItem(trimmed));
    store.saveSoon();
    broadcast();
    return snapshot();
  });

  ipcMain.handle('item:remove', (_e, { list, id }) => {
    if (!Array.isArray(store.data[list])) return snapshot();
    store.data[list] = store.data[list].filter(it => it.id !== id);
    store.saveSoon();
    broadcast();
    return snapshot();
  });

  ipcMain.handle('item:toggle', (_e, { list, id }) => {
    const it = findItem(list, id);
    if (!it) return snapshot();
    it.done = !it.done;
    // 反勾选必须清掉完成时间，否则代办会在 10 分钟时凭空消失
    it.completedAt = it.done ? Date.now() : null;
    store.saveSoon();
    broadcast();
    return snapshot();
  });

  ipcMain.handle('item:edit', (_e, { list, id, text }) => {
    const it = findItem(list, id);
    const trimmed = String(text || '').trim();
    if (!it || !trimmed) return snapshot();
    it.text = trimmed;
    store.saveSoon();
    broadcast();
    return snapshot();
  });

  ipcMain.handle('ui:setAlpha', (_e, alpha) => {
    const n = Number(alpha);
    if (!Number.isFinite(n)) return snapshot();
    store.data.window.alpha = Math.min(MAX_ALPHA, Math.max(MIN_ALPHA, n));
    store.saveSoon();
    return snapshot();
  });

  ipcMain.on('ui:hide', () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.hide();
  });

  ipcMain.handle('ui:setLocked', (_e, locked) => {
    applyLock(!!locked);
    return snapshot();
  });

  // 渲染进程上报锁按钮的位置，主进程靠它把这一小块从穿透区域里挖出来
  ipcMain.on('ui:lockHitRect', (_e, rect) => setLockHitRect(rect));
}

/** 锁定：整窗鼠标穿透 + 位置固定，只有渲染层的锁按钮可点。 */
function applyLock(locked) {
  store.data.settings.locked = locked;
  if (locked) startLockPolling();
  else stopLockPolling();
  setClickThrough(locked);
  store.saveSoon();
  broadcast();
  if (trayApi) trayApi.refresh();
}

function quit() {
  quitting = true;
  app.quit();
}

app.on('second-instance', () => showWindow());
app.on('window-all-closed', () => { /* 保持托盘存活，退出只能走托盘菜单 */ });
app.on('before-quit', () => { quitting = true; store.flush(); });
app.on('will-quit', () => destroyTray());

app.whenReady().then(async () => {
  app.setAppUserModelId('com.local.dailywidget');

  // 必须在 load() 之前判断：data.json 存在与否就是「是不是新装的」的判据
  const freshInstall = !fs.existsSync(dataFile);

  store.load();
  // 启动时先跑一次：关机期间错过的 4:00 重置和 10 分钟过期都在这里补上
  tick();

  registerItemIpc();
  registerResizeIpc(store);
  createWindow(store);

  // 安装界面上的勾选框写下的偏好，只在首次启动时消费一次。
  // 必须放在下面 isEnabled() 之前——首次运行时 .lnk 还不存在，
  // 先问 isEnabled() 的话会被直接改回 false，偏好就丢了。
  if (freshInstall && autostart.readInstallerPreference() === true) {
    try {
      autostart.enable({ exePath: process.execPath, appDir: app.getAppPath(), isPackaged: app.isPackaged });
    } catch (err) {
      console.error('[autostart] 首次创建失败:', err.message);
    }
  }

  // 这之后启动文件夹里的 .lnk 才是权威：用户可能直接把它删了，托盘里的勾选状态得跟着变
  store.data.settings.autostart = autostart.isEnabled();
  if (store.data.settings.autostart) {
    // 自愈：每次启动重建一次快捷方式，程序目录挪了也能自动修好
    try {
      autostart.enable({ exePath: process.execPath, appDir: app.getAppPath(), isPackaged: app.isPackaged });
    } catch (err) {
      console.error('[autostart] 自愈失败:', err.message);
    }
  }
  store.saveSoon();

  trayApi = createTray(store, { onQuit: quit, dataDir, onToggleLock: () => applyLock(!store.data.settings.locked) });

  // 上次退出时是锁定状态的话，这里恢复。放在建托管之后，
  // 因为 applyLock 要刷新托盘菜单。
  if (store.data.settings.locked) applyLock(true);

  const win = getWindow();
  win.on('close', e => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
  });

  setInterval(tick, 1000);
  powerMonitor.on('resume', tick);
  powerMonitor.on('unlock-screen', tick);

  if (SELFTEST) {
    try {
      await require('../scripts/selftest.js').run({ win, store, app });
    } catch (err) {
      console.error('SELFTEST 异常:', err && err.stack || err);
      process.exitCode = 1;
    }
    process.exit(process.exitCode || 0);
  }
});
