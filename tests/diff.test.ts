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
  assert.deepEqual(r.adopted, [{ path: "a.md", size: 10, mtimeMs: 1000, sha256: "aaa", fid: "f1", remoteSize: 10, adopted: true }]);
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

const tw = (mirror = false, tombs = { localDeleted: [], remoteDeleted: [] }) => ({ mirrorDelete: mirror, twoWay: true, tombstones: tombs });
const remoteU = (path, fid, size = 10, updatedAt = undefined) => ({ path, fid, size, updatedAt });
const lastU = (path, fid, size = 10, sha = "aaa", mtime = 1000, extra = {}) => ({ path, size, mtimeMs: mtime, sha256: sha, fid, ...extra });

test("双向：远端新增文件 -> download", () => {
  const r = computeDiff([], [remote("b.md", "f2")], [], tw());
  assert.deepEqual(r.plan, [{ kind: "download", path: "b.md", fid: "f2", size: 10, updatedAt: undefined }]);
});

test("双向关：远端新增文件 -> 只记日志，不下载", () => {
  const r = computeDiff([], [remote("b.md", "f2")], [], false);
  assert.deepEqual(r.plan, []);
  assert.equal(r.notes.some((n) => n.includes("单向同步不回写")), true);
});

test("双向：远端改了大小、本地未变 -> download", () => {
  const r = computeDiff(
    [local("a.md")],
    [remoteU("a.md", "f1", 20, 2000)],
    [lastU("a.md", "f1", 10, "aaa", 1000, { remoteSize: 10, remoteUpdatedAt: 1000 })],
    tw(),
  );
  assert.deepEqual(r.plan, [{ kind: "download", path: "a.md", fid: "f1", size: 20, updatedAt: 2000 }]);
});

test("双向：远端只改了 updatedAt、大小不变 -> download", () => {
  const r = computeDiff(
    [local("a.md")],
    [remoteU("a.md", "f1", 10, 2000)],
    [lastU("a.md", "f1", 10, "aaa", 1000, { remoteSize: 10, remoteUpdatedAt: 1000 })],
    tw(),
  );
  assert.equal(r.plan.length, 1);
  assert.equal(r.plan[0].kind, "download");
});

test("双向：老状态无远端指纹、远端大小变了 -> download", () => {
  const r = computeDiff([local("a.md")], [remoteU("a.md", "f1", 20)], [last("a.md", "f1")], tw());
  assert.equal(r.plan[0].kind, "download");
});

test("双向：双边都改动 -> downloadConflict，不覆盖任何一边", () => {
  const r = computeDiff(
    [local("a.md", 20, "bbb", 2000)],
    [remoteU("a.md", "f1", 15, 2000)],
    [lastU("a.md", "f1", 10, "aaa", 1000, { remoteSize: 10, remoteUpdatedAt: 1000 })],
    tw(),
  );
  assert.deepEqual(r.plan, [{ kind: "downloadConflict", path: "a.md", fid: "f1", size: 15, updatedAt: 2000, conflictPath: "a（夸克冲突）.md" }]);
});

test("双向：冲突副本名撞了本地已有文件 -> 自动加序号", () => {
  const r = computeDiff(
    [local("a.md", 20, "bbb", 2000), local("a（夸克冲突）.md", 5, "ccc", 2000)],
    [remoteU("a.md", "f1", 15, 2000)],
    [lastU("a.md", "f1", 10, "aaa", 1000, { remoteSize: 10, remoteUpdatedAt: 1000 })],
    tw(),
  );
  const c = r.plan.find((p) => p.kind === "downloadConflict");
  assert.equal(c.conflictPath, "a（夸克冲突 2）.md");
});

test("单向：双边都改动 -> 仍按本地重新上传（旧行为不变）", () => {
  const r = computeDiff(
    [local("a.md", 20, "bbb", 2000)],
    [remoteU("a.md", "f1", 15, 2000)],
    [lastU("a.md", "f1", 10, "aaa", 1000, { remoteSize: 10, remoteUpdatedAt: 1000 })],
    false,
  );
  assert.deepEqual(r.plan, [{ kind: "reupload", path: "a.md", oldFid: "f1" }]);
});

test("双向：认领文件远端有变 -> 冲突副本，不直接覆盖本地", () => {
  const r = computeDiff(
    [local("a.md")],
    [remoteU("a.md", "f1", 20, 2000)],
    [lastU("a.md", "f1", 10, "aaa", 1000, { remoteSize: 10, remoteUpdatedAt: 1000, adopted: true })],
    tw(),
  );
  assert.equal(r.plan[0].kind, "downloadConflict");
});

test("双向：本地删了，镜像关 -> 记墓碑，不删远端", () => {
  const r = computeDiff([], [remote("a.md", "f1")], [last("a.md", "f1")], tw());
  assert.deepEqual(r.plan, []);
  assert.deepEqual(r.tombstones.localDeleted, ["a.md"]);
});

test("双向：墓碑里的远端文件不再下载（本地删除不复活）", () => {
  const r = computeDiff([], [remote("a.md", "f1")], [], tw(false, { localDeleted: ["a.md"], remoteDeleted: [] }));
  assert.deepEqual(r.plan, []);
  assert.deepEqual(r.tombstones.localDeleted, ["a.md"]);
});

test("双向：远端删了，镜像关 -> 不上传，记墓碑", () => {
  const r = computeDiff([local("a.md")], [], [last("a.md", "f1")], tw());
  assert.deepEqual(r.plan, []);
  assert.deepEqual(r.tombstones.remoteDeleted, ["a.md"]);
});

test("双向：墓碑里的本地文件不再上传（远端删除不重传）", () => {
  const r = computeDiff([local("a.md")], [], [], tw(false, { localDeleted: [], remoteDeleted: ["a.md"] }));
  assert.deepEqual(r.plan, []);
  assert.deepEqual(r.tombstones.remoteDeleted, ["a.md"]);
});

test("双向：远端删了，镜像开 -> deleteLocal", () => {
  const r = computeDiff([local("a.md")], [], [last("a.md", "f1")], tw(true));
  assert.deepEqual(r.plan, [{ kind: "deleteLocal", path: "a.md" }]);
});

test("双向：两边都没了 -> 状态与墓碑都清掉", () => {
  const r = computeDiff([], [], [last("a.md", "f1")], tw(false, { localDeleted: ["a.md"], remoteDeleted: [] }));
  assert.deepEqual(r.dropState, ["a.md"]);
  assert.deepEqual(r.tombstones.localDeleted, []);
});

test("双向：本地重建已删文件 -> 墓碑清掉，正常上传", () => {
  const r = computeDiff([local("a.md")], [], [], tw(false, { localDeleted: ["a.md"], remoteDeleted: [] }));
  assert.deepEqual(r.plan, [{ kind: "upload", path: "a.md" }]);
  assert.deepEqual(r.tombstones.localDeleted, []);
});

test("双向：未变文件 -> 跳过且从列表学会远端 updatedAt", () => {
  const r = computeDiff(
    [local("a.md")],
    [remoteU("a.md", "f1", 10, 2000)],
    [lastU("a.md", "f1", 10, "aaa", 1000, { remoteSize: 10 })],
    tw(),
  );
  assert.deepEqual(r.plan, []);
  assert.deepEqual(r.skipped, ["a.md"]);
  assert.equal(r.refreshed[0].remoteUpdatedAt, 2000);
});
