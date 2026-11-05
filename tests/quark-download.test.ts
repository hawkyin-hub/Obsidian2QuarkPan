import test from "node:test";
import assert from "node:assert/strict";
import { QuarkClient, QuarkError, type FetchFn } from "../src/quark.ts";

// Mock fetch: the API leg answers file/download with a fresh download URL;
// the CDN leg follows a scripted queue (status steps or thrown errors).
type CdnStep = { status: number; body?: string } | { throw: string };

function makeFetch(
  apiCalls: { n: number },
  cdnQueue: CdnStep[],
  cdnCalls: { n: number },
  apiStatus = 200,
): FetchFn {
  return (async (input: unknown) => {
    const url = String(input);
    if (url.includes("drive-pc.quark.cn")) {
      apiCalls.n++;
      return {
        status: apiStatus,
        ok: apiStatus >= 200 && apiStatus < 300,
        headers: { getSetCookie: () => [] as string[] },
        json: async () => ({ status: 200, code: 0, data: [{ download_url: "https://mock-cdn/file" }] }),
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    cdnCalls.n++;
    const step = cdnQueue.shift();
    if (!step) throw new Error("CDN 队列耗尽");
    if ("throw" in step) throw new Error(step.throw);
    return {
      status: step.status,
      ok: step.status >= 200 && step.status < 300,
      headers: { getSetCookie: () => [] as string[] },
      json: async () => ({}),
      arrayBuffer: async () => new TextEncoder().encode(step.body ?? "").buffer,
    };
  }) as unknown as FetchFn;
}

test("CDN 403 一次后成功：重试并返回内容，链接每次重取", async () => {
  const apiCalls = { n: 0 };
  const cdnCalls = { n: 0 };
  const client = new QuarkClient("a=b", makeFetch(apiCalls, [{ status: 403 }, { status: 200, body: "hello" }], cdnCalls));
  const bytes = await client.downloadBytes("fid1", [0, 0]);
  assert.equal(new TextDecoder().decode(bytes), "hello");
  assert.equal(apiCalls.n, 2);
  assert.equal(cdnCalls.n, 2);
});

test("CDN 连续 3 次 403：抛错并写明重试次数", async () => {
  const apiCalls = { n: 0 };
  const cdnCalls = { n: 0 };
  const client = new QuarkClient(
    "a=b",
    makeFetch(apiCalls, [{ status: 403 }, { status: 403 }, { status: 403 }], cdnCalls),
  );
  await assert.rejects(() => client.downloadBytes("fid1", [0, 0]), (e: unknown) => {
    assert.ok(e instanceof QuarkError);
    assert.match(e.message, /HTTP 403/);
    assert.match(e.message, /已重试 3 次/);
    return true;
  });
  assert.equal(apiCalls.n, 3);
  assert.equal(cdnCalls.n, 3);
});

test("API 层 401：不重试，直接报登录过期", async () => {
  const apiCalls = { n: 0 };
  const cdnCalls = { n: 0 };
  const client = new QuarkClient("a=b", makeFetch(apiCalls, [], cdnCalls, 401));
  await assert.rejects(() => client.downloadBytes("fid1", [0, 0]), (e: unknown) => {
    assert.ok(e instanceof QuarkError);
    assert.match(e.message, /重新登录/);
    return true;
  });
  assert.equal(apiCalls.n, 1);
  assert.equal(cdnCalls.n, 0);
});

test("CDN 404：不可重试状态直接失败", async () => {
  const apiCalls = { n: 0 };
  const cdnCalls = { n: 0 };
  const client = new QuarkClient("a=b", makeFetch(apiCalls, [{ status: 404 }], cdnCalls));
  await assert.rejects(() => client.downloadBytes("fid1", [0, 0]), /HTTP 404/);
  assert.equal(apiCalls.n, 1);
  assert.equal(cdnCalls.n, 1);
});

test("CDN 网络异常一次后成功", async () => {
  const apiCalls = { n: 0 };
  const cdnCalls = { n: 0 };
  const client = new QuarkClient(
    "a=b",
    makeFetch(apiCalls, [{ throw: "boom" }, { status: 200, body: "ok" }], cdnCalls),
  );
  const bytes = await client.downloadBytes("fid1", [0, 0]);
  assert.equal(new TextDecoder().decode(bytes), "ok");
  assert.equal(apiCalls.n, 2);
  assert.equal(cdnCalls.n, 2);
});
