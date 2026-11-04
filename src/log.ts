// In-memory ring log. Never logs credentials: callers must never pass a
// cookie, token, or service ticket into add().

export interface LogEntry {
  time: string;
  level: "info" | "warn" | "error";
  message: string;
}

/**
 * Format a date as Beijing time (Asia/Shanghai, UTC+8, no DST), e.g.
 * "2026-11-03 17:26:32.444". The timezone is fixed, not the machine's
 * local zone, so a UTC cloud machine and a Beijing phone show the same
 * wall time. Milliseconds come from the date itself (zone-independent).
 */
export function formatBeijingTime(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === t)?.value ?? "00";
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}.${ms}`;
}

export class RingLog {
  private entries: LogEntry[] = [];
  private max: number;
  private listeners = new Set<() => void>();
  constructor(max = 200) {
    this.max = max;
  }

  /** Push subscription: called synchronously on every add/clear. A
   * listener throwing never breaks logging itself. Returns unsubscribe. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(): void {
    for (const fn of [...this.listeners]) {
      try {
        fn();
      } catch {
        // A broken UI listener must not take logging down with it.
      }
    }
  }

  add(level: LogEntry["level"], message: string): void {
    this.entries.push({ time: formatBeijingTime(new Date()), level, message });
    if (this.entries.length > this.max) {
      this.entries.splice(0, this.entries.length - this.max);
    }
    this.notify();
  }

  info(message: string): void {
    this.add("info", message);
  }

  warn(message: string): void {
    this.add("warn", message);
  }

  error(message: string): void {
    this.add("error", message);
  }

  clear(): void {
    this.entries = [];
    this.notify();
  }

  all(): LogEntry[] {
    return [...this.entries];
  }

  /** Display order: newest first, oldest pushed down. */
  toText(): string {
    return [...this.entries]
      .reverse()
      .map((e) => `${e.time} [${e.level}] ${e.message}`)
      .join("\n");
  }
}
