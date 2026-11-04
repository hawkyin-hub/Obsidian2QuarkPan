import test from "node:test";
import assert from "node:assert/strict";
import { computeDiff } from "../src/diff.ts";

const local = (path: string, size = 10, sha = "aaa", mtime = 1000) => ({ path, size, mtimeMs: mtime, sha256: sha });
const remote = (path: string, fid: string, size = 10) => ({ path, fid, size });
const last = (path: string, fid: string, size = 10, sha = "aaa", mtime = 1000) => ({ path, size, mtimeMs: mtime, sha256: sha, fid });

test("新增文件 -> upload", () => {
  const r = computeDiff([local("a.md")], [], [], false);
  assert.deepEqual(r.plan, [{ kind: "upload", path: "a.md" }]);
});

test("未变文件 -> 跳过，不重复上传", () => {
  const r = computeDiff([local("a.md")], [remote("a.md", "f1")], [last("a.md", "f1")], false);
  assert.deepEqual(r.plan, []);
  assert.deepEqual(r.skipped, ["a.md"]);
});

test("mtime 变了但内容不变 -> 跳过，不重新上传", () => {
  const r = computeDiff(
    [local("a.md", 10, "aaa", 9999)],
    [remote("a.md", "f1")],
    [last("a.md", "f1", 10, "aaa", 1000)],
    false,
  );
  assert.deepEqual(r.plan, []);
  assert.deepEqual(r.skipped, ["a.md"]);
});

test("远端已有同名同大小、从未同步过 -> 认领，不上传", () => {
  const r = computeDiff([local("a.md")], [remote("a.md", "f1")], [], false);
  assert.deepEqual(r.plan, []);
  assert.deepEqual(r.adopted, [{ path: "a.md", size: 10, mtimeMs: 1000, sha256: "aaa", fid: "f1" }]);
  assert.equal(r.notes.some((n) => n.includes("已标记为已上传")), true);
});

test("远端同名但大小不同、从未同步过 -> 重新上传", () => {
  const r = computeDiff([local("a.md")], [remote("a.md", "f1", 15)], [], false);
  assert.deepEqual(r.plan, [{ kind: "reupload", path: "a.md", oldFid: "f1" }]);
  assert.deepEqual(r.adopted, []);
});

test("本地改了 -> reupload，且记冲突当远端 size 与上次不同", () => {
  const r = computeDiff(
    [local("a.md", 20, "bbb", 2000)],
    [remote("a.md", "f1", 15)],
    [last("a.md", "f1", 10, "aaa", 1000)],
    false,
  );
  assert.deepEqual(r.plan, [{ kind: "reupload", path: "a.md", oldFid: "f1" }]);
  assert.equal(r.notes.some((n) => n.includes("冲突")), true);
});

test("本地删了，镜像删除关 -> 不动远端，只记日志", () => {
  const r = computeDiff([], [remote("a.md", "f1")], [last("a.md", "f1")], false);
  assert.deepEqual(r.plan, []);
  assert.equal(r.notes.some((n) => n.includes("远端保留")), true);
});

test("本地删了，镜像删除开 -> deleteRemote", () => {
  const r = computeDiff([], [remote("a.md", "f1")], [last("a.md", "f1")], true);
  assert.deepEqual(r.plan, [{ kind: "deleteRemote", path: "a.md", fid: "f1" }]);
});

test("同目录改名（内容相同）-> rename，不重新上传", () => {
  const r = computeDiff(
    [local("b.md", 10, "aaa", 1000)],
    [remote("a.md", "f1", 10)],
    [last("a.md", "f1", 10, "aaa", 1000)],
    false,
  );
  assert.deepEqual(r.plan, [{ kind: "rename", oldPath: "a.md", newPath: "b.md", fid: "f1" }]);
});

test("跨目录移动（内容相同）-> move", () => {
  const r = computeDiff(
    [local("sub/b.md", 10, "aaa", 1000)],
    [remote("a.md", "f1", 10)],
    [last("a.md", "f1", 10, "aaa", 1000)],
    false,
  );
  assert.equal(r.plan[0].kind, "move");
});

test("改名但内容变了 -> 不认改名，走 upload（旧文件按本地删除处理）", () => {
  const r = computeDiff(
    [local("b.md", 99, "zzz", 2000)],
    [remote("a.md", "f1", 10)],
    [last("a.md", "f1", 10, "aaa", 1000)],
    false,
  );
  assert.equal(r.plan.some((p) => p.kind === "upload" && p.path === "b.md"), true);
  assert.equal(r.plan.some((p) => p.kind === "rename"), false);
});

test("远端新增、本地无、从未同步过 -> 忽略不回写", () => {
  const r = computeDiff([], [remote("remote-only.md", "f9")], [], false);
  assert.deepEqual(r.plan, []);
  assert.equal(r.notes.some((n) => n.includes("不回写")), true);
});

test("远端丢失但本地未变（上次同步过）-> 重新上传恢复", () => {
  const r = computeDiff([local("a.md")], [], [last("a.md", "f1")], false);
  assert.deepEqual(r.plan, [{ kind: "upload", path: "a.md" }]);
});
