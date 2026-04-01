import { select } from "@inquirer/prompts";
import type { Command } from "commander";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
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
                // Print path to stdout for shell wrapper to capture
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
            const selected = await select(
                {
                    message: "Select worktree:",
                    choices: entries.map((e) => ({
                        value: e.path,
                        name: `${e.dirname} → ${e.branch}`,
                    })),
                },
                { output: process.stderr },
            );

            // Print path to stdout for shell wrapper to capture
            process.stdout.write(selected);
        });
}
