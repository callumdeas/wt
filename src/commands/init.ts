import type { Command } from "commander";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as output from "../lib/output.js";

const MARKER_START = "# --- wt shell integration (added by wt init) ---";
const MARKER_END = "# --- end wt shell integration ---";

const SHELL_WRAPPER = `
${MARKER_START}
wt() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      -h|--help) command wt "$@"; return;;
    esac
  done
  case "$1" in
    cd|new|get|rm|remove)
      local dir
      dir="$(command wt "$@")"
      if [[ -d "$dir" ]]; then
        cd "$dir"
      elif [[ -n "$dir" ]]; then
        printf '%s\\n' "$dir"
      fi
      ;;
    *)
      command wt "$@"
      ;;
  esac
}
${MARKER_END}
`;

function detectShellConfig(): string {
    const home = homedir();
    // Check SHELL env var first
    const shell = process.env.SHELL ?? "";

    if (shell.endsWith("/zsh")) {
        return join(home, ".zshrc");
    }
    if (shell.endsWith("/bash")) {
        // Prefer .bashrc, fall back to .bash_profile
        const bashrc = join(home, ".bashrc");
        return existsSync(bashrc) ? bashrc : join(home, ".bash_profile");
    }

    // Default to .zshrc on macOS, .bashrc elsewhere
    return join(home, process.platform === "darwin" ? ".zshrc" : ".bashrc");
}

/**
 * Strip existing wt shell integration from config file content.
 * Handles both old format (start marker only) and new format (start + end markers).
 */
function stripWrapper(content: string): string {
    const startIdx = content.indexOf(MARKER_START);
    if (startIdx === -1) return content;

    const endIdx = content.indexOf(MARKER_END, startIdx);
    if (endIdx !== -1) {
        // New format: strip from start marker to end of end-marker line
        const afterEnd = content.indexOf("\n", endIdx);
        const before = content.slice(0, startIdx === 0 ? 0 : startIdx - 1);
        const after = content.slice(afterEnd !== -1 ? afterEnd + 1 : content.length);
        return before + after;
    }

    // Old format: strip from start marker to closing } of the function
    const afterStart = content.slice(startIdx);
    const fnEnd = afterStart.match(/\n}\n/);
    if (fnEnd?.index != null) {
        const before = content.slice(0, startIdx === 0 ? 0 : startIdx - 1);
        const after = content.slice(startIdx + fnEnd.index + fnEnd[0].length);
        return before + after;
    }

    return content;
}

export function registerInit(program: Command): void {
    program
        .command("init")
        .description("Install shell integration for cd, new, and get into your shell config")
        .option("--force", "Replace existing shell integration with the latest version")
        .action((opts: { force?: boolean }) => {
            const configFile = detectShellConfig();

            if (existsSync(configFile)) {
                const content = readFileSync(configFile, "utf-8");
                if (content.includes(MARKER_START)) {
                    if (!opts.force) {
                        output.info(`Shell integration already installed in ${configFile}`);
                        output.dim("  Run with --force to update to the latest version");
                        return;
                    }
                    // Strip old wrapper before writing new one
                    writeFileSync(configFile, stripWrapper(content));
                    output.dim("Removed old shell integration");
                }
            }

            // Append the wrapper
            appendFileSync(configFile, SHELL_WRAPPER);

            output.success(`Shell integration ${opts.force ? "updated" : "added"} in ${configFile}`);
            output.warn(`To activate, run: source ${configFile}`);
        });
}
