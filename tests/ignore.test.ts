import test from "node:test";
import assert from "node:assert/strict";
import { isIgnored } from "../src/ignore.ts";

test("默认忽略 .obsidian / .git / .trash", () => {
  assert.equal(isIgnored(".obsidian/plugins/x/data.json", []), true);
  assert.equal(isIgnored(".git/config", []), true);
  assert.equal(isIgnored(".trash/old.md", []), true);
  assert.equal(isIgnored("笔记/a.md", []), false);
});

test("用户 glob：目录 ** 与单段 *", () => {
  assert.equal(isIgnored("私人/日记/a.md", ["私人/**"]), true);
  assert.equal(isIgnored("私人/a.md", ["私人/**"]), true);
  assert.equal(isIgnored("公开/私人/a.md", ["私人/**"]), false);
  assert.equal(isIgnored("a.tmp", ["*.tmp"]), true);
  assert.equal(isIgnored("子目录/a.tmp", ["*.tmp"]), false);
  assert.equal(isIgnored("子目录/a.tmp", ["**/*.tmp"]), true);
});

test("默认忽略构建产物 target / node_modules", () => {
  assert.equal(isIgnored("projects/RayLaunch/src-tauri/target/release/deps/x.rlib", []), true);
  assert.equal(isIgnored("target/debug/a", []), true);
  assert.equal(isIgnored("web/node_modules/react/index.js", []), true);
  assert.equal(isIgnored("笔记/target.md", []), false);
  assert.equal(isIgnored("my-target/x.md", []), false);
  assert.equal(isIgnored("笔记/a.md", []), false);
});
