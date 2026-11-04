// End-to-end Obsidian flow harness (NOT a unit test).
//
// v0.1.5 rewrite: the plugin no longer uses browser fetch at all in
// Obsidian — it uses Obsidian's requestUrl(), which bypasses CORS.
// Browser fetch from an Obsidian plugin is CORS-blocked by quark.cn, which
// is why real Mac runs reported "Failed to fetch" for BOTH test connection
// and QR token in v0.1.4. So this harness now makes browser fetch THROW
// for every quark URL: if any plugin code path still used fetch, the flow
// fails here. The only allowed channel is the requestUrl mock below,
// which behaves like Electron's net layer: no CORS check, Cookie header
// sent as given, Set-Cookie exposed in response headers.
//
// Flow clicked in the user's order (real bundled main.js, obsidian module
// aliased to tests/obsidian-stub.ts):
//   QR login -> Test connection -> Sync -> restart -> Test connection again
//   + paste-cookie flow + connection-gate test (sync must refuse BEFORE
//     uploading anything when the connection is down).
//
// Usage: node tests/e2e-obsidian-flow.mjs   (also: npm run e2e)

import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "..");
const bundlePath = path.join(root, "tests", ".e2e-bundle.cjs");

function assert(cond, msg) {
  if (!cond) throw new Error(`HARNESS FAIL: ${msg}`);
  console.log(`  ok: ${msg}`);
}
function lastNotice() {
  const n = globalThis.__notices;
  return n[n.length - 1] ?? "(no notice)";
}

// ---------------- Mock Quark server (unchanged API surface) ----------------
function makeServer(opts = {}) {
  let fidSeq = 1000;
  const folders = new Map([["0", { fid: "0", name: "", parent: null, type: 0 }]]);
  const files = new Map();
  const pending = new Map();
  let pollCount = 0;
  let preCount = 0;
  let jarSession = false;
  const nextFid = () => String(fidSeq++);
  const children = (parent) => [
    ...[...folders.values()].filter((f) => f.parent === parent).map((f) => ({ fid: f.fid, file_name: f.name, file_type: 0, size: 0 })),
    ...[...files.values()].filter((f) => f.parent === parent).map((f) => ({ fid: f.fid, file_name: f.name, file_type: 1, size: f.bytes.length, updated_at: f.updated_at ?? 1700000000000 })),
  ];
  return {
    state: { folders, files, get preCount() { return preCount; }, get jarSession() { return jarSession; } },
    async handle(urlStr, method, headers, bodyText) {
      const u = new URL(urlStr);
      const host = u.hostname;
      const json = (data, status = 200) => ({ ok: true, status, data });
      if (host === "uop.quark.cn" && u.pathname.endsWith("getTokenForQrcodeLogin"))
        return json({ status: 2000000, data: { members: { token: "qr-token" } } });
      if (host === "uop.quark.cn" && u.pathname.endsWith("getServiceTicketByQrcodeToken")) {
        pollCount++;
        if (pollCount < 3) return json({ status: 50004001, data: {} });
        return json({ status: 2000000, data: { members: { service_ticket: "ticket-1" } } });
      }
      if (host === "pan.quark.cn" && u.pathname === "/account/info") {
        if (u.searchParams.get("st") !== "ticket-1") return json({ status: 50004001, data: {} }, 200);
        // Jar-only mode (real Obsidian requestUrl behaviour under test):
        // the session lands in Electron's jar and is NOT exposed via
        // Set-Cookie, so the plugin holds no readable cookie at all.
        if (opts.jarOnly) { jarSession = true; return { ok: true, status: 200, data: { status: 2000000 } }; }
        return { ok: true, status: 200, data: { status: 2000000 }, __setCookie: "__puus=qr-session; Path=/; Domain=.quark.cn" };
      }
      if (host.endsWith(".pds.quark.cn")) {
        const objKey = decodeURIComponent(u.pathname.slice(1));
        if (method === "PUT") {
          if (globalThis.__uploadDelayMs) await new Promise((r) => setTimeout(r, globalThis.__uploadDelayMs));
          const task = [...pending.values()].find((p) => p.objKey === objKey);
          if (task) task.chunks.set(Number(u.searchParams.get("partNumber")), Buffer.from(bodyText ?? "", "utf8"));
          return { ok: true, status: 200, data: null, __etag: "mock-etag-1" };
        }
        return { ok: true, status: 200, data: null };
      }
      if (host === "drive-pc.quark.cn") {
        const authed = headers["__authed"];
        const body = bodyText ? JSON.parse(bodyText) : {};
        const p = u.pathname.replace("/1/clouddrive/", "");
        if (p === "file/sort") {
          if (!authed) return json({ status: 401, code: 0, message: "login required" });
          const parent = u.searchParams.get("pdir_fid") ?? "0";
          const page = Number(u.searchParams.get("_page") ?? 1);
          const size = Number(u.searchParams.get("_size") ?? 100);
          const all = children(parent);
          return json({ status: 200, code: 0, data: { list: all.slice((page - 1) * size, page * size) } });
        }
        if (p === "file" && method === "POST") {
          if (!authed) return json({ status: 401, code: 0, message: "login required" });
          const fid = nextFid();
          folders.set(fid, { fid, name: body.file_name, parent: body.pdir_fid, type: 0 });
          return json({ status: 200, code: 0, data: { fid } });
        }
        if (p === "file/delete") {
          for (const fid of body.filelist ?? []) files.delete(fid);
          return json({ status: 200, code: 0, data: {} });
        }
        if (p === "file/rename") return json({ status: 200, code: 0, data: {} });
        if (p === "file/move") return json({ status: 200, code: 0, data: { finish: true } });
        if (p === "file/download") {
          const fid = (body.fids ?? [])[0];
          return json({ status: 200, code: 0, data: [{ download_url: `https://mock-download/file/${fid}`, file_name: "x", size: 1 }] });
        }
        if (p === "file/upload/pre") {
          preCount++;
          const taskId = `task-${nextFid()}`;
          pending.set(taskId, { pdir_fid: body.pdir_fid, file_name: body.file_name, objKey: `obj-${taskId}`, chunks: new Map() });
          return json({ status: 200, code: 0, data: { task_id: taskId, upload_id: `up-${taskId}`, obj_key: `obj-${taskId}`, bucket: "mock-bucket", auth_info: "auth", callback: {} } });
        }
        if (p === "file/update/hash") return json({ status: 200, code: 0, data: {} });
        if (p === "file/upload/auth") return json({ status: 200, code: 0, data: { auth_key: "mock-auth-key" } });
        if (p === "file/upload/finish") {
          const task = pending.get(body.task_id);
          if (task) {
            const parts = [...task.chunks.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
            const fid = nextFid();
            files.set(fid, { fid, name: task.file_name, parent: task.pdir_fid, type: 1, bytes: Buffer.concat(parts), updated_at: Date.now() });
          }
          return json({ status: 200, code: 0, data: {} });
        }
        if (p === "task") return json({ status: 200, code: 0, data: { status: 2 } });
        throw new Error(`unmocked drive-pc route ${method} ${p}`);
      }
      if (host === "mock-download") {
        const fid = u.pathname.split("/").pop();
        const f = files.get(fid);
        return { ok: true, status: 200, data: f ? f.bytes : Buffer.from("x") };
      }
      throw new Error(`unmocked host ${host} ${u.pathname}`);
    },
  };
}

// ---------------- Obsidian requestUrl mock (Electron net behaviour) ----------------
function makeRequestUrlImpl(server) {
  return async (req) => {
    if (globalThis.__requestUrlDown && String(req.url).includes("drive-pc.quark.cn")) {
      throw new TypeError("Failed to fetch");
    }
    const headers = { ...(req.headers ?? {}) };
    const cookie = headers.cookie ?? headers.Cookie ?? "";
    const hasCookieHeader = headers.cookie !== undefined || headers.Cookie !== undefined;
    // Electron jar model: an omitted Cookie header lets the jar attach the
    // QR session; an explicit (even empty) Cookie header overrides it.
    const authed = String(cookie).includes("__puus=") || (!hasCookieHeader && server.state.jarSession);
    let bodyText;
    if (typeof req.body === "string") bodyText = req.body;
    else if (req.body instanceof ArrayBuffer) bodyText = Buffer.from(req.body).toString("utf8");
    const res = await server.handle(String(req.url), req.method ?? "GET", { ...headers, __authed: authed }, bodyText);
    const outHeaders = {};
    if (res.__setCookie) outHeaders["set-cookie"] = res.__setCookie;
    // Server refresh simulation: a pasted cookie gets refreshed on first use.
    if (String(req.url).includes("file/sort") && String(cookie).includes("pasted-session")) {
      outHeaders["set-cookie"] = "__puus=refreshed-session; Path=/; Domain=.quark.cn";
    }
    if (res.__etag) outHeaders["etag"] = `"${res.__etag}"`;
    return {
      status: res.status,
      headers: outHeaders,
      json: res.data,
      text: typeof res.data === "string" ? res.data : JSON.stringify(res.data),
      arrayBuffer: Buffer.isBuffer(res.data) ? res.data.buffer.slice(res.data.byteOffset, res.data.byteOffset + res.data.byteLength) : new ArrayBuffer(0),
    };
  };
}

// ---------------- Plugin loading ----------------
async function loadPlugin(app, manifest) {
  await build({
    entryPoints: [path.join(root, "src", "main.ts")],
    bundle: true,
    format: "cjs",
    platform: "node",
    outfile: bundlePath,
    alias: { obsidian: path.join(root, "tests", "obsidian-stub.ts") },
    logLevel: "silent",
  });
  delete createRequire(import.meta.url).cache[bundlePath];
  const mod = createRequire(import.meta.url)(bundlePath);
  const PluginClass = mod.default ?? mod;
  const plugin = new PluginClass(app, manifest);
  await plugin.onload();
  return plugin;
}
function findButton(text) {
  for (const s of globalThis.__settings) {
    for (const b of s.buttons) if (b.text === text) return b;
  }
  throw new Error(`button not found: ${text}`);
}
async function click(text) {
  const b = findButton(text);
  globalThis.__notices = [];
  await b.onClick();
}
async function waitNotice(ms = 8000) {
  const t0 = Date.now();
  while (globalThis.__notices.length === 0 && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 50));
}
async function waitSyncDone(plugin, ms = 8000) {
  const t0 = Date.now();
  while (plugin.running && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 50));
}
function makeVault() {
  const content = Buffer.from("# Test\nhello obsidian\n", "utf8");
  const file = { path: "笔记/test.md", stat: { mtime: 1700000000000 } };
  return {
    vault: {
      getFiles: () => [file],
      readBinary: async () => content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength),
    },
  };
}
// Mutable in-memory vault for the bidirectional section: supports the
// writes a download needs (createBinary/modifyBinary/createFolder/trash).
function makeMutableVault(initial = []) {
  const files = new Map();
  const folders = new Set();
  for (const f of initial) files.set(f.path, { path: f.path, content: Buffer.from(f.content, "utf8"), mtime: f.mtime ?? 1700000000000 });
  const vault = {
    getFiles: () => [...files.values()].map((f) => ({ path: f.path, stat: { mtime: f.mtime } })),
    readBinary: async (file) => {
      const rec = files.get(file.path);
      return rec.content.buffer.slice(rec.content.byteOffset, rec.content.byteOffset + rec.content.byteLength);
    },
    createBinary: async (path, data) => {
      const content = Buffer.from(data);
      files.set(path, { path, content, mtime: Date.now() });
      return { path, stat: { mtime: Date.now() } };
    },
    modifyBinary: async (file, data) => {
      const rec = files.get(file.path);
      rec.content = Buffer.from(data);
      rec.mtime = Date.now();
    },
    createFolder: async (path) => { folders.add(path); return { path }; },
    getAbstractFileByPath: (path) => {
      if (files.has(path)) { const f = files.get(path); return { path, stat: { mtime: f.mtime } }; }
      if (folders.has(path)) return { path };
      return null;
    },
    rename: async (file, newPath) => {
      const rec = files.get(file.path);
      files.delete(file.path);
      rec.path = newPath;
      files.set(newPath, rec);
    },
    trash: async (file) => { files.delete(file.path); },
  };
  return { vault, files, folders };
}
function setupEnv(server) {
  // Browser fetch is CORS-blocked for quark.cn in Obsidian: make it throw,
  // so any plugin path still using fetch fails loudly instead of silently.
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  globalThis.__requestUrlImpl = makeRequestUrlImpl(server);
  globalThis.__requestUrlDown = false;
}

// ---------------- Main flow via requestUrl ----------------
console.log("\n== mode: Obsidian requestUrl (browser fetch throws) ==");
{
  const server = makeServer();
  setupEnv(server);
  globalThis.__store = null;
  globalThis.__notices = [];
  const manifest = { id: "obsidian-quark-sync", name: "Quark Sync", version: JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")).version };

  let plugin = await loadPlugin(makeVault(), manifest);
  globalThis.__settings = [];
  globalThis.__settingTab.display();
  const h2 = globalThis.__settingTab.containerEl.children.find((c) => c.tag === "h2");
  assert(h2 && String(h2.text).includes(manifest.version), `settings header shows version ${manifest.version} (got: ${h2?.text})`);
  const verRow = globalThis.__settings.find((s) => String(s.name).startsWith("当前版本"));
  assert(verRow && String(verRow.name).includes(manifest.version), `version row shows ${manifest.version} in its name`);
  // v0.1.22: the update note + orientation hide behind a superscript "!" on
  // the version row; clicking it toggles the description.
  assert(verRow.descEl.style.display === "none", "version note is hidden until the ! marker is clicked");
  const mark = verRow.nameEl.children.find((c) => c.text === "!");
  assert(mark, "superscript ! marker exists on the version row");
  mark.onclick();
  assert(verRow.descEl.style.display !== "none", "clicking ! shows the version note");
  assert(String(verRow.desc).includes("只覆盖 main.js") && String(verRow.desc).includes("双向同步"), "expanded note holds the update note and the two-way orientation");
  mark.onclick();
  assert(verRow.descEl.style.display === "none", "clicking ! again hides the version note");
  assert(!globalThis.__settingTab.containerEl.children.some((c) => c.tag === "p" && String(c.text ?? "").includes("双向同步")), "no standalone orientation paragraph anymore (it moved behind !)");

  // QR login is removed (2026-11-03) and its transition notes are gone for
  // release (v0.1.21): no QR button, no cancelled-QR row, no jar warning.
  let qrButtonGone = false;
  try { findButton("获取二维码"); } catch { qrButtonGone = true; }
  assert(qrButtonGone, "no QR button is offered anymore");
  assert(!globalThis.__settings.some((s) => s.name === "二维码登录已取消"), "dead cancelled-QR note is gone from release UI");
  assert(!globalThis.__settings.some((s) => s.name === "扫码登录态未固化"), "legacy QR jar warning is gone from release UI");
  plugin.settings.cookie = "__puus=pasted-session; other=x";
  await plugin.saveSettings();

  await click("测试连接");
  assert(lastNotice().includes("夸克连接正常"), `test connection after QR succeeds (got: ${lastNotice()})`);

  await click("开始同步");
  await waitNotice();
  assert(lastNotice().includes("失败 0"), `sync completes with 0 failures (got: ${lastNotice()})`);
  assert([...server.state.files.values()].some((f) => f.name === "test.md"), "sync uploaded test.md to mock Quark");
  // Push, not polling: the panel already holds the new records the moment
  // sync returns -- no wait -- newest on top, progress counted in files.
  const pre = globalThis.__settingTab.containerEl.children.find((c) => c.tag === "pre");
  const logText = String(pre?.textContent ?? pre?.text ?? "");
  assert(logText.includes("上传成功") && logText.includes("test.md"), `live log shows per-file success below settings (got: ${logText.slice(-200)})`);
  assert(logText.indexOf("同步完成") < logText.indexOf("上传成功"), `newest log first (got head: ${logText.slice(0, 200)})`);
  assert(plugin.progressText().includes("已完成 1 / 共 1"), `progress counts files (got: ${plugin.progressText()})`);
  const progEl = globalThis.__settingTab.containerEl.children.find((c) => String(c.textContent ?? c.text ?? "").includes("同步进度"));
  assert(progEl && String(progEl.textContent ?? progEl.text ?? "").includes("已完成 1 / 共 1"), "progress line shown in the log area");
  assert(/上一次同步：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(plugin.lastSyncText()), `last sync time shown in Beijing time (got: ${plugin.lastSyncText()})`);
  const lastEl = globalThis.__settingTab.containerEl.children.find((c) => String(c.textContent ?? c.text ?? "").includes("上一次同步"));
  assert(lastEl && !String(lastEl.textContent ?? lastEl.text ?? "").includes("尚未同步"), "last sync line shown in the log area");
  await click("清除日志");
  assert(lastNotice().includes("同步日志已清除"), `clear-log notice shown (got: ${lastNotice()})`);
  assert(plugin.logText() === "", "clear-log empties the in-memory log");
  globalThis.__settingTab.hide();

  plugin = await loadPlugin(makeVault(), manifest);
  globalThis.__settings = [];
  globalThis.__settingTab.display();
  assert(!plugin.lastSyncText().includes("尚未同步"), `last sync time survives restart (got: ${plugin.lastSyncText()})`);
  assert(plugin.progressText().includes("已完成 1 / 共 1"), `completed count survives restart (got: ${plugin.progressText()})`);
  assert(globalThis.__store?.lastProgress?.done === 1 && globalThis.__store?.lastProgress?.total === 1, `completed count persisted in data (got: ${JSON.stringify(globalThis.__store?.lastProgress)})`);
  await click("测试连接");
  assert(lastNotice().includes("夸克连接正常"), `test connection after restart succeeds (got: ${lastNotice()})`);
  globalThis.__settingTab.hide();
  console.log("== requestUrl flow: ALL PASSED ==");
}

// ---------------- Paste-cookie flow via requestUrl ----------------
// ---------------- legacy QR flag is ignored ----------------
console.log("\n== legacy QR flag ignored ==");
{
  const server = makeServer();
  setupEnv(server);
  const manifest = { id: "obsidian-quark-sync", name: "Quark Sync", version: JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")).version };
  const plugin = await loadPlugin(makeVault(), manifest);
  // An old data.json may still carry qrLoggedIn=true from the QR era: the
  // release build ignores it (no warning row) and treats empty cookie as
  // simply logged out, with a plain paste instruction.
  plugin.settings.qrLoggedIn = true;
  plugin.settings.cookie = "";
  globalThis.__settings = [];
  globalThis.__settingTab.display();
  assert(!globalThis.__settings.some((s) => s.name === "扫码登录态未固化"), "no legacy QR warning row in release UI");
  await click("测试连接");
  assert(lastNotice().includes("请先粘贴夸克 Cookie"), `empty cookie asks for paste, not a QR flow (got: ${lastNotice()})`);
  globalThis.__settingTab.hide();
  console.log("== legacy QR flag ignored: PASSED ==");
}

// ---------------- Illegal filename auto-rename (user's standing rule) ----------------
console.log("\n== illegal filename auto-rename ==");
{
  const server = makeServer();
  setupEnv(server);
  globalThis.__store = null;
  const manifest = { id: "obsidian-quark-sync", name: "Quark Sync", version: JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")).version };
  const mkFile = (pathName) => ({ path: pathName, stat: { mtime: 1700000000000 } });
  const fNormal = mkFile("笔记/正常.md");
  const fIllegal = mkFile('笔记/带"引号".md');
  const fLegalClash = mkFile("笔记/带引号.md");
  const contents = new Map([
    [fNormal, Buffer.from("normal", "utf8")],
    [fIllegal, Buffer.from("illegal", "utf8")],
    [fLegalClash, Buffer.from("legal", "utf8")],
  ]);
  const app = {
    vault: {
      getFiles: () => [fNormal, fIllegal, fLegalClash],
      readBinary: async (f) => {
        const b = contents.get(f);
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      },
      rename: async (f, newPath) => { f.path = newPath; },
    },
  };
  const plugin = await loadPlugin(app, manifest);
  globalThis.__settings = [];
  globalThis.__settingTab.display();
  plugin.settings.cookie = "__puus=pasted-session; other=x";
  await plugin.saveSettings();
  await click("开始同步");
  await waitNotice();
  assert(lastNotice().includes("失败 0"), `rename sync completes (got: ${lastNotice()})`);
  assert(!fIllegal.path.includes('"'), `local illegal file was renamed in place (got: ${fIllegal.path})`);
  assert(fIllegal.path === "笔记/带引号 (2).md", `collision gets a suffix, legal file untouched (got: ${fIllegal.path}, legal still: ${fLegalClash.path})`);
  assert(fLegalClash.path === "笔记/带引号.md", "legal file is never renamed");
  const names = [...server.state.files.values()].map((f) => f.name);
  assert(names.includes("带引号 (2).md") && names.includes("正常.md") && names.includes("带引号.md"), `sanitised names uploaded (got: ${names.join(", ")})`);
  assert(plugin.logText().includes("本地文件名已清理"), "rename is logged");
  globalThis.__settingTab.hide();
  console.log("== illegal filename auto-rename: PASSED ==");
}

// ---------------- Log push stops on hide, resumes on open ----------------
console.log("\n== log push stops on hide, resumes on open ==");
{
  const server = makeServer();
  setupEnv(server);
  globalThis.__store = null;
  globalThis.__notices = [];
  const manifest = { id: "obsidian-quark-sync", name: "Quark Sync", version: JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")).version };
  const plugin = await loadPlugin(makeVault(), manifest);
  globalThis.__settings = [];
  globalThis.__settingTab.display();
  plugin.settings.cookie = "__puus=pasted-session; other=x";
  await plugin.saveSettings();
  await click("开始同步");
  await waitNotice();
  assert(lastNotice().includes("失败 0"), `stop-push sync completes (got: ${lastNotice()})`);
  const pre = globalThis.__settingTab.containerEl.children.find((c) => c.tag === "pre");
  const preText = String(pre?.textContent ?? pre?.text ?? "");
  const progEl = globalThis.__settingTab.containerEl.children.find((c) => String(c.textContent ?? c.text ?? "").includes("同步进度"));
  const progText = String(progEl?.textContent ?? progEl?.text ?? "");
  assert(preText.includes("上传成功"), "panel holds the new record right after sync");
  assert(progText.includes("已完成 1 / 共 1"), `panel shows progress (got: ${progText})`);
  globalThis.__settingTab.hide();
  plugin.clearLog();
  assert(String(pre?.textContent ?? pre?.text ?? "") === preText, "closed window receives no pushes (log panel frozen)");
  assert(String(progEl?.textContent ?? progEl?.text ?? "") === progText, "closed window receives no pushes (progress frozen)");
  assert(plugin.logText() === "", "internal log really was cleared while the panel stayed frozen");
  globalThis.__settingTab.display();
  const pre2 = globalThis.__settingTab.containerEl.children.find((c) => c.tag === "pre");
  const progEl2 = globalThis.__settingTab.containerEl.children.find((c) => String(c.textContent ?? c.text ?? "").includes("同步进度"));
  assert(String(pre2?.textContent ?? pre2?.text ?? "") === "", "reopening re-renders the current (cleared) log");
  assert(String(progEl2?.textContent ?? progEl2?.text ?? "").includes("已完成 1 / 共 1"), "reopening keeps the last progress");
  globalThis.__settingTab.hide();
  console.log("== log push stops on hide, resumes on open: PASSED ==");
}

// ---------------- Incomplete sync still saves time ----------------
console.log("\n== incomplete sync still saves time ==");
{
  const server = makeServer();
  setupEnv(server);
  globalThis.__store = null;
  globalThis.__notices = [];
  const manifest = { id: "obsidian-quark-sync", name: "Quark Sync", version: JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")).version };
  const badVault = {
    vault: {
      getFiles: () => [{ path: "笔记/test.md", stat: { mtime: 1700000000000 } }],
      readBinary: async () => { throw new Error("read boom"); },
    },
  };
  const plugin = await loadPlugin(badVault, manifest);
  globalThis.__settings = [];
  globalThis.__settingTab.display();
  plugin.settings.cookie = "__puus=pasted-session; other=x";
  await plugin.saveSettings();
  await click("开始同步");
  await waitNotice();
  assert(lastNotice().includes("失败"), `interrupted sync reports failure (got: ${lastNotice()})`);
  assert(!plugin.lastSyncText().includes("尚未同步"), `attempt time saved even though sync never finished (got: ${plugin.lastSyncText()})`);
  assert(typeof globalThis.__store?.lastSyncAt === "string", "attempt time persisted in data");
  const savedTime = plugin.lastSyncText();
  const plugin2 = await loadPlugin(makeVault(), manifest);
  assert(plugin2.lastSyncText() === savedTime, `attempt time survives restart (got: ${plugin2.lastSyncText()})`);
  globalThis.__settingTab.hide();
  console.log("== incomplete sync still saves time: PASSED ==");
}

// ---------------- Remote same-name adoption (user's manual copies) ----------------
console.log("\n== remote same-name adoption ==");
{
  const server = makeServer();
  setupEnv(server);
  globalThis.__store = null;
  globalThis.__notices = [];
  const manifest = { id: "obsidian-quark-sync", name: "Quark Sync", version: JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")).version };
  // Pre-seed the ROOT target folder: targetFolder "" -> target fid "0".
  server.state.files.set("900", { fid: "900", name: "已有.md", parent: "0", type: 1, bytes: Buffer.from("same", "utf8") });
  server.state.files.set("901", { fid: "901", name: "不同.md", parent: "0", type: 1, bytes: Buffer.from("old", "utf8") });
  const mkFile = (pathName) => ({ path: pathName, stat: { mtime: 1700000000000 } });
  const fHave = mkFile("已有.md");
  const fDiff = mkFile("不同.md");
  const contents = new Map([
    [fHave, Buffer.from("same", "utf8")],
    [fDiff, Buffer.from("local-new-content", "utf8")],
  ]);
  const app = {
    vault: {
      getFiles: () => [fHave, fDiff],
      readBinary: async (f) => {
        const b = contents.get(f);
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      },
      rename: async (f, newPath) => { f.path = newPath; },
    },
  };
  const plugin = await loadPlugin(app, manifest);
  globalThis.__settings = [];
  globalThis.__settingTab.display();
  plugin.settings.cookie = "__puus=pasted-session; other=x";
  plugin.settings.targetFolder = "";
  await plugin.saveSettings();
  await click("开始同步");
  await waitNotice();
  assert(lastNotice().includes("失败 0"), `adoption sync completes (got: ${lastNotice()})`);
  assert(server.state.preCount === 1, `only the different-size file uploads (preCount got: ${server.state.preCount})`);
  assert(plugin.logText().includes("已标记为已上传") && plugin.logText().includes("已有.md"), "adoption is logged");
  const adopted = plugin.lastState.find((s) => s.path === "已有.md");
  assert(adopted && adopted.fid === "900", `adopted file recorded with the remote fid (got: ${JSON.stringify(adopted)})`);
  const diffed = [...server.state.files.values()].find((f) => f.name === "不同.md");
  assert(diffed && String(diffed.bytes) === "local-new-content", "different-size file was re-uploaded from local");
  globalThis.__settingTab.hide();
  console.log("== remote same-name adoption: PASSED ==");
}

// ---------------- Play/pause sync button ----------------
console.log("\n== play/pause sync button ==");
{
  const server = makeServer();
  setupEnv(server);
  globalThis.__store = null;
  globalThis.__notices = [];
  globalThis.__uploadDelayMs = 800;
  const manifest = { id: "obsidian-quark-sync", name: "Quark Sync", version: JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")).version };
  const mkFile = (pathName, content) => ({ path: pathName, stat: { mtime: 1700000000000 }, __content: Buffer.from(content, "utf8") });
  const fA = mkFile("a.md", "aaa");
  const fB = mkFile("b.md", "bbb");
  const fC = mkFile("c.md", "ccc");
  const app = {
    vault: {
      getFiles: () => [fA, fB, fC],
      readBinary: async (f) => {
        const b = f.__content;
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      },
      rename: async (f, newPath) => { f.path = newPath; },
    },
  };
  const plugin = await loadPlugin(app, manifest);
  globalThis.__settings = [];
  globalThis.__settingTab.display();
  plugin.settings.cookie = "__puus=pasted-session; other=x";
  await plugin.saveSettings();
  const startBtn = findButton("开始同步");
  assert(startBtn.icon === "play", `idle button shows play (got: ${startBtn.icon})`);
  await click("开始同步");
  // Past the 1 s double-tap grace, still mid-run (file b uploading).
  await new Promise((r) => setTimeout(r, 1100));
  const pauseBtn = findButton("暂停同步");
  assert(pauseBtn.icon === "pause", `syncing button shows pause (got: ${pauseBtn.icon})`);
  await click("暂停同步");
  await waitSyncDone(plugin);
  assert(!plugin.running, "run stops after pause");
  const afterPause = findButton("开始同步");
  assert(afterPause.icon === "play", `paused button flips back to play (got: ${afterPause.icon})`);
  const names = [...server.state.files.values()].map((f) => f.name);
  assert(names.includes("a.md") && names.includes("b.md") && !names.includes("c.md"), `pause finishes the current file only (got: ${names.join(", ")})`);
  assert(plugin.logText().includes("同步已暂停"), "pause is logged");
  assert(plugin.progressText().includes("已暂停"), `progress shows paused (got: ${plugin.progressText()})`);
  assert(plugin.lastState.some((s) => s.path === "a.md") && plugin.lastState.some((s) => s.path === "b.md"), "partial state saved, finished files not redone");
  globalThis.__uploadDelayMs = 0;
  await click("开始同步");
  await waitSyncDone(plugin);
  const names2 = [...server.state.files.values()].map((f) => f.name);
  assert(names2.includes("a.md") && names2.includes("b.md") && names2.includes("c.md"), `resume uploads the rest (got: ${names2.join(", ")})`);
  assert(lastNotice().includes("同步完成"), `resume completes (got: ${lastNotice()})`);
  globalThis.__settingTab.hide();
  console.log("== play/pause sync button: PASSED ==");
}

// ---------------- Start flips button at once; double-tap grace ----------------
// ---------------- Part progress shows during a multi-part upload ----------------
console.log("\n== part progress during multi-part upload ==");
{
  const server = makeServer();
  setupEnv(server);
  globalThis.__store = null;
  globalThis.__notices = [];
  globalThis.__uploadDelayMs = 400;
  const manifest = { id: "obsidian-quark-sync", name: "Quark Sync", version: JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")).version };
  const big = { path: "big.bin", stat: { mtime: 1700000000000 }, content: Buffer.alloc(4 * 1024 * 1024 + 1, 7) };
  const app = {
    vault: {
      getFiles: () => [big],
      readBinary: async (f) => f.content.buffer.slice(f.content.byteOffset, f.content.byteOffset + f.content.byteLength),
    },
  };
  const plugin = await loadPlugin(app, manifest);
  globalThis.__settings = [];
  globalThis.__settingTab.display();
  plugin.settings.cookie = "__puus=pasted-session; other=x";
  await plugin.saveSettings();
  await click("开始同步");
  // Two parts, 400 ms each: while the upload is in flight the progress
  // line must name the current part instead of standing still.
  let sawPart = false;
  for (let i = 0; i < 50 && !sawPart; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (plugin.progressText().includes("分片")) sawPart = true;
  }
  assert(sawPart, `part progress visible mid-upload (got: ${plugin.progressText()})`);
  await waitSyncDone(plugin);
  assert([...server.state.files.values()].some((f) => f.name === "big.bin"), "multi-part file uploaded");
  globalThis.__uploadDelayMs = 0;
  globalThis.__settingTab.hide();
  console.log("== part progress during multi-part upload: PASSED ==");
}

console.log("\n== start flips button at once, double-tap grace ==");
{
  const server = makeServer();
  setupEnv(server);
  globalThis.__store = null;
  globalThis.__notices = [];
  const manifest = { id: "obsidian-quark-sync", name: "Quark Sync", version: JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")).version };
  const plugin = await loadPlugin(makeVault(), manifest);
  globalThis.__settings = [];
  globalThis.__settingTab.display();
  plugin.settings.cookie = "__puus=pasted-session; other=x";
  await plugin.saveSettings();
  await click("开始同步");
  // No waiting: the button must already read pause, or the user takes a
  // second tap for a no-op and cancels the run they just started.
  const pauseBtn = findButton("暂停同步");
  assert(pauseBtn.icon === "pause", `button flips to pause at once (got: ${pauseBtn.icon})`);
  // A second tap inside the 1 s grace window must not cancel the run.
  await click("暂停同步");
  await waitNotice();
  assert(lastNotice().includes("同步完成"), `grace-ignored tap still lets the sync finish (got: ${lastNotice()})`);
  assert(!plugin.logText().includes("同步已暂停"), "no pause was recorded for the grace-ignored tap");
  assert([...server.state.files.values()].some((f) => f.name === "test.md"), "file uploaded despite the extra tap");
  globalThis.__settingTab.hide();
  console.log("== start flips button at once, double-tap grace: PASSED ==");
}

console.log("\n== paste-cookie flow via requestUrl ==");
{
  const server = makeServer();
  setupEnv(server);
  globalThis.__store = null;
  globalThis.__notices = [];
  const manifest = { id: "obsidian-quark-sync", name: "Quark Sync", version: "0" };
  const plugin = await loadPlugin(makeVault(), manifest);
  globalThis.__settings = [];
  globalThis.__settingTab.display();
  plugin.settings.cookie = "__puus=pasted-session; other=x";
  await plugin.saveSettings();
  await click("测试连接");
  assert(lastNotice().includes("夸克连接正常"), `paste-cookie test connection succeeds (got: ${lastNotice()})`);
  assert(plugin.settings.cookie.includes("__puus=refreshed-session"), "auto-update: refreshed cookie persisted to settings after test connection");
  await click("开始同步");
  await waitNotice();
  assert(lastNotice().includes("失败 0"), `paste-cookie sync completes (got: ${lastNotice()})`);
  globalThis.__settingTab.hide();
  console.log("== paste-cookie via requestUrl: PASSED ==");
}

// ---------------- Connection gate: down -> sync must refuse, zero uploads ----------------
console.log("\n== connection gate (requestUrl down) ==");
{
  const server = makeServer();
  setupEnv(server);
  globalThis.__store = null;
  globalThis.__notices = [];
  const manifest = { id: "obsidian-quark-sync", name: "Quark Sync", version: "0" };
  const plugin = await loadPlugin(makeVault(), manifest);
  globalThis.__settings = [];
  globalThis.__settingTab.display();
  plugin.settings.cookie = "__puus=pasted-session; other=x";
  await plugin.saveSettings();
  globalThis.__requestUrlDown = true;
  await click("开始同步");
  await waitNotice();
  assert(lastNotice().includes("同步未开始"), `sync refuses upfront when connection is down (got: ${lastNotice()})`);
  assert(server.state.preCount === 0, "gate: zero upload attempts when connection is down");
  assert(server.state.files.size === 0, "gate: zero files uploaded when connection is down");
  globalThis.__requestUrlDown = false;
  await click("开始同步");
  await waitNotice();
  assert(lastNotice().includes("失败 0"), `sync succeeds once connection is back (got: ${lastNotice()})`);
  globalThis.__settingTab.hide();
  console.log("== connection gate: PASSED ==");
}


// ---------------- Bidirectional sync (v0.2.0) ----------------
console.log("\n== bidirectional sync ==");
{
  const server = makeServer();
  setupEnv(server);
  globalThis.__store = null;
  globalThis.__notices = [];
  const manifest = { id: "obsidian-quark-sync", name: "Quark Sync", version: JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")).version };
  // Pre-seed the default target folder so remote files can be seeded before sync.
  server.state.folders.set("900", { fid: "900", name: "Obsidian备份", parent: "0", type: 0 });
  server.state.folders.set("901", { fid: "901", name: "子目录", parent: "900", type: 0 });
  const { vault, files, folders } = makeMutableVault([{ path: "本地.md", content: "local v1" }]);
  let plugin = await loadPlugin({ vault }, manifest);
  plugin.settings.cookie = "__puus=pasted-session; other=x";
  await plugin.saveSettings();
  const syncOk = async () => {
    globalThis.__notices = [];
    await plugin.syncNow();
    assert(lastNotice().includes("失败 0"), `sync completes with 0 failures (got: ${lastNotice()})`);
  };
  const serverFile = (name, parent = "900") => [...server.state.files.values()].find((f) => f.name === name && f.parent === parent);

  // Phase 1: remote-only files (incl. a nested one) download into the vault.
  server.state.files.set("2001", { fid: "2001", name: "远端新增.md", parent: "900", type: 1, bytes: Buffer.from("remote new", "utf8"), updated_at: 1700000001000 });
  server.state.files.set("2002", { fid: "2002", name: "嵌套.md", parent: "901", type: 1, bytes: Buffer.from("nested", "utf8"), updated_at: 1700000001000 });
  await syncOk();
  assert(files.has("远端新增.md") && files.get("远端新增.md").content.toString() === "remote new", "remote-only file downloaded to vault");
  assert(files.has("子目录/嵌套.md") && files.get("子目录/嵌套.md").content.toString() === "nested", "nested remote file downloaded with parent folder created");
  assert(folders.has("子目录"), "parent folder created for nested download");
  assert(serverFile("本地.md"), "local file uploaded in the same run");

  // Phase 2: remote changed, local unchanged -> download overwrites local.
  const lf = serverFile("本地.md");
  lf.bytes = Buffer.from("remote v2", "utf8");
  lf.updated_at = 1700000002000;
  await syncOk();
  assert(files.get("本地.md").content.toString() === "remote v2", "remote change overwrote unchanged local file");

  // Phase 3: both changed -> conflict copy, original untouched, remote untouched.
  files.get("本地.md").content = Buffer.from("local v3", "utf8");
  lf.bytes = Buffer.from("remote v3", "utf8");
  lf.updated_at = 1700000003000;
  await syncOk();
  assert(files.get("本地.md").content.toString() === "local v3", "conflict keeps local original untouched");
  assert(files.has("本地（夸克冲突）.md") && files.get("本地（夸克冲突）.md").content.toString() === "remote v3", "conflict saves remote version as a separate file");
  assert(lf.bytes.toString() === "remote v3", "conflict does not overwrite remote");

  // Phase 4: local delete, mirror off -> kept remotely, never resurrected (even after restart).
  files.delete("本地.md");
  await syncOk();
  assert(serverFile("本地.md"), "locally deleted file stays on remote with mirror off");
  assert(!files.has("本地.md"), "locally deleted file stays deleted after sync");
  plugin = await loadPlugin({ vault }, manifest);
  await syncOk();
  assert(!files.has("本地.md"), "tombstone survives restart: no resurrection on the next sync");
  assert((globalThis.__store?.tombstones?.localDeleted ?? []).includes("本地.md"), "local-deletion tombstone persisted");

  // Phase 5: remote delete, mirror off -> kept locally, never re-uploaded.
  server.state.files.delete(serverFile("远端新增.md").fid);
  await syncOk();
  assert(files.has("远端新增.md"), "remotely deleted file stays local with mirror off");
  await syncOk();
  assert(!serverFile("远端新增.md"), "remotely deleted file is not re-uploaded on the next sync");
  assert((globalThis.__store?.tombstones?.remoteDeleted ?? []).includes("远端新增.md"), "remote-deletion tombstone persisted");

  // Phase 6: mirror on -> deletions propagate both ways.
  plugin.settings.mirrorDelete = true;
  await plugin.saveSettings();
  server.state.files.delete(serverFile("本地（夸克冲突）.md").fid);
  await syncOk();
  assert(!files.has("本地（夸克冲突）.md"), "mirror on: remote deletion trashes the local file");
  assert(!files.has("远端新增.md"), "mirror on: remote deletion trashes the other local file too");
  assert(!serverFile("本地.md"), "mirror on: local deletion deletes the remote file");
  console.log("== bidirectional sync: PASSED ==");
}

console.log("\nE2E OBSIDIAN FLOW: ALL PASSED");
process.exit(0);
