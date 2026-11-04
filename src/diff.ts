// Pure-function sync diff: local snapshot / remote snapshot / last state
// -> an execution plan. No I/O here, so it is fully unit-testable.
//
// Two-way semantics (v0.2.0): local and remote are peers, tracked by
// INDEPENDENT fingerprints in LastSynced (local size+sha, remote
// size+updatedAt). A path is unchanged only when BOTH sides match their
// recorded fingerprints. One side changed -> that side's content wins for
// that path (upload or download). Both sides changed -> neither side is
// overwritten: the remote version is downloaded as a conflict copy and
// the original path's state records both current fingerprints, so the
// next sync skips it instead of looping. Deletions with mirror off do not
// propagate, and tombstones remember them so a deleted file is neither
// resurrected by download nor restored by upload. Mirror on propagates
// deletions both ways.

export interface LocalFile {
  path: string; // vault-relative, `/`-separated
  size: number;
  mtimeMs: number;
  sha256: string;
  data?: Uint8Array; // present only when the caller already read the file
}

export interface RemoteFile {
  path: string; // relative to the Quark target folder
  fid: string;
  size: number;
  updatedAt?: number;
}

export interface LastSynced {
  path: string;
  size: number;
  mtimeMs: number;
  sha256: string;
  fid: string;
  /** Remote size at last sync (undefined for pre-v0.2.0 state). */
  remoteSize?: number;
  /** Remote updated_at at last sync (undefined when unknown). */
  remoteUpdatedAt?: number;
  /** True when this entry was adopted from a same-size remote file whose
   * content was never verified equal to local. A later remote change on
   * an adopted path goes to a conflict copy, never a blind overwrite. */
  adopted?: boolean;
}

/** Deletion tombstones (two-way only, mirror off). A path here was
 * deleted on one side while the other side kept it; the surviving side
 * must neither re-upload nor re-download it. */
export interface Tombstones {
  /** Deleted locally, kept remotely: do not download. */
  localDeleted: string[];
  /** Deleted remotely, kept locally: do not upload. */
  remoteDeleted: string[];
}

export interface DiffOptions {
  mirrorDelete: boolean;
  twoWay: boolean;
  tombstones: Tombstones;
}

/** Legacy call shape: a bare boolean means mirrorDelete with one-way
 * semantics (pre-v0.2.0 behaviour, preserved exactly). */
export type DiffInputOptions = boolean | DiffOptions;

export type PlanAction =
  | { kind: "upload"; path: string }
  | { kind: "reupload"; path: string; oldFid: string }
  | { kind: "rename"; oldPath: string; newPath: string; fid: string }
  | { kind: "move"; oldPath: string; newPath: string; fid: string }
  | { kind: "deleteRemote"; path: string; fid: string }
  | { kind: "deleteLocal"; path: string }
  | { kind: "download"; path: string; fid: string; size: number; updatedAt?: number }
  | { kind: "downloadConflict"; path: string; fid: string; size: number; updatedAt?: number; conflictPath: string };

export interface DiffResult {
  plan: PlanAction[];
  skipped: string[];
  notes: string[];
  /** Remote same-path files adopted as already synced (never synced
   * locally before, same size as the local file). These are recorded
   * into the new state without uploading. */
  adopted: LastSynced[];
  /** Skipped files with their remote fingerprint refreshed from the
   * current listing (so the next sync can detect same-size remote edits). */
  refreshed: LastSynced[];
  /** State entries to drop (both sides gone). */
  dropState: string[];
  tombstones: Tombstones;
}

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

function normalizeOpts(o: DiffInputOptions): DiffOptions {
  if (typeof o === "boolean") {
    return { mirrorDelete: o, twoWay: false, tombstones: { localDeleted: [], remoteDeleted: [] } };
  }
  return {
    mirrorDelete: o.mirrorDelete,
    twoWay: o.twoWay,
    tombstones: o.tombstones ?? { localDeleted: [], remoteDeleted: [] },
  };
}

function localChanged(f: LocalFile, s: LastSynced | undefined): boolean {
  return !s || s.size !== f.size || s.sha256 !== f.sha256;
}

/** Remote changed since last sync. With a recorded remote fingerprint,
 * size or updated_at decides. Legacy state (no remote fingerprint) falls
 * back to comparing remote size against the local size at last sync. */
function remoteChanged(r: RemoteFile, s: LastSynced | undefined): boolean {
  if (!s) return false;
  if (s.remoteSize !== undefined) {
    if (r.size !== s.remoteSize) return true;
    if (r.updatedAt !== undefined && s.remoteUpdatedAt !== undefined && r.updatedAt !== s.remoteUpdatedAt) return true;
    return false;
  }
  return r.size !== s.size;
}

function conflictPathFor(path: string, localPaths: Set<string>, remotePaths: Set<string>): string {
  const dir = dirname(path);
  const base = basename(path);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  const make = (suffix: string) => (dir ? `${dir}/${stem}${suffix}${ext}` : `${stem}${suffix}${ext}`);
  let cand = make("（夸克冲突）");
  let n = 2;
  while (localPaths.has(cand) || remotePaths.has(cand)) {
    cand = make(`（夸克冲突 ${n}）`);
    n++;
  }
  return cand;
}

export function computeDiff(
  local: LocalFile[],
  remote: RemoteFile[],
  last: LastSynced[],
  inputOpts: DiffInputOptions,
): DiffResult {
  const opts = normalizeOpts(inputOpts);
  const plan: PlanAction[] = [];
  const skipped: string[] = [];
  const notes: string[] = [];
  const adopted: LastSynced[] = [];
  const refreshed: LastSynced[] = [];
  const dropState: string[] = [];

  const localByPath = new Map(local.map((f) => [f.path, f]));
  const remoteByPath = new Map(remote.map((f) => [f.path, f]));
  const lastByPath = new Map(last.map((f) => [f.path, f]));
  const localPaths = new Set(local.map((f) => f.path));
  const remotePaths = new Set(remote.map((f) => f.path));

  // Tombstone working sets. Reappearance clears: a locally deleted path
  // that exists locally again is a recreation, not a deletion; same for
  // remote. Both-gone paths are forgotten entirely (see dropState below).
  const localDel = new Set(opts.tombstones.localDeleted);
  const remoteDel = new Set(opts.tombstones.remoteDeleted);
  for (const p of localPaths) localDel.delete(p);
  for (const p of remotePaths) remoteDel.delete(p);

  // Candidates for rename/move detection: remote files that disappeared
  // locally, and local files that are new to remote, matched by size+hash.
  const goneRemote: RemoteFile[] = [];
  for (const r of remote) {
    if (!localByPath.has(r.path) && lastByPath.has(r.path)) {
      goneRemote.push(r);
    }
  }
  const goneByContent = new Map<string, RemoteFile>();
  for (const r of goneRemote) {
    const s = lastByPath.get(r.path);
    if (s) goneByContent.set(`${s.size}:${s.sha256}`, r);
  }

  const consumedGone = new Set<string>();

  for (const f of local) {
    const r = remoteByPath.get(f.path);
    const s = lastByPath.get(f.path);
    if (!r) {
      // Remote is missing for this path.
      if (s) {
        // It was synced before, so the remote side deleted it.
        // Symmetric mirror delete applies only in two-way mode; one-way
        // keeps its legacy behaviour (fall through to re-upload/restore).
        if (opts.mirrorDelete && opts.twoWay) {
          plan.push({ kind: "deleteLocal", path: f.path });
          continue;
        }
        if (opts.twoWay) {
          remoteDel.add(f.path);
          notes.push(`远端已删，本地保留，不上传：${f.path}`);
          continue;
        }
        // One-way legacy: fall through to rename-match/upload (the old
        // "remote was deleted manually, re-upload to restore" behaviour).
      } else if (opts.twoWay && remoteDel.has(f.path)) {
        // Tombstoned from an earlier run: do not resurrect the remote copy.
        notes.push(`远端已删，本地保留，不上传：${f.path}`);
        continue;
      }
      // New locally (or one-way legacy restore): rename-match, else upload.
      const match = goneByContent.get(`${f.size}:${f.sha256}`);
      if (match && !consumedGone.has(match.path)) {
        consumedGone.add(match.path);
        if (dirname(match.path) === dirname(f.path)) {
          plan.push({ kind: "rename", oldPath: match.path, newPath: f.path, fid: match.fid });
        } else {
          plan.push({ kind: "move", oldPath: match.path, newPath: f.path, fid: match.fid });
        }
        // If the name also changed across directories, a move alone keeps
        // the old name; sync.ts handles the follow-up rename.
        if (basename(match.path) !== basename(f.path) && dirname(match.path) !== dirname(f.path)) {
          notes.push(`移动+改名：${match.path} -> ${f.path}，移动后需再改名`);
        }
      } else {
        plan.push({ kind: "upload", path: f.path });
      }
      continue;
    }
    // Both sides have the file.
    const lc = localChanged(f, s);
    const rc = remoteChanged(r, s);
    if (!lc && !rc) {
      skipped.push(f.path);
      if (s) {
        refreshed.push({
          ...s,
          remoteSize: r.size,
          ...(r.updatedAt !== undefined ? { remoteUpdatedAt: r.updatedAt } : {}),
        });
      }
      continue;
    }
    if (!s) {
      // Never synced before.
      if (r.size === f.size) {
        // The user (or another tool) already put an identical-sized copy
        // at the same remote path: adopt it instead of re-uploading. The
        // recorded hash is the LOCAL file's, so any later local edit still
        // diffs as changed and re-uploads. Content was never verified
        // equal, so the entry stays flagged: a later remote change on an
        // adopted path goes to a conflict copy, never a blind overwrite.
        adopted.push({
          path: f.path,
          size: f.size,
          mtimeMs: f.mtimeMs,
          sha256: f.sha256,
          fid: r.fid,
          remoteSize: r.size,
          ...(r.updatedAt !== undefined ? { remoteUpdatedAt: r.updatedAt } : {}),
          adopted: true,
        });
        notes.push(`远端已有同名同大小文件，已标记为已上传（未重新上传）：${f.path}`);
        continue;
      }
      notes.push(`远端同名文件大小不同，已按本地重新上传：${f.path}`);
      plan.push({ kind: "reupload", path: f.path, oldFid: r.fid });
      continue;
    }
    if (lc && !rc) {
      plan.push({ kind: "reupload", path: f.path, oldFid: r.fid });
      continue;
    }
    if (!lc && rc) {
      if (s.adopted) {
        // Never verified equal: do not overwrite local blindly.
        plan.push({
          kind: "downloadConflict",
          path: f.path,
          fid: r.fid,
          size: r.size,
          updatedAt: r.updatedAt,
          conflictPath: conflictPathFor(f.path, localPaths, remotePaths),
        });
        notes.push(`冲突（认领文件远端有变，远端版另存，不覆盖本地）：${f.path}`);
        continue;
      }
      if (opts.twoWay) {
        plan.push({ kind: "download", path: f.path, fid: r.fid, size: r.size, updatedAt: r.updatedAt });
        continue;
      }
      // One-way legacy: a remote-only change is invisible (local wins,
      // but local is unchanged, so nothing to upload either).
      skipped.push(f.path);
      refreshed.push({
        ...s,
        remoteSize: r.size,
        ...(r.updatedAt !== undefined ? { remoteUpdatedAt: r.updatedAt } : {}),
      });
      notes.push(`远端有改动但本地未变，单向模式不下载：${f.path}`);
      continue;
    }
    // Both sides changed.
    if (opts.twoWay) {
      plan.push({
        kind: "downloadConflict",
        path: f.path,
        fid: r.fid,
        size: r.size,
        updatedAt: r.updatedAt,
        conflictPath: conflictPathFor(f.path, localPaths, remotePaths),
      });
      notes.push(`冲突（双边都改动，远端版另存，不覆盖任何一边）：${f.path}`);
      continue;
    }
    if (s.size !== r.size) {
      notes.push(`冲突（本地为准，重新上传）：${f.path} 远端 size=${r.size} 上次 size=${s.size} 本地 size=${f.size}`);
    }
    plan.push({ kind: "reupload", path: f.path, oldFid: r.fid });
  }

  for (const r of remote) {
    if (localByPath.has(r.path)) continue;
    if (consumedGone.has(r.path)) continue;
    const s = lastByPath.get(r.path);
    if (s) {
      // Locally deleted.
      if (opts.mirrorDelete) {
        plan.push({ kind: "deleteRemote", path: r.path, fid: r.fid });
      } else if (opts.twoWay) {
        localDel.add(r.path);
        notes.push(`本地已删，远端保留，不下载：${r.path}`);
      } else {
        notes.push(`本地已删，远端保留（镜像删除未开）：${r.path}`);
      }
    } else {
      // Remote-only, never synced before.
      if (opts.twoWay) {
        if (localDel.has(r.path)) {
          notes.push(`本地已删，远端保留，不下载：${r.path}`);
        } else {
          plan.push({ kind: "download", path: r.path, fid: r.fid, size: r.size, updatedAt: r.updatedAt });
        }
      } else {
        notes.push(`远端有、本地无，已忽略（单向同步不回写）：${r.path}`);
      }
    }
  }

  // Both sides gone: forget the path entirely (state + tombstones), so a
  // later recreation on either side is treated as a genuinely new file.
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
    tombstones: { localDeleted: [...localDel], remoteDeleted: [...remoteDel] },
  };
}
