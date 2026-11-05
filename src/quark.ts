// Quark Drive web-API client, pure fetch. Mirrors lich0821/QuarkPan's
// Python implementation (see docs/DESIGN.md section 3). No Node APIs.
// The cookie is supplied by the caller and is never logged here.

import { md5Hex } from "./md5.ts";
import { sha1Hex } from "./hash.ts";
import { sha1IncrementalContext } from "./sha1state.ts";

export const QUARK_BASE = "https://drive-pc.quark.cn/1/clouddrive";
const OSS_USER_AGENT_PUT =
  "aliyun-sdk-js/1.0.0 Chrome Mobile 139.0.0.0 on Google Nexus 5 (Android 6.0)";
const OSS_USER_AGENT_POST =
  "aliyun-sdk-js/1.0.0 Chrome 139.0.0.0 on OS X 10.15.7 64-bit";

export class QuarkError extends Error {
  readonly isAuth: boolean;
  readonly statusCode?: number;
  constructor(message: string, isAuth: boolean = false, statusCode?: number) {
    super(message);
    this.name = "QuarkError";
    this.isAuth = isAuth;
    this.statusCode = statusCode;
  }
}

export interface QuarkItem {
  fid: string;
  file_name: string;
  file_type: number; // 0 = folder, otherwise file
  size: number;
  updated_at?: number;
}

export interface RemoteEntry {
  path: string;
  fid: string;
  size: number;
  updatedAt?: number;
}

export type FetchFn = typeof fetch;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function gmtDate(): string {
  return new Date().toUTCString();
}

function base64Encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function base64OfJson(value: unknown): string {
  return base64Encode(new TextEncoder().encode(JSON.stringify(value)));
}

function md5Base64(text: string): string {
  // MD5 of the XML string, base64-encoded, for the OSS complete request.
  // Reuse the pure-TS MD5 by converting its hex back to bytes.
  const hex = md5Hex(new TextEncoder().encode(text));
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return base64Encode(bytes);
}

export class QuarkClient {
  private cookie: string;
  private fetchFn: FetchFn;

  constructor(cookie: string, fetchFn?: FetchFn) {
    this.cookie = cookie;
    // Never store a bare `fetch` reference: in Electron/Chromium, calling
    // an unbound window.fetch throws "Illegal invocation" (seen 2026-11-03
    // on Mac Obsidian when tapping "获取二维码" — and it would break every
    // other call too, since all of them go through this.fetchFn).
    // Always call through a wrapper so the receiver stays the global object.
    this.fetchFn = (
      fetchFn
        ? (input: Parameters<FetchFn>[0], init?: Parameters<FetchFn>[1]) =>
            fetchFn.call(globalThis, input, init)
        : (input: Parameters<FetchFn>[0], init?: Parameters<FetchFn>[1]) =>
            fetch(input, init)
    ) as FetchFn;
  }

  setCookie(cookie: string): void {
    this.cookie = cookie;
  }

  getCookie(): string {
    return this.cookie;
  }

  /** Merge Set-Cookie from a response into the stored cookie string.
   *  Browsers hide Set-Cookie from JS, so this is a no-op there; in Node
   *  (undici) getSetCookie() exposes it. Never throws. */
  private mergeSetCookie(res: { headers: unknown }): void {
    try {
      const getSetCookie = (res.headers as { getSetCookie?: () => string[] }).getSetCookie;
      const setCookies = typeof getSetCookie === "function" ? getSetCookie.call(res.headers) : [];
      if (setCookies.length === 0) return;
      const map = new Map<string, string>();
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
      // Cookie merging must never break the API call itself.
    }
  }

  hasCookie(): boolean {
    return this.cookie.trim().length > 0;
  }

  private buildUrl(path: string, extra: Record<string, string | number> = {}): string {
    const params = new URLSearchParams({
      pr: "ucpro",
      fr: "pc",
      uc_param_str: "",
      __t: String(Date.now()),
      __dt: "1000",
    });
    for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
    return `${QUARK_BASE}/${path}?${params.toString()}`;
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    extraParams: Record<string, string | number> = {},
    absoluteUrl?: string,
  ): Promise<Record<string, unknown>> {
    const url = absoluteUrl ?? this.buildUrl(path, extraParams);
    // Never send an explicit Cookie header when we hold no cookie: an
    // explicit (even empty) Cookie header overrides Electron's own cookie
    // jar, which is exactly how a QR login dies. After a QR scan, the
    // session may live ONLY in that jar (requestUrl does not expose
    // Set-Cookie), so later calls must omit the header and let the jar
    // attach the session. This was the 2026-11-03 Mac failure: ticket
    // obtained, then testConnection sent `Cookie: ""` and got rejected.
    const res = await this.fetchFn(url, {
      method,
      headers: {
        origin: "https://pan.quark.cn",
        referer: "https://pan.quark.cn/",
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        ...(this.cookie.trim() ? { cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    this.mergeSetCookie(res);
    if (res.status === 401 || res.status === 403) {
      // Do NOT phrase this as "expired": a 401 here most often means no
      // usable session was presented at all (e.g. the QR exchange never
      // delivered a cookie to the plugin), not that a live session died.
      throw new QuarkError(
        `夸克拒绝了请求（HTTP ${res.status}）：未携带有效登录信息，或登录已过期，请重新登录`,
        true,
        res.status,
      );
    }
    let json: Record<string, unknown>;
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      throw new QuarkError(`夸克返回了非 JSON 响应（HTTP ${res.status}）`, false, res.status);
    }
    const status = json["status"];
    const code = json["code"];
    const okStatus = status === 200 || status === true || status === "success";
    const okCode = code === undefined || code === 0;
    if (!okStatus || !okCode) {
      const message = String(json["message"] ?? "未知错误");
      const lower = message.toLowerCase();
      const isAuth = lower.includes("login") || lower.includes("auth") || lower.includes("登录");
      throw new QuarkError(`夸克接口错误：${message}`, isAuth, res.status);
    }
    return json;
  }

  async testConnection(): Promise<number> {
    // Connectivity probe: list the first page of the root folder.
    // NOTE: the `capacity` endpoint used by QuarkPan returns HTTP 404 on
    // the current server (verified 2026-11-02, QuarkPan itself returns an
    // error dict for it), so it must NOT be used as a health check.
    const items = await this.listPage("0", 1, 1);
    return items.length;
  }

  async listPage(pdirFid: string, page = 1, size = 100): Promise<QuarkItem[]> {
    const json = await this.request("GET", "file/sort", undefined, {
      pdir_fid: pdirFid,
      _page: page,
      _size: size,
      _sort: "file_name:asc",
    });
    const data = json["data"] as { list?: unknown[] } | undefined;
    const list = (data?.list ?? []) as Record<string, unknown>[];
    return list.map((it) => ({
      fid: String(it["fid"] ?? ""),
      file_name: String(it["file_name"] ?? ""),
      file_type: Number(it["file_type"] ?? 1),
      size: Number(it["size"] ?? it["file_size"] ?? 0),
      updated_at: it["updated_at"] ? Number(it["updated_at"]) : undefined,
    }));
  }

  async listAll(pdirFid: string): Promise<QuarkItem[]> {
    const out: QuarkItem[] = [];
    let page = 1;
    for (;;) {
      const items = await this.listPage(pdirFid, page, 100);
      out.push(...items);
      if (items.length < 100) break;
      page++;
    }
    return out;
  }

  /** Recursively list everything under rootFid, paths relative to root. */
  async listRecursive(rootFid: string): Promise<RemoteEntry[]> {
    const out: RemoteEntry[] = [];
    const queue: Array<{ fid: string; prefix: string }> = [{ fid: rootFid, prefix: "" }];
    while (queue.length > 0) {
      const cur = queue.shift()!;
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

  async createFolder(parentFid: string, name: string): Promise<string> {
    const json = await this.request(
      "POST",
      "file",
      { pdir_fid: parentFid, file_name: name, dir_init_lock: false, dir_path: "" },
      { pr: "ucpro", fr: "pc", uc_param_str: "" },
    );
    const data = json["data"] as Record<string, unknown> | undefined;
    const fid = String(data?.["fid"] ?? "");
    if (!fid) throw new QuarkError(`创建文件夹失败，未返回 fid：${name}`);
    return fid;
  }

  /** Resolve a path (segments) under rootFid, creating missing folders. */
  async ensureFolderPath(segments: string[], rootFid = "0"): Promise<string> {
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
  async resolveFolderPath(segments: string[], rootFid = "0"): Promise<string | null> {
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

  async deleteFiles(fids: string[]): Promise<void> {
    if (fids.length === 0) return;
    await this.request("POST", "file/delete", {
      action_type: 2,
      filelist: fids,
      exclude_fids: [],
    });
  }

  async rename(fid: string, newName: string): Promise<void> {
    await this.request("POST", "file/rename", { fid, file_name: newName });
  }

  async move(fid: string, toPdirFid: string): Promise<void> {
    const json = await this.request("POST", "file/move", {
      action_type: 1,
      to_pdir_fid: toPdirFid,
      filelist: [fid],
      exclude_fids: [],
    });
    const data = json["data"] as Record<string, unknown> | undefined;
    if (data?.["finish"]) return;
    const taskId = String(data?.["task_id"] ?? "");
    if (!taskId) throw new QuarkError("移动任务创建失败，未返回 task_id");
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      const t = await this.request("GET", "task", undefined, { task_id: taskId, retry_index: i });
      const td = t["data"] as Record<string, unknown> | undefined;
      if (td?.["status"] === 2) return;
      if (td?.["status"] === 3) {
        throw new QuarkError(`移动任务失败：${String(td?.["message"] ?? "任务失败")}`);
      }
    }
    throw new QuarkError("移动任务超时（15 秒未完成）");
  }

  // Download with retry. The CDN GET is the flaky leg: Quark's download
  // CDN intermittently answers 403 during bulk downloads (same signature
  // as the October 2026 wind-control incidents on this account: link
  // issuance succeeds, the CDN GET is refused, and the same files download
  // fine minutes later). The link is re-issued on every attempt, and only
  // the CDN leg retries — an auth failure from file/download itself means
  // the session is dead and must surface immediately, never be retried.
  // retryDelays is injectable so unit tests can pass [0, 0].
  async downloadBytes(fid: string, retryDelays: number[] = [5000, 20000]): Promise<Uint8Array> {
    const maxAttempts = retryDelays.length + 1;
    let lastStatus = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const json = await this.request(
        "POST",
        "file/download",
        { fids: [fid] },
        { pr: "ucpro", fr: "pc", sys: "win32", ve: "2.5.56", ut: "", guid: "" },
      );
      const list = (json["data"] as Record<string, unknown>[]) ?? [];
      const url = String(list[0]?.["download_url"] ?? "");
      if (!url) throw new QuarkError("无法获取下载链接");
      let res: Awaited<ReturnType<FetchFn>>;
      try {
        res = await this.fetchFn(url, {
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
            "User-Agent":
              "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
            ...(this.cookie.trim() ? { cookie: this.cookie } : {}),
          },
        });
      } catch (e) {
        // Network-level failure: retryable, same as a 5xx.
        if (attempt === maxAttempts) {
          throw new QuarkError(
            `下载失败（网络错误，已重试 ${maxAttempts} 次）：${e instanceof Error ? e.message : String(e)}`,
          );
        }
        await sleep(retryDelays[attempt - 1]);
        continue;
      }
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
      lastStatus = res.status;
      const retryable = res.status === 403 || res.status === 429 || res.status >= 500;
      if (!retryable || attempt === maxAttempts) break;
      await sleep(retryDelays[attempt - 1]);
    }
    throw new QuarkError(`下载失败（HTTP ${lastStatus}，已重试 ${maxAttempts} 次）`);
  }

  // ---- Upload: pre -> update hash -> OSS parts -> complete -> finish ----

  private mimeFor(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const map: Record<string, string> = {
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
      mp4: "video/mp4",
    };
    return map[ext] ?? "application/octet-stream";
  }

  async uploadFile(parentFid: string, fileName: string, data: Uint8Array, onPart?: (part: number, totalParts: number) => void): Promise<void> {
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
      l_created_at: now,
    });
    const preData = pre["data"] as Record<string, unknown>;
    const taskId = String(preData["task_id"] ?? "");
    const uploadId = String(preData["upload_id"] ?? "");
    const objKey = String(preData["obj_key"] ?? "");
    const bucket = String(preData["bucket"] ?? "ul-zb");
    const authInfo = String(preData["auth_info"] ?? "");
    const callback = (preData["callback"] ?? {}) as Record<string, unknown>;
    if (!taskId || !uploadId || !objKey) {
      throw new QuarkError("预上传失败，未返回 task_id/upload_id/obj_key");
    }

    await this.request("POST", "file/update/hash", {
      task_id: taskId,
      md5: md5Hex(data),
      sha1: await sha1Hex(data),
    });

    const CHUNK = 4 * 1024 * 1024;
    const parts: Array<{ num: number; size: number }> = [];
    if (data.length === 0) {
      parts.push({ num: 1, size: 0 });
    } else {
      for (let off = 0, n = 1; off < data.length; off += CHUNK, n++) {
        parts.push({ num: n, size: Math.min(CHUNK, data.length - off) });
      }
    }

    const etags: Array<{ num: number; etag: string }> = [];
    for (const part of parts) {
      const chunk = data.slice((part.num - 1) * CHUNK, (part.num - 1) * CHUNK + part.size);
      // Part 2+ must carry the SHA-1 incremental state of all previous
      // bytes, or OSS rejects the PUT with 400 (verified 2026-11-02).
      const hashCtx =
        part.num > 1
          ? sha1IncrementalContext(data.slice(0, (part.num - 1) * CHUNK), (part.num - 1) * CHUNK)
          : undefined;
      const auth = await this.uploadAuth(taskId, authInfo, mime, part.num, uploadId, objKey, bucket, hashCtx);
      const res = await this.fetchFn(auth.url, {
        method: "PUT",
        headers: auth.headers,
        body: chunk as unknown as BodyInit,
      });
      if (!res.ok) {
        throw new QuarkError(`OSS 分片上传失败 part=${part.num}（HTTP ${res.status}）`);
      }
      const etag = (res.headers.get("etag") ?? "").replace(/"/g, "");
      if (!etag) throw new QuarkError(`OSS 分片上传成功但未返回 ETag part=${part.num}`);
      etags.push({ num: part.num, etag });
      onPart?.(part.num, parts.length);
    }

    const xmlParts = etags
      .map((p) => `<Part><PartNumber>${p.num}</PartNumber><ETag>"${p.etag}"</ETag></Part>`)
      .join("");
    const xml = `<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUpload>${xmlParts}</CompleteMultipartUpload>`;
    const completeAuth = await this.completeAuth(taskId, authInfo, mime, uploadId, objKey, bucket, xml, callback);
    const completeRes = await this.fetchFn(completeAuth.url, {
      method: "POST",
      headers: completeAuth.headers,
      body: xml,
    });
    if (!completeRes.ok) {
      throw new QuarkError(`OSS 合并失败（HTTP ${completeRes.status}）`);
    }

    await this.request("POST", "file/upload/finish", { task_id: taskId, obj_key: objKey });
  }

  private async uploadAuth(
    taskId: string,
    authInfo: string,
    mime: string,
    partNumber: number,
    uploadId: string,
    objKey: string,
    bucket: string,
    hashCtx?: string,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const date = gmtDate();
    const authMeta =
      `PUT\n\n${mime}\n${date}\nx-oss-date:${date}\n` +
      (hashCtx ? `x-oss-hash-ctx:${hashCtx}\n` : "") +
      `x-oss-user-agent:${OSS_USER_AGENT_PUT}\n/${bucket}/${objKey}?partNumber=${partNumber}&uploadId=${uploadId}`;
    const json = await this.request("POST", "file/upload/auth", {
      task_id: taskId,
      auth_info: authInfo,
      auth_meta: authMeta,
    });
    const data = json["data"] as Record<string, unknown>;
    const authKey = String(data["auth_key"] ?? "");
    const headers: Record<string, string> = {
      "Content-Type": mime,
      "x-oss-date": date,
      "x-oss-user-agent": OSS_USER_AGENT_PUT,
    };
    if (authKey) headers["authorization"] = authKey;
    if (hashCtx) headers["X-Oss-Hash-Ctx"] = hashCtx;
    return {
      url: `https://${bucket}.pds.quark.cn/${objKey}?partNumber=${partNumber}&uploadId=${uploadId}`,
      headers,
    };
  }

  private async completeAuth(
    taskId: string,
    authInfo: string,
    mime: string,
    uploadId: string,
    objKey: string,
    bucket: string,
    xml: string,
    callback: Record<string, unknown>,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const date = gmtDate();
    const xmlMd5 = md5Base64(xml);
    const callbackB64 = base64OfJson(callback);
    const authMeta =
      `POST\n${xmlMd5}\napplication/xml\n${date}\nx-oss-callback:${callbackB64}\n` +
      `x-oss-date:${date}\nx-oss-user-agent:${OSS_USER_AGENT_POST}\n/${bucket}/${objKey}?uploadId=${uploadId}`;
    const json = await this.request("POST", "file/upload/auth", {
      task_id: taskId,
      auth_meta: authMeta,
      auth_info: authInfo,
    });
    const data = json["data"] as Record<string, unknown>;
    const authKey = String(data["auth_key"] ?? "");
    return {
      url: `https://${bucket}.pds.quark.cn/${objKey}?uploadId=${uploadId}`,
      headers: {
        "Content-Type": "application/xml",
        "x-oss-date": date,
        "x-oss-user-agent": OSS_USER_AGENT_POST,
        authorization: authKey,
        "x-oss-callback": callbackB64,
        "Content-MD5": xmlMd5,
      },
    };
  }

}
