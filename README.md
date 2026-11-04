# Obsidian2QuarkPan — Quark Sync for Obsidian

[中文](#中文) | [English](#english)

---

## 中文

Obsidian 仓库与夸克网盘（Quark Pan）之间的双向同步插件。本地和夸克对等：
夸克上直接保存的文件会下载到本地，本地改动会上传到夸克。

> 非官方社区插件，与夸克、Obsidian 均无关联。夸克没有面向个人网盘的公开
> API，本插件调用的是夸克网页版自身使用的接口；因此登录方式是粘贴
> Cookie，且夸克随时可能改动这些接口。

### 功能

- **双向同步（默认开）**：远端新增或改动的文件会下载到本地；设置里关掉
  “双向同步”就回到只上传的旧单向行为。
- **增量**：大小 + SHA-256 与上次同步状态一致的文件直接跳过，不重复上传。
- **改名 / 移动识别**：移动或改名的文件按内容匹配，在夸克上直接改名，
  而不是重新上传。
- **认领**：远端同路径同大小、从未同步过的文件视为已同步（适合中途被打断
  后续跑的场景）。认领文件的内容从未核验相等，之后远端再变时不直接覆盖
  本地，而是走冲突副本。
- **冲突不覆盖**：本地和远端双边都改动时，谁也不覆盖谁——远端版下载成
  “原名（夸克冲突）.ext”（撞名自动加序号），本地原文件和远端原文件都原样
  不动；若下载到的内容与本地已一致，则不另存副本。
- **大文件**：单文件上限 50MB；≥ 5MB 按 4MB 分片上传，设置面板里显示分片进度。
- **暂停 / 续跑**：同步按钮在运行中会变成暂停按钮，点后传完当前文件即停，
  并保存部分进度，下次继续，不重传已完成的文件。
- **忽略规则**：默认忽略 `.obsidian/`、`.git/`、`.trash/`、所有 `target/` 与
  `node_modules/`；设置里可追加自己的 glob（每行一条，如 `私人/**`、
  `*.tmp`）。忽略从不删除远端文件。
- **镜像删除（默认关）**：关时删除不互相同步——本地删了远端保留，远端删了
  本地保留，且删掉的文件不会被重新下载回来、也不会被重新上传回去；开时
  删除双向同步：本地删了远端删，远端删了本地文件进 Obsidian 回收站
  （.trash，可恢复）。
- **自动同步**：设置间隔分钟数（0 = 只手动）。仅在 Obsidian 打开时运行。
- **进度 + 日志**：设置面板显示实时进度、上次同步时间与最新在前的日志。

### 安装

#### 方式一：直接用仓库里的构建产物

1. 把 `main.js` 和 `manifest.json` 复制到仓库的插件目录：
   `<你的仓库>/.obsidian/plugins/obsidian-quark-sync/`
2. 重启 Obsidian，在设置 → 第三方插件里启用 **Quark Sync**。
3. 打开插件设置，按下面登录，然后同步。

#### 方式二：从源码构建

```bash
npm install
npm run build   # 生成 main.js
```

然后按方式一使用新生成的 `main.js`。

### 登录（粘贴 Cookie）

Obsidian 沙箱里留不住会话 Cookie，所以插件只用粘贴 Cookie 一种登录方式：

1. 在桌面浏览器打开 [pan.quark.cn](https://pan.quark.cn) 并登录。
2. 按 F12 → Network → 点任意一个请求 → 复制 `Cookie` 请求头的值。
3. 粘贴到插件设置的 **夸克 Cookie** 一栏，点 **测试连接**。服务端返回了
   新 Cookie 时，插件会自动保存。

安全提示：

- Cookie 只存在插件的数据文件里
  （`<仓库>/.obsidian/plugins/obsidian-quark-sync/data.json`），不会写进
  笔记、日志或本仓库。
- 插件默认不同步 `.obsidian/`，所以它自己的 `data.json` 不会被自己传上
  夸克。但如果你还用 Git 同步整个仓库（含 `.obsidian/`），请把这个
  `data.json` 加进 `.gitignore`。
- Cookie 会过期（401/403 时就是过期了），重新粘贴一个新的即可。

### 同步规则

- 目标文件夹：设置里的 **夸克目标文件夹**，如 `Obsidian备份`。
  本地 `笔记/a.md` 对应夸克上的 `<目标>/笔记/a.md`。
- 首次运行是全量上传，之后增量。
- 空文件夹不会在远端创建。
- 同步动作串行执行（一次一个文件）。
- 非法文件名字符（`\ / : * ? " < > |`）会在上传前从本地文件名里删掉
  （Obsidian 会自动改名并跟随链接）；撞名加 `(2)` 后缀。
- 下载同样受 50MB 上限与忽略规则约束，超限或命中规则的文件不下载，只记日志。

### 开发

```bash
npm run typecheck   # tsc --noEmit
npm test            # 单元测试（diff、hash、ignore、log、sanitize、sha1 state）
npm run e2e         # 端到端模拟器：真实打包代码 + Obsidian 替身 + 模拟夸克服务端
npm run build       # 生产打包 -> main.js
```

### 许可证

MIT，见 [LICENSE](LICENSE)。

---

## English

Two-way sync between an Obsidian vault and Quark Pan. Local and remote are
peers: files saved directly to Quark download into the vault, and local
changes upload to Quark.

> Unofficial community plugin. Not affiliated with Quark or Obsidian.
> Quark offers no public open API for personal drives, so this plugin talks
> to the same web endpoints the Quark web app itself uses. That also means
> the login method below is cookie-based, and Quark may change those
> endpoints at any time.

### Features

- **Two-way sync (on by default)**: files added or changed on Quark download
  into the vault. Turn off "two-way sync" in settings to fall back to the
  old upload-only behaviour.
- **Incremental**: a file is skipped when its size + SHA-256 match the last
  synced state — no re-upload of unchanged files.
- **Rename / move detection**: a file that moved or was renamed is matched
  by content and renamed on Quark instead of re-uploaded.
- **Adoption**: a remote file at the same path with the same size is treated
  as already synced (useful when a previous run was interrupted). An adopted
  file's content was never verified equal to local, so a later remote change
  on it goes to a conflict copy instead of overwriting local.
- **Conflicts never overwrite**: when both sides changed, neither side wins
  by overwriting — the remote version downloads as
  "name（夸克冲突）.ext" (auto-numbered on collision) while the local
  original and the remote original stay untouched. If the downloaded content
  already equals local, no copy is made.
- **Large files**: single-file cap 50 MB; files ≥ 5 MB upload in 4 MB parts
  with per-part progress in the settings panel.
- **Pause / resume**: the sync button turns into a pause button mid-run; it
  stops after the current file and persists partial progress.
- **Ignore rules**: `.obsidian/`, `.git/`, `.trash/`, any `target/` and
  `node_modules/` are ignored by default; append your own globs in settings
  (one per line, e.g. `私人/**`, `*.tmp`). Ignoring never deletes remote
  files.
- **Mirror delete (off by default)**: when off, deletions do not propagate —
  a locally deleted file stays on Quark, a remotely deleted file stays
  local, and a deleted file is neither re-downloaded nor re-uploaded. When
  on, deletions sync both ways: locally deleted files are deleted remotely,
  and remotely deleted files move to Obsidian's trash (.trash, recoverable).
- **Auto sync**: set an interval in minutes (0 = manual only). It only runs
  while Obsidian is open.
- **Progress + log**: the settings panel shows live progress, the last sync
  time, and a newest-first log.

### Install

#### Option A: use the built files in this repo

1. Copy `main.js` and `manifest.json` into your vault's plugin folder:
   `<your vault>/.obsidian/plugins/obsidian-quark-sync/`
2. Restart Obsidian, then enable **Quark Sync** under
   Settings → Community plugins.
3. Open the plugin settings, log in (below), and sync.

#### Option B: build from source

```bash
npm install
npm run build   # produces main.js
```

Then follow Option A with the freshly built `main.js`.

### Login (paste Cookie)

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

### Sync rules

- Target folder: set **夸克目标文件夹** in settings, e.g. `Obsidian备份`.
  Local `笔记/a.md` lands at `<target>/笔记/a.md` on Quark.
- First run is a full upload; later runs are incremental.
- Empty folders are not created remotely.
- Sync actions run serially (one file at a time).
- Illegal filename characters (`\ / : * ? " < > |`) are stripped from the
  local filename before upload (Obsidian renames the file, links follow);
  name collisions get a `(2)` suffix.
- Downloads obey the same 50 MB cap and ignore rules; over-limit or ignored
  files are not downloaded, only logged.

### Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # unit tests (diff, hash, ignore, log, sanitize, sha1 state)
npm run e2e         # end-to-end simulator: real bundled code + Obsidian stub + mock Quark server
npm run build       # production bundle -> main.js
```

### License

MIT. See [LICENSE](LICENSE).
