import type { Command } from "commander";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as output from "../lib/output.js";

const MARKER = "# --- wt shell integration (added by wt init) ---";

const SHELL_WRAPPER = `
${MARKER}
wt() {
  if [[ "$1" == "cd" ]]; then
    local dir
    dir="$(command wt cd "\${@:2}")"
    [[ -n "$dir" ]] && cd "$dir"
  else
    command wt "$@"
  fi
}
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

export function registerInit(program: Command): void {
    program
        .command("init")
        .description("Install shell integration (wt cd wrapper) into your shell config")
        .action(() => {
            const configFile = detectShellConfig();

            // Check if already installed
            if (existsSync(configFile)) {
                const content = readFileSync(configFile, "utf-8");
                if (content.includes(MARKER)) {
                    output.info(`Shell integration already installed in ${configFile}`);
                    return;
                }
            }

            // Append the wrapper
            appendFileSync(configFile, SHELL_WRAPPER);

            output.success(`Shell integration added to ${configFile}`);
            console.log();
            console.log("To activate, run:");
            console.log(`  source ${configFile}`);
        });
}
