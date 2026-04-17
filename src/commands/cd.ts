import type { Command } from "commander";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
import { pc, promptTheme } from "../lib/output.js";
import { select } from "../lib/prompt.js";
import { requireRoot } from "../lib/root.js";

export function registerCd(program: Command): void {
    program
        .command("cd")
        .description("Print the path to a worktree (use shell wrapper for actual cd)")
        .argument("[name]", "Worktree directory name (interactive if omitted)")
        .action(async (name?: string) => {
            const root = requireRoot();

            if (name) {
                const target = join(root, name);
                if (!existsSync(target)) {
                    output.error(`Worktree not found: ${target}`);
                    process.exit(1);
                }
                warnIfNoWrapper();
                process.stdout.write(target);
                return;
            }

            // Interactive selection
            const entries = git.worktreeList(root);
            if (entries.length === 0) {
                output.error("No worktrees found");
                process.exit(1);
            }

            // Render prompts to stderr so the shell wrapper's $(...)
            // only captures the final path on stdout
            const maxLen = Math.max(...entries.map((e) => e.dirname.length));
            const selected = await select(
                {
                    message: "📂 Select worktree:",
                    choices: entries.map((e) => ({
                        value: e.path,
                        name: `${pc.cyan(e.dirname.padEnd(maxLen))}  ${pc.dim("→")}  ${pc.yellow(e.branch)}`,
                    })),
                    theme: promptTheme,
                },
                { output: process.stderr },
            );

            warnIfNoWrapper();
            process.stdout.write(selected);
        });
}

/**
 * When stdout is a TTY, the shell wrapper isn't capturing output —
 * the user called the binary directly instead of through the shell function.
 */
function warnIfNoWrapper(): void {
    if (process.stdout.isTTY) {
        output.blank();
        output.warn("Shell wrapper not active — cd will not happen.");
        output.dim("  Setup: wt init         (first time only)");
        output.dim("  Then:  source ~/.zshrc  (or open a new terminal)");
    }
}
