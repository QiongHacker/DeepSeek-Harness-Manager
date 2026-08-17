'use strict';

// 统计 worker：在独立线程中计算 Token 统计，避免阻塞主进程 UI。
const { parentPort, workerData } = require('worker_threads');
const { computeStats } = require('./stats.js');

try {
  const result = computeStats(workerData || {});
  parentPort.postMessage({ ok: true, ...result });
} catch (e) {
  parentPort.postMessage({ ok: false, error: String((e && e.message) || e) });
}
