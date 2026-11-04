import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { QuarkClient } from "./quark.ts";
import { obsidianFetchFn } from "./obsidian-fetch.ts";
import type QuarkSyncPlugin from "./main.ts";

export interface QuarkSyncSettings {
  cookie: string;
  targetFolder: string;
  mirrorDelete: boolean;
  autoSyncMinutes: number;
  maxFileBytes: number;
  ignorePatterns: string; // one glob per line
}

export const DEFAULT_SETTINGS: QuarkSyncSettings = {
  cookie: "",
  targetFolder: "Obsidian备份",
  mirrorDelete: false,
  autoSyncMinutes: 0,
  maxFileBytes: 50 * 1024 * 1024,
  ignorePatterns: "",
};

export function targetSegments(settings: QuarkSyncSettings): string[] {
  return settings.targetFolder
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}


export class QuarkSyncSettingTab extends PluginSettingTab {
  plugin: QuarkSyncPlugin;
  private logUnsub: (() => void) | null = null;
  private logPre: HTMLElement | null = null;
  private progressEl: HTMLElement | null = null;
  private lastSyncEl: HTMLElement | null = null;
  private syncBtn: { setButtonText: (t: string) => void; setIcon: (i: string) => void } | null = null;

  hide(): void {
    // Closing the settings window stops the pushes (unsubscribe).
    if (this.logUnsub) this.logUnsub();
    this.logUnsub = null;
    this.logPre = null;
    this.progressEl = null;
    this.lastSyncEl = null;
    this.syncBtn = null;
  }

  constructor(app: App, plugin: QuarkSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    if (this.logUnsub) this.logUnsub();
    this.logUnsub = null;
    this.logPre = null;
    this.progressEl = null;
    this.lastSyncEl = null;
    this.syncBtn = null;
    containerEl.empty();
    containerEl.createEl("h2", { text: `夸克同步（单向备份） v${this.plugin.manifest.version}` });
    // Release UI: the version row shows only the number plus a superscript
    // "!" marker; the update note and the one-way-backup orientation live in
    // the row's description, hidden until the marker is clicked.
    const ver = new Setting(containerEl).setName(`当前版本 v${this.plugin.manifest.version}`);
    const mark = ver.nameEl.createEl("span", { text: "!" });
    mark.style.verticalAlign = "super";
    mark.style.fontSize = "11px";
    mark.style.fontWeight = "bold";
    mark.style.color = "#e07856";
    mark.style.cursor = "pointer";
    mark.style.marginLeft = "4px";
    mark.title = "点击查看更新说明";
    ver.setDesc(
      "更新：只覆盖 main.js 与 manifest.json，彻底退出 Obsidian（Cmd+Q）再重开；不要删除整个插件文件夹，登录信息与同步状态存在里面的 data.json，删了就丢了。本地为准，夸克只写不回写。夸克上的改动不会回写到本地，也不会删除本地文件。Git 同步继续用，这个插件是另一条备份路线。",
    );
    ver.descEl.style.display = "none";
    mark.onclick = () => {
      ver.descEl.style.display = ver.descEl.style.display === "none" ? "" : "none";
    };

    new Setting(containerEl)
      .setName("夸克目标文件夹")
      .setDesc("本地库根对应到夸克的这个文件夹，例如：Obsidian备份 或 Muse生成内容/Obsidian备份。")
      .addText((text) =>
        text
          .setPlaceholder("Obsidian备份")
          .setValue(this.plugin.settings.targetFolder)
          .onChange(async (value) => {
            this.plugin.settings.targetFolder = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("夸克 Cookie")
      .setDesc(
        "在电脑浏览器打开 pan.quark.cn 登录后，按 F12 → Network → 任一请求，复制 Cookie 字符串粘贴到这里。只存在本插件的数据文件里，不会写进笔记或日志；过期后请重新粘贴。",
      )
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("粘贴从浏览器复制的 Cookie 字符串")
          .setValue(this.plugin.settings.cookie)
          .onChange(async (value) => {
            this.plugin.settings.cookie = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("登录")
      .setDesc("测试连接会拉取夸克根目录验证登录；成功后若服务端返回了新 Cookie，会自动保存。失败请先检查 Cookie 是否过期。")
      .addButton((btn) =>
        btn.setButtonText("测试连接").onClick(async () => {
          try {
            if (!this.plugin.settings.cookie.trim()) {
              new Notice("请先粘贴夸克 Cookie");
              return;
            }
            const client = new QuarkClient(this.plugin.settings.cookie, obsidianFetchFn());
            await client.testConnection();
            const refreshed = this.plugin.syncCookieFrom(client);
            if (refreshed) await this.plugin.saveSettings();
            new Notice(refreshed ? "夸克连接正常（Cookie 已自动刷新并保存）" : "夸克连接正常");
          } catch (e) {
            new Notice(`连接失败：${e instanceof Error ? e.message : String(e)}`);
          }
        }),
      )
      .addButton((btn) =>
        btn.setButtonText("清除登录").onClick(async () => {
          this.plugin.settings.cookie = "";
          await this.plugin.saveSettings();
          new Notice("已清除夸克登录");
          this.display();
        }),
      );

    new Setting(containerEl)
      .setName("镜像删除")
      .setDesc(
        "关闭（默认）：本地删了文件，远端保留，只记日志。打开：本地删了且上次同步过的文件，远端也会删除。请谨慎打开。",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.mirrorDelete).onChange(async (value) => {
          this.plugin.settings.mirrorDelete = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("自动同步间隔（分钟）")
      .setDesc("0 = 关闭自动同步（默认，只手动同步）。大于 0 时 Obsidian 打开期间按间隔自动同步，关闭 Obsidian 即停。")
      .addText((text) =>
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.settings.autoSyncMinutes))
          .onChange(async (value) => {
            const n = Number(value);
            this.plugin.settings.autoSyncMinutes = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
            await this.plugin.saveSettings();
            this.plugin.restartTimer();
          }),
      );

    new Setting(containerEl)
      .setName("忽略规则（每行一条）")
      .setDesc(
        "默认已忽略 .obsidian/、.git/、.trash/、任何 target/ 与 node_modules/（构建产物，不是笔记）。这里追加 glob，例如：私人/** 或 *.tmp。忽略只影响本次扫描，不删除远端已有文件。",
      )
      .addTextArea((text) =>
        text
          .setPlaceholder("私人/**\n*.tmp")
          .setValue(this.plugin.settings.ignorePatterns)
          .onChange(async (value) => {
            this.plugin.settings.ignorePatterns = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName("立即同步").setDesc("手动触发一次同步到夸克。").addButton((btn) => {
      this.syncBtn = btn;
      this.refreshSyncButton();
      // Synchronous toggle (never awaits the sync promise): Obsidian
      // therefore never puts this button into its loading spinner, and
      // the button stays clickable mid-sync so it can pause the run.
      btn.onClick(() => {
        this.plugin.toggleSync();
      });
    });

    new Setting(containerEl)
      .setName("同步日志")
      .addButton((btn) =>
        btn.setButtonText("清除日志").onClick(() => {
          this.plugin.clearLog();
          if (this.logPre) this.logPre.textContent = "";
          new Notice("同步日志已清除");
        }),
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
    // Push, not polling: opening the window renders the current log and
    // progress at once, and every new record / progress step pushes an
    // update in the same tick. Hiding unsubscribes, which stops pushes.
    this.logUnsub = this.plugin.subscribeUi(() => {
      if (this.logPre) this.logPre.textContent = this.plugin.logText();
      if (this.progressEl) this.progressEl.textContent = this.plugin.progressText();
      if (this.lastSyncEl) this.lastSyncEl.textContent = this.plugin.lastSyncText();
      this.refreshSyncButton();
    });
  }

  private refreshSyncButton(): void {
    if (!this.syncBtn) return;
    if (this.plugin.isSyncing()) {
      this.syncBtn.setIcon("pause");
      this.syncBtn.setButtonText("暂停同步");
    } else {
      this.syncBtn.setIcon("play");
      this.syncBtn.setButtonText("开始同步");
    }
  }
}
