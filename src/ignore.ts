// Glob ignore matching. Supports `*` (within one path segment) and `**`
// (across segments). Patterns are matched against vault-relative paths
// using `/` separators.

// Build outputs are not notes: a vault that contains a code project would
// otherwise upload megabytes of regenerable .rlib/.rmeta/node_modules
// files, each taking minutes over Quark's slow upload path.
export const DEFAULT_IGNORES = [".obsidian/**", ".git/**", ".trash/**", "**/target/**", "**/node_modules/**"];

function globToRegExp(glob: string): RegExp {
  let re = "^";
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        // ** : consume optional following slash
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 3;
        } else {
          re += ".*";
          i += 2;
        }
      } else {
        re += "[^/]*";
        i += 1;
      }
    } else if ("+|()^${}.[]\\".includes(ch)) {
      re += "\\" + ch;
      i += 1;
    } else {
      re += ch;
      i += 1;
    }
  }
  re += "$";
  return new RegExp(re);
}

export function isIgnored(path: string, extraPatterns: string[]): boolean {
  const patterns = [...DEFAULT_IGNORES, ...extraPatterns];
  for (const raw of patterns) {
    const p = raw.trim();
    if (!p) continue;
    // A bare directory name like "foo" means "foo/**" as well.
    if (globToRegExp(p).test(path)) return true;
    if (!p.includes("*") && (path === p || path.startsWith(p + "/"))) return true;
  }
  return false;
}
