'use strict';

// electron-builder 的 afterPack 钩子：自己给 exe 写图标和版本信息。
//
// package.json 里设了 signAndEditExecutable: false，electron-builder 就不会去碰
// winCodeSign（那个包在非管理员、没开开发者模式的 Windows 上解不开，会导致构建失败）。
// 代价是它也不写 exe 的图标和版本信息了，所以在这里补上。
//
// 参数完全照抄 app-builder-lib/out/winPackager.js 里 signAndEditResources 的写法，
// 保证「应用和功能」、任务管理器、文件属性里显示的信息和正常构建一致。

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const appInfo = context.packager.appInfo;
  const exePath = path.join(context.appOutDir, `${appInfo.productFilename}.exe`);
  const rcedit = path.join(__dirname, '..', 'build', 'cache', 'rcedit-x64.exe');
  const icon = path.join(__dirname, '..', 'build', 'icon.ico');

  if (!fs.existsSync(rcedit)) throw new Error(`找不到 rcedit: ${rcedit}（先跑一次 npm run package）`);
  if (!fs.existsSync(exePath)) throw new Error(`找不到待处理的 exe: ${exePath}`);

  const args = [
    exePath,
    '--set-version-string', 'FileDescription', appInfo.productName,
    '--set-version-string', 'ProductName', appInfo.productName,
    '--set-file-version', appInfo.shortVersion || appInfo.buildVersion,
    '--set-product-version', appInfo.getVersionInWeirdWindowsForm(),
    '--set-version-string', 'InternalName', appInfo.productFilename,
    '--set-version-string', 'OriginalFilename', `${appInfo.productFilename}.exe`,
  ];
  if (appInfo.copyright) args.push('--set-version-string', 'LegalCopyright', appInfo.copyright);
  if (appInfo.companyName) args.push('--set-version-string', 'CompanyName', appInfo.companyName);
  if (fs.existsSync(icon)) args.push('--set-icon', icon);

  execFileSync(rcedit, args, { stdio: 'inherit', timeout: 60000 });
  console.log(`[build] 已写入 exe 图标与版本信息: ${path.relative(process.cwd(), exePath)}`);
};
