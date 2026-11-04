// Pure-function sync diff: local snapshot / remote snapshot / last state
// -> an execution plan. No I/O here, so it is fully unit-testable.
// One-way semantics: local wins, remote-only files are never written back.

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
}

export interface LastSynced {
  path: string;
  size: number;
  mtimeMs: number;
  sha256: string;
  fid: string;
}

export type PlanAction =
  | { kind: "upload"; path: string }
  | { kind: "reupload"; path: string; oldFid: string }
  | { kind: "rename"; oldPath: string; newPath: string; fid: string }
  | { kind: "move"; oldPath: string; newPath: string; fid: string }
  | { kind: "deleteRemote"; path: string; fid: string };

export interface DiffResult {
  plan: PlanAction[];
  skipped: string[];
  notes: string[];
  /** Remote same-path files adopted as already synced (never synced
   * locally before, same size as the local file). These are recorded
   * into the new state without uploading. */
  adopted: LastSynced[];
}

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

export function computeDiff(
  local: LocalFile[],
  remote: RemoteFile[],
  last: LastSynced[],
  mirrorDelete: boolean,
): DiffResult {
  const plan: PlanAction[] = [];
  const skipped: string[] = [];
  const notes: string[] = [];
  const adopted: LastSynced[] = [];

  const localByPath = new Map(local.map((f) => [f.path, f]));
  const remoteByPath = new Map(remote.map((f) => [f.path, f]));
  const lastByPath = new Map(last.map((f) => [f.path, f]));

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
      // New locally, or remote was deleted manually.
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
    // Skip on size + content hash ONLY. mtime is deliberately not part of
    // the check: iCloud re-downloads, Git checkouts, vault copies and
    // other tools all touch mtime without changing content, and requiring
    // an identical mtime turned those touches into a full re-upload.
    // sha256 already proves the content is unchanged.
    if (s && s.size === f.size && s.sha256 === f.sha256) {
      skipped.push(f.path);
      continue;
    }
    if (!s && r.size === f.size) {
      // Never synced before, but the user (or another tool) already put
      // an identical-sized copy at the same remote path: adopt it instead
      // of re-uploading. The recorded hash is the LOCAL file's, so any
      // later local edit still diffs as changed and re-uploads.
      adopted.push({ path: f.path, size: f.size, mtimeMs: f.mtimeMs, sha256: f.sha256, fid: r.fid });
      notes.push(`远端已有同名同大小文件，已标记为已上传（未重新上传）：${f.path}`);
      continue;
    }
    if (!s) {
      notes.push(`远端同名文件大小不同，已按本地重新上传：${f.path}`);
    } else if (s.size !== r.size) {
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
      if (mirrorDelete) {
        plan.push({ kind: "deleteRemote", path: r.path, fid: r.fid });
      } else {
        notes.push(`本地已删，远端保留（镜像删除未开）：${r.path}`);
      }
    } else {
      // Remote-only, never synced before: one-way sync ignores it.
      notes.push(`远端有、本地无，已忽略（单向同步不回写）：${r.path}`);
    }
  }

  return { plan, skipped, notes, adopted };
}
