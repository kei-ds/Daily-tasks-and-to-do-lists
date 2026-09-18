'use strict';

// 读「每日及代办」主窗口的扩展样式，输出 "<窗口标题>|<WS_EX_TRANSPARENT 位>"。
//
// WS_EX_TRANSPARENT (0x20) 置位表示窗口鼠标穿透——也就是 Electron 的
// setIgnoreMouseEvents(true) 真正产生的系统级效果。用它来验证锁定功能，
// 比让应用自报状态可信得多。
//
// 单独放一个文件是为了避开在 bash 里嵌多行 PowerShell 的引号地狱。

const { execFileSync } = require('child_process');

const ps = `
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class WinStyle {
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
}
'@
$p = Get-Process DailyWidget -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle } | Select-Object -First 1
if (-not $p) { Write-Output 'NO-WINDOW|'; exit }
$ex = [WinStyle]::GetWindowLong($p.MainWindowHandle, -20)
Write-Output ($p.MainWindowTitle + '|' + ($ex -band 0x20))
`;

const encoded = Buffer.from(ps, 'utf16le').toString('base64');
const out = execFileSync('powershell.exe',
  ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
  { encoding: 'utf8', windowsHide: true, timeout: 15000 });

process.stdout.write(out.trim());
