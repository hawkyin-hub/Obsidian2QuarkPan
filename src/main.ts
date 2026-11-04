import { Notice, Plugin, type TFile } from "obsidian";
import { QuarkClient } from "./quark.ts";
import { obsidianFetchFn } from "./obsidian-fetch.ts";
import { sha256Hex } from "./hash.ts";
import { isIgnored } from "./ignore.ts";
import { RingLog, formatBeijingTime } from "./log.ts";
import { runSync, sanitizeFileName } from "./sync.ts";
import type { LastSynced, LocalFile } from "./diff.ts";
import {
  DEFAULT_SETTINGS,
  QuarkSyncSettingTab,
  targetSegments,
  type QuarkSyncSettings,
} from "./settings.ts";

interface PluginData {
  settings: QuarkSyncSettings;
  lastState: LastSynced[];
  tombstones?: { localDeleted: string[]; remoteDeleted: string[] };
  lastSyncAt?: string;
  lastProgress?: { total: number; done: number; failed: number; interrupted: boolean; active: boolean; paused?: boolean };
}

export default class QuarkSyncPlugin extends Plugin {
  settings: QuarkSyncSettings = DEFAULT_SETTINGS;
  lastState: LastSynced[] = [];
  tombstones: { localDeleted: string[]; remoteDeleted: string[] } = { localDeleted: [], remoteDeleted: [] };
  private lastSyncAt: string | null = null;
  private log = new RingLog(200);
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private statusEl: HTMLElement | null = null;

  async onload(): Promise<void> {
    const data = (await this.loadData()) as PluginData | null;
    if (data) {
      this.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
      this.lastState = data.lastState ?? [];
      this.tombstones = data.tombstones ?? { localDeleted: [], remoteDeleted: [] };
      this.lastSyncAt = typeof data.lastSyncAt === "string" ? data.lastSyncAt : null;
      if (data.lastProgress) {
        // A run saved mid-sync (active) never finished: on reload it
        // counts as interrupted, not still-running.
        this.progress = {
          total: data.lastProgress.total,
          done: data.lastProgress.done,
          active: false,
          interrupted: data.lastProgress.interrupted || data.lastProgress.active,
          failed: data.lastProgress.failed,
          paused: data.lastProgress.paused ?? false,
        };
      }
    }

    this.addRibbonIcon("cloud", "同步到夸克", async () => {
      await this.syncNow();
    });

    this.addCommand({
      id: "sync-to-quark",
      name: "同步到夸克",
      callback: async () => {
        await this.syncNow();
      },
    });

    this.addCommand({
      id: "clear-quark-sync-log",
      name: "清除夸克同步日志",
      callback: () => {
        this.clearLog();
        new Notice("同步日志已清除");
      },
    });

    this.statusEl = this.addStatusBarItem();
    this.statusEl.setText("夸克同步：就绪");

    this.addSettingTab(new QuarkSyncSettingTab(this.app, this));
    this.restartTimer();
    this.log.info("插件已加载");
  }

  onunload(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  restartTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.settings.autoSyncMinutes > 0) {
      this.timer = setInterval(() => {
        void this.syncNow(true);
      }, this.settings.autoSyncMinutes * 60 * 1000);
    }
  }

  /** Persist a server-refreshed cookie back to settings (no value is logged).
   *  Returns true when the stored cookie actually changed. Callers save. */
  syncCookieFrom(client: QuarkClient): boolean {
    const merged = client.getCookie();
    if (merged.trim() && merged !== this.settings.cookie) {
      this.settings.cookie = merged;
      this.log.info("Cookie 已自动刷新并保存");
      return true;
    }
    return false;
  }

  async saveSettings(): Promise<void> {
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
        paused: this.progress.paused,
      },
    });
  }

  /** Last completed sync, Beijing time. Survives restart (saved in data.json). */
  lastSyncText(): string {
    if (!this.lastSyncAt) return "上一次同步：尚未同步";
    return `上一次同步：${formatBeijingTime(new Date(this.lastSyncAt))}`;
  }

  logText(): string {
    return this.log.toText();
  }

  clearLog(): void {
    this.log.clear();
  }

  // Sync progress, shown in the settings log area. Denominator is the
  // number of scanned LOCAL files (what the user counts); skipped and
  // filtered files count as handled at diff time, action files as their
  // action completes. Remote-only deletes do not move this counter.
  private progress = { total: 0, done: 0, active: false, interrupted: false, failed: 0, paused: false };
  private progressBase = 0;
  private progressFileDone = 0;
  private progressListeners = new Set<() => void>();
  private syncStartedAt = 0;
  private lastUiNotifyAt = 0;
  private lastStatusAt = 0;
  private lastProgressSaveAt = 0;
  private progressCurrent = "";

  progressText(): string {
    const { total, done, active, interrupted, failed } = this.progress;
    if (total === 0) return "同步进度：尚未同步";
    if (active) return `同步进度：已完成 ${done} / 共 ${total} 个文件（同步中…）` + (this.progressCurrent ? ` · ${this.progressCurrent}` : "");
    if ((this.progress as { paused?: boolean }).paused) return `同步进度：已完成 ${done} / 共 ${total} 个文件（已暂停）`;
    if (interrupted) return `同步进度：已完成 ${done} / 共 ${total} 个文件（同步中断，见日志）`;
    return `同步进度：已完成 ${done} / 共 ${total} 个文件` + (failed > 0 ? `，失败 ${failed} 个` : "");
  }

  private notifyProgress(): void {
    this.lastUiNotifyAt = Date.now();
    for (const fn of [...this.progressListeners]) {
      try {
        fn();
      } catch {
        // A broken UI listener must not break sync.
      }
    }
  }

  /** At most one UI push per 250 ms during the per-file loops: with a
   * 15k-file vault, a push per file makes the status bar flicker and
   * the settings panel rewrite itself thousands of times. */
  private notifyProgressThrottled(): void {
    if (Date.now() - this.lastUiNotifyAt >= 250) this.notifyProgress();
  }

  private setStatus(text: string, force = false): void {
    if (!this.statusEl) return;
    if (force || Date.now() - this.lastStatusAt >= 250) {
      this.lastStatusAt = Date.now();
      this.statusEl.setText(text);
    }
  }

  /** Progress persistence, throttled to one write per 5 s mid-run: a
   * per-file data.json rewrite over a 15k-file vault is O(n^2) bytes
   * and visibly slows the sync. The final and failure saves are direct. */
  private async saveProgressThrottled(): Promise<void> {
    if (Date.now() - this.lastProgressSaveAt >= 5000) {
      this.lastProgressSaveAt = Date.now();
      await this.saveSettings();
    }
  }

  /** One subscription for the whole live settings panel: log pushes AND
   * progress pushes. The settings tab unsubscribes on hide, which is
   * what stops the pushes when the window closes. */
  subscribeUi(fn: () => void): () => void {
    const offLog = this.log.subscribe(fn);
    this.progressListeners.add(fn);
    return () => {
      offLog();
      this.progressListeners.delete(fn);
    };
  }

  private cancelRequested = false;

  isSyncing(): boolean {
    return this.running;
  }

  /**
   * The settings button calls this synchronously (never awaiting the sync
   * promise) so Obsidian never puts the button into a loading spinner:
   * idle -> start sync in the background; syncing -> request a pause.
   * A pause finishes the current file, saves the partial state, and the
   * next start resumes without redoing finished files.
   */
  toggleSync(): void {
    if (this.running) {
      // A second tap within 1 s of start is almost always an impatient
      // double-tap, not a deliberate pause: the button only just flipped
      // to pause, and the scan had not visibly started yet. Ignore it.
      if (Date.now() - this.syncStartedAt < 1000) return;
      this.cancelRequested = true;
      return;
    }
    void this.syncNow().catch(() => {
      // syncNow already reports its own failures via log + Notice.
    });
  }

  async syncNow(quiet = false): Promise<void> {
    if (this.running) {
      if (!quiet) new Notice("夸克同步进行中，请稍候");
      return;
    }
    this.cancelRequested = false;
    if (!this.settings.cookie.trim()) {
      if (!quiet) new Notice("请先在设置页粘贴夸克 Cookie");
      return;
    }
    this.running = true;
    this.syncStartedAt = Date.now();
    this.progressCurrent = "";
    // Flip the button to pause immediately, before the first await: during
    // a long scan the button otherwise keeps showing "start", inviting
    // extra taps that toggle the run straight back into a pause.
    this.notifyProgress();
    try {
      const client = new QuarkClient(this.settings.cookie, obsidianFetchFn());
      // Connection gate (user's rule, 2026-11-03): if the connection is
      // down, refuse BEFORE scanning/uploading, with a clear message —
      // never start a sync that can only end in a generic failure.
      this.statusEl?.setText("夸克同步：正在检查连接…");
      try {
        await client.testConnection();
        if (this.syncCookieFrom(client)) await this.saveSettings();
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        this.statusEl?.setText("夸克同步：连接失败，已取消");
        this.log.error(`同步未开始：连接失败：${reason}`);
        if (!quiet) new Notice(`夸克连接失败，同步未开始：${reason}。请先在设置页测试连接。`);
        return;
      }
      // The sync really started (gate passed): record the attempt time now,
      // so even a run that never finishes is saved and shown.
      this.lastSyncAt = new Date().toISOString();
      await this.saveSettings();
      this.statusEl?.setText("夸克同步：扫描中…");
      const extraIgnores = this.settings.ignorePatterns
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const localFiles: LocalFile[] = [];
      const allFiles = this.app.vault.getFiles();
      // Scan-phase progress: the read+hash loop over a big vault is the
      // long silent stretch before any upload starts, so show it moving.
      this.progress = { total: allFiles.length, done: 0, active: true, interrupted: false, failed: 0, paused: false };
      this.notifyProgress();
      // Standing rule (user, 2026-11-03): a filename holding illegal
      // characters is renamed IN PLACE -- the illegal chars are deleted
      // from the local name -- and then uploaded under the new name.
      // Renames go through vault.rename so Obsidian updates links in
      // other notes automatically. Legal files are never renamed, even
      // when an illegal file would sanitise onto their name (the illegal
      // one gets a " (n)" suffix instead, so nothing is ever overwritten).
      const dirOf = (p: string): string => {
        const i = p.lastIndexOf("/");
        return i === -1 ? "" : p.slice(0, i);
      };
      const baseOf = (p: string): string => {
        const i = p.lastIndexOf("/");
        return i === -1 ? p : p.slice(i + 1);
      };
      const takenByDir = new Map<string, Set<string>>();
      for (const f of allFiles) {
        if (isIgnored(f.path, extraIgnores)) continue;
        const base = baseOf(f.path);
        if (sanitizeFileName(base) === base) {
          const dir = dirOf(f.path);
          if (!takenByDir.has(dir)) takenByDir.set(dir, new Set());
          takenByDir.get(dir)!.add(base);
        }
      }
      const finalPath = new Map<object, string>();
      for (const f of allFiles) {
        if (isIgnored(f.path, extraIgnores)) continue;
        const base = baseOf(f.path);
        const clean = sanitizeFileName(base);
        if (clean === base) {
          finalPath.set(f, f.path);
          continue;
        }
        const dir = dirOf(f.path);
        const taken = takenByDir.get(dir) ?? new Set<string>();
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
          this.log.info(`本地文件名已清理：${f.path} -> ${newPath}`);
          finalPath.set(f, newPath);
        } catch (e) {
          this.log.error(
            `本地重命名失败，已跳过：${f.path}：${e instanceof Error ? e.message : String(e)}`,
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
        this.setStatus(`夸克同步：扫描中…已读 ${i + 1}/${allFiles.length} · ${path}`);
        this.notifyProgressThrottled();
        localFiles.push({
          path,
          size: bytes.length,
          mtimeMs: file.stat.mtime,
          sha256: await sha256Hex(bytes),
          data: bytes,
        });
      }
      const ignoredCount = allFiles.filter((f) => isIgnored(f.path, extraIgnores)).length;
      this.log.info(`扫描完成：库内 ${allFiles.length} 个文件，忽略 ${ignoredCount} 个，待处理 ${localFiles.length} 个`);
      this.statusEl?.setText(`夸克同步：${localFiles.length} 个本地文件，正在比对…`);
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
            const buf = data.slice().buffer as ArrayBuffer;
            const existing = this.app.vault.getAbstractFileByPath(path);
            if (existing && "stat" in existing) {
              await this.app.vault.modifyBinary(existing as TFile, buf);
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
            this.progressCurrent = `${path}（分片 ${part}/${totalParts}）`;
            this.setStatus(`夸克同步：${this.progressCurrent}`);
            this.notifyProgressThrottled();
          },
        },
        this.log,
        async (done, total, current, kind) => {
          this.progressCurrent = current;
          this.setStatus(`夸克同步：${done}/${total} · ${current}`);
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
        },
      );
      // The run is over from the UI's point of view: clear the flag BEFORE
      // notifying, or the button (which reads isSyncing()) would keep
      // showing pause after the run already stopped.
      this.running = false;
      this.progress.active = false;
      this.progress.failed = summary.failed.length;
      this.lastSyncAt = new Date().toISOString();
      this.lastState = newState;
      this.tombstones = newTombstones;
      this.syncCookieFrom(client);
      if (cancelled) {
        this.progress.paused = true;
        this.notifyProgress();
        await this.saveSettings();
        this.statusEl?.setText("夸克同步已暂停");
        const msg = `同步已暂停：已完成 ${this.progress.done} / 共 ${this.progress.total} 个文件，下次同步继续，不会重传已完成的文件。`;
        if (!quiet) new Notice(msg);
        this.log.info(msg);
      } else {
        this.notifyProgress();
        await this.saveSettings();
        this.statusEl?.setText(
          `夸克同步完成：上传 ${summary.uploaded + summary.reuploaded} · 下载 ${summary.downloaded} · 跳过 ${summary.skipped} · 失败 ${summary.failed.length}`,
        );
        const msg =
          `夸克同步完成：上传 ${summary.uploaded}、重新上传 ${summary.reuploaded}、` +
          `下载 ${summary.downloaded}、冲突另存 ${summary.conflictCopies}、` +
          `改名 ${summary.renamed}、移动 ${summary.moved}、远端删除 ${summary.deletedRemote}、本地删除 ${summary.deletedLocal}、` +
          `跳过 ${summary.skipped}` +
          (summary.adopted > 0 ? `、认领 ${summary.adopted}` : "") +
          `、失败 ${summary.failed.length}` +
          (summary.failed.length > 0 ? `，首个失败：${summary.failed[0].path}：${summary.failed[0].error}` : "");
        if (!quiet || summary.failed.length > 0) new Notice(msg);
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
      this.statusEl?.setText("夸克同步失败");
      this.log.error(`同步失败：${msg}`);
      if (!quiet) new Notice(`夸克同步失败：${msg}`);
      try {
        await this.saveSettings();
      } catch {
        // The failure itself is already logged + noticed; a failed
        // persistence write must not mask it.
      }
    } finally {
      this.running = false;
      this.progressCurrent = "";
      // Every exit path must end with a UI push AFTER the flag clears,
      // or the button (which reads isSyncing()) would stay on pause
      // after a refused or failed run that notified mid-run.
      this.notifyProgress();
    }
  }
}
