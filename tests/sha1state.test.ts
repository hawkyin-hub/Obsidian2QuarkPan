import test from "node:test";
import assert from "node:assert/strict";
import { sha1IncrementalContext } from "../src/sha1state.ts";

test("空数据增量上下文 = SHA-1 初始状态", () => {
  const ctx = JSON.parse(Buffer.from(sha1IncrementalContext(new Uint8Array(0)), "base64").toString("utf8"));
  assert.deepEqual(ctx, { hash_type: "sha1", h0: "1732584193", h1: "4023233417", h2: "2562383102", h3: "271733878", h4: "3285377520", Nl: "0", Nh: "0", data: "", num: "0" });
});

test("128 字节 a、按 QuarkPan part=2 口径（Nl=4MiB*8）与 Python 输出一致", () => {
  const data = new TextEncoder().encode("a".repeat(128));
  const got = sha1IncrementalContext(data, 4 * 1024 * 1024);
  assert.equal(got, "eyJoYXNoX3R5cGUiOiJzaGExIiwiaDAiOiIxOTUwNDU3MDUiLCJoMSI6IjM3MzE5NTc4MTYiLCJoMiI6IjE3NTUyMTU1ODkiLCJoMyI6IjIyODc3Mjg3NjkiLCJoNCI6IjM5ODA3OTA0NCIsIk5sIjoiMzM1NTQ0MzIiLCJOaCI6IjAiLCJkYXRhIjoiIiwibnVtIjoiMCJ9");
});
