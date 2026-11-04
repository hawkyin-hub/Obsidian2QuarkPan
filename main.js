"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => QuarkSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/md5.ts
var S = [
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21
];
var K = [
  3614090360,
  3905402710,
  606105819,
  3250441966,
  4118548399,
  1200080426,
  2821735955,
  4249261313,
  1770035416,
  2336552879,
  4294925233,
  2304563134,
  1804603682,
  4254626195,
  2792965006,
  1236535329,
  4129170786,
  3225465664,
  643717713,
  3921069994,
  3593408605,
  38016083,
  3634488961,
  3889429448,
  568446438,
  3275163606,
  4107603335,
  1163531501,
  2850285829,
  4243563512,
  1735328473,
  2368359562,
  4294588738,
  2272392833,
  1839030562,
  4259657740,
  2763975236,
  1272893353,
  4139469664,
  3200236656,
  681279174,
  3936430074,
  3572445317,
  76029189,
  3654602809,
  3873151461,
  530742520,
  3299628645,
  4096336452,
  1126891415,
  2878612391,
  4237533241,
  1700485571,
  2399980690,
  4293915773,
  2240044497,
  1873313359,
  4264355552,
  2734768916,
  1309151649,
  4149444226,
  3174756917,
  718787259,
  3951481745
];
function rotl(x, c) {
  return x << c | x >>> 32 - c;
}
function md5Hex(data) {
  let a0 = 1732584193;
  let b0 = 4023233417;
  let c0 = 2562383102;
  let d0 = 271733878;
  const bitLen = data.length * 8;
  const paddedLen = data.length + 9 + 63 >> 6 << 6;
  const msg = new Uint8Array(paddedLen);
  msg.set(data);
  msg[data.length] = 128;
  const view = new DataView(msg.buffer);
  view.setUint32(paddedLen - 8, bitLen >>> 0, true);
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 4294967296), true);
  for (let off = 0; off < paddedLen; off += 64) {
    const m = [];
    for (let i = 0; i < 16; i++) m.push(view.getUint32(off + i * 4, true));
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f;
      let g;
      if (i < 16) {
        f = b & c | ~b & d;
        g = i;
      } else if (i < 32) {
        f = d & b | ~d & c;
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = 7 * i % 16;
      }
      const tmp = d;
      d = c;
      c = b;
      const sum = a + f + K[i] + m[g] | 0;
      b = b + rotl(sum, S[i]) | 0;
      a = tmp;
    }
    a0 = a0 + a | 0;
    b0 = b0 + b | 0;
    c0 = c0 + c | 0;
    d0 = d0 + d | 0;
  }
  const out = new Uint8Array(16);
  const oview = new DataView(out.buffer);
  oview.setUint32(0, a0, true);
  oview.setUint32(4, b0, true);
  oview.setUint32(8, c0, true);
  oview.setUint32(12, d0, true);
  return Array.from(out).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// src/hash.ts
function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(data) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(digest);
}
async function sha1Hex(data) {
  const digest = await crypto.subtle.digest("SHA-1", data);
  return bytesToHex(digest);
}

// src/sha1state.ts
function rotl2(x, c) {
  return x << c | x >>> 32 - c;
}
function sha1IncrementalContext(previousData, processedBytes = previousData.length) {
  let h0 = 1732584193;
  let h1 = 4023233417;
  let h2 = 2562383102;
  let h3 = 271733878;
  let h4 = 3285377520;
  const view = new DataView(previousData.buffer, previousData.byteOffset, previousData.byteLength);
  const fullBlocks = Math.floor(previousData.length / 64);
  for (let b = 0; b < fullBlocks; b++) {
    const off = b * 64;
    const w = [];
    for (let j = 0; j < 16; j++) w.push(view.getUint32(off + j * 4, false));
    for (let t = 16; t < 80; t++) {
      const x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16];
      w.push(rotl2(x, 1));
    }
    let a = h0;
    let bb = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let t = 0; t < 80; t++) {
      let f;
      let k;
      if (t < 20) {
        f = bb & c | ~bb & d;
        k = 1518500249;
      } else if (t < 40) {
        f = bb ^ c ^ d;
        k = 1859775393;
      } else if (t < 60) {
        f = bb & c | bb & d | c & d;
        k = 2400959708;
      } else {
        f = bb ^ c ^ d;
        k = 3395469782;
      }
      const temp = rotl2(a, 5) + f + e + k + w[t] | 0;
      e = d;
      d = c;
      c = rotl2(bb, 30);
      bb = a;
      a = temp;
    }
    h0 = h0 + a | 0;
    h1 = h1 + bb | 0;
    h2 = h2 + c | 0;
    h3 = h3 + d | 0;
    h4 = h4 + e | 0;
  }
  const ctx = {
    hash_type: "sha1",
    h0: String(h0 >>> 0),
    h1: String(h1 >>> 0),
    h2: String(h2 >>> 0),
    h3: String(h3 >>> 0),
    h4: String(h4 >>> 0),
    Nl: String(processedBytes * 8),
    Nh: "0",
    data: "",
    num: "0"
  };
  const json = JSON.stringify(ctx);
  let s = "";
  for (const byte of new TextEncoder().encode(json)) s += String.fromCharCode(byte);
  return btoa(s);
}

// src/quark.ts
var QUARK_BASE = "https://drive-pc.quark.cn/1/clouddrive";
var OSS_USER_AGENT_PUT = "aliyun-sdk-js/1.0.0 Chrome Mobile 139.0.0.0 on Google Nexus 5 (Android 6.0)";
var OSS_USER_AGENT_POST = "aliyun-sdk-js/1.0.0 Chrome 139.0.0.0 on OS X 10.15.7 64-bit";
var QuarkError = class extends Error {
  constructor(message, isAuth = false, statusCode) {
    super(message);
    this.name = "QuarkError";
    this.isAuth = isAuth;
    this.statusCode = statusCode;
  }
};
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function gmtDate() {
  return (/* @__PURE__ */ new Date()).toUTCString();
}
function base64Encode(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function base64OfJson(value) {
  return base64Encode(new TextEncoder().encode(JSON.stringify(value)));
}
function md5Base64(text) {
  const hex = md5Hex(new TextEncoder().encode(text));
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return base64Encode(bytes);
}
var QuarkClient = class {
  constructor(cookie, fetchFn) {
    this.cookie = cookie;
    this.fetchFn = fetchFn ? (input, init) => fetchFn.call(globalThis, input, init) : (input, init) => fetch(input, init);
  }
  setCookie(cookie) {
    this.cookie = cookie;
  }
  getCookie() {
    return this.cookie;
  }
  /** Merge Set-Cookie from a response into the stored cookie string.
   *  Browsers hide Set-Cookie from JS, so this is a no-op there; in Node
   *  (undici) getSetCookie() exposes it. Never throws. */
  mergeSetCookie(res) {
    try {
      const getSetCookie = res.headers.getSetCookie;
      const setCookies = typeof getSetCookie === "function" ? getSetCookie.call(res.headers) : [];
      if (setCookies.length === 0) return;
      const map = /* @__PURE__ */ new Map();
      for (const part of this.cookie.split(";")) {
        const eq = part.indexOf("=");
        if (eq > 0) map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
      }
      for (const sc of setCookies) {
        const first = sc.split(";")[0];
        const eq = first.indexOf("=");
        if (eq > 0) map.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
      }
      this.cookie = [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    } catch {
    }
  }
  hasCookie() {
    return this.cookie.trim().length > 0;
  }
  buildUrl(path, extra = {}) {
    const params = new URLSearchParams({
      pr: "ucpro",
      fr: "pc",
      uc_param_str: "",
      __t: String(Date.now()),
      __dt: "1000"
    });
    for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
    return `${QUARK_BASE}/${path}?${params.toString()}`;
  }
  async request(method, path, body, extraParams = {}, absoluteUrl) {
    const url = absoluteUrl ?? this.buildUrl(path, extraParams);
    const res = await this.fetchFn(url, {
      method,
      headers: {
        origin: "https://pan.quark.cn",
        referer: "https://pan.quark.cn/",
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        ...this.cookie.trim() ? { cookie: this.cookie } : {}
      },
      body: body === void 0 ? void 0 : JSON.stringify(body)
    });
    this.mergeSetCookie(res);
    if (res.status === 401 || res.status === 403) {
      throw new QuarkError(
        `\u5938\u514B\u62D2\u7EDD\u4E86\u8BF7\u6C42\uFF08HTTP ${res.status}\uFF09\uFF1A\u672A\u643A\u5E26\u6709\u6548\u767B\u5F55\u4FE1\u606F\uFF0C\u6216\u767B\u5F55\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55`,
        true,
        res.status
      );
    }
    let json;
    try {
      json = await res.json();
    } catch {
      throw new QuarkError(`\u5938\u514B\u8FD4\u56DE\u4E86\u975E JSON \u54CD\u5E94\uFF08HTTP ${res.status}\uFF09`, false, res.status);
    }
    const status = json["status"];
    const code = json["code"];
    const okStatus = status === 200 || status === true || status === "success";
    const okCode = code === void 0 || code === 0;
    if (!okStatus || !okCode) {
      const message = String(json["message"] ?? "\u672A\u77E5\u9519\u8BEF");
      const lower = message.toLowerCase();
      const isAuth = lower.includes("login") || lower.includes("auth") || lower.includes("\u767B\u5F55");
      throw new QuarkError(`\u5938\u514B\u63A5\u53E3\u9519\u8BEF\uFF1A${message}`, isAuth, res.status);
    }
    return json;
  }
  async testConnection() {
    const items = await this.listPage("0", 1, 1);
    return items.length;
  }
  async listPage(pdirFid, page = 1, size = 100) {
    const json = await this.request("GET", "file/sort", void 0, {
      pdir_fid: pdirFid,
      _page: page,
      _size: size,
      _sort: "file_name:asc"
    });
    const data = json["data"];
    const list = data?.list ?? [];
    return list.map((it) => ({
      fid: String(it["fid"] ?? ""),
      file_name: String(it["file_name"] ?? ""),
      file_type: Number(it["file_type"] ?? 1),
      size: Number(it["size"] ?? it["file_size"] ?? 0),
      updated_at: it["updated_at"] ? Number(it["updated_at"]) : void 0
    }));
  }
  async listAll(pdirFid) {
    const out = [];
    let page = 1;
    for (; ; ) {
      const items = await this.listPage(pdirFid, page, 100);
      out.push(...items);
      if (items.length < 100) break;
      page++;
    }
    return out;
  }
  /** Recursively list everything under rootFid, paths relative to root. */
  async listRecursive(rootFid) {
    const out = [];
    const queue = [{ fid: rootFid, prefix: "" }];
    while (queue.length > 0) {
      const cur = queue.shift();
      const items = await this.listAll(cur.fid);
      for (const it of items) {
        const path = cur.prefix ? `${cur.prefix}/${it.file_name}` : it.file_name;
        if (it.file_type === 0) {
          queue.push({ fid: it.fid, prefix: path });
        } else {
          out.push({ path, fid: it.fid, size: it.size, updatedAt: it.updated_at });
        }
      }
    }
    return out;
  }
  async createFolder(parentFid, name) {
    const json = await this.request(
      "POST",
      "file",
      { pdir_fid: parentFid, file_name: name, dir_init_lock: false, dir_path: "" },
      { pr: "ucpro", fr: "pc", uc_param_str: "" }
    );
    const data = json["data"];
    const fid = String(data?.["fid"] ?? "");
    if (!fid) throw new QuarkError(`\u521B\u5EFA\u6587\u4EF6\u5939\u5931\u8D25\uFF0C\u672A\u8FD4\u56DE fid\uFF1A${name}`);
    return fid;
  }
  /** Resolve a path (segments) under rootFid, creating missing folders. */
  async ensureFolderPath(segments, rootFid = "0") {
    let cur = rootFid;
    for (const seg of segments) {
      if (!seg) continue;
      const items = await this.listAll(cur);
      const found = items.find((it) => it.file_type === 0 && it.file_name === seg);
      if (found) {
        cur = found.fid;
      } else {
        cur = await this.createFolder(cur, seg);
      }
    }
    return cur;
  }
  /** Resolve a path without creating anything; returns null if missing. */
  async resolveFolderPath(segments, rootFid = "0") {
    let cur = rootFid;
    for (const seg of segments) {
      if (!seg) continue;
      const items = await this.listAll(cur);
      const found = items.find((it) => it.file_type === 0 && it.file_name === seg);
      if (!found) return null;
      cur = found.fid;
    }
    return cur;
  }
  async deleteFiles(fids) {
    if (fids.length === 0) return;
    await this.request("POST", "file/delete", {
      action_type: 2,
      filelist: fids,
      exclude_fids: []
    });
  }
  async rename(fid, newName) {
    await this.request("POST", "file/rename", { fid, file_name: newName });
  }
  async move(fid, toPdirFid) {
    const json = await this.request("POST", "file/move", {
      action_type: 1,
      to_pdir_fid: toPdirFid,
      filelist: [fid],
      exclude_fids: []
    });
    const data = json["data"];
    if (data?.["finish"]) return;
    const taskId = String(data?.["task_id"] ?? "");
    if (!taskId) throw new QuarkError("\u79FB\u52A8\u4EFB\u52A1\u521B\u5EFA\u5931\u8D25\uFF0C\u672A\u8FD4\u56DE task_id");
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      const t = await this.request("GET", "task", void 0, { task_id: taskId, retry_index: i });
      const td = t["data"];
      if (td?.["status"] === 2) return;
      if (td?.["status"] === 3) {
        throw new QuarkError(`\u79FB\u52A8\u4EFB\u52A1\u5931\u8D25\uFF1A${String(td?.["message"] ?? "\u4EFB\u52A1\u5931\u8D25")}`);
      }
    }
    throw new QuarkError("\u79FB\u52A8\u4EFB\u52A1\u8D85\u65F6\uFF0815 \u79D2\u672A\u5B8C\u6210\uFF09");
  }
  async downloadBytes(fid) {
    const json = await this.request(
      "POST",
      "file/download",
      { fids: [fid] },
      { pr: "ucpro", fr: "pc", sys: "win32", ve: "2.5.56", ut: "", guid: "" }
    );
    const list = json["data"] ?? [];
    const url = String(list[0]?.["download_url"] ?? "");
    if (!url) throw new QuarkError("\u65E0\u6CD5\u83B7\u53D6\u4E0B\u8F7D\u94FE\u63A5");
    const res = await this.fetchFn(url, {
      headers: {
        Accept: "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        origin: "https://pan.quark.cn",
        referer: "https://pan.quark.cn/",
        "Sec-Ch-Ua": '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
        "Sec-Ch-Ua-Mobile": "?1",
        "Sec-Ch-Ua-Platform": '"Android"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
        "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
        ...this.cookie.trim() ? { cookie: this.cookie } : {}
      }
    });
    if (!res.ok) throw new QuarkError(`\u4E0B\u8F7D\u5931\u8D25\uFF08HTTP ${res.status}\uFF09`);
    return new Uint8Array(await res.arrayBuffer());
  }
  // ---- Upload: pre -> update hash -> OSS parts -> complete -> finish ----
  mimeFor(name) {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const map = {
      md: "text/markdown",
      txt: "text/plain",
      json: "application/json",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      pdf: "application/pdf",
      mp3: "audio/mpeg",
      mp4: "video/mp4"
    };
    return map[ext] ?? "application/octet-stream";
  }
  async uploadFile(parentFid, fileName, data, onPart) {
    const mime = this.mimeFor(fileName);
    const now = Date.now();
    const pre = await this.request("POST", "file/upload/pre", {
      ccp_hash_update: true,
      parallel_upload: true,
      pdir_fid: parentFid,
      dir_name: "",
      size: data.length,
      file_name: fileName,
      format_type: mime,
      l_updated_at: now,
      l_created_at: now
    });
    const preData = pre["data"];
    const taskId = String(preData["task_id"] ?? "");
    const uploadId = String(preData["upload_id"] ?? "");
    const objKey = String(preData["obj_key"] ?? "");
    const bucket = String(preData["bucket"] ?? "ul-zb");
    const authInfo = String(preData["auth_info"] ?? "");
    const callback = preData["callback"] ?? {};
    if (!taskId || !uploadId || !objKey) {
      throw new QuarkError("\u9884\u4E0A\u4F20\u5931\u8D25\uFF0C\u672A\u8FD4\u56DE task_id/upload_id/obj_key");
    }
    await this.request("POST", "file/update/hash", {
      task_id: taskId,
      md5: md5Hex(data),
      sha1: await sha1Hex(data)
    });
    const CHUNK = 4 * 1024 * 1024;
    const parts = [];
    if (data.length === 0) {
      parts.push({ num: 1, size: 0 });
    } else {
      for (let off = 0, n = 1; off < data.length; off += CHUNK, n++) {
        parts.push({ num: n, size: Math.min(CHUNK, data.length - off) });
      }
    }
    const etags = [];
    for (const part of parts) {
      const chunk = data.slice((part.num - 1) * CHUNK, (part.num - 1) * CHUNK + part.size);
      const hashCtx = part.num > 1 ? sha1IncrementalContext(data.slice(0, (part.num - 1) * CHUNK), (part.num - 1) * CHUNK) : void 0;
      const auth = await this.uploadAuth(taskId, authInfo, mime, part.num, uploadId, objKey, bucket, hashCtx);
      const res = await this.fetchFn(auth.url, {
        method: "PUT",
        headers: auth.headers,
        body: chunk
      });
      if (!res.ok) {
        throw new QuarkError(`OSS \u5206\u7247\u4E0A\u4F20\u5931\u8D25 part=${part.num}\uFF08HTTP ${res.status}\uFF09`);
      }
      const etag = (res.headers.get("etag") ?? "").replace(/"/g, "");
      if (!etag) throw new QuarkError(`OSS \u5206\u7247\u4E0A\u4F20\u6210\u529F\u4F46\u672A\u8FD4\u56DE ETag part=${part.num}`);
      etags.push({ num: part.num, etag });
      onPart?.(part.num, parts.length);
    }
    const xmlParts = etags.map((p) => `<Part><PartNumber>${p.num}</PartNumber><ETag>"${p.etag}"</ETag></Part>`).join("");
    const xml = `<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUpload>${xmlParts}</CompleteMultipartUpload>`;
    const completeAuth = await this.completeAuth(taskId, authInfo, mime, uploadId, objKey, bucket, xml, callback);
    const completeRes = await this.fetchFn(completeAuth.url, {
      method: "POST",
      headers: completeAuth.headers,
      body: xml
    });
    if (!completeRes.ok) {
      throw new QuarkError(`OSS \u5408\u5E76\u5931\u8D25\uFF08HTTP ${completeRes.status}\uFF09`);
    }
    await this.request("POST", "file/upload/finish", { task_id: taskId, obj_key: objKey });
  }
  async uploadAuth(taskId, authInfo, mime, partNumber, uploadId, objKey, bucket, hashCtx) {
    const date = gmtDate();
    const authMeta = `PUT

${mime}
${date}
x-oss-date:${date}
` + (hashCtx ? `x-oss-hash-ctx:${hashCtx}
` : "") + `x-oss-user-agent:${OSS_USER_AGENT_PUT}
/${bucket}/${objKey}?partNumber=${partNumber}&uploadId=${uploadId}`;
    const json = await this.request("POST", "file/upload/auth", {
      task_id: taskId,
      auth_info: authInfo,
      auth_meta: authMeta
    });
    const data = json["data"];
    const authKey = String(data["auth_key"] ?? "");
    const headers = {
      "Content-Type": mime,
      "x-oss-date": date,
      "x-oss-user-agent": OSS_USER_AGENT_PUT
    };
    if (authKey) headers["authorization"] = authKey;
    if (hashCtx) headers["X-Oss-Hash-Ctx"] = hashCtx;
    return {
      url: `https://${bucket}.pds.quark.cn/${objKey}?partNumber=${partNumber}&uploadId=${uploadId}`,
      headers
    };
  }
  async completeAuth(taskId, authInfo, mime, uploadId, objKey, bucket, xml, callback) {
    const date = gmtDate();
    const xmlMd5 = md5Base64(xml);
    const callbackB64 = base64OfJson(callback);
    const authMeta = `POST
${xmlMd5}
application/xml
${date}
x-oss-callback:${callbackB64}
x-oss-date:${date}
x-oss-user-agent:${OSS_USER_AGENT_POST}
/${bucket}/${objKey}?uploadId=${uploadId}`;
    const json = await this.request("POST", "file/upload/auth", {
      task_id: taskId,
      auth_meta: authMeta,
      auth_info: authInfo
    });
    const data = json["data"];
    const authKey = String(data["auth_key"] ?? "");
    return {
      url: `https://${bucket}.pds.quark.cn/${objKey}?uploadId=${uploadId}`,
      headers: {
        "Content-Type": "application/xml",
        "x-oss-date": date,
        "x-oss-user-agent": OSS_USER_AGENT_POST,
        authorization: authKey,
        "x-oss-callback": callbackB64,
        "Content-MD5": xmlMd5
      }
    };
  }
};

// src/obsidian-fetch.ts
var import_obsidian = require("obsidian");
function obsidianFetchFn() {
  if (typeof import_obsidian.requestUrl !== "function") {
    return ((input, init) => fetch(input, init));
  }
  return (async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    let body;
    if (typeof init?.body === "string") {
      body = init.body;
    } else if (init?.body instanceof Uint8Array) {
      body = init.body.buffer.slice(init.body.byteOffset, init.body.byteOffset + init.body.byteLength);
    } else if (init?.body instanceof ArrayBuffer) {
      body = init.body;
    }
    const headers = { ...init?.headers ?? {} };
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === "cookie" && !String(headers[k]).trim()) delete headers[k];
    }
    const res = await (0, import_obsidian.requestUrl)({
      url,
      method: init?.method ?? "GET",
      headers,
      body,
      throw: false
    });
    const lower = {};
    for (const [k, v] of Object.entries(res.headers ?? {})) lower[k.toLowerCase()] = v;
    const setCookieRaw = lower["set-cookie"];
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      headers: {
        get: (name) => lower[name.toLowerCase()] ?? null,
        getSetCookie: () => setCookieRaw ? [setCookieRaw] : []
      },
      json: async () => res.json,
      arrayBuffer: async () => res.arrayBuffer
    };
  });
}

// src/ignore.ts
var DEFAULT_IGNORES = [".obsidian/**", ".git/**", ".trash/**", "**/target/**", "**/node_modules/**"];
function globToRegExp(glob) {
  let re = "^";
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 3;
        } else {
          re += ".*";
          i += 2;
        }
      } else {
        re += "[^/]*";
        i += 1;
      }
    } else if ("+|()^${}.[]\\".includes(ch)) {
      re += "\\" + ch;
      i += 1;
    } else {
      re += ch;
      i += 1;
    }
  }
  re += "$";
  return new RegExp(re);
}
function isIgnored(path, extraPatterns) {
  const patterns = [...DEFAULT_IGNORES, ...extraPatterns];
  for (const raw of patterns) {
    const p = raw.trim();
    if (!p) continue;
    if (globToRegExp(p).test(path)) return true;
    if (!p.includes("*") && (path === p || path.startsWith(p + "/"))) return true;
  }
  return false;
}

// src/log.ts
function formatBeijingTime(d) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "00";
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}.${ms}`;
}
var RingLog = class {
  constructor(max = 200) {
    this.entries = [];
    this.listeners = /* @__PURE__ */ new Set();
    this.max = max;
  }
  /** Push subscription: called synchronously on every add/clear. A
   * listener throwing never breaks logging itself. Returns unsubscribe. */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  notify() {
    for (const fn of [...this.listeners]) {
      try {
        fn();
      } catch {
      }
    }
  }
  add(level, message) {
    this.entries.push({ time: formatBeijingTime(/* @__PURE__ */ new Date()), level, message });
    if (this.entries.length > this.max) {
      this.entries.splice(0, this.entries.length - this.max);
    }
    this.notify();
  }
  info(message) {
    this.add("info", message);
  }
  warn(message) {
    this.add("warn", message);
  }
  error(message) {
    this.add("error", message);
  }
  clear() {
    this.entries = [];
    this.notify();
  }
  all() {
    return [...this.entries];
  }
  /** Display order: newest first, oldest pushed down. */
  toText() {
    return [...this.entries].reverse().map((e) => `${e.time} [${e.level}] ${e.message}`).join("\n");
  }
};

// src/diff.ts
function dirname(p) {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}
function basename(p) {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}
function normalizeOpts(o) {
  if (typeof o === "boolean") {
    return { mirrorDelete: o, twoWay: false, tombstones: { localDeleted: [], remoteDeleted: [] } };
  }
  return {
    mirrorDelete: o.mirrorDelete,
    twoWay: o.twoWay,
    tombstones: o.tombstones ?? { localDeleted: [], remoteDeleted: [] }
  };
}
function localChanged(f, s) {
  return !s || s.size !== f.size || s.sha256 !== f.sha256;
}
function remoteChanged(r, s) {
  if (!s) return false;
  if (s.remoteSize !== void 0) {
    if (r.size !== s.remoteSize) return true;
    if (r.updatedAt !== void 0 && s.remoteUpdatedAt !== void 0 && r.updatedAt !== s.remoteUpdatedAt) return true;
    return false;
  }
  return r.size !== s.size;
}
function conflictPathFor(path, localPaths, remotePaths) {
  const dir = dirname(path);
  const base = basename(path);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  const make = (suffix) => dir ? `${dir}/${stem}${suffix}${ext}` : `${stem}${suffix}${ext}`;
  let cand = make("\uFF08\u5938\u514B\u51B2\u7A81\uFF09");
  let n = 2;
  while (localPaths.has(cand) || remotePaths.has(cand)) {
    cand = make(`\uFF08\u5938\u514B\u51B2\u7A81 ${n}\uFF09`);
    n++;
  }
  return cand;
}
function computeDiff(local, remote, last, inputOpts) {
  const opts = normalizeOpts(inputOpts);
  const plan = [];
  const skipped = [];
  const notes = [];
  const adopted = [];
  const refreshed = [];
  const dropState = [];
  const localByPath = new Map(local.map((f) => [f.path, f]));
  const remoteByPath = new Map(remote.map((f) => [f.path, f]));
  const lastByPath = new Map(last.map((f) => [f.path, f]));
  const localPaths = new Set(local.map((f) => f.path));
  const remotePaths = new Set(remote.map((f) => f.path));
  const localDel = new Set(opts.tombstones.localDeleted);
  const remoteDel = new Set(opts.tombstones.remoteDeleted);
  for (const p of localPaths) localDel.delete(p);
  for (const p of remotePaths) remoteDel.delete(p);
  const goneRemote = [];
  for (const r of remote) {
    if (!localByPath.has(r.path) && lastByPath.has(r.path)) {
      goneRemote.push(r);
    }
  }
  const goneByContent = /* @__PURE__ */ new Map();
  for (const r of goneRemote) {
    const s = lastByPath.get(r.path);
    if (s) goneByContent.set(`${s.size}:${s.sha256}`, r);
  }
  const consumedGone = /* @__PURE__ */ new Set();
  for (const f of local) {
    const r = remoteByPath.get(f.path);
    const s = lastByPath.get(f.path);
    if (!r) {
      if (s) {
        if (opts.mirrorDelete && opts.twoWay) {
          plan.push({ kind: "deleteLocal", path: f.path });
          continue;
        }
        if (opts.twoWay) {
          remoteDel.add(f.path);
          notes.push(`\u8FDC\u7AEF\u5DF2\u5220\uFF0C\u672C\u5730\u4FDD\u7559\uFF0C\u4E0D\u4E0A\u4F20\uFF1A${f.path}`);
          continue;
        }
      } else if (opts.twoWay && remoteDel.has(f.path)) {
        notes.push(`\u8FDC\u7AEF\u5DF2\u5220\uFF0C\u672C\u5730\u4FDD\u7559\uFF0C\u4E0D\u4E0A\u4F20\uFF1A${f.path}`);
        continue;
      }
      const match = goneByContent.get(`${f.size}:${f.sha256}`);
      if (match && !consumedGone.has(match.path)) {
        consumedGone.add(match.path);
        if (dirname(match.path) === dirname(f.path)) {
          plan.push({ kind: "rename", oldPath: match.path, newPath: f.path, fid: match.fid });
        } else {
          plan.push({ kind: "move", oldPath: match.path, newPath: f.path, fid: match.fid });
        }
        if (basename(match.path) !== basename(f.path) && dirname(match.path) !== dirname(f.path)) {
          notes.push(`\u79FB\u52A8+\u6539\u540D\uFF1A${match.path} -> ${f.path}\uFF0C\u79FB\u52A8\u540E\u9700\u518D\u6539\u540D`);
        }
      } else {
        plan.push({ kind: "upload", path: f.path });
      }
      continue;
    }
    const lc = localChanged(f, s);
    const rc = remoteChanged(r, s);
    if (!lc && !rc) {
      skipped.push(f.path);
      if (s) {
        refreshed.push({
          ...s,
          remoteSize: r.size,
          ...r.updatedAt !== void 0 ? { remoteUpdatedAt: r.updatedAt } : {}
        });
      }
      continue;
    }
    if (!s) {
      if (r.size === f.size) {
        adopted.push({
          path: f.path,
          size: f.size,
          mtimeMs: f.mtimeMs,
          sha256: f.sha256,
          fid: r.fid,
          remoteSize: r.size,
          ...r.updatedAt !== void 0 ? { remoteUpdatedAt: r.updatedAt } : {},
          adopted: true
        });
        notes.push(`\u8FDC\u7AEF\u5DF2\u6709\u540C\u540D\u540C\u5927\u5C0F\u6587\u4EF6\uFF0C\u5DF2\u6807\u8BB0\u4E3A\u5DF2\u4E0A\u4F20\uFF08\u672A\u91CD\u65B0\u4E0A\u4F20\uFF09\uFF1A${f.path}`);
        continue;
      }
      notes.push(`\u8FDC\u7AEF\u540C\u540D\u6587\u4EF6\u5927\u5C0F\u4E0D\u540C\uFF0C\u5DF2\u6309\u672C\u5730\u91CD\u65B0\u4E0A\u4F20\uFF1A${f.path}`);
      plan.push({ kind: "reupload", path: f.path, oldFid: r.fid });
      continue;
    }
    if (lc && !rc) {
      plan.push({ kind: "reupload", path: f.path, oldFid: r.fid });
      continue;
    }
    if (!lc && rc) {
      if (s.adopted) {
        plan.push({
          kind: "downloadConflict",
          path: f.path,
          fid: r.fid,
          size: r.size,
          updatedAt: r.updatedAt,
          conflictPath: conflictPathFor(f.path, localPaths, remotePaths)
        });
        notes.push(`\u51B2\u7A81\uFF08\u8BA4\u9886\u6587\u4EF6\u8FDC\u7AEF\u6709\u53D8\uFF0C\u8FDC\u7AEF\u7248\u53E6\u5B58\uFF0C\u4E0D\u8986\u76D6\u672C\u5730\uFF09\uFF1A${f.path}`);
        continue;
      }
      if (opts.twoWay) {
        plan.push({ kind: "download", path: f.path, fid: r.fid, size: r.size, updatedAt: r.updatedAt });
        continue;
      }
      skipped.push(f.path);
      refreshed.push({
        ...s,
        remoteSize: r.size,
        ...r.updatedAt !== void 0 ? { remoteUpdatedAt: r.updatedAt } : {}
      });
      notes.push(`\u8FDC\u7AEF\u6709\u6539\u52A8\u4F46\u672C\u5730\u672A\u53D8\uFF0C\u5355\u5411\u6A21\u5F0F\u4E0D\u4E0B\u8F7D\uFF1A${f.path}`);
      continue;
    }
    if (opts.twoWay) {
      plan.push({
        kind: "downloadConflict",
        path: f.path,
        fid: r.fid,
        size: r.size,
        updatedAt: r.updatedAt,
        conflictPath: conflictPathFor(f.path, localPaths, remotePaths)
      });
      notes.push(`\u51B2\u7A81\uFF08\u53CC\u8FB9\u90FD\u6539\u52A8\uFF0C\u8FDC\u7AEF\u7248\u53E6\u5B58\uFF0C\u4E0D\u8986\u76D6\u4EFB\u4F55\u4E00\u8FB9\uFF09\uFF1A${f.path}`);
      continue;
    }
    if (s.size !== r.size) {
      notes.push(`\u51B2\u7A81\uFF08\u672C\u5730\u4E3A\u51C6\uFF0C\u91CD\u65B0\u4E0A\u4F20\uFF09\uFF1A${f.path} \u8FDC\u7AEF size=${r.size} \u4E0A\u6B21 size=${s.size} \u672C\u5730 size=${f.size}`);
    }
    plan.push({ kind: "reupload", path: f.path, oldFid: r.fid });
  }
  for (const r of remote) {
    if (localByPath.has(r.path)) continue;
    if (consumedGone.has(r.path)) continue;
    const s = lastByPath.get(r.path);
    if (s) {
      if (opts.mirrorDelete) {
        plan.push({ kind: "deleteRemote", path: r.path, fid: r.fid });
      } else if (opts.twoWay) {
        localDel.add(r.path);
        notes.push(`\u672C\u5730\u5DF2\u5220\uFF0C\u8FDC\u7AEF\u4FDD\u7559\uFF0C\u4E0D\u4E0B\u8F7D\uFF1A${r.path}`);
      } else {
        notes.push(`\u672C\u5730\u5DF2\u5220\uFF0C\u8FDC\u7AEF\u4FDD\u7559\uFF08\u955C\u50CF\u5220\u9664\u672A\u5F00\uFF09\uFF1A${r.path}`);
      }
    } else {
      if (opts.twoWay) {
        if (localDel.has(r.path)) {
          notes.push(`\u672C\u5730\u5DF2\u5220\uFF0C\u8FDC\u7AEF\u4FDD\u7559\uFF0C\u4E0D\u4E0B\u8F7D\uFF1A${r.path}`);
        } else {
          plan.push({ kind: "download", path: r.path, fid: r.fid, size: r.size, updatedAt: r.updatedAt });
        }
      } else {
        notes.push(`\u8FDC\u7AEF\u6709\u3001\u672C\u5730\u65E0\uFF0C\u5DF2\u5FFD\u7565\uFF08\u5355\u5411\u540C\u6B65\u4E0D\u56DE\u5199\uFF09\uFF1A${r.path}`);
      }
    }
  }
  if (opts.twoWay) {
    for (const s of last) {
      if (!localByPath.has(s.path) && !remoteByPath.has(s.path)) {
        dropState.push(s.path);
        localDel.delete(s.path);
        remoteDel.delete(s.path);
      }
    }
  }
  return {
    plan,
    skipped,
    notes,
    adopted,
    refreshed,
    dropState,
    tombstones: { localDeleted: [...localDel], remoteDeleted: [...remoteDel] }
  };
}

// src/sync.ts
var ILLEGAL = /[\\/:*?"<>|]/;
function sanitizeFileName(name) {
  const stripped = name.replace(/[\\/:*?\"<>|]/g, "");
  if (stripped === "" || /^\.+$/.test(stripped)) return "\u672A\u547D\u540D";
  const dot = stripped.lastIndexOf(".");
  if (dot === 0) return `\u672A\u547D\u540D${stripped}`;
  return stripped;
}
function dirname2(p) {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}
function basename2(p) {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}
async function runSync(client, localFiles, lastState, options, log, onProgress, onDiffed) {
  const summary = {
    uploaded: 0,
    reuploaded: 0,
    renamed: 0,
    moved: 0,
    deletedRemote: 0,
    deletedLocal: 0,
    downloaded: 0,
    conflictCopies: 0,
    skipped: 0,
    adopted: 0,
    failed: [],
    notes: []
  };
  const usable = [];
  for (const f of localFiles) {
    if (f.size > options.maxFileBytes) {
      log.warn(`\u8DF3\u8FC7\u8D85\u9650\u6587\u4EF6\uFF08>${options.maxFileBytes} \u5B57\u8282\uFF09\uFF1A${f.path} size=${f.size}`);
      summary.notes.push(`\u8DF3\u8FC7\u8D85\u9650\uFF1A${f.path}`);
      continue;
    }
    if (ILLEGAL.test(basename2(f.path))) {
      log.warn(`\u8DF3\u8FC7\u975E\u6CD5\u6587\u4EF6\u540D\uFF1A${f.path}`);
      summary.notes.push(`\u8DF3\u8FC7\u975E\u6CD5\u6587\u4EF6\u540D\uFF1A${f.path}`);
      continue;
    }
    usable.push(f);
  }
  const targetFid = await client.ensureFolderPath(options.targetSegments, "0");
  log.info(`\u76EE\u6807\u6587\u4EF6\u5939 fid \u5DF2\u89E3\u6790\uFF0C\u8DEF\u5F84\uFF1A${options.targetSegments.join("/") || "(\u6839)"}`);
  const remote = await client.listRecursive(targetFid);
  const { plan, skipped, notes, adopted, refreshed, dropState, tombstones: newTombstones } = computeDiff(usable, remote, lastState, {
    mirrorDelete: options.mirrorDelete,
    twoWay: options.twoWay,
    tombstones: options.tombstones
  });
  await onDiffed?.({ skipped: skipped.length, filtered: localFiles.length - usable.length, adopted: adopted.length });
  summary.skipped = skipped.length;
  summary.adopted = adopted.length;
  summary.notes.push(...notes);
  for (const n of notes) log.info(n);
  const localByPath = new Map(usable.map((f) => [f.path, f]));
  const newStateByPath = new Map(lastState.map((s) => [s.path, s]));
  for (const a of adopted) newStateByPath.set(a.path, a);
  for (const r of refreshed) newStateByPath.set(r.path, r);
  for (const d of dropState) newStateByPath.delete(d);
  for (const p of skipped) {
    void p;
  }
  const folderCache = /* @__PURE__ */ new Map([["", targetFid]]);
  async function folderFid(dir) {
    const cached = folderCache.get(dir);
    if (cached) return cached;
    const segments = dir ? dir.split("/") : [];
    const fid = await client.ensureFolderPath(segments, targetFid);
    folderCache.set(dir, fid);
    return fid;
  }
  async function findFidIn(dir, name) {
    const fid = await folderFid(dir);
    for (let attempt = 0; attempt < 15; attempt++) {
      const items = await client.listAll(fid);
      const found = items.find((it) => it.file_type !== 0 && it.file_name === name);
      if (found) return found.fid;
      await new Promise((r) => setTimeout(r, 1e3));
    }
    return null;
  }
  const ordered = [...plan].sort((a, b) => {
    const rank = (k) => k === "rename" || k === "move" ? 0 : k === "upload" || k === "reupload" || k === "download" || k === "downloadConflict" ? 1 : 2;
    return rank(a.kind) - rank(b.kind);
  });
  let done = 0;
  const total = ordered.length;
  let cancelled = false;
  for (const action of ordered) {
    if (options.shouldCancel?.()) {
      cancelled = true;
      break;
    }
    done++;
    try {
      if (action.kind === "rename") {
        await client.rename(action.fid, basename2(action.newPath));
        const f = localByPath.get(action.newPath);
        newStateByPath.delete(action.oldPath);
        newStateByPath.set(action.newPath, {
          path: action.newPath,
          size: f.size,
          mtimeMs: f.mtimeMs,
          sha256: f.sha256,
          fid: action.fid
        });
        summary.renamed++;
        log.info(`\u6539\u540D\uFF1A${action.oldPath} -> ${action.newPath}`);
        await onProgress?.(done, total, action.newPath, "rename");
      } else if (action.kind === "move") {
        const targetDirFid = await folderFid(dirname2(action.newPath));
        await client.move(action.fid, targetDirFid);
        let fid = action.fid;
        if (basename2(action.oldPath) !== basename2(action.newPath)) {
          await client.rename(fid, basename2(action.newPath));
        }
        const f = localByPath.get(action.newPath);
        newStateByPath.delete(action.oldPath);
        newStateByPath.set(action.newPath, {
          path: action.newPath,
          size: f.size,
          mtimeMs: f.mtimeMs,
          sha256: f.sha256,
          fid
        });
        summary.moved++;
        log.info(`\u79FB\u52A8\uFF1A${action.oldPath} -> ${action.newPath}`);
        await onProgress?.(done, total, action.newPath, "move");
      } else if (action.kind === "upload" || action.kind === "reupload") {
        const f = localByPath.get(action.path);
        if (!f.data) throw new Error(`\u672C\u5730\u6587\u4EF6\u5185\u5BB9\u672A\u8BFB\u53D6\uFF1A${action.path}`);
        if (action.kind === "reupload") {
          await client.deleteFiles([action.oldFid]);
        }
        const parentFid = await folderFid(dirname2(action.path));
        await client.uploadFile(parentFid, basename2(action.path), f.data, (part, totalParts) => options.onUploadPart?.(action.path, part, totalParts));
        const newFid = await findFidIn(dirname2(action.path), basename2(action.path));
        if (!newFid) throw new Error(`\u4E0A\u4F20\u540E\u5728\u8FDC\u7AEF\u672A\u627E\u5230\u6587\u4EF6\uFF1A${action.path}`);
        newStateByPath.set(action.path, {
          path: action.path,
          size: f.size,
          mtimeMs: f.mtimeMs,
          sha256: f.sha256,
          fid: newFid
        });
        if (action.kind === "upload") summary.uploaded++;
        else summary.reuploaded++;
        log.info(`${action.kind === "upload" ? "\u4E0A\u4F20\u6210\u529F" : "\u91CD\u65B0\u4E0A\u4F20\u6210\u529F"}\uFF1A${action.path} size=${f.size}`);
        await onProgress?.(done, total, action.path, action.kind);
      } else if (action.kind === "download" || action.kind === "downloadConflict") {
        const isConflict = action.kind === "downloadConflict";
        if (isIgnored(action.path, options.extraIgnores ?? [])) {
          log.warn(`\u8FDC\u7AEF\u6587\u4EF6\u547D\u4E2D\u5FFD\u7565\u89C4\u5219\uFF0C\u672A\u4E0B\u8F7D\uFF1A${action.path}`);
          summary.notes.push(`\u8FDC\u7AEF\u6587\u4EF6\u547D\u4E2D\u5FFD\u7565\u89C4\u5219\uFF0C\u672A\u4E0B\u8F7D\uFF1A${action.path}`);
          await onProgress?.(done, total, action.path, action.kind);
          continue;
        }
        if (action.size > options.maxFileBytes) {
          log.warn(`\u8DF3\u8FC7\u8D85\u9650\u8FDC\u7AEF\u6587\u4EF6\uFF08>${options.maxFileBytes} \u5B57\u8282\uFF09\uFF1A${action.path} size=${action.size}`);
          summary.notes.push(`\u8DF3\u8FC7\u8D85\u9650\u8FDC\u7AEF\u6587\u4EF6\uFF1A${action.path}`);
          await onProgress?.(done, total, action.path, action.kind);
          continue;
        }
        if (!options.writeLocal) throw new Error(`\u672A\u63D0\u4F9B\u672C\u5730\u5199\u5165\u56DE\u8C03\uFF0C\u65E0\u6CD5\u4E0B\u8F7D\uFF1A${action.path}`);
        const bytes = await client.downloadBytes(action.fid);
        const sha = await sha256Hex(bytes);
        if (isConflict) {
          const f = localByPath.get(action.path);
          if (sha === f.sha256) {
            newStateByPath.set(action.path, {
              path: action.path,
              size: f.size,
              mtimeMs: f.mtimeMs,
              sha256: f.sha256,
              fid: action.fid,
              remoteSize: bytes.length,
              ...action.updatedAt !== void 0 ? { remoteUpdatedAt: action.updatedAt } : {}
            });
            log.info(`\u51B2\u7A81\u5DF2\u81EA\u884C\u4E00\u81F4\uFF0C\u65E0\u9700\u53E6\u5B58\uFF1A${action.path}`);
          } else {
            await options.writeLocal(action.conflictPath, bytes);
            newStateByPath.set(action.path, {
              path: action.path,
              size: f.size,
              mtimeMs: f.mtimeMs,
              sha256: f.sha256,
              fid: action.fid,
              remoteSize: bytes.length,
              ...action.updatedAt !== void 0 ? { remoteUpdatedAt: action.updatedAt } : {}
            });
            summary.conflictCopies++;
            log.info(`\u51B2\u7A81\uFF1A\u8FDC\u7AEF\u7248\u5DF2\u53E6\u5B58\u4E3A ${action.conflictPath}\uFF0C\u672C\u5730\u539F\u6587\u4EF6\u672A\u52A8\uFF1A${action.path}`);
          }
          await onProgress?.(done, total, action.path, action.kind);
        } else {
          const existing = localByPath.get(action.path);
          if (existing && existing.sha256 === sha) {
            newStateByPath.set(action.path, {
              path: action.path,
              size: existing.size,
              mtimeMs: existing.mtimeMs,
              sha256: existing.sha256,
              fid: action.fid,
              remoteSize: bytes.length,
              ...action.updatedAt !== void 0 ? { remoteUpdatedAt: action.updatedAt } : {}
            });
            log.info(`\u8FDC\u7AEF\u5185\u5BB9\u4E0E\u672C\u5730\u4E00\u81F4\uFF0C\u65E0\u9700\u5199\u5165\uFF1A${action.path}`);
          } else {
            await options.writeLocal(action.path, bytes);
            newStateByPath.set(action.path, {
              path: action.path,
              size: bytes.length,
              mtimeMs: Date.now(),
              sha256: sha,
              fid: action.fid,
              remoteSize: bytes.length,
              ...action.updatedAt !== void 0 ? { remoteUpdatedAt: action.updatedAt } : {}
            });
            summary.downloaded++;
            log.info(`\u4E0B\u8F7D\u6210\u529F\uFF1A${action.path} size=${bytes.length}`);
          }
          await onProgress?.(done, total, action.path, action.kind);
        }
      } else if (action.kind === "deleteRemote") {
        await client.deleteFiles([action.fid]);
        newStateByPath.delete(action.path);
        summary.deletedRemote++;
        log.info(`\u5220\u9664\u8FDC\u7AEF\uFF1A${action.path}`);
        await onProgress?.(done, total, action.path, "deleteRemote");
      } else if (action.kind === "deleteLocal") {
        if (!options.deleteLocal) throw new Error(`\u672A\u63D0\u4F9B\u672C\u5730\u5220\u9664\u56DE\u8C03\uFF0C\u65E0\u6CD5\u5220\u9664\u672C\u5730\u6587\u4EF6\uFF1A${action.path}`);
        await options.deleteLocal(action.path);
        newStateByPath.delete(action.path);
        summary.deletedLocal++;
        log.info(`\u5220\u9664\u672C\u5730\uFF1A${action.path}`);
        await onProgress?.(done, total, action.path, "deleteLocal");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const path = "path" in action ? action.path : action.oldPath;
      summary.failed.push({ path, error: msg });
      log.error(`\u5931\u8D25\uFF1A${path}\uFF1A${msg}`);
      await onProgress?.(done, total, path, "kind" in action ? action.kind : "");
    }
  }
  return { summary, newState: [...newStateByPath.values()], tombstones: newTombstones, cancelled };
}

// src/settings.ts
var import_obsidian2 = require("obsidian");
var DEFAULT_SETTINGS = {
  cookie: "",
  targetFolder: "Obsidian\u5907\u4EFD",
  mirrorDelete: false,
  twoWay: true,
  autoSyncMinutes: 0,
  maxFileBytes: 50 * 1024 * 1024,
  ignorePatterns: ""
};
function targetSegments(settings) {
  return settings.targetFolder.split("/").map((s) => s.trim()).filter((s) => s.length > 0);
}
var QuarkSyncSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.logUnsub = null;
    this.logPre = null;
    this.progressEl = null;
    this.lastSyncEl = null;
    this.syncBtn = null;
    this.plugin = plugin;
  }
  hide() {
    if (this.logUnsub) this.logUnsub();
    this.logUnsub = null;
    this.logPre = null;
    this.progressEl = null;
    this.lastSyncEl = null;
    this.syncBtn = null;
  }
  display() {
    const { containerEl } = this;
    if (this.logUnsub) this.logUnsub();
    this.logUnsub = null;
    this.logPre = null;
    this.progressEl = null;
    this.lastSyncEl = null;
    this.syncBtn = null;
    containerEl.empty();
    containerEl.createEl("h2", { text: `\u5938\u514B\u540C\u6B65 v${this.plugin.manifest.version}` });
    const ver = new import_obsidian2.Setting(containerEl).setName(`\u5F53\u524D\u7248\u672C v${this.plugin.manifest.version}`);
    const mark = ver.nameEl.createEl("span", { text: "!" });
    mark.style.verticalAlign = "super";
    mark.style.fontSize = "11px";
    mark.style.fontWeight = "bold";
    mark.style.color = "#e07856";
    mark.style.cursor = "pointer";
    mark.style.marginLeft = "4px";
    mark.title = "\u70B9\u51FB\u67E5\u770B\u66F4\u65B0\u8BF4\u660E";
    ver.setDesc(
      "\u66F4\u65B0\uFF1A\u53EA\u8986\u76D6 main.js \u4E0E manifest.json\uFF0C\u5F7B\u5E95\u9000\u51FA Obsidian\uFF08Cmd+Q\uFF09\u518D\u91CD\u5F00\uFF1B\u4E0D\u8981\u5220\u9664\u6574\u4E2A\u63D2\u4EF6\u6587\u4EF6\u5939\uFF0C\u767B\u5F55\u4FE1\u606F\u4E0E\u540C\u6B65\u72B6\u6001\u5B58\u5728\u91CC\u9762\u7684 data.json\uFF0C\u5220\u4E86\u5C31\u4E22\u4E86\u3002\u53CC\u5411\u540C\u6B65\uFF1A\u672C\u5730\u548C\u5938\u514B\u5BF9\u7B49\uFF0C\u8FDC\u7AEF\u65B0\u589E\u6216\u6539\u52A8\u4F1A\u4E0B\u8F7D\u5230\u672C\u5730\uFF1B\u53CC\u8FB9\u90FD\u6539\u52A8\u65F6\u4E0D\u8986\u76D6\uFF0C\u8FDC\u7AEF\u7248\u53E6\u5B58\u4E3A\u201C\uFF08\u5938\u514B\u51B2\u7A81\uFF09\u201D\u6587\u4EF6\uFF1B\u955C\u50CF\u5220\u9664\u5173\u65F6\u5220\u9664\u4E0D\u4E92\u76F8\u540C\u6B65\u3002Git \u540C\u6B65\u7EE7\u7EED\u7528\uFF0C\u8FD9\u4E2A\u63D2\u4EF6\u662F\u53E6\u4E00\u6761\u5907\u4EFD\u8DEF\u7EBF\u3002"
    );
    ver.descEl.style.display = "none";
    mark.onclick = () => {
      ver.descEl.style.display = ver.descEl.style.display === "none" ? "" : "none";
    };
    new import_obsidian2.Setting(containerEl).setName("\u5938\u514B\u76EE\u6807\u6587\u4EF6\u5939").setDesc("\u672C\u5730\u5E93\u6839\u5BF9\u5E94\u5230\u5938\u514B\u7684\u8FD9\u4E2A\u6587\u4EF6\u5939\uFF0C\u4F8B\u5982\uFF1AObsidian\u5907\u4EFD \u6216 Muse\u751F\u6210\u5185\u5BB9/Obsidian\u5907\u4EFD\u3002").addText(
      (text) => text.setPlaceholder("Obsidian\u5907\u4EFD").setValue(this.plugin.settings.targetFolder).onChange(async (value) => {
        this.plugin.settings.targetFolder = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u5938\u514B Cookie").setDesc(
      "\u5728\u7535\u8111\u6D4F\u89C8\u5668\u6253\u5F00 pan.quark.cn \u767B\u5F55\u540E\uFF0C\u6309 F12 \u2192 Network \u2192 \u4EFB\u4E00\u8BF7\u6C42\uFF0C\u590D\u5236 Cookie \u5B57\u7B26\u4E32\u7C98\u8D34\u5230\u8FD9\u91CC\u3002\u53EA\u5B58\u5728\u672C\u63D2\u4EF6\u7684\u6570\u636E\u6587\u4EF6\u91CC\uFF0C\u4E0D\u4F1A\u5199\u8FDB\u7B14\u8BB0\u6216\u65E5\u5FD7\uFF1B\u8FC7\u671F\u540E\u8BF7\u91CD\u65B0\u7C98\u8D34\u3002"
    ).addText((text) => {
      text.inputEl.type = "password";
      text.setPlaceholder("\u7C98\u8D34\u4ECE\u6D4F\u89C8\u5668\u590D\u5236\u7684 Cookie \u5B57\u7B26\u4E32").setValue(this.plugin.settings.cookie).onChange(async (value) => {
        this.plugin.settings.cookie = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian2.Setting(containerEl).setName("\u767B\u5F55").setDesc("\u6D4B\u8BD5\u8FDE\u63A5\u4F1A\u62C9\u53D6\u5938\u514B\u6839\u76EE\u5F55\u9A8C\u8BC1\u767B\u5F55\uFF1B\u6210\u529F\u540E\u82E5\u670D\u52A1\u7AEF\u8FD4\u56DE\u4E86\u65B0 Cookie\uFF0C\u4F1A\u81EA\u52A8\u4FDD\u5B58\u3002\u5931\u8D25\u8BF7\u5148\u68C0\u67E5 Cookie \u662F\u5426\u8FC7\u671F\u3002").addButton(
      (btn) => btn.setButtonText("\u6D4B\u8BD5\u8FDE\u63A5").onClick(async () => {
        try {
          if (!this.plugin.settings.cookie.trim()) {
            new import_obsidian2.Notice("\u8BF7\u5148\u7C98\u8D34\u5938\u514B Cookie");
            return;
          }
          const client = new QuarkClient(this.plugin.settings.cookie, obsidianFetchFn());
          await client.testConnection();
          const refreshed = this.plugin.syncCookieFrom(client);
          if (refreshed) await this.plugin.saveSettings();
          new import_obsidian2.Notice(refreshed ? "\u5938\u514B\u8FDE\u63A5\u6B63\u5E38\uFF08Cookie \u5DF2\u81EA\u52A8\u5237\u65B0\u5E76\u4FDD\u5B58\uFF09" : "\u5938\u514B\u8FDE\u63A5\u6B63\u5E38");
        } catch (e) {
          new import_obsidian2.Notice(`\u8FDE\u63A5\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`);
        }
      })
    ).addButton(
      (btn) => btn.setButtonText("\u6E05\u9664\u767B\u5F55").onClick(async () => {
        this.plugin.settings.cookie = "";
        await this.plugin.saveSettings();
        new import_obsidian2.Notice("\u5DF2\u6E05\u9664\u5938\u514B\u767B\u5F55");
        this.display();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u955C\u50CF\u5220\u9664").setDesc(
      "\u5173\u95ED\uFF08\u9ED8\u8BA4\uFF09\uFF1A\u5220\u9664\u4E0D\u4E92\u76F8\u540C\u6B65\uFF1A\u672C\u5730\u5220\u4E86\u8FDC\u7AEF\u4FDD\u7559\uFF0C\u8FDC\u7AEF\u5220\u4E86\u672C\u5730\u4FDD\u7559\uFF0C\u4E14\u4E0D\u4F1A\u628A\u5220\u6389\u7684\u6587\u4EF6\u91CD\u65B0\u4E0B\u8F7D\u6216\u4E0A\u4F20\u56DE\u6765\u3002\u6253\u5F00\uFF1A\u5220\u9664\u53CC\u5411\u540C\u6B65\uFF1A\u672C\u5730\u5220\u4E86\u8FDC\u7AEF\u5220\uFF0C\u8FDC\u7AEF\u5220\u4E86\u672C\u5730\u6587\u4EF6\u8FDB Obsidian \u56DE\u6536\u7AD9\uFF08.trash\uFF0C\u53EF\u6062\u590D\uFF09\u3002"
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.mirrorDelete).onChange(async (value) => {
        this.plugin.settings.mirrorDelete = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u53CC\u5411\u540C\u6B65").setDesc(
      "\u6253\u5F00\uFF08\u9ED8\u8BA4\uFF09\uFF1A\u8FDC\u7AEF\u65B0\u589E\u6216\u6539\u52A8\u7684\u6587\u4EF6\u4F1A\u4E0B\u8F7D\u5230\u672C\u5730\uFF1B\u53CC\u8FB9\u90FD\u6539\u52A8\u65F6\u4E0D\u8986\u76D6\u4EFB\u4F55\u4E00\u8FB9\uFF0C\u8FDC\u7AEF\u7248\u53E6\u5B58\u4E3A\u201C\uFF08\u5938\u514B\u51B2\u7A81\uFF09\u201D\u6587\u4EF6\u5E76\u8BB0\u65E5\u5FD7\u3002\u5173\u95ED\uFF1A\u53EA\u4E0A\u4F20\uFF08\u65E7\u7684\u5355\u5411\u884C\u4E3A\uFF09\u3002"
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.twoWay).onChange(async (value) => {
        this.plugin.settings.twoWay = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u81EA\u52A8\u540C\u6B65\u95F4\u9694\uFF08\u5206\u949F\uFF09").setDesc("0 = \u5173\u95ED\u81EA\u52A8\u540C\u6B65\uFF08\u9ED8\u8BA4\uFF0C\u53EA\u624B\u52A8\u540C\u6B65\uFF09\u3002\u5927\u4E8E 0 \u65F6 Obsidian \u6253\u5F00\u671F\u95F4\u6309\u95F4\u9694\u81EA\u52A8\u540C\u6B65\uFF0C\u5173\u95ED Obsidian \u5373\u505C\u3002").addText(
      (text) => text.setPlaceholder("0").setValue(String(this.plugin.settings.autoSyncMinutes)).onChange(async (value) => {
        const n = Number(value);
        this.plugin.settings.autoSyncMinutes = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
        await this.plugin.saveSettings();
        this.plugin.restartTimer();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u5FFD\u7565\u89C4\u5219\uFF08\u6BCF\u884C\u4E00\u6761\uFF09").setDesc(
      "\u9ED8\u8BA4\u5DF2\u5FFD\u7565 .obsidian/\u3001.git/\u3001.trash/\u3001\u4EFB\u4F55 target/ \u4E0E node_modules/\uFF08\u6784\u5EFA\u4EA7\u7269\uFF0C\u4E0D\u662F\u7B14\u8BB0\uFF09\u3002\u8FD9\u91CC\u8FFD\u52A0 glob\uFF0C\u4F8B\u5982\uFF1A\u79C1\u4EBA/** \u6216 *.tmp\u3002\u5FFD\u7565\u53EA\u5F71\u54CD\u672C\u6B21\u626B\u63CF\uFF0C\u4E0D\u5220\u9664\u8FDC\u7AEF\u5DF2\u6709\u6587\u4EF6\u3002"
    ).addTextArea(
      (text) => text.setPlaceholder("\u79C1\u4EBA/**\n*.tmp").setValue(this.plugin.settings.ignorePatterns).onChange(async (value) => {
        this.plugin.settings.ignorePatterns = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u7ACB\u5373\u540C\u6B65").setDesc("\u624B\u52A8\u89E6\u53D1\u4E00\u6B21\u540C\u6B65\u5230\u5938\u514B\u3002").addButton((btn) => {
      this.syncBtn = btn;
      this.refreshSyncButton();
      btn.onClick(() => {
        this.plugin.toggleSync();
      });
    });
    new import_obsidian2.Setting(containerEl).setName("\u540C\u6B65\u65E5\u5FD7").addButton(
      (btn) => btn.setButtonText("\u6E05\u9664\u65E5\u5FD7").onClick(() => {
        this.plugin.clearLog();
        if (this.logPre) this.logPre.textContent = "";
        new import_obsidian2.Notice("\u540C\u6B65\u65E5\u5FD7\u5DF2\u6E05\u9664");
      })
    );
    const prog = containerEl.createEl("p", { text: this.plugin.progressText() });
    this.progressEl = prog;
    const lastSync = containerEl.createEl("p", { text: this.plugin.lastSyncText() });
    this.lastSyncEl = lastSync;
    const pre = containerEl.createEl("pre", { text: this.plugin.logText() });
    pre.style.whiteSpace = "pre-wrap";
    pre.style.maxHeight = "300px";
    pre.style.overflow = "auto";
    this.logPre = pre;
    this.logUnsub = this.plugin.subscribeUi(() => {
      if (this.logPre) this.logPre.textContent = this.plugin.logText();
      if (this.progressEl) this.progressEl.textContent = this.plugin.progressText();
      if (this.lastSyncEl) this.lastSyncEl.textContent = this.plugin.lastSyncText();
      this.refreshSyncButton();
    });
  }
  refreshSyncButton() {
    if (!this.syncBtn) return;
    if (this.plugin.isSyncing()) {
      this.syncBtn.setIcon("pause");
      this.syncBtn.setButtonText("\u6682\u505C\u540C\u6B65");
    } else {
      this.syncBtn.setIcon("play");
      this.syncBtn.setButtonText("\u5F00\u59CB\u540C\u6B65");
    }
  }
};

// src/main.ts
var QuarkSyncPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.lastState = [];
    this.tombstones = { localDeleted: [], remoteDeleted: [] };
    this.lastSyncAt = null;
    this.log = new RingLog(200);
    this.running = false;
    this.timer = null;
    this.statusEl = null;
    // Sync progress, shown in the settings log area. Denominator is the
    // number of scanned LOCAL files (what the user counts); skipped and
    // filtered files count as handled at diff time, action files as their
    // action completes. Remote-only deletes do not move this counter.
    this.progress = { total: 0, done: 0, active: false, interrupted: false, failed: 0, paused: false };
    this.progressBase = 0;
    this.progressFileDone = 0;
    this.progressListeners = /* @__PURE__ */ new Set();
    this.syncStartedAt = 0;
    this.lastUiNotifyAt = 0;
    this.lastStatusAt = 0;
    this.lastProgressSaveAt = 0;
    this.progressCurrent = "";
    this.cancelRequested = false;
  }
  async onload() {
    const data = await this.loadData();
    if (data) {
      this.settings = { ...DEFAULT_SETTINGS, ...data.settings ?? {} };
      this.lastState = data.lastState ?? [];
      this.tombstones = data.tombstones ?? { localDeleted: [], remoteDeleted: [] };
      this.lastSyncAt = typeof data.lastSyncAt === "string" ? data.lastSyncAt : null;
      if (data.lastProgress) {
        this.progress = {
          total: data.lastProgress.total,
          done: data.lastProgress.done,
          active: false,
          interrupted: data.lastProgress.interrupted || data.lastProgress.active,
          failed: data.lastProgress.failed,
          paused: data.lastProgress.paused ?? false
        };
      }
    }
    this.addRibbonIcon("cloud", "\u540C\u6B65\u5230\u5938\u514B", async () => {
      await this.syncNow();
    });
    this.addCommand({
      id: "sync-to-quark",
      name: "\u540C\u6B65\u5230\u5938\u514B",
      callback: async () => {
        await this.syncNow();
      }
    });
    this.addCommand({
      id: "clear-quark-sync-log",
      name: "\u6E05\u9664\u5938\u514B\u540C\u6B65\u65E5\u5FD7",
      callback: () => {
        this.clearLog();
        new import_obsidian3.Notice("\u540C\u6B65\u65E5\u5FD7\u5DF2\u6E05\u9664");
      }
    });
    this.statusEl = this.addStatusBarItem();
    this.statusEl.setText("\u5938\u514B\u540C\u6B65\uFF1A\u5C31\u7EEA");
    this.addSettingTab(new QuarkSyncSettingTab(this.app, this));
    this.restartTimer();
    this.log.info("\u63D2\u4EF6\u5DF2\u52A0\u8F7D");
  }
  onunload() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  restartTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.settings.autoSyncMinutes > 0) {
      this.timer = setInterval(() => {
        void this.syncNow(true);
      }, this.settings.autoSyncMinutes * 60 * 1e3);
    }
  }
  /** Persist a server-refreshed cookie back to settings (no value is logged).
   *  Returns true when the stored cookie actually changed. Callers save. */
  syncCookieFrom(client) {
    const merged = client.getCookie();
    if (merged.trim() && merged !== this.settings.cookie) {
      this.settings.cookie = merged;
      this.log.info("Cookie \u5DF2\u81EA\u52A8\u5237\u65B0\u5E76\u4FDD\u5B58");
      return true;
    }
    return false;
  }
  async saveSettings() {
    await this.saveData({
      settings: this.settings,
      lastState: this.lastState,
      tombstones: this.tombstones,
      lastSyncAt: this.lastSyncAt,
      lastProgress: {
        total: this.progress.total,
        done: this.progress.done,
        failed: this.progress.failed,
        interrupted: this.progress.interrupted,
        active: this.progress.active,
        paused: this.progress.paused
      }
    });
  }
  /** Last completed sync, Beijing time. Survives restart (saved in data.json). */
  lastSyncText() {
    if (!this.lastSyncAt) return "\u4E0A\u4E00\u6B21\u540C\u6B65\uFF1A\u5C1A\u672A\u540C\u6B65";
    return `\u4E0A\u4E00\u6B21\u540C\u6B65\uFF1A${formatBeijingTime(new Date(this.lastSyncAt))}`;
  }
  logText() {
    return this.log.toText();
  }
  clearLog() {
    this.log.clear();
  }
  progressText() {
    const { total, done, active, interrupted, failed } = this.progress;
    if (total === 0) return "\u540C\u6B65\u8FDB\u5EA6\uFF1A\u5C1A\u672A\u540C\u6B65";
    if (active) return `\u540C\u6B65\u8FDB\u5EA6\uFF1A\u5DF2\u5B8C\u6210 ${done} / \u5171 ${total} \u4E2A\u6587\u4EF6\uFF08\u540C\u6B65\u4E2D\u2026\uFF09` + (this.progressCurrent ? ` \xB7 ${this.progressCurrent}` : "");
    if (this.progress.paused) return `\u540C\u6B65\u8FDB\u5EA6\uFF1A\u5DF2\u5B8C\u6210 ${done} / \u5171 ${total} \u4E2A\u6587\u4EF6\uFF08\u5DF2\u6682\u505C\uFF09`;
    if (interrupted) return `\u540C\u6B65\u8FDB\u5EA6\uFF1A\u5DF2\u5B8C\u6210 ${done} / \u5171 ${total} \u4E2A\u6587\u4EF6\uFF08\u540C\u6B65\u4E2D\u65AD\uFF0C\u89C1\u65E5\u5FD7\uFF09`;
    return `\u540C\u6B65\u8FDB\u5EA6\uFF1A\u5DF2\u5B8C\u6210 ${done} / \u5171 ${total} \u4E2A\u6587\u4EF6` + (failed > 0 ? `\uFF0C\u5931\u8D25 ${failed} \u4E2A` : "");
  }
  notifyProgress() {
    this.lastUiNotifyAt = Date.now();
    for (const fn of [...this.progressListeners]) {
      try {
        fn();
      } catch {
      }
    }
  }
  /** At most one UI push per 250 ms during the per-file loops: with a
   * 15k-file vault, a push per file makes the status bar flicker and
   * the settings panel rewrite itself thousands of times. */
  notifyProgressThrottled() {
    if (Date.now() - this.lastUiNotifyAt >= 250) this.notifyProgress();
  }
  setStatus(text, force = false) {
    if (!this.statusEl) return;
    if (force || Date.now() - this.lastStatusAt >= 250) {
      this.lastStatusAt = Date.now();
      this.statusEl.setText(text);
    }
  }
  /** Progress persistence, throttled to one write per 5 s mid-run: a
   * per-file data.json rewrite over a 15k-file vault is O(n^2) bytes
   * and visibly slows the sync. The final and failure saves are direct. */
  async saveProgressThrottled() {
    if (Date.now() - this.lastProgressSaveAt >= 5e3) {
      this.lastProgressSaveAt = Date.now();
      await this.saveSettings();
    }
  }
  /** One subscription for the whole live settings panel: log pushes AND
   * progress pushes. The settings tab unsubscribes on hide, which is
   * what stops the pushes when the window closes. */
  subscribeUi(fn) {
    const offLog = this.log.subscribe(fn);
    this.progressListeners.add(fn);
    return () => {
      offLog();
      this.progressListeners.delete(fn);
    };
  }
  isSyncing() {
    return this.running;
  }
  /**
   * The settings button calls this synchronously (never awaiting the sync
   * promise) so Obsidian never puts the button into a loading spinner:
   * idle -> start sync in the background; syncing -> request a pause.
   * A pause finishes the current file, saves the partial state, and the
   * next start resumes without redoing finished files.
   */
  toggleSync() {
    if (this.running) {
      if (Date.now() - this.syncStartedAt < 1e3) return;
      this.cancelRequested = true;
      return;
    }
    void this.syncNow().catch(() => {
    });
  }
  async syncNow(quiet = false) {
    if (this.running) {
      if (!quiet) new import_obsidian3.Notice("\u5938\u514B\u540C\u6B65\u8FDB\u884C\u4E2D\uFF0C\u8BF7\u7A0D\u5019");
      return;
    }
    this.cancelRequested = false;
    if (!this.settings.cookie.trim()) {
      if (!quiet) new import_obsidian3.Notice("\u8BF7\u5148\u5728\u8BBE\u7F6E\u9875\u7C98\u8D34\u5938\u514B Cookie");
      return;
    }
    this.running = true;
    this.syncStartedAt = Date.now();
    this.progressCurrent = "";
    this.notifyProgress();
    try {
      const client = new QuarkClient(this.settings.cookie, obsidianFetchFn());
      this.statusEl?.setText("\u5938\u514B\u540C\u6B65\uFF1A\u6B63\u5728\u68C0\u67E5\u8FDE\u63A5\u2026");
      try {
        await client.testConnection();
        if (this.syncCookieFrom(client)) await this.saveSettings();
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        this.statusEl?.setText("\u5938\u514B\u540C\u6B65\uFF1A\u8FDE\u63A5\u5931\u8D25\uFF0C\u5DF2\u53D6\u6D88");
        this.log.error(`\u540C\u6B65\u672A\u5F00\u59CB\uFF1A\u8FDE\u63A5\u5931\u8D25\uFF1A${reason}`);
        if (!quiet) new import_obsidian3.Notice(`\u5938\u514B\u8FDE\u63A5\u5931\u8D25\uFF0C\u540C\u6B65\u672A\u5F00\u59CB\uFF1A${reason}\u3002\u8BF7\u5148\u5728\u8BBE\u7F6E\u9875\u6D4B\u8BD5\u8FDE\u63A5\u3002`);
        return;
      }
      this.lastSyncAt = (/* @__PURE__ */ new Date()).toISOString();
      await this.saveSettings();
      this.statusEl?.setText("\u5938\u514B\u540C\u6B65\uFF1A\u626B\u63CF\u4E2D\u2026");
      const extraIgnores = this.settings.ignorePatterns.split("\n").map((s) => s.trim()).filter(Boolean);
      const localFiles = [];
      const allFiles = this.app.vault.getFiles();
      this.progress = { total: allFiles.length, done: 0, active: true, interrupted: false, failed: 0, paused: false };
      this.notifyProgress();
      const dirOf = (p) => {
        const i = p.lastIndexOf("/");
        return i === -1 ? "" : p.slice(0, i);
      };
      const baseOf = (p) => {
        const i = p.lastIndexOf("/");
        return i === -1 ? p : p.slice(i + 1);
      };
      const takenByDir = /* @__PURE__ */ new Map();
      for (const f of allFiles) {
        if (isIgnored(f.path, extraIgnores)) continue;
        const base = baseOf(f.path);
        if (sanitizeFileName(base) === base) {
          const dir = dirOf(f.path);
          if (!takenByDir.has(dir)) takenByDir.set(dir, /* @__PURE__ */ new Set());
          takenByDir.get(dir).add(base);
        }
      }
      const finalPath = /* @__PURE__ */ new Map();
      for (const f of allFiles) {
        if (isIgnored(f.path, extraIgnores)) continue;
        const base = baseOf(f.path);
        const clean = sanitizeFileName(base);
        if (clean === base) {
          finalPath.set(f, f.path);
          continue;
        }
        const dir = dirOf(f.path);
        const taken = takenByDir.get(dir) ?? /* @__PURE__ */ new Set();
        const dot = clean.lastIndexOf(".");
        const stem = dot > 0 ? clean.slice(0, dot) : clean;
        const ext = dot > 0 ? clean.slice(dot) : "";
        let candidate = clean;
        let n = 2;
        while (taken.has(candidate)) {
          candidate = `${stem} (${n})${ext}`;
          n++;
        }
        taken.add(candidate);
        takenByDir.set(dir, taken);
        const newPath = dir ? `${dir}/${candidate}` : candidate;
        try {
          await this.app.vault.rename(f, newPath);
          this.log.info(`\u672C\u5730\u6587\u4EF6\u540D\u5DF2\u6E05\u7406\uFF1A${f.path} -> ${newPath}`);
          finalPath.set(f, newPath);
        } catch (e) {
          this.log.error(
            `\u672C\u5730\u91CD\u547D\u540D\u5931\u8D25\uFF0C\u5DF2\u8DF3\u8FC7\uFF1A${f.path}\uFF1A${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
      for (let i = 0; i < allFiles.length; i++) {
        const file = allFiles[i];
        const path = finalPath.get(file);
        if (!path) continue;
        const buf = await this.app.vault.readBinary(file);
        const bytes = new Uint8Array(buf);
        this.progress.done = i + 1;
        this.setStatus(`\u5938\u514B\u540C\u6B65\uFF1A\u626B\u63CF\u4E2D\u2026\u5DF2\u8BFB ${i + 1}/${allFiles.length} \xB7 ${path}`);
        this.notifyProgressThrottled();
        localFiles.push({
          path,
          size: bytes.length,
          mtimeMs: file.stat.mtime,
          sha256: await sha256Hex(bytes),
          data: bytes
        });
      }
      const ignoredCount = allFiles.filter((f) => isIgnored(f.path, extraIgnores)).length;
      this.log.info(`\u626B\u63CF\u5B8C\u6210\uFF1A\u5E93\u5185 ${allFiles.length} \u4E2A\u6587\u4EF6\uFF0C\u5FFD\u7565 ${ignoredCount} \u4E2A\uFF0C\u5F85\u5904\u7406 ${localFiles.length} \u4E2A`);
      this.statusEl?.setText(`\u5938\u514B\u540C\u6B65\uFF1A${localFiles.length} \u4E2A\u672C\u5730\u6587\u4EF6\uFF0C\u6B63\u5728\u6BD4\u5BF9\u2026`);
      this.progress = { total: localFiles.length, done: 0, active: true, interrupted: false, failed: 0, paused: false };
      this.progressBase = 0;
      this.progressFileDone = 0;
      this.notifyProgress();
      const { summary, newState, tombstones: newTombstones, cancelled } = await runSync(
        client,
        localFiles,
        this.lastState,
        {
          targetSegments: targetSegments(this.settings),
          mirrorDelete: this.settings.mirrorDelete,
          twoWay: this.settings.twoWay,
          tombstones: this.tombstones,
          extraIgnores,
          writeLocal: async (path, data) => {
            const dir = dirOf(path);
            if (dir) {
              const parts = dir.split("/");
              let cur = "";
              for (const seg of parts) {
                cur = cur ? `${cur}/${seg}` : seg;
                if (!this.app.vault.getAbstractFileByPath(cur)) await this.app.vault.createFolder(cur);
              }
            }
            const buf = data.slice().buffer;
            const existing = this.app.vault.getAbstractFileByPath(path);
            if (existing && "stat" in existing) {
              await this.app.vault.modifyBinary(existing, buf);
            } else {
              await this.app.vault.createBinary(path, buf);
            }
          },
          deleteLocal: async (path) => {
            const f = this.app.vault.getAbstractFileByPath(path);
            if (f) await this.app.vault.trash(f, false);
          },
          maxFileBytes: this.settings.maxFileBytes,
          shouldCancel: () => this.cancelRequested,
          onUploadPart: (path, part, totalParts) => {
            this.progressCurrent = `${path}\uFF08\u5206\u7247 ${part}/${totalParts}\uFF09`;
            this.setStatus(`\u5938\u514B\u540C\u6B65\uFF1A${this.progressCurrent}`);
            this.notifyProgressThrottled();
          }
        },
        this.log,
        async (done, total, current, kind) => {
          this.progressCurrent = current;
          this.setStatus(`\u5938\u514B\u540C\u6B65\uFF1A${done}/${total} \xB7 ${current}`);
          if (kind !== "deleteRemote" && kind !== "deleteLocal") {
            this.progressFileDone++;
            this.progress.done = Math.min(this.progress.total, this.progressBase + this.progressFileDone);
            this.notifyProgressThrottled();
            await this.saveProgressThrottled();
          }
        },
        async (info) => {
          this.progressBase = info.skipped + info.filtered + info.adopted;
          this.progress.done = Math.min(this.progress.total, this.progressBase);
          this.notifyProgress();
          await this.saveProgressThrottled();
        }
      );
      this.running = false;
      this.progress.active = false;
      this.progress.failed = summary.failed.length;
      this.lastSyncAt = (/* @__PURE__ */ new Date()).toISOString();
      this.lastState = newState;
      this.tombstones = newTombstones;
      this.syncCookieFrom(client);
      if (cancelled) {
        this.progress.paused = true;
        this.notifyProgress();
        await this.saveSettings();
        this.statusEl?.setText("\u5938\u514B\u540C\u6B65\u5DF2\u6682\u505C");
        const msg = `\u540C\u6B65\u5DF2\u6682\u505C\uFF1A\u5DF2\u5B8C\u6210 ${this.progress.done} / \u5171 ${this.progress.total} \u4E2A\u6587\u4EF6\uFF0C\u4E0B\u6B21\u540C\u6B65\u7EE7\u7EED\uFF0C\u4E0D\u4F1A\u91CD\u4F20\u5DF2\u5B8C\u6210\u7684\u6587\u4EF6\u3002`;
        if (!quiet) new import_obsidian3.Notice(msg);
        this.log.info(msg);
      } else {
        this.notifyProgress();
        await this.saveSettings();
        this.statusEl?.setText(
          `\u5938\u514B\u540C\u6B65\u5B8C\u6210\uFF1A\u4E0A\u4F20 ${summary.uploaded + summary.reuploaded} \xB7 \u4E0B\u8F7D ${summary.downloaded} \xB7 \u8DF3\u8FC7 ${summary.skipped} \xB7 \u5931\u8D25 ${summary.failed.length}`
        );
        const msg = `\u5938\u514B\u540C\u6B65\u5B8C\u6210\uFF1A\u4E0A\u4F20 ${summary.uploaded}\u3001\u91CD\u65B0\u4E0A\u4F20 ${summary.reuploaded}\u3001\u4E0B\u8F7D ${summary.downloaded}\u3001\u51B2\u7A81\u53E6\u5B58 ${summary.conflictCopies}\u3001\u6539\u540D ${summary.renamed}\u3001\u79FB\u52A8 ${summary.moved}\u3001\u8FDC\u7AEF\u5220\u9664 ${summary.deletedRemote}\u3001\u672C\u5730\u5220\u9664 ${summary.deletedLocal}\u3001\u8DF3\u8FC7 ${summary.skipped}` + (summary.adopted > 0 ? `\u3001\u8BA4\u9886 ${summary.adopted}` : "") + `\u3001\u5931\u8D25 ${summary.failed.length}` + (summary.failed.length > 0 ? `\uFF0C\u9996\u4E2A\u5931\u8D25\uFF1A${summary.failed[0].path}\uFF1A${summary.failed[0].error}` : "");
        if (!quiet || summary.failed.length > 0) new import_obsidian3.Notice(msg);
        this.log.info(msg);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.running = false;
      if (this.progress.active) {
        this.progress.active = false;
        this.progress.interrupted = true;
        this.notifyProgress();
      }
      this.statusEl?.setText("\u5938\u514B\u540C\u6B65\u5931\u8D25");
      this.log.error(`\u540C\u6B65\u5931\u8D25\uFF1A${msg}`);
      if (!quiet) new import_obsidian3.Notice(`\u5938\u514B\u540C\u6B65\u5931\u8D25\uFF1A${msg}`);
      try {
        await this.saveSettings();
      } catch {
      }
    } finally {
      this.running = false;
      this.progressCurrent = "";
      this.notifyProgress();
    }
  }
};
