#!/usr/bin/env bash
# 验证运行中的定时逻辑：每秒 tick 会做「跨过 4:00 重置每日事项」和「代办过 10 分钟清除」。
# 为了不用真等到凌晨 4:00 / 干等 10 分钟，这里临时把 RESET_HOUR 挪到几十秒后，
# 并把一条代办的完成时间设成十几秒后过期，测完把 logic.js 还原。
set -u
cd "$(dirname "$0")/.."

LOGIC=src/logic.js
ORIG=$(mktemp)
cp "$LOGIC" "$ORIG"
restore() { cp "$ORIG" "$LOGIC"; rm -f "$ORIG"; }
trap restore EXIT

# 算一个 30~90 秒之后的分界点，用小数小时表示
read -r RESET_HOUR WAIT_MS < <(node -e '
  const now = new Date();
  const target = new Date(now.getTime() + 90000);
  const boundary = new Date(target); boundary.setSeconds(0, 0);
  const h = boundary.getHours() + boundary.getMinutes() / 60;
  process.stdout.write(h + " " + (boundary.getTime() - now.getTime()));
')

sed -i "s/^const RESET_HOUR = .*/const RESET_HOUR = ${RESET_HOUR};/" "$LOGIC"
echo "临时 RESET_HOUR=${RESET_HOUR}（分界点在约 $((WAIT_MS / 1000)) 秒后）"

# 用临时的 RESET_HOUR 算出「当前逻辑日」当作 lastResetDay，这样启动时不该触发重置
node -e '
  const fs = require("fs");
  const RESET_HOUR = Number(process.argv[1]);
  const now = Date.now();
  const pad = n => String(n).padStart(2, "0");
  const day = ts => { const d = new Date(ts - RESET_HOUR * 3600 * 1000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const f = process.env.APPDATA + "/daily-widget/data.json";
  fs.writeFileSync(f, JSON.stringify({
    version: 1,
    window: { x: 490, y: 226, width: 460, height: 400, alpha: 0.82 },
    settings: { autostart: false },
    lastResetDay: day(now),
    daily: [
      { id: "d1", text: "已完成的每日事项", done: true, completedAt: now - 60000, createdAt: 1 },
      { id: "d2", text: "未完成的每日事项", done: false, completedAt: null, createdAt: 2 }
    ],
    todo: [
      { id: "t1", text: "十几秒后过期", done: true, completedAt: now + 15000 - 600000, createdAt: 3 },
      { id: "t2", text: "还早", done: true, completedAt: now - 120000, createdAt: 4 }
    ]
  }, null, 2));
  console.log("已构造测试数据，启动时不应发生重置（lastResetDay 已是当前逻辑日）");
' "$RESET_HOUR"

npx electron . >/dev/null 2>&1 &
APP_PID=$!
sleep $((WAIT_MS / 1000 + 14))
kill $APP_PID 2>/dev/null
taskkill //F //IM electron.exe >/dev/null 2>&1
sleep 1

node -e '
  const fs = require("fs");
  const d = JSON.parse(fs.readFileSync(process.env.APPDATA + "/daily-widget/data.json", "utf8"));
  let ok = true;
  const c = (n, v, extra) => { ok = ok && v; console.log((v ? "PASS" : "FAIL") + "  " + n + (extra ? "  — " + extra : "")); };
  c("运行中跨过重置点，每日事项被重置",
    d.daily.every(i => i.done === false && i.completedAt === null),
    JSON.stringify(d.daily.map(i => i.id + ":" + i.done)));
  c("运行中到点的代办被清除", !d.todo.some(i => i.id === "t1"), d.todo.map(i => i.id).join(",") || "空");
  c("未到期的代办保留", d.todo.some(i => i.id === "t2"));
  console.log(ok ? "\n运行中定时逻辑全部正确" : "\n有失败项");
'
