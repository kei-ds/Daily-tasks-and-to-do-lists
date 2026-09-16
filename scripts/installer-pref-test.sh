#!/usr/bin/env bash
# 验证「安装界面勾选框 -> 注册表 -> 应用首次启动建快捷方式」这条链路。
# 模拟安装器写下的注册表值，然后跑打包好的程序，看它有没有照做。
set -u
cd "$(dirname "$0")/.."

EXE="release/win-unpacked/DailyWidget.exe"
LNK="$APPDATA/Microsoft/Windows/Start Menu/Programs/Startup/每日及代办.lnk"
DATA="$APPDATA/daily-widget/data.json"
REG='HKCU\Software\DailyWidget'

clean() {
  taskkill //F //IM DailyWidget.exe >/dev/null 2>&1
  sleep 1
  rm -f "$LNK" "$DATA"
  reg delete "$REG" //f >/dev/null 2>&1 || true
}

check() { # 名称 期望(yes/no)
  local name="$1" want="$2" got
  [ -f "$LNK" ] && got=yes || got=no

  # settings.autostart 是布尔值，统一成 yes/no 再比
  local pref=no
  if [ -f "$DATA" ]; then
    pref=$(node -e "
      const fs=require('fs');
      const d=JSON.parse(fs.readFileSync(process.env.APPDATA+'/daily-widget/data.json','utf8'));
      process.stdout.write(d.settings.autostart ? 'yes' : 'no');
    " 2>/dev/null || echo "读取失败")
  fi

  if [ "$got" = "$want" ] && [ "$pref" = "$want" ]; then
    echo "PASS  $name  — 快捷方式=$got settings.autostart=$pref"
  else
    echo "FAIL  $name  — 快捷方式=$got（期望 $want） settings.autostart=$pref（期望 $want）"
    return 1
  fi
}

run_case() { # 名称 注册表值 期望
  local name="$1" val="$2" want="$3"
  echo "--- $name（安装器写入 Autostart=$val）---"
  clean
  reg add "$REG" //v Autostart //t REG_SZ //d "$val" //f >/dev/null 2>&1

  "$EXE" >/dev/null 2>&1 &
  sleep 6
  taskkill //F //IM DailyWidget.exe >/dev/null 2>&1
  sleep 1
  check "$name" "$want"
}

run_case "勾选了自启动" "1" "yes"
run_case "没勾自启动" "0" "no"

# 再验一次「注册表没有这个键」的干净机器上的行为（等价于没装过安装器）
echo "--- 全新机器（注册表里没有这个键）---"
clean
"$EXE" >/dev/null 2>&1 &
sleep 6
taskkill //F //IM DailyWidget.exe >/dev/null 2>&1
sleep 1
check "无注册表偏好" "no"

clean
