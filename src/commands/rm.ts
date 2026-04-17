import type { Command } from "commander";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import ora from "ora";
import { loadConfig } from "../lib/config.js";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
import { pc, promptTheme } from "../lib/output.js";
import { confirm, select } from "../lib/prompt.js";
import { requireRoot } from "../lib/root.js";
import { workspaceRemove } from "../lib/workspace.js";

const HEAVY_DIRS = [
    "node_modules",
    ".next",
    "dist",
    "build",
    ".turbo",
    ".cache",
    ".parcel-cache",
    ".nuxt",
    ".output",
    ".svelte-kit",
];

export function registerRm(program: Command): void {
    program
        .command("rm")
        .alias("remove")
        .description("Remove a worktree")
        .argument("[name]", "Worktree directory name (interactive picker if omitted)")
        .option("--force", "Force remove even with uncommitted changes (skip confirmation)")
        .option("--delete-branch", "Delete the branch after removing (skip confirmation)")
        .option("--keep-branch", "Keep the branch (skip confirmation)")
        .addHelpText(
            "after",
            `\n${pc.bold("Fully non-interactive example:")}\n` + pc.dim("  wt rm my-feature --force --delete-branch"),
        )
        .action(
            async (
                name: string | undefined,
                opts: { force?: boolean; deleteBranch?: boolean; keepBranch?: boolean },
            ) => {
                const root = requireRoot();
                const config = loadConfig(root);
                const defBranch = git.defaultBranch(root);

                // If no name, show interactive selection
                if (!name) {
                    const entries = git.worktreeList(root).filter((e) => e.dirname !== defBranch);
                    if (entries.length === 0) {
                        output.info("No removable worktrees found (only default branch exists)");
                        process.exit(1);
                    }

                    const maxLen = Math.max(...entries.map((e) => e.dirname.length));
                    const selected = await select(
                        {
                            message: "🧹 Select worktree to remove:",
                            choices: entries.map((e) => ({
                                value: e.dirname,
                                name: `${pc.cyan(e.dirname.padEnd(maxLen))}  ${pc.dim("→")}  ${pc.yellow(e.branch)}`,
                            })),
                            theme: promptTheme,
                        },
                        { output: process.stderr },
                    );
                    name = selected;
                }

                const worktreeDir = join(root, name);

                if (!existsSync(worktreeDir)) {
                    output.error(`Worktree not found: ${worktreeDir}`);
                    process.exit(1);
                }

                // Detect if the user's shell is inside the worktree being removed
                const cwd = resolve(process.cwd());
                const resolvedWorktree = resolve(worktreeDir);
                const insideWorktree = cwd === resolvedWorktree || cwd.startsWith(`${resolvedWorktree}/`);

                // Get branch name before removing
                const branchName = git.currentBranch(worktreeDir);

                // Front-load branch deletion decision — ask before any destructive work
                let shouldDeleteBranch = false;
                if (branchName && branchName !== defBranch) {
                    if (opts.deleteBranch) {
                        shouldDeleteBranch = true;
                    } else if (!opts.keepBranch) {
                        shouldDeleteBranch = await confirm(
                            {
                                message: `Delete branch '${branchName}'?`,
                                default: false,
                                theme: promptTheme,
                            },
                            { output: process.stderr },
                        );
                    }
                }

                const spinner = ora({ text: "Removing worktree...", stream: process.stderr }).start();

                try {
                    // Pre-delete heavy directories for speed (async so the spinner can animate)
                    let deletedAny = false;
                    for (const dir of HEAVY_DIRS) {
                        const dirPath = join(worktreeDir, dir);
                        if (existsSync(dirPath)) {
                            if (!deletedAny) spinner.text = "Cleaning heavy directories...";
                            deletedAny = true;
                            await rm(dirPath, { recursive: true, force: true });
                        }
                    }

                    // Remove worktree (force if we pre-deleted dirs or user requested)
                    const forceRemove = deletedAny || opts.force === true;

                    spinner.text = "Removing worktree...";

                    try {
                        git.worktreeRemove(root, worktreeDir, forceRemove);
                    } catch (err) {
                        if (!opts.force) {
                            spinner.stop();
                            output.warn("Worktree has uncommitted changes");
                            const forceConfirm = await confirm(
                                {
                                    message: "Force remove anyway? (changes will be lost)",
                                    default: false,
                                    theme: promptTheme,
                                },
                                { output: process.stderr },
                            );
                            if (forceConfirm) {
                                spinner.start("Removing worktree...");
                                git.worktreeRemove(root, worktreeDir, true);
                            } else {
                                process.exit(1);
                            }
                        } else {
                            throw err;
                        }
                    }
                } finally {
                    spinner.stop();
                }

                output.success("Worktree removed");

                if (insideWorktree) {
                    process.stdout.write(root);
                }

                // Remove from workspace
                if (config.workspaceMode) {
                    workspaceRemove(root, worktreeDir);
                }

                // Execute deferred branch deletion
                if (shouldDeleteBranch) {
                    git.branchDelete(root, branchName!);
                    output.success("Branch deleted");
                }
            },
        );
}
