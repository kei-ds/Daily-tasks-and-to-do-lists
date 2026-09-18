'use strict';

const bridge = window.api;

const state = { daily: [], todo: [], window: {}, settings: {}, ttl: 10 * 60 * 1000 };
let editing = null;      // { list, id }
let locked = false;

const lists = {
  daily: document.getElementById('list-daily'),
  todo: document.getElementById('list-todo'),
};

/* ---------- 渲染 ---------- */

function formatLeft(ms) {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function buildItem(listName, item) {
  const li = document.createElement('li');
  li.className = 'item' + (item.done ? ' done' : '');
  li.dataset.id = item.id;
  li.dataset.list = listName;

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = item.done;
  box.title = '标记完成';
  box.addEventListener('change', () => bridge.toggle(listName, item.id));
  li.appendChild(box);

  if (editing && editing.list === listName && editing.id === item.id) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'edit';
    input.value = item.text;
    input.maxLength = 200;
    li.appendChild(input);
    // 等元素进 DOM 后再聚焦，否则选不中
    queueMicrotask(() => { input.focus(); input.select(); });

    let settled = false;
    const finish = commit => {
      if (settled) return;
      settled = true;
      const text = input.value.trim();
      editing = null;
      if (commit && text && text !== item.text) bridge.edit(listName, item.id, text);
      else if (commit && !text) bridge.remove(listName, item.id);
      render(true);
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    li.appendChild(input);
  } else {
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = item.text;
    text.title = '双击编辑';
    text.addEventListener('dblclick', () => {
      editing = { list: listName, id: item.id };
      render(true);
    });
    li.appendChild(text);

    if (listName === 'todo' && item.done && typeof item.completedAt === 'number') {
      const cd = document.createElement('span');
      cd.className = 'countdown';
      cd.dataset.completedAt = item.completedAt;
      cd.textContent = formatLeft(Math.max(0, item.completedAt + state.ttl - Date.now()));
      li.appendChild(cd);
    }
  }

  const del = document.createElement('button');
  del.className = 'del';
  del.textContent = '\u00d7';
  del.title = '删除';
  del.addEventListener('click', () => bridge.remove(listName, item.id));
  li.appendChild(del);

  return li;
}

/**
 * force=true 用于切换编辑态时的那次主动渲染——它必须穿透守卫，
 * 否则「设置 editing -> render 被守卫挡掉 -> 输入框永远建不出来」会死锁。
 */
function render(force) {
  // 编辑中不重绘，否则输入框会被冲掉；编辑结束时那次 render(true) 会把最新状态补上
  if (editing && !force) return;

  for (const name of ['daily', 'todo']) {
    const ul = lists[name];
    ul.textContent = '';
    const items = state[name];
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = name === 'daily' ? '还没有每日事项' : '还没有代办';
      ul.appendChild(li);
      continue;
    }
    for (const item of items) ul.appendChild(buildItem(name, item));
  }
}

function tickCountdowns() {
  for (const el of document.querySelectorAll('.countdown')) {
    const doneAt = Number(el.dataset.completedAt);
    if (!Number.isFinite(doneAt)) continue;
    el.textContent = formatLeft(Math.max(0, doneAt + state.ttl - Date.now()));
  }
}

/* ---------- 与主进程同步 ---------- */

function applyState(next) {
  state.daily = next.daily || [];
  state.todo = next.todo || [];
  state.window = next.window || state.window;
  if (next.settings) state.settings = next.settings;
  if (typeof next.ttl === 'number') state.ttl = next.ttl;

  const pct = Math.round((state.window.alpha ?? 0.82) * 100);
  const slider = document.getElementById('alpha');
  if (document.activeElement !== slider) slider.value = String(pct);
  document.documentElement.style.setProperty('--panel-alpha', String(pct / 100));

  if (locked !== !!state.settings.locked) {
    locked = !!state.settings.locked;
    syncLockUI();
  }

  render();
}

/* ---------- 锁定 ---------- */

const lockBtn = document.getElementById('lock');

function reportLockRect() {
  const r = lockBtn.getBoundingClientRect();
  bridge.setLockHitRect({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
}

function syncLockUI() {
  document.body.classList.toggle('locked', locked);
  lockBtn.title = locked
    ? '解除锁定（也可以右键托盘图标）'
    : '锁定：固定位置，鼠标可穿透到底下的窗口';

  // 锁按钮的位置只有渲染进程知道（CSS 布局），上报给主进程，
  // 它靠轮询光标来判断这一小块什么时候该恢复可点击。
  // 锁定期间窗口尺寸不会变（缩放手柄已禁用），所以报一次就够。
  if (locked) reportLockRect();
}

// 上锁后主进程开始轮询光标：光标停在按钮上就不穿透，移开就穿透。
// 所以刚点完锁按钮的那一瞬间它仍然是可点的，想立刻解锁不用先晃鼠标。
lockBtn.addEventListener('click', () => bridge.setLocked(!locked));

/* ---------- 添加 ---------- */

for (const form of document.querySelectorAll('.add')) {
  const input = form.querySelector('input[type="text"]');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    bridge.add(form.dataset.list, text);
    input.value = '';
    input.focus();
  });
}

/* ---------- 透明度 ---------- */

{
  const slider = document.getElementById('alpha');
  let timer = null;
  slider.addEventListener('input', () => {
    const alpha = Number(slider.value) / 100;
    document.documentElement.style.setProperty('--panel-alpha', String(alpha));
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => bridge.setAlpha(alpha), 250);
  });
}

document.getElementById('hide').addEventListener('click', () => bridge.hide());

/* ---------- 缩放 ---------- */

for (const el of document.querySelectorAll('.rs')) {
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch { /* 捕获失败也不影响 */ }
    bridge.resizeStart(el.dataset.dir);
  });
  el.addEventListener('pointerup', () => bridge.resizeEnd());
  el.addEventListener('pointercancel', () => bridge.resizeEnd());
}
window.addEventListener('mouseup', () => bridge.resizeEnd());
window.addEventListener('blur', () => bridge.resizeEnd());

/* ---------- 启动 ---------- */

bridge.onState(applyState);
bridge.getState().then(applyState);
setInterval(tickCountdowns, 1000);
