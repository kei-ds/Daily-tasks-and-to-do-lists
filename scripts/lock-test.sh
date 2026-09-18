#!/usr/bin/env bash
# 验证锁定功能，观察渠道是 Win32 窗口样式里的 WS_EX_TRANSPARENT 位——
# 也就是 setIgnoreMouseEvents 真正产生的效果，不依赖应用自报状态。
#
# WS_EX_TRANSPARENT (0x20) 置位 = 鼠标穿透，点击会落到下层窗口。
set -u
cd "$(dirname "$0")/.."

EXE="release/win-unpacked/DailyWidget.exe"
DATA="$APPDATA/daily-widget/data.json"
PS="\$ProgressPreference='SilentlyContinue'"

# 读主窗口的扩展样式，输出是否带 WS_EX_TRANSPARENT
read_style() {
  powershell.exe -NoProfile -NonInteractive -EncodedCommand "$(node -e "
    const q = process.argv[1] + \`
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport(\\\"user32.dll\\\")] public static extern int GetWindowLong(IntPtr h, int i);
}
'@
\\\$p = Get-Process DailyWidget -ErrorAction SilentlyContinue | Where-Object { \\\$_.MainWindowTitle } | Select-Object -First 1
if (-not \\\$p) { Write-Output 'NO-WINDOW'; exit }
\\\$ex = [W]::GetWindowLong(\\\$p.MainWindowHandle, -20)
Write-Output (\\\$p.MainWindowTitle + '|' + (\\\$ex -band 0x20))
\`;
    process.stdout.write(Buffer.from(q,'utf16le').toString('base64'));
  " "$PS")" 2>/dev/null | tr -d '\r'
}

start_app() {
  "$EXE" >/dev/null 2>&1 &
  sleep 6
}

stop_app() {
  taskkill //F //IM DailyWidget.exe >/dev/null 2>&1
  sleep 1
}

set_locked() { # true/false
  node -e "
    const fs=require('fs');
    const f=process.env.APPDATA+'/daily-widget/data.json';
    const d=JSON.parse(fs.readFileSync(f,'utf8'));
    d.settings.locked = ($1 === 'true');
    fs.writeFileSync(f, JSON.stringify(d,null,2));
  "
}

check() { # 名称 实际 期望
  if [ "$2" = "$3" ]; then echo "PASS  $1  —  $2"
  else echo "FAIL  $1  —  实际 '$2'，期望 '$3'"; fi
}

move_cursor() { # x y
  powershell.exe -NoProfile -NonInteractive -Command \
    "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($1,$2)" \
    >/dev/null 2>&1
  sleep 1
}

# ---- 准备：清掉数据，指向本机打包产物 ----
[ -f "$EXE" ] || { echo "找不到 $EXE，先跑 npm run package"; exit 1; }
stop_app
rm -f "$DATA"

echo "--- 1. 默认启动应为不穿透 ---"
start_app
check "默认未锁定，无 WS_EX_TRANSPARENT" "$(read_style | cut -d'|' -f2)" "0"
stop_app

echo "--- 2. 上次退出时是锁定态，重启应恢复 ---"
node -e "
  const fs=require('fs');
  const f=process.env.APPDATA+'/daily-widget/data.json';
  const d=JSON.parse(fs.readFileSync(f,'utf8'));
  d.settings.locked = true;
  fs.writeFileSync(f, JSON.stringify(d,null,2));
  console.log('已把 settings.locked 设为 true');
"
start_app
check "重启后恢复锁定，带 WS_EX_TRANSPARENT" "$(read_style | cut -d'|' -f2)" "32"

echo "--- 3. 锁定期间光标移到解锁按钮上应恢复可点击 ---"
# 锁按钮在标题栏右侧，距离右边缘约 40px、距顶部约 17px（窗口 520 宽时）
BOUNDS=$(node -e "
  const fs=require('fs');
  const d=JSON.parse(fs.readFileSync(process.env.APPDATA+'/daily-widget/data.json','utf8'));
  process.stdout.write([d.window.x,d.window.y,d.window.width,d.window.height].join(' '));
")
read -r WX WY WW WH <<< "$BOUNDS"
BTN_X=$((WX + WW - 40))
BTN_Y=$((WY + 17))
echo "窗口 ${WW}x${WH} @ ${WX},${WY}；锁按钮约在 ${BTN_X},${BTN_Y}"

move_cursor "$BTN_X" "$BTN_Y"
check "光标在锁按钮上，穿透关闭" "$(read_style | cut -d'|' -f2)" "0"

echo "--- 4. 光标移开应恢复穿透 ---"
move_cursor $((WX + WW / 2)) $((WY + WH - 30))
check "光标离开锁按钮，穿透恢复" "$(read_style | cut -d'|' -f2)" "32"

stop_app
echo "--- 收尾：解除锁定并重启 ---"
node -e "
  const fs=require('fs');
  const f=process.env.APPDATA+'/daily-widget/data.json';
  const d=JSON.parse(fs.readFileSync(f,'utf8'));
  d.settings.locked = false;
  fs.writeFileSync(f, JSON.stringify(d,null,2));
"
