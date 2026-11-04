import test from "node:test";
import assert from "node:assert/strict";
import { formatBeijingTime, RingLog } from "../src/log.ts";

test("北京时间：UTC 转 +08:00，含跨日", () => {
  assert.equal(formatBeijingTime(new Date("2026-11-03T09:26:32.444Z")), "2026-11-03 17:26:32.444");
  assert.equal(formatBeijingTime(new Date("2026-11-03T16:30:00.000Z")), "2026-11-04 00:30:00.000");
});

test("日志最新在最上面", () => {
  const log = new RingLog();
  log.info("第一条");
  log.info("第二条");
  const text = log.toText();
  assert.ok(text.indexOf("第二条") < text.indexOf("第一条"), text);
});

test("推送：新增与清空都通知，退订后停止", () => {
  const log = new RingLog();
  let calls = 0;
  const off = log.subscribe(() => { calls++; });
  log.info("a");
  assert.equal(calls, 1);
  log.clear();
  assert.equal(calls, 2);
  off();
  log.info("b");
  assert.equal(calls, 2);
});
