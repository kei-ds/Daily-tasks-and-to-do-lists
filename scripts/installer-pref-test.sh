#!/usr/bin/env bash
# 验证「安装界面勾选框 -> 注册表 -> 应用首次启动建快捷方式」这条链路。
# 模拟安装器写下的注册表值，然后跑打包好的程序，看它有没有照做。
#
# 注意：数据全程跑在沙箱目录里（--user-data-dir），绝不能用真实目录——
# 早期版本直接删 %APPDATA%\daily-widget\data.json，把用户攒的清单删光了。
#
# 启动文件夹里的 .lnk 是真实系统资源，这个脚本确实会动它，
# 所以开头先记下原状，结尾原样恢复。
set -u
cd "$(dirname "$0")/.."

EXE="release/win-unpacked/DailyWidget.exe"
LNK="$APPDATA/Microsoft/Windows/Start Menu/Programs/Startup/每日及代办.lnk"
REG='HKCU\Software\DailyWidget'

SANDBOX="${TMPDIR:-/tmp}/dw-pref-test"
rm -rf "$SANDBOX" 2>/dev/null
mkdir -p "$SANDBOX"
DATA="$SANDBOX/data.json"

[ -f "$EXE" ] || { echo "找不到 $EXE，先跑 npm run package"; exit 1; }

# 记下启动项原状，结束时恢复
LNK_EXISTED=no
[ -f "$LNK" ] && LNK_EXISTED=yes
REG_BACKUP=$(reg query "$REG" //v Autostart 2>/dev/null | grep -oE '[01]$' || true)
echo "启动项原状: .lnk=$LNK_EXISTED  注册表=$([ -n "$REG_BACKUP" ] && echo "$REG_BACKUP" || echo '无')"

clean() {
  taskkill //F //IM DailyWidget.exe >/dev/null 2>&1
  sleep 1
  rm -f "$LNK" "$DATA"
  reg delete "$REG" //f >/dev/null 2>&1 || true
}

restore() {
  clean
  rm -rf "$SANDBOX" 2>/dev/null
  node scripts/autostart-cli.js enable >/dev/null 2>&1 || true
  echo "已恢复启动项: $(node scripts/autostart-cli.js status 2>/dev/null | tail -1)"
}
trap restore EXIT

check() { # 名称 期望(yes/no)
  local name="$1" want="$2" got pref=no
  [ -f "$LNK" ] && got=yes || got=no
  if [ -f "$DATA" ]; then
    pref=$(node -e "
      const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
      process.stdout.write(d.settings.autostart ? 'yes' : 'no');
    " "$DATA" 2>/dev/null || echo "读取失败")
  fi
  if [ "$got" = "$want" ] && [ "$pref" = "$want" ]; then
    echo "PASS  $name  — 快捷方式=$got settings.autostart=$pref"
  else
    echo "FAIL  $name  — 快捷方式=$got（期望 $want） settings.autostart=$pref（期望 $want）"
  fi
}

run_case() { # 名称 注册表值 期望
  local name="$1" val="$2" want="$3"
  echo "--- $name（安装器写入 Autostart=$val）---"
  clean
  reg add "$REG" //v Autostart //t REG_SZ //d "$val" //f >/dev/null 2>&1
  "$EXE" --user-data-dir="$SANDBOX" >/dev/null 2>&1 &
  sleep 6
  taskkill //F //IM DailyWidget.exe >/dev/null 2>&1
  sleep 1
  check "$name" "$want"
}

run_case "勾选了自启动" "1" "yes"
run_case "没勾自启动" "0" "no"

echo "--- 全新机器（注册表里没有这个键）---"
clean
"$EXE" --user-data-dir="$SANDBOX" >/dev/null 2>&1 &
sleep 6
taskkill //F //IM DailyWidget.exe >/dev/null 2>&1
sleep 1
check "无注册表偏好" "no"
