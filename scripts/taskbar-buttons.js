'use strict';

// 列出任务栏上的按钮名称，用来判断某个程序有没有出现在任务栏里。
//
// 为什么不截屏：任务栏可能是自动隐藏的，截屏根本拍不到；而且透明分层窗口
// 用 GDI 截屏也抓不到。这里走 UI Automation，不管任务栏可不可见都能枚举。

const { execFileSync } = require('child_process');

const ps = `
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class Tb {
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr FindWindow(string c, string n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
}
'@

$h = [Tb]::FindWindow("Shell_TrayWnd", $null)
if ($h -eq [IntPtr]::Zero) { Write-Output 'TASKBAER=missing'; exit }
Write-Output ("任务栏窗口可见=" + ([Tb]::IsWindowVisible($h)))

$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ClassNameProperty, "Shell_TrayWnd")
$tray = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
if ($tray -eq $null) { Write-Output 'UIA 找不到任务栏'; exit }

$btnCond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::Button)
$found = $tray.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
Write-Output ("任务栏按钮数=" + $found.Count)
foreach ($b in $found) {
  $n = $b.Current.Name
  if ($n) { Write-Output ("  [" + $n + "]") }
}
`;

const encoded = Buffer.from(ps, 'utf16le').toString('base64');
const out = execFileSync('powershell.exe',
  ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
  { encoding: 'utf8', windowsHide: true, timeout: 30000 });

process.stdout.write(out);
