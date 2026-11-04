import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { md5Hex } from "../src/md5.ts";
import { sha256Hex, sha1Hex } from "../src/hash.ts";

const enc = new TextEncoder();

function sys(cmd: string, input: string): string {
  return execFileSync(cmd, { input, encoding: "utf8" }).trim();
}

test("MD5 与系统 md5sum 一致（空串/短串/中文）", () => {
  for (const s of ["", "hello", "Obsidian 夸克同步测试 2026", "a".repeat(1000)]) {
    assert.equal(md5Hex(enc.encode(s)), sys("md5sum", s).split(" ")[0], JSON.stringify(s));
  }
});

test("SHA-256 / SHA-1 与系统工具一致", async () => {
  for (const s of ["", "hello", "Obsidian 夸克同步测试 2026"]) {
    assert.equal(await sha256Hex(enc.encode(s)), sys("sha256sum", s).split(" ")[0]);
    assert.equal(await sha1Hex(enc.encode(s)), sys("sha1sum", s).split(" ")[0]);
  }
});
