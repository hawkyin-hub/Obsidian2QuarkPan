# Obsidian2QuarkPan — Quark Sync for Obsidian

One-way backup from an Obsidian vault to Quark Pan (夸克网盘).
Local is the source of truth: the plugin only writes to Quark, never writes
back to local files, and never deletes local files.

> Unofficial community plugin. Not affiliated with Quark or Obsidian.
> Quark offers no public open API for personal drives, so this plugin talks
> to the same web endpoints the Quark web app itself uses. That also means
> the login method below is cookie-based, and Quark may change those
> endpoints at any time.

## Features

- **One-way backup**: Obsidian → Quark only. Files added or changed on Quark
  are never synced back.
- **Incremental**: a file is skipped when its size + SHA-256 match the last
  synced state — no re-upload of unchanged files.
- **Rename / move detection**: a file that moved or was renamed is matched
  by content and renamed on Quark instead of re-uploaded.
- **Adoption**: a remote file at the same path with the same size is treated
  as already synced (useful when a previous run was interrupted).
- **Large files**: single-file cap 50 MB; files ≥ 5 MB upload in 4 MB parts
  with per-part progress in the settings panel.
- **Pause / resume**: the sync button turns into a pause button mid-run; it
  stops after the current file and persists partial progress.
- **Ignore rules**: `.obsidian/`, `.git/`, `.trash/`, any `target/` and
  `node_modules/` are ignored by default; append your own globs in settings
  (one per line, e.g. `私人/**`, `*.tmp`). Ignoring never deletes remote
  files.
- **Mirror delete (off by default)**: when off, locally deleted files stay on
  Quark (only logged). When on, files deleted locally that were synced
  before are also deleted remotely.
- **Auto sync**: set an interval in minutes (0 = manual only). It only runs
  while Obsidian is open.
- **Progress + log**: the settings panel shows live progress, the last sync
  time, and a newest-first log.

## Install

### Option A: use the built files in this repo

1. Copy `main.js` and `manifest.json` into your vault's plugin folder:
   `<your vault>/.obsidian/plugins/obsidian-quark-sync/`
2. Restart Obsidian, then enable **Quark Sync** under
   Settings → Community plugins.
3. Open the plugin settings, log in (below), and sync.

### Option B: build from source

```bash
npm install
npm run build   # produces main.js
```

Then follow Option A with the freshly built `main.js`.

## Login (paste Cookie)

Quark login inside Obsidian's sandbox cannot hold a session cookie, so the
plugin uses a pasted Cookie as the only login method:

1. In a desktop browser, open [pan.quark.cn](https://pan.quark.cn) and log in.
2. Press F12 → Network → click any request → copy the `Cookie` header value.
3. Paste it into the plugin settings field **夸克 Cookie** and click
   **测试连接**. If the server returns a refreshed Cookie, the plugin saves
   it automatically.

Security notes:

- The Cookie lives only in the plugin's data file
  (`<vault>/.obsidian/plugins/obsidian-quark-sync/data.json`). It is never
  written into notes, logs, or this repository.
- The plugin never syncs `.obsidian/` by default, so its own `data.json`
  is not uploaded to Quark by itself. But if you also sync your whole vault
  with Git (including `.obsidian/`), add that `data.json` to `.gitignore`.
- Cookies expire (expect re-login with a 401/403); just paste a fresh one.

## Sync rules

- Target folder: set **夸克目标文件夹** in settings, e.g. `Obsidian备份`.
  Local `笔记/a.md` lands at `<target>/笔记/a.md` on Quark.
- First run is a full upload; later runs are incremental.
- Empty folders are not created remotely.
- Uploads are serial (one file at a time).
- Local deletions: remote keeps the file unless mirror delete is on.
- Illegal filename characters (`\ / : * ? " < > |`) are stripped from the
  local filename before upload (Obsidian renames the file, links follow);
  name collisions get a `(2)` suffix.

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # unit tests (diff, hash, ignore, log, sanitize, sha1 state)
npm run e2e         # end-to-end simulator: real bundled code + Obsidian stub + mock Quark server
npm run build       # production bundle -> main.js
```

## License

MIT. See [LICENSE](LICENSE).
