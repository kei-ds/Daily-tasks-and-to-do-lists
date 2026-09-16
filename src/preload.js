'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 初始状态 + 订阅主进程广播（主进程是唯一数据源）
  getState: () => ipcRenderer.invoke('state:get'),
  onState: cb => {
    const h = (_e, state) => cb(state);
    ipcRenderer.on('state:changed', h);
    return () => ipcRenderer.removeListener('state:changed', h);
  },

  // 事项操作
  add: (list, text) => ipcRenderer.invoke('item:add', { list, text }),
  remove: (list, id) => ipcRenderer.invoke('item:remove', { list, id }),
  toggle: (list, id) => ipcRenderer.invoke('item:toggle', { list, id }),
  edit: (list, id, text) => ipcRenderer.invoke('item:edit', { list, id, text }),

  // 窗口
  setAlpha: alpha => ipcRenderer.invoke('ui:setAlpha', alpha),
  resizeStart: dir => ipcRenderer.send('resize:start', dir),
  resizeEnd: () => ipcRenderer.send('resize:end'),
  hide: () => ipcRenderer.send('ui:hide'),
});
