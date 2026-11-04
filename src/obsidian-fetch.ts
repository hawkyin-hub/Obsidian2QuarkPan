// Transport for the Obsidian plugin: prefer Obsidian's requestUrl, fall back
// to plain fetch only outside Obsidian (Node tests / integration script).
//
// Why: a plugin's browser fetch() is subject to CORS, and quark.cn does not
// return CORS headers for Obsidian's origin, so EVERY endpoint failed in
// real Obsidian on Mac (2026-11-03: test connection AND QR token both
// reported "Failed to fetch"). Obsidian's requestUrl() goes through
// Electron's net layer / native HTTP and bypasses CORS, which is exactly
// what it is documented for. It also sends the Cookie header as given,
// unlike browser fetch which strips it as a forbidden header.
import { requestUrl } from "obsidian";
import type { FetchFn } from "./quark.ts";

export function obsidianFetchFn(): FetchFn {
  if (typeof requestUrl !== "function") {
    return ((input, init) => fetch(input, init)) as FetchFn;
  }
  return (async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    let body: string | ArrayBuffer | undefined;
    if (typeof init?.body === "string") {
      body = init.body;
    } else if (init?.body instanceof Uint8Array) {
      body = init.body.buffer.slice(init.body.byteOffset, init.body.byteOffset + init.body.byteLength) as ArrayBuffer;
    } else if (init?.body instanceof ArrayBuffer) {
      body = init.body;
    }
    const headers = { ...((init?.headers as Record<string, string> | undefined) ?? {}) };
    // Belt-and-braces for the jar path: an empty Cookie header must never
    // reach Electron's net layer, or it overrides the jar session.
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === "cookie" && !String(headers[k]).trim()) delete headers[k];
    }
    const res = await requestUrl({
      url,
      method: init?.method ?? "GET",
      headers,
      body,
      throw: false,
    });
    const lower: Record<string, string> = {};
    for (const [k, v] of Object.entries(res.headers ?? {})) lower[k.toLowerCase()] = v;
    const setCookieRaw = lower["set-cookie"];
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      headers: {
        get: (name: string) => lower[name.toLowerCase()] ?? null,
        getSetCookie: () => (setCookieRaw ? [setCookieRaw] : []),
      },
      json: async () => res.json,
      arrayBuffer: async () => res.arrayBuffer,
    };
  }) as FetchFn;
}
