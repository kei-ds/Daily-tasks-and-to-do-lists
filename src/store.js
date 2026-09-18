'use strict';

const fs = require('fs');
const path = require('path');

const SAVE_DEBOUNCE = 300;

function defaultData() {
  return {
    version: 1,
    window: { x: null, y: null, width: 460, height: 400, alpha: 0.82 },
    settings: { autostart: false, locked: false },
    lastResetDay: null,
    daily: [],
    todo: [],
  };
}

/** 把读到的对象补齐成完整结构，容忍缺字段或类型不对。 */
function normalize(raw) {
  const d = defaultData();
  if (!raw || typeof raw !== 'object') return d;

  if (raw.window && typeof raw.window === 'object') {
    for (const k of ['x', 'y', 'width', 'height', 'alpha']) {
      if (typeof raw.window[k] === 'number' && Number.isFinite(raw.window[k])) d.window[k] = raw.window[k];
    }
  }
  if (raw.settings && typeof raw.settings === 'object') {
    if (typeof raw.settings.autostart === 'boolean') d.settings.autostart = raw.settings.autostart;
    if (typeof raw.settings.locked === 'boolean') d.settings.locked = raw.settings.locked;
  }
  if (typeof raw.lastResetDay === 'string') d.lastResetDay = raw.lastResetDay;

  for (const key of ['daily', 'todo']) {
    if (Array.isArray(raw[key])) d[key] = raw[key].filter(isValidItem).map(it => ({
      id: String(it.id),
      text: String(it.text),
      done: !!it.done,
      completedAt: typeof it.completedAt === 'number' ? it.completedAt : null,
      createdAt: typeof it.createdAt === 'number' ? it.createdAt : Date.now(),
    }));
  }
  return d;
}

function isValidItem(it) {
  return it && typeof it === 'object' && it.id != null && typeof it.text === 'string';
}

class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.tmpPath = filePath + '.tmp';
    this.bakPath = filePath + '.bak';
    this.data = defaultData();
    this._timer = null;
  }

  load() {
    try {
      const text = fs.readFileSync(this.filePath, 'utf8');
      this.data = normalize(JSON.parse(text));
    } catch (err) {
      if (err.code === 'ENOENT') {
        if (fs.existsSync(this.bakPath)) {
          console.error(`[store] ${this.filePath} 不存在，但备份还在: ${this.bakPath}`);
        }
        this.data = defaultData();
      } else {
        // JSON 损坏：留一份现场再重建，别让程序起不来。
        // 注意用 .corrupt 而不是 .bak —— .bak 存的是上一个好版本，不能被毁掉。
        console.error('[store] 读取失败，备份并重建:', err.message);
        try { fs.renameSync(this.filePath, this.filePath + '.corrupt'); } catch { /* 备份失败就算了 */ }
        this.data = defaultData();
      }
    }
    return this.data;
  }

  /** 去抖保存，避免连续勾选时疯狂写盘。 */
  saveSoon() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => { this._timer = null; this.flush(); }, SAVE_DEBOUNCE);
  }

  /** 立即落盘。先写 .tmp 再改名，避免崩溃时留下半截 JSON。 */
  flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.tmpPath, JSON.stringify(this.data, null, 2), 'utf8');
      // 覆盖前把上一版留一份。清单是用户一点点攒出来的，删了没法找回来；
      // 有 .bak 的话至少误删 data.json、写坏文件这类事故还能手动捞。
      try {
        fs.copyFileSync(this.filePath, this.bakPath);
      } catch {
        // 首次写入时还没有旧文件，正常
      }
      fs.renameSync(this.tmpPath, this.filePath);
    } catch (err) {
      console.error('[store] 写入失败:', err.message);
    }
  }
}

module.exports = { Store, defaultData, normalize };
