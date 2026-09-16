'use strict';

// 生成 build/icon.ico 供 electron-packager 使用，让 exe 图标不是默认的 Electron 标志。
const fs = require('fs');
const path = require('path');
const { iconPng, pngToIco } = require('../src/trayIcon.js');

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });

const size = 256;
const ico = pngToIco(iconPng(size), size);
const out = path.join(outDir, 'icon.ico');
fs.writeFileSync(out, ico);

console.log(`已生成 ${out} (${size}x${size}, ${ico.length} 字节)`);
