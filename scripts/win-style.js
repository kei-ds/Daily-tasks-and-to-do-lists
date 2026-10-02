'use strict';

// 读「每日及代办」主窗口的状态，输出四个字段：
//   <窗口标题>|<WS_EX_TRANSPARENT>|<WS_EX_TOOLWINDOW>|<IsWindowVisible>
//
// WS_EX_TRANSPARENT (0x20) 置位 = 窗口鼠标穿透，也就是 Electron 的
// setIgnoreMouseEvents(true) 真正产生的系统级效果。
//
// WS_EX_TOOLWINDOW (0x80) 置位 = 不在任务栏和 Alt+Tab 里出现。
// 注意 Electron 的 skipTaskbar 走的是任务栏 COM 接口 DeleteTab，
// 并不改这个位，所以判断「有没有从任务栏消失」不能只看它，
// 得结合窗口可见性一起看。
//
// 直接读系统状态比让应用自报可信得多。单独放一个文件是为了避开
// 在 bash 里嵌多行 PowerShell 的引号地狱。

const { execFileSync } = require('child_process');

const ps = `
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class WinStyle {
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
}
'@
$p = Get-Process DailyWidget -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output 'NO-WINDOW|||'; exit }
$h = $p.MainWindowHandle
$ex = [WinStyle]::GetWindowLong($h, -20)
$vis = if ([WinStyle]::IsWindowVisible($h)) { 1 } else { 0 }
Write-Output ($p.MainWindowTitle + '|' + ($ex -band 0x20) + '|' + ($ex -band 0x80) + '|' + $vis)
`;

const encoded = Buffer.from(ps, 'utf16le').toString('base64');
const out = execFileSync('powershell.exe',
  ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
  { encoding: 'utf8', windowsHide: true, timeout: 15000 });

process.stdout.write(out.trim());
