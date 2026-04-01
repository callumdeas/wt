import { confirm, select } from "@inquirer/prompts";
import type { Command } from "commander";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../lib/config.js";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
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
        .argument("[name]", "Worktree directory name (interactive if omitted)")
        .option("--force", "Force remove even with uncommitted changes")
        .option("--delete-branch", "Delete the branch after removing")
        .option("--keep-branch", "Keep the branch (don't prompt)")
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

                    const selected = await select({
                        message: "Select worktree to remove:",
                        choices: entries.map((e) => ({
                            value: e.dirname,
                            name: `${e.dirname} → ${e.branch}`,
                        })),
                    });
                    name = selected;
                }

                const worktreeDir = join(root, name);

                if (!existsSync(worktreeDir)) {
                    output.error(`Worktree not found: ${worktreeDir}`);
                    process.exit(1);
                }

                // Get branch name before removing
                const branchName = git.currentBranch(worktreeDir);

                // Pre-delete heavy directories for speed
                let deletedAny = false;
                for (const dir of HEAVY_DIRS) {
                    const dirPath = join(worktreeDir, dir);
                    if (existsSync(dirPath)) {
                        deletedAny = true;
                        rmSync(dirPath, { recursive: true, force: true });
                    }
                }

                if (deletedAny) {
                    output.dim("Cleaned heavy directories");
                }

                // Remove worktree (force if we pre-deleted dirs or user requested)
                const forceRemove = deletedAny || opts.force === true;

                try {
                    git.worktreeRemove(root, worktreeDir, forceRemove);
                } catch (err) {
                    if (!opts.force) {
                        output.warn("Worktree has uncommitted changes");
                        const forceConfirm = await confirm({
                            message: "Force remove anyway? (changes will be lost)",
                            default: false,
                        });
                        if (forceConfirm) {
                            git.worktreeRemove(root, worktreeDir, true);
                        } else {
                            process.exit(1);
                        }
                    } else {
                        throw err;
                    }
                }

                output.success("Worktree removed");

                // Remove from workspace
                if (config.workspaceMode) {
                    workspaceRemove(root, worktreeDir);
                }

                // Branch deletion
                if (branchName && branchName !== defBranch) {
                    if (opts.deleteBranch) {
                        git.branchDelete(root, branchName);
                        output.success("Branch deleted");
                    } else if (!opts.keepBranch) {
                        const del = await confirm({
                            message: `Delete branch '${branchName}'?`,
                            default: false,
                        });
                        if (del) {
                            git.branchDelete(root, branchName);
                            output.success("Branch deleted");
                        }
                    }
                }
            },
        );
}
