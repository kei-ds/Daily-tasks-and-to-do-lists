'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const LNK_NAME = '每日及代办.lnk';

function startupDir() {
  return path.join(
    process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming'),
    'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup',
  );
}

function lnkPath() {
  return path.join(startupDir(), LNK_NAME);
}

/** PowerShell 单引号字面量：内部的单引号写成两个。 */
const psQuote = s => "'" + String(s).replace(/'/g, "''") + "'";

function runPowerShell(script) {
  // 控制台代码页是 gb2312，直接传中文路径会被按 gb2312 解释而损坏。
  // -EncodedCommand 收 UTF-16LE 的 base64，完全绕开代码页。
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { windowsHide: true, timeout: 15000, encoding: 'utf8' },
  );
}

/**
 * 快捷方式指向什么由调用方决定：
 * 打包后指向 DailyWidget.exe，开发态指向 electron.exe + 应用目录参数。
 */
function resolveTarget({ exePath, appDir, isPackaged }) {
  if (isPackaged) {
    return { target: exePath, args: '', workDir: path.dirname(exePath) };
  }
  return { target: exePath, args: `"${appDir}"`, workDir: appDir };
}

/** 幂等地创建/更新启动文件夹里的快捷方式。 */
function enable({ exePath, appDir, isPackaged }) {
  const lnk = lnkPath();
  const { target, args, workDir } = resolveTarget({ exePath, appDir, isPackaged });

  fs.mkdirSync(startupDir(), { recursive: true });

  const script = [
    // 不关掉进度条的话，PowerShell 会往 stderr 吐一堆 CLIXML 噪音
    "$ProgressPreference='SilentlyContinue'",
    "$ErrorActionPreference='Stop'",
    '$ws = New-Object -ComObject WScript.Shell',
    `$sc = $ws.CreateShortcut(${psQuote(lnk)})`,
    `$sc.TargetPath = ${psQuote(target)}`,
    `$sc.Arguments = ${psQuote(args)}`,
    `$sc.WorkingDirectory = ${psQuote(workDir)}`,
    `$sc.IconLocation = ${psQuote(target + ',0')}`,
    "$sc.Description = '每日及代办'",
    '$sc.Save()',
  ].join('; ');

  runPowerShell(script);
  return lnk;
}

function disable() {
  const lnk = lnkPath();
  try {
    fs.unlinkSync(lnk);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return lnk;
}

function isEnabled() {
  return fs.existsSync(lnkPath());
}

// 安装界面上的「开机自启动」勾选框由 NSIS 写进这里，应用首次启动时消费一次。
// 键名和值都是 ASCII，用 reg.exe 读不受控制台代码页影响。
const REG_KEY = 'HKCU\\Software\\DailyWidget';

/** 读安装器写下的自启动偏好。没装过 / 没写过返回 null。 */
function readInstallerPreference() {
  try {
    const out = execFileSync('reg.exe', ['query', REG_KEY, '/v', 'Autostart'], {
      windowsHide: true,
      timeout: 5000,
      encoding: 'utf8',
    });
    const m = out.match(/Autostart\s+REG_SZ\s+(\S+)/);
    return m ? m[1] === '1' : null;
  } catch {
    return null; // 键不存在时 reg.exe 以非 0 退出
  }
}

module.exports = { enable, disable, isEnabled, readInstallerPreference, lnkPath, startupDir };
