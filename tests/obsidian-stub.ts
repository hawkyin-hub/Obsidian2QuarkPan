// Minimal mock of the `obsidian` module, ONLY for the e2e harness
// (tests/e2e-obsidian-flow.mjs). It is never shipped in main.js.
// It records every Setting/button created so the harness can click them
// exactly as a user would in the Obsidian settings UI.

export function makeEl(tag: string): Record<string, unknown> & {
  createEl: (t: string, o?: Record<string, unknown>) => unknown;
  setText: (s: string) => void;
  empty: () => void;
} {
  const el: Record<string, unknown> = {
    tag,
    text: "",
    children: [] as unknown[],
    style: {} as Record<string, string>,
    href: "",
  };
  el["createEl"] = (t: string, o?: Record<string, unknown>) => {
    const child = makeEl(t);
    if (o && typeof o["text"] === "string") child["text"] = o["text"];
    (el["children"] as unknown[]).push(child);
    child["remove"] = () => {
      const arr = el["children"] as unknown[];
      const idx = arr.indexOf(child);
      if (idx >= 0) arr.splice(idx, 1);
    };
    return child;
  };
  el["setText"] = (s: string) => {
    el["text"] = s;
  };
  el["empty"] = () => {
    el["children"] = [];
  };
  return el as never;
}

export class Notice {
  constructor(message: string) {
    ((globalThis as Record<string, unknown>)["__notices"] as string[]).push(message);
  }
}

export class Plugin {
  app: Record<string, unknown>;
  manifest: Record<string, unknown>;
  constructor(app: Record<string, unknown>, manifest: Record<string, unknown>) {
    this.app = app;
    this.manifest = manifest;
  }
  async loadData(): Promise<unknown> {
    return (globalThis as Record<string, unknown>)["__store"] ?? null;
  }
  async saveData(data: unknown): Promise<void> {
    (globalThis as Record<string, unknown>)["__store"] = data;
  }
  addRibbonIcon(): Record<string, unknown> {
    return makeEl("span");
  }
  addCommand(): void {}
  addStatusBarItem(): Record<string, unknown> {
    return makeEl("span");
  }
  addSettingTab(tab: unknown): void {
    (globalThis as Record<string, unknown>)["__settingTab"] = tab;
  }
}

export class PluginSettingTab {
  app: Record<string, unknown>;
  plugin: Record<string, unknown>;
  containerEl: Record<string, unknown>;
  constructor(app: Record<string, unknown>, plugin: Record<string, unknown>) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = makeEl("div");
  }
  display(): void {}
}

export class App {}

interface Builder {
  text?: string;
  onClick?: () => Promise<unknown> | unknown;
  onChange?: (v: never) => Promise<unknown> | unknown;
  value?: string;
  inputEl: { type: string };
  setButtonText: (t: string) => Builder;
  setIcon: (i: string) => Builder;
  icon?: string;
  setPlaceholder: (t: string) => Builder;
  setValue: (v: string) => Builder;
  onChangeFn?: (v: never) => Promise<unknown> | unknown;
}

function makeBuilder(): Builder {
  const b = {
    inputEl: { type: "text" },
  } as Builder;
  b.setButtonText = (t: string) => {
    b.text = t;
    return b;
  };
  b.setIcon = (i: string) => {
    b.icon = i;
    return b;
  };
  b.setPlaceholder = () => b;
  b.setValue = (v: string) => {
    b.value = v;
    return b;
  };
  return b;
}

export class Setting {
  name = "";
  desc = "";
  buttons: Builder[] = [];
  nameEl: Record<string, unknown>;
  descEl: Record<string, unknown>;
  constructor(public containerEl: Record<string, unknown>) {
    ((globalThis as Record<string, unknown>)["__settings"] as Setting[]).push(this);
    this.nameEl = makeEl("div");
    this.descEl = makeEl("div");
  }
  setName(n: string): this {
    this.name = n;
    return this;
  }
  setDesc(d: string): this {
    this.desc = d;
    this.descEl["text"] = d;
    return this;
  }
  addText(cb: (b: Builder) => void): this {
    const b = makeBuilder();
    const origOnChange = b;
    void origOnChange;
    (b as Record<string, unknown>)["onChange"] = (fn: (v: never) => Promise<unknown>) => {
      b.onChangeFn = fn;
      return b;
    };
    cb(b);
    return this;
  }
  addTextArea(cb: (b: Builder) => void): this {
    return this.addText(cb);
  }
  addToggle(cb: (b: Builder) => void): this {
    const b = makeBuilder();
    (b as Record<string, unknown>)["setValue"] = (v: boolean) => {
      b.value = String(v);
      return b;
    };
    (b as Record<string, unknown>)["onChange"] = (fn: (v: never) => Promise<unknown>) => {
      b.onChangeFn = fn;
      return b;
    };
    cb(b);
    return this;
  }
  addButton(cb: (b: Builder) => void): this {
    const b = makeBuilder();
    (b as Record<string, unknown>)["onClick"] = (fn: () => Promise<unknown>) => {
      b.onClick = fn;
      return b;
    };
    cb(b);
    this.buttons.push(b);
    return this;
  }
}

export async function requestUrl(req: Record<string, unknown>): Promise<unknown> {
  const impl = (globalThis as Record<string, unknown>)["__requestUrlImpl"] as
    ((r: Record<string, unknown>) => Promise<unknown>) | undefined;
  if (typeof impl !== "function") throw new Error("requestUrl mock not configured");
  return impl(req);
}
