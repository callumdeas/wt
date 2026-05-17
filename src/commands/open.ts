import type { Command } from "commander";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../lib/config.js";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
import { pc, promptTheme } from "../lib/output.js";
import { select } from "../lib/prompt.js";
import { findRepo } from "../lib/registry.js";
import { requireRoot } from "../lib/root.js";
import { workspaceAdd } from "../lib/workspace.js";

export function registerOpen(program: Command): void {
    program
        .command("open")
        .description("Open a worktree in the configured editor")
        .argument("[name]", "Worktree directory name (current worktree if omitted)")
        .option("--repo <name>", "Open a worktree from a specific registered repo")
        .addHelpText("after", `\n${pc.bold("Non-interactive example:")}\n` + pc.dim("  wt open feature-1 --repo web"))
        .action(async (name: string | undefined, opts: { repo?: string }) => {
            if (opts.repo) {
                const entry = findRepo(opts.repo);
                if (!entry) {
                    output.error(`Unknown repo: ${opts.repo}`);
                    process.exit(1);
                }
                const root = entry.path;

                if (!name) {
                    const entries = git.worktreeList(root);
                    if (entries.length === 0) {
                        output.info(`No worktrees found in: ${entry.name}`);
                        process.exit(1);
                    }
                    const maxLen = Math.max(...entries.map((e) => e.dirname.length));
                    name = await select(
                        {
                            message: "📂 Select worktree to open:",
                            choices: entries.map((e) => ({
                                value: e.dirname,
                                name: `${pc.cyan(e.dirname.padEnd(maxLen))}  ${pc.dim("→")}  ${pc.yellow(e.branch)}`,
                            })),
                            theme: promptTheme,
                        },
                        { output: process.stderr },
                    );
                }

                const target = join(root, name);
                if (!existsSync(target)) {
                    output.error(`Worktree not found: ${target}`);
                    process.exit(1);
                }

                openTarget(root, target);
                return;
            }

            // No --repo: existing behaviour
            const root = requireRoot();
            const config = loadConfig(root);

            let target: string;
            if (name) {
                target = join(root, name);
                if (!existsSync(target)) {
                    output.error(`Worktree not found: ${target}`);
                    process.exit(1);
                }
            } else {
                const cwd = process.cwd();
                if (cwd.startsWith(root + "/") && cwd !== root) {
                    target = cwd;
                } else {
                    execSync(`${config.editor} .`, { stdio: "inherit" });
                    return;
                }
            }

            if (config.workspaceMode) {
                workspaceAdd(root, target);
                execSync(`${config.editor} --add "${target}"`, { stdio: "inherit" });
            } else {
                execSync(`${config.editor} "${target}"`, { stdio: "inherit" });
            }
        });
}

function openTarget(root: string, target: string): void {
    const config = loadConfig(root);
    if (config.workspaceMode) {
        workspaceAdd(root, target);
        execSync(`${config.editor} --add "${target}"`, { stdio: "inherit" });
    } else {
        execSync(`${config.editor} "${target}"`, { stdio: "inherit" });
    }
}
