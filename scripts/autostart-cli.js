'use strict';

// 应用外单独开关自启动用的命令行入口：
//   node scripts/autostart-cli.js enable | disable | status
// 正常使用时不用它，托盘菜单里勾一下「开机自启动」即可。
const fs = require('fs');
const path = require('path');
const autostart = require('../src/autostart.js');

const EXE = path.join(__dirname, '..', 'release', 'win-unpacked', 'DailyWidget.exe');
const cmd = (process.argv[2] || 'status').toLowerCase();

if (cmd === 'status') {
  console.log('快捷方式:', autostart.lnkPath());
  console.log('状态:', autostart.isEnabled() ? '已启用' : '未启用');
  console.log('目标程序:', EXE, fs.existsSync(EXE) ? '(存在)' : '(不存在，请先 npm run package)');
  process.exit(0);
}

if (cmd === 'enable') {
  if (!fs.existsSync(EXE)) {
    console.error('找不到打包后的程序:', EXE);
    console.error('请先运行 npm run package 打包。');
    process.exit(1);
  }
  const lnk = autostart.enable({ exePath: EXE, appDir: path.dirname(EXE), isPackaged: true });
  console.log('已创建快捷方式:', lnk);
  process.exit(0);
}

if (cmd === 'disable') {
  console.log('已删除快捷方式:', autostart.disable());
  process.exit(0);
}

console.error('用法: node scripts/autostart-cli.js enable|disable|status');
process.exit(1);
