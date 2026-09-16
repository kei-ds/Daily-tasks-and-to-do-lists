'use strict';

// 用 --selftest 启动时跑，逐项验证最容易翻车的部分，最后打印 PASS/FAIL 汇总。
// 注意：-webkit-app-region 的真正命中测试由操作系统做，合成事件绕不过去，
// 所以「拖动标题栏能不能移动窗口」这一项仍需人工确认，这里只校验计算样式和事件接线。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

/**
 * 用真实光标移动来驱动缩放，这样才走完整的 pointerdown -> IPC -> 轮询链路。
 * setCursor 是另起一个 PowerShell 进程，是异步的；不等它真的到位就发 mouseDown 的话，
 * 主进程会取到移动前的光标位置当基准，算出来的增量就全是错的。
 */
async function setCursor(x, y, screen) {
  execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    'Add-Type -AssemblyName System.Windows.Forms; ' +
    `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)},${Math.round(y)})`,
  ], { windowsHide: true, timeout: 10000 });

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const p = screen.getCursorScreenPoint();
    if (Math.abs(p.x - x) <= 2 && Math.abs(p.y - y) <= 2) return true;
    await sleep(30);
  }
  return false;
}

async function run({ win, store, app }) {
  const wc = win.webContents;
  const js = code => wc.executeJavaScript(code, true);

  await new Promise(resolve => {
    if (!wc.isLoading()) return resolve();
    wc.once('did-finish-load', resolve);
  });
  await sleep(600);

  // 自检会把窗口挪来挪去并缩到最小，记下原始位置，跑完还原，
  // 免得下次正常启动时窗口莫名其妙待在角落里。
  const originalBounds = win.getBounds();

  // ---- 1. 窗口形态 ----
  const bounds = win.getBounds();
  check('窗口已创建且可见', win.isVisible(), `${bounds.width}x${bounds.height} @ ${bounds.x},${bounds.y}`);
  check('窗口始终置顶', win.isAlwaysOnTop());
  check('窗口可缩放', win.isResizable());
  check('无边框', !win.isMaximizable() && !win.isFullScreenable());

  // ---- 2. 防穿透底色 + drag/no-drag 分区 ----
  const rootAlpha = await js(`getComputedStyle(document.getElementById('root')).backgroundColor`);
  const rootAlphaNum = Number((rootAlpha.match(/[\d.]+\)$/) || ['0'])[0].replace(')', ''));
  check('#root 有几乎不可见的底色（防透明像素穿透）', rootAlphaNum > 0 && rootAlphaNum < 0.05, rootAlpha);

  const bodyRegion = await js(`getComputedStyle(document.body).webkitAppRegion`);
  check('body 是 drag 区域', bodyRegion === 'drag', bodyRegion);

  const handles = await js(`Array.from(document.querySelectorAll('.rs')).map(el => {
    const cs = getComputedStyle(el);
    return { dir: el.dataset.dir, region: cs.webkitAppRegion, pos: cs.position, z: cs.zIndex, cursor: cs.cursor,
             rect: el.getBoundingClientRect().toJSON() };
  })`);
  check('8 个缩放手柄齐全', handles.length === 8, handles.map(h => h.dir).join(','));
  check('手柄都是 no-drag', handles.every(h => h.region === 'no-drag'));
  check('手柄是 fixed 且 z-index 足够高', handles.every(h => h.pos === 'fixed' && Number(h.z) >= 1000));

  const interactive = await js(`Array.from(document.querySelectorAll('input, button, .list, .item .text'))
    .map(el => ({ tag: el.tagName + '.' + el.className, region: getComputedStyle(el).webkitAppRegion }))`);
  const badRegion = interactive.filter(i => i.region !== 'no-drag');
  check('所有交互元素都是 no-drag', badRegion.length === 0,
    badRegion.length ? badRegion.map(b => b.tag).join(', ') : `${interactive.length} 个元素`);

  // ---- 3. 增删改查往返 ----
  const ops = await js(`(async () => {
    let s = await window.api.add('daily', '自检-每日');
    const dailyId = s.daily[s.daily.length - 1].id;
    s = await window.api.toggle('daily', dailyId);
    const doneAfterToggle = s.daily.find(i => i.id === dailyId).done;
    s = await window.api.edit('daily', dailyId, '自检-改过');
    const edited = s.daily.find(i => i.id === dailyId).text;
    s = await window.api.remove('daily', dailyId);
    const removed = !s.daily.some(i => i.id === dailyId);

    s = await window.api.add('todo', '自检-代办');
    const todoId = s.todo[s.todo.length - 1].id;
    s = await window.api.toggle('todo', todoId);
    const todoItem = s.todo.find(i => i.id === todoId);
    const stamped = typeof todoItem.completedAt === 'number';

    // 反勾选必须清掉 completedAt
    s = await window.api.toggle('todo', todoId);
    const cleared = s.todo.find(i => i.id === todoId).completedAt === null;
    s = await window.api.remove('todo', todoId);
    return { doneAfterToggle, edited, removed, stamped, cleared };
  })()`);
  check('每日事项：添加/勾选/编辑/删除 往返正常',
    ops.doneAfterToggle && ops.edited === '自检-改过' && ops.removed, JSON.stringify(ops));
  check('代办：勾选写入 completedAt，反勾选清空',
    ops.stamped && ops.cleared, `stamped=${ops.stamped} cleared=${ops.cleared}`);

  // ---- 4. 双击进入编辑（真实合成点击，验证事件没被 drag 区域吞掉）----
  await js(`(async () => {
    await window.api.add('daily', '双击我');
  })()`);
  await sleep(250);
  const textRect = await js(`(() => {
    const el = document.querySelector('#list-daily .item .text');
    return el ? el.getBoundingClientRect().toJSON() : null;
  })()`);
  if (textRect) {
    const cx = textRect.x + textRect.width / 2;
    const cy = textRect.y + textRect.height / 2;
    for (const clickCount of [1, 2]) {
      wc.sendInputEvent({ type: 'mouseDown', x: Math.round(cx), y: Math.round(cy), button: 'left', clickCount });
      wc.sendInputEvent({ type: 'mouseUp', x: Math.round(cx), y: Math.round(cy), button: 'left', clickCount });
    }
    await sleep(300);
    const editing = await js(`!!document.querySelector('#list-daily input.edit')`);
    check('双击事项文字进入编辑态', editing, editing ? '' : '没出现 input.edit');
    await js(`document.querySelectorAll('#list-daily input.edit').forEach(el => el.blur())`);
    await sleep(200);
    await js(`(async () => { const s = await window.api.getState();
      for (const it of s.daily.filter(i => i.text === '双击我')) await window.api.remove('daily', it.id); })()`);
  } else {
    check('双击事项文字进入编辑态', false, '找不到 .item .text 元素');
  }

  // ---- 5. 缩放手柄端到端（真实光标移动）----
  // 先把窗口挪到左上角并留足伸展空间，否则光标向下/向右会被屏幕边缘夹住，
  // 测出来的增量就不可信了。
  const area = require('electron').screen.getPrimaryDisplay().workArea;
  win.setBounds({
    x: area.x + 40,
    y: area.y + 40,
    width: Math.min(420, area.width - 200),
    height: Math.min(320, area.height - 200),
  }, false);
  await sleep(400);

  // 手柄坐标必须在这一刻重新量，上面 handles 快照是改尺寸之前取的，已经失效了
  const seRect = await js(`document.querySelector('.rs-se').getBoundingClientRect().toJSON()`);
  const startBounds = win.getBounds();
  const grabX = startBounds.x + startBounds.width - 3;
  const grabY = startBounds.y + startBounds.height - 3;

  const s = require('electron').screen;
  const atGrab = await setCursor(grabX, grabY, s);
  check('能把光标移到手柄位置', atGrab, atGrab ? '' : '光标没到位，后面的缩放结果不可信');

  wc.sendInputEvent({
    type: 'mouseDown', button: 'left', clickCount: 1,
    x: Math.round(seRect.x + seRect.width / 2), y: Math.round(seRect.y + seRect.height / 2),
  });
  await sleep(150);

  const DX = 90, DY = 60;
  await setCursor(grabX + DX, grabY + DY, s);
  await sleep(300);
  const grown = win.getBounds();
  wc.sendInputEvent({
    type: 'mouseUp', button: 'left', clickCount: 1,
    x: Math.round(seRect.x + seRect.width / 2), y: Math.round(seRect.y + seRect.height / 2),
  });
  await sleep(200);

  const dw = grown.width - startBounds.width;
  const dh = grown.height - startBounds.height;
  check('拖动右下角手柄能缩放窗口（端到端）',
    Math.abs(dw - DX) <= 6 && Math.abs(dh - DY) <= 6,
    `Δw=${dw} Δh=${dh}（期望 ≈${DX},${DY}）`);

  // ---- 6. 最小尺寸限制 ----
  const liveSe = await js(`document.querySelector('.rs-se').getBoundingClientRect().toJSON()`);
  await setCursor(grown.x + grown.width - 3, grown.y + grown.height - 3, s);
  wc.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: Math.round(liveSe.x + 5), y: Math.round(liveSe.y + 5) });
  await sleep(120);
  await setCursor(grown.x + grown.width - 3 - 900, grown.y + grown.height - 3 - 900, s);
  await sleep(300);
  const shrunk = win.getBounds();
  wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: Math.round(seRect.x + 5), y: Math.round(seRect.y + 5) });
  await sleep(200);
  check('缩放不会小于最小尺寸', shrunk.width >= 240 && shrunk.height >= 180, `${shrunk.width}x${shrunk.height}`);

  // ---- 7. 位置尺寸持久化 ----
  await sleep(900); // 等保存去抖
  const saved = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'data.json'), 'utf8'));
  check('窗口位置尺寸已落盘',
    typeof saved.window.width === 'number' && typeof saved.window.x === 'number',
    JSON.stringify(saved.window));

  // ---- 8. 截图，供人工核对布局 ----
  const shot = await wc.capturePage();
  const shotPath = path.join(os.tmpdir(), 'daily-widget-selftest.png');
  fs.writeFileSync(shotPath, shot.toPNG());
  console.log('截图已保存:', shotPath, `${shot.getSize().width}x${shot.getSize().height}`);

  // ---- 还原窗口位置，别把自检的副作用留给下次正常启动 ----
  win.setBounds(originalBounds, false);
  await sleep(900); // 等位置保存去抖

  // ---- 汇总 ----
  const failed = results.filter(r => !r.ok);
  console.log('\n========================================');
  console.log(`自检结果: ${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) {
    console.log('失败项:');
    for (const f of failed) console.log('  -', f.name, f.detail || '');
    process.exitCode = 1;
  } else {
    console.log('全部通过');
  }
}

module.exports = { run };
