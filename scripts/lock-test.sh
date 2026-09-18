#!/usr/bin/env bash
# 验证锁定功能，观察渠道是 Win32 窗口样式里的 WS_EX_TRANSPARENT 位——
# 也就是 setIgnoreMouseEvents 真正产生的效果，不依赖应用自报状态。
#
# WS_EX_TRANSPARENT (0x20) 置位 = 鼠标穿透，点击会落到下层窗口。
#
# 注意：这个脚本会删 data.json、改 settings.locked，所以全程跑在沙箱目录里。
# 绝对不要指向用户的真实数据目录 %APPDATA%\daily-widget —— 早期版本就是这么写的，
# 结果把用户攒的清单删光了。这里用 Electron 的 --user-data-dir 做隔离。
set -u
cd "$(dirname "$0")/.."

EXE="release/win-unpacked/DailyWidget.exe"
SANDBOX="${TMPDIR:-/tmp}/dw-lock-test"
rm -rf "$SANDBOX" 2>/dev/null
mkdir -p "$SANDBOX"
DATA="$SANDBOX/data.json"

[ -f "$EXE" ] || { echo "找不到 $EXE，先跑 npm run package"; exit 1; }

read_json() { node -e "const d=require(process.argv[1]);console.log($1)" "$DATA"; }
patch_json() { node -e "
  const fs=require('fs');
  const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
  $1
  fs.writeFileSync(process.argv[1], JSON.stringify(d,null,2));
" "$DATA"; }

# 读主窗口的扩展样式，输出 "<标题>|<WS_EX_TRANSPARENT 位>"
transparent_bit() { node scripts/win-style.js | cut -d'|' -f2; }

start_app()  { "$EXE" --user-data-dir="$SANDBOX" >/dev/null 2>&1 & sleep 6; }
stop_app()   { taskkill //F //IM DailyWidget.exe >/dev/null 2>&1; sleep 1; }
cleanup()    { stop_app; rm -rf "$SANDBOX" 2>/dev/null; }
trap cleanup EXIT

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

stop_app
echo "沙箱数据目录: $SANDBOX"

echo "--- 1. 默认启动应为不穿透 ---"
start_app
check "默认未锁定，无 WS_EX_TRANSPARENT" "$(transparent_bit)" "0"
stop_app

echo "--- 2. 上次退出时是锁定态，重启应恢复 ---"
patch_json "d.settings.locked = true;"
start_app
check "重启后恢复锁定，带 WS_EX_TRANSPARENT" "$(transparent_bit)" "32"

echo "--- 3. 锁定期间光标移到解锁按钮上应恢复可点击 ---"
read -r WX WY WW WH < <(node -e "
  const d=require(process.argv[1]);
  process.stdout.write([d.window.x,d.window.y,d.window.width,d.window.height].join(' '));
" "$DATA")
# 锁按钮在标题栏右侧，距右边缘约 40px、距顶部约 17px
BTN_X=$((WX + WW - 40))
BTN_Y=$((WY + 17))
echo "窗口 ${WW}x${WH} @ ${WX},${WY}；锁按钮约在 ${BTN_X},${BTN_Y}"

move_cursor "$BTN_X" "$BTN_Y"
check "光标在锁按钮上，穿透关闭" "$(transparent_bit)" "0"

echo "--- 4. 光标移开应恢复穿透 ---"
move_cursor $((WX + WW / 2)) $((WY + WH - 30))
check "光标离开锁按钮，穿透恢复" "$(transparent_bit)" "32"

stop_app
echo "--- 收尾：解除锁定 ---"
patch_json "d.settings.locked = false;"
echo "完成"
