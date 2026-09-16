'use strict';

// 每日事项在凌晨 4:00 重置，所以「一天」的分界线不是 00:00 而是 04:00。
const RESET_HOUR = 4;
// 代办事项勾选完成后多久自动消失。
const TTL = 10 * 60 * 1000;

const pad = n => String(n).padStart(2, '0');

/**
 * 逻辑日：把时间戳整体前移 RESET_HOUR 小时再取本地日期。
 * 03:59 -> 前一天，04:00 -> 当天。
 */
function logicDay(ts = Date.now()) {
  const d = new Date(ts - RESET_HOUR * 3600 * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let seq = 0;
function makeItem(text, now = Date.now()) {
  seq = (seq + 1) % 1e6;
  return {
    id: `${now.toString(36)}-${seq.toString(36)}`,
    text: String(text).trim(),
    done: false,
    completedAt: null,
    createdAt: now,
  };
}

/**
 * 把每日事项全部重置为未完成。
 * 「全部置为未完成」是幂等操作，所以单次比较就能覆盖任意多天的遗漏，不需要按天补算。
 * 返回是否真的发生了改变。
 */
function applyDailyReset(data, now = Date.now()) {
  const day = logicDay(now);
  if (data.lastResetDay === day) return false;
  for (const it of data.daily) {
    it.done = false;
    it.completedAt = null;
  }
  data.lastResetDay = day;
  return true;
}

/**
 * 清除勾选完成后已超过 TTL 的代办事项。
 * 启动时会先无条件跑一次，所以关机期间错过的过期点也能正确补算。
 */
function sweepExpired(data, now = Date.now()) {
  const before = data.todo.length;
  data.todo = data.todo.filter(it => !isExpired(it, now));
  return data.todo.length !== before;
}

function isExpired(it, now = Date.now()) {
  return !!(it.done && typeof it.completedAt === 'number' && now - it.completedAt >= TTL);
}

module.exports = { RESET_HOUR, TTL, logicDay, makeItem, applyDailyReset, sweepExpired };
