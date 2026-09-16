'use strict';

const { Tray, Menu, nativeImage, shell, app } = require('electron');
const { iconPng } = require('./trayIcon.js');
const autostart = require('./autostart.js');
const { getWindow, toggleWindow } = require('./window.js');

// 必须存模块级变量，否则会被 GC 回收，托盘图标会莫名消失。
let tray = null;

function buildIcon() {
  const img = nativeImage.createFromBuffer(iconPng(16));
  img.addRepresentation({ scaleFactor: 2.0, buffer: iconPng(32) });
  return img;
}

function createTray(store, { onQuit, dataDir }) {
  tray = new Tray(buildIcon());
  tray.setToolTip('每日及代办');
  tray.on('click', () => toggleWindow());

  const refresh = () => {
    const win = getWindow();
    const shown = !!win && !win.isDestroyed() && win.isVisible() && !win.isMinimized();
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: shown ? '隐藏' : '显示', click: () => toggleWindow() },
      { type: 'separator' },
      {
        label: '开机自启动',
        type: 'checkbox',
        checked: store.data.settings.autostart,
        click: menuItem => {
          try {
            if (menuItem.checked) {
              autostart.enable({ exePath: process.execPath, appDir: app.getAppPath(), isPackaged: app.isPackaged });
            } else {
              autostart.disable();
            }
            store.data.settings.autostart = menuItem.checked;
          } catch (err) {
            console.error('[autostart] 设置失败:', err.message);
            menuItem.checked = !menuItem.checked;
            store.data.settings.autostart = menuItem.checked;
          }
          store.saveSoon();
        },
      },
      { label: '打开数据文件夹', click: () => shell.openPath(dataDir) },
      { type: 'separator' },
      { label: '退出', click: onQuit },
    ]));
  };

  refresh();
  // 菜单里的「显示/隐藏」文案依赖窗口当前可见状态。
  // 设了 setContextMenu 之后右键由 Electron 自己弹出，所以只能靠窗口事件驱动刷新。
  const win = getWindow();
  if (win) {
    win.on('show', refresh);
    win.on('hide', refresh);
    win.on('minimize', refresh);
    win.on('restore', refresh);
  }

  return { tray: () => tray, refresh };
}

function destroyTray() {
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
}

module.exports = { createTray, destroyTray };
