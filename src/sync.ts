// Sync orchestration: scan (caller-provided) -> diff -> execute -> state.
// The caller (Obsidian plugin, or the Node integration harness) supplies
// local files already read; this module does no filesystem or Vault I/O,
// so it runs identically in Obsidian and in tests.

import { QuarkClient } from "./quark.ts";
import { computeDiff, type LastSynced, type LocalFile, type Tombstones } from "./diff.ts";
import { sha256Hex } from "./hash.ts";
import { isIgnored } from "./ignore.ts";
import type { RingLog } from "./log.ts";

export interface SyncOptions {
  targetSegments: string[];
  mirrorDelete: boolean;
  twoWay: boolean;
  tombstones: Tombstones;
  extraIgnores?: string[];
  writeLocal?: (path: string, data: Uint8Array) => Promise<void>;
  deleteLocal?: (path: string) => Promise<void>;
  maxFileBytes: number;
  shouldCancel?: () => boolean;
  onUploadPart?: (path: string, part: number, totalParts: number) => void;
}

export interface SyncSummary {
  uploaded: number;
  reuploaded: number;
  renamed: number;
  moved: number;
  deletedRemote: number;
  deletedLocal: number;
  downloaded: number;
  conflictCopies: number;
  skipped: number;
  adopted: number;
  failed: Array<{ path: string; error: string }>;
  notes: string[];
}

const ILLEGAL = /[\\/:*?"<>|]/;

/**
 * Delete illegal filename characters (user's standing rule, 2026-11-03:
 * the LOCAL name is cleaned, not just the remote one). Only the basename
 * is ever passed here -- directory separators are not part of a name.
 * A name that would become empty (or dot-only) falls back to 未命名 so
 * the file is never left nameless.
 */
export function sanitizeFileName(name: string): string {
  const stripped = name.replace(/[\\/:*?\"<>|]/g, "");
  if (stripped === "" || /^\.+$/.test(stripped)) return "未命名";
  const dot = stripped.lastIndexOf(".");
  if (dot === 0) return `未命名${stripped}`;
  return stripped;
}

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

export async function runSync(
  client: QuarkClient,
  localFiles: LocalFile[],
  lastState: LastSynced[],
  options: SyncOptions,
  log: RingLog,
  onProgress?: (done: number, total: number, current: string, kind?: string) => void | Promise<void>,
  onDiffed?: (info: { skipped: number; filtered: number; adopted: number }) => void | Promise<void>,
): Promise<{ summary: SyncSummary; newState: LastSynced[]; tombstones: Tombstones; cancelled: boolean }> {
  const summary: SyncSummary = {
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
    notes: [],
  };

  // Filter out oversize / illegal names before diffing.
  const usable: LocalFile[] = [];
  for (const f of localFiles) {
    if (f.size > options.maxFileBytes) {
      log.warn(`跳过超限文件（>${options.maxFileBytes} 字节）：${f.path} size=${f.size}`);
      summary.notes.push(`跳过超限：${f.path}`);
      continue;
    }
    if (ILLEGAL.test(basename(f.path))) {
      log.warn(`跳过非法文件名：${f.path}`);
      summary.notes.push(`跳过非法文件名：${f.path}`);
      continue;
    }
    usable.push(f);
  }

  const targetFid = await client.ensureFolderPath(options.targetSegments, "0");
  log.info(`目标文件夹 fid 已解析，路径：${options.targetSegments.join("/") || "(根)"}`);
  const remote = await client.listRecursive(targetFid);
  const { plan, skipped, notes, adopted, refreshed, dropState, tombstones: newTombstones } = computeDiff(usable, remote, lastState, {
    mirrorDelete: options.mirrorDelete,
    twoWay: options.twoWay,
    tombstones: options.tombstones,
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
    // Keep the old state entry as-is.
    void p;
  }

  // Folder fid cache: dir (relative to target) -> fid.
  const folderCache = new Map<string, string>([["", targetFid]]);
  async function folderFid(dir: string): Promise<string> {
    const cached = folderCache.get(dir);
    if (cached) return cached;
    const segments = dir ? dir.split("/") : [];
    const fid = await client.ensureFolderPath(segments, targetFid);
    folderCache.set(dir, fid);
    return fid;
  }

  async function findFidIn(dir: string, name: string): Promise<string | null> {
    const fid = await folderFid(dir);
    // Quark's listing can lag behind upload/finish (verified: a 6 MB file
    // was missing from an immediate listing but present a minute later).
    for (let attempt = 0; attempt < 15; attempt++) {
      const items = await client.listAll(fid);
      const found = items.find((it) => it.file_type !== 0 && it.file_name === name);
      if (found) return found.fid;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return null;
  }

  // Execute renames/moves first, then uploads, then remote deletes.
  const ordered = [...plan].sort((a, b) => {
    const rank = (k: string) =>
      k === "rename" || k === "move" ? 0 : k === "upload" || k === "reupload" || k === "download" || k === "downloadConflict" ? 1 : 2;
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
        await client.rename(action.fid, basename(action.newPath));
        const f = localByPath.get(action.newPath)!;
        newStateByPath.delete(action.oldPath);
        newStateByPath.set(action.newPath, {
          path: action.newPath,
          size: f.size,
          mtimeMs: f.mtimeMs,
          sha256: f.sha256,
          fid: action.fid,
        });
        summary.renamed++;
        log.info(`改名：${action.oldPath} -> ${action.newPath}`);
        await onProgress?.(done, total, action.newPath, "rename");
      } else if (action.kind === "move") {
        const targetDirFid = await folderFid(dirname(action.newPath));
        await client.move(action.fid, targetDirFid);
        let fid = action.fid;
        if (basename(action.oldPath) !== basename(action.newPath)) {
          await client.rename(fid, basename(action.newPath));
        }
        const f = localByPath.get(action.newPath)!;
        newStateByPath.delete(action.oldPath);
        newStateByPath.set(action.newPath, {
          path: action.newPath,
          size: f.size,
          mtimeMs: f.mtimeMs,
          sha256: f.sha256,
          fid,
        });
        summary.moved++;
        log.info(`移动：${action.oldPath} -> ${action.newPath}`);
        await onProgress?.(done, total, action.newPath, "move");
      } else if (action.kind === "upload" || action.kind === "reupload") {
        const f = localByPath.get(action.path)!;
        if (!f.data) throw new Error(`本地文件内容未读取：${action.path}`);
        if (action.kind === "reupload") {
          await client.deleteFiles([action.oldFid]);
        }
        const parentFid = await folderFid(dirname(action.path));
        await client.uploadFile(parentFid, basename(action.path), f.data, (part, totalParts) => options.onUploadPart?.(action.path, part, totalParts));
        const newFid = await findFidIn(dirname(action.path), basename(action.path));
        if (!newFid) throw new Error(`上传后在远端未找到文件：${action.path}`);
        newStateByPath.set(action.path, {
          path: action.path,
          size: f.size,
          mtimeMs: f.mtimeMs,
          sha256: f.sha256,
          fid: newFid,
        });
        if (action.kind === "upload") summary.uploaded++;
        else summary.reuploaded++;
        log.info(`${action.kind === "upload" ? "上传成功" : "重新上传成功"}：${action.path} size=${f.size}`);
        await onProgress?.(done, total, action.path, action.kind);
      } else if (action.kind === "download" || action.kind === "downloadConflict") {
        const isConflict = action.kind === "downloadConflict";
        if (isIgnored(action.path, options.extraIgnores ?? [])) {
          log.warn(`远端文件命中忽略规则，未下载：${action.path}`);
          summary.notes.push(`远端文件命中忽略规则，未下载：${action.path}`);
          await onProgress?.(done, total, action.path, action.kind);
          continue;
        }
        if (action.size > options.maxFileBytes) {
          log.warn(`跳过超限远端文件（>${options.maxFileBytes} 字节）：${action.path} size=${action.size}`);
          summary.notes.push(`跳过超限远端文件：${action.path}`);
          await onProgress?.(done, total, action.path, action.kind);
          continue;
        }
        if (!options.writeLocal) throw new Error(`未提供本地写入回调，无法下载：${action.path}`);
        const bytes = await client.downloadBytes(action.fid);
        const sha = await sha256Hex(bytes);
        if (isConflict) {
          const f = localByPath.get(action.path)!;
          if (sha === f.sha256) {
            newStateByPath.set(action.path, {
              path: action.path,
              size: f.size,
              mtimeMs: f.mtimeMs,
              sha256: f.sha256,
              fid: action.fid,
              remoteSize: bytes.length,
              ...(action.updatedAt !== undefined ? { remoteUpdatedAt: action.updatedAt } : {}),
            });
            log.info(`冲突已自行一致，无需另存：${action.path}`);
          } else {
            await options.writeLocal(action.conflictPath, bytes);
            newStateByPath.set(action.path, {
              path: action.path,
              size: f.size,
              mtimeMs: f.mtimeMs,
              sha256: f.sha256,
              fid: action.fid,
              remoteSize: bytes.length,
              ...(action.updatedAt !== undefined ? { remoteUpdatedAt: action.updatedAt } : {}),
            });
            summary.conflictCopies++;
            log.info(`冲突：远端版已另存为 ${action.conflictPath}，本地原文件未动：${action.path}`);
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
              ...(action.updatedAt !== undefined ? { remoteUpdatedAt: action.updatedAt } : {}),
            });
            log.info(`远端内容与本地一致，无需写入：${action.path}`);
          } else {
            await options.writeLocal(action.path, bytes);
            newStateByPath.set(action.path, {
              path: action.path,
              size: bytes.length,
              mtimeMs: Date.now(),
              sha256: sha,
              fid: action.fid,
              remoteSize: bytes.length,
              ...(action.updatedAt !== undefined ? { remoteUpdatedAt: action.updatedAt } : {}),
            });
            summary.downloaded++;
            log.info(`下载成功：${action.path} size=${bytes.length}`);
          }
          await onProgress?.(done, total, action.path, action.kind);
        }
      } else if (action.kind === "deleteRemote") {
        await client.deleteFiles([action.fid]);
        newStateByPath.delete(action.path);
        summary.deletedRemote++;
        log.info(`删除远端：${action.path}`);
        await onProgress?.(done, total, action.path, "deleteRemote");
      } else if (action.kind === "deleteLocal") {
        if (!options.deleteLocal) throw new Error(`未提供本地删除回调，无法删除本地文件：${action.path}`);
        await options.deleteLocal(action.path);
        newStateByPath.delete(action.path);
        summary.deletedLocal++;
        log.info(`删除本地：${action.path}`);
        await onProgress?.(done, total, action.path, "deleteLocal");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const path = "path" in action ? action.path : action.oldPath;
      summary.failed.push({ path, error: msg });
      log.error(`失败：${path}：${msg}`);
      await onProgress?.(done, total, path, "kind" in action ? action.kind : "");
    }
  }

  return { summary, newState: [...newStateByPath.values()], tombstones: newTombstones, cancelled };
}
