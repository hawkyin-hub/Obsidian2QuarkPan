import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeFileName } from "../src/sync.ts";

test("删除 9 个非法字符，其余不动", () => {
  assert.equal(sanitizeFileName('严格按"教材编写要求"评估《牛顿运动定律_预习自学讲义》.md'), "严格按教材编写要求评估《牛顿运动定律_预习自学讲义》.md");
  assert.equal(sanitizeFileName('项羽：一个失败"创业者"的史诗级悲剧.md'), "项羽：一个失败创业者的史诗级悲剧.md");
  assert.equal(sanitizeFileName("a<b>c:d|e?f*g.md"), "abcdefg.md");
  assert.equal(sanitizeFileName("正常名字.md"), "正常名字.md");
});

test("全角冒号不是非法字符", () => {
  assert.equal(sanitizeFileName("项羽：一个失败者.md"), "项羽：一个失败者.md");
});

test("清完变空或只剩点时给兜底名", () => {
  assert.equal(sanitizeFileName('".md'), "未命名.md");
  assert.equal(sanitizeFileName('""'), "未命名");
});
