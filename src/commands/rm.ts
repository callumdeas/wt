import type { Command } from "commander";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import ora from "ora";
import type { CrossRepoSelectConfig } from "../lib/cross-repo-select.js";
import { crossRepoSelect } from "../lib/cross-repo-select.js";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
import { pc, promptTheme } from "../lib/output.js";
import { confirm, select } from "../lib/prompt.js";
import type { RegistryEntry } from "../lib/registry.js";
import { findRepo, listRepos } from "../lib/registry.js";
import { findRoot, requireRoot } from "../lib/root.js";
import { DirtyWorktreeError, removeWorktree } from "../lib/worktree-remove.js";

export function registerRm(program: Command): void {
    program
        .command("rm")
        .alias("remove")
        .description("Remove a worktree")
        .argument("[name]", "Worktree directory name (interactive picker if omitted)")
        .option("--repo <name>", "Remove from a specific registered repo")
        .option("--force", "Force remove even with uncommitted changes (skip confirmation)")
        .option("--delete-branch", "Delete the branch after removing (skip confirmation)")
        .option("--keep-branch", "Keep the branch (skip confirmation)")
        .addHelpText(
            "after",
            `\n${pc.bold("Fully non-interactive examples:")}\n` +
                pc.dim(
                    "  wt rm my-feature --force --delete-branch\n  wt rm my-feature --repo web --force --delete-branch",
                ),
        )
        .action(
            async (
                name: string | undefined,
                opts: { repo?: string; force?: boolean; deleteBranch?: boolean; keepBranch?: boolean },
            ) => {
                let root: string;

                if (opts.repo) {
                    // --repo specified: resolve from registry
                    const entry = findRepo(opts.repo);
                    if (!entry) {
                        output.error(`Unknown repo: ${opts.repo}`);
                        process.exit(1);
                    }
                    root = entry.path;

                    if (!name) {
                        const defBr = git.defaultBranch(root);
                        const entries = git.worktreeList(root);
                        const removable = entries.filter((e) => e.dirname !== defBr);
                        if (removable.length === 0) {
                            output.info(`No removable worktrees found in: ${entry.name}`);
                            process.exit(1);
                        }
                        const maxLen = Math.max(...entries.map((e) => e.dirname.length));
                        name = await select(
                            {
                                message: "🧹 Delete worktree:",
                                choices: entries.map((e) => ({
                                    value: e.dirname,
                                    name: `${pc.cyan(e.dirname.padEnd(maxLen))}  ${pc.dim("→")}  ${pc.yellow(e.branch)}`,
                                    disabled: e.dirname === defBr ? "🔒 default branch" : false,
                                })),
                                theme: promptTheme,
                            },
                            { output: process.stderr },
                        );
                    }
                } else if (!name) {
                    // No --repo, no name: cross-repo interactive picker
                    const currentRoot = findRoot();
                    const repos = listRepos();
                    const effectiveRepos: RegistryEntry[] =
                        repos.length > 0
                            ? repos
                            : currentRoot
                              ? [{ path: currentRoot, name: basename(currentRoot), addedAt: "" }]
                              : [];

                    if (effectiveRepos.length === 0) {
                        output.error("Not in a worktree-managed repository (no .bare found)");
                        output.dim("  Register repos with: wt repos add [path]");
                        process.exit(1);
                    }

                    // Build worktree lists; default branch is shown greyed out but not selectable
                    const worktreesByRepo = effectiveRepos.map((repo) => {
                        const defBr = git.defaultBranch(repo.path);
                        const entries = git.worktreeList(repo.path);
                        const maxLen = Math.max(...entries.map((e) => e.dirname.length), 0);
                        return entries.map((e) => ({
                            value: e.path,
                            name: `${pc.cyan(e.dirname.padEnd(maxLen))}  ${pc.dim("→")}  ${pc.yellow(e.branch)}`,
                            disabled: e.dirname === defBr,
                        }));
                    });

                    // Only show repos that have at least one removable (non-default) worktree
                    const removableRepos = effectiveRepos.filter((_, i) =>
                        (worktreesByRepo[i] ?? []).some((w) => !w.disabled),
                    );
                    const removableByRepo = worktreesByRepo.filter((wts) => wts.some((w) => !w.disabled));

                    if (removableRepos.length === 0) {
                        output.info("No removable worktrees found (only default branches exist)");
                        process.exit(1);
                    }

                    const initialRepoIdx = currentRoot
                        ? Math.max(
                              0,
                              removableRepos.findIndex((r) => r.path === currentRoot),
                          )
                        : 0;

                    const filterModeRef = { current: false };
                    const promptConfig: CrossRepoSelectConfig = {
                        repos: removableRepos,
                        worktreesByRepo: removableByRepo,
                        initialRepoIdx,
                        message: "🧹 Delete worktree:",
                        actionLabel: "delete",
                        filterModeRef,
                    };

                    const controller = new AbortController();
                    const onEscape = (_ch: string, key: { name: string }) => {
                        if (key?.name === "escape" && !filterModeRef.current) controller.abort();
                    };
                    process.stdin.on("keypress", onEscape);

                    let selected: string;
                    try {
                        selected = await crossRepoSelect(promptConfig, {
                            output: process.stderr,
                            signal: controller.signal,
                        });
                    } finally {
                        process.stdin.removeListener("keypress", onEscape);
                    }

                    const matchedRepo = removableRepos.find((r) => selected.startsWith(r.path + "/"));
                    if (!matchedRepo) {
                        output.error("Could not determine repo root from selection");
                        process.exit(1);
                    }
                    root = matchedRepo.path;
                    name = basename(selected);
                } else {
                    // No --repo, name provided: use current repo
                    root = requireRoot();
                }

                const worktreeDir = join(root, name);
                const defBranch = git.defaultBranch(root);

                if (name === defBranch) {
                    output.error(`Cannot remove the default branch worktree: ${pc.cyan(name)}`);
                    output.dim("  The default branch is protected. Use git directly if you really need this.");
                    process.exit(1);
                }

                // Detect if the user's shell is inside the worktree being removed
                const cwd = resolve(process.cwd());
                const resolvedWorktree = resolve(worktreeDir);
                const insideWorktree = cwd === resolvedWorktree || cwd.startsWith(`${resolvedWorktree}/`);

                // Front-load branch deletion decision — ask before any destructive work
                let branchName: string | null;
                if (existsSync(worktreeDir)) {
                    branchName = git.currentBranch(worktreeDir);
                } else {
                    // Directory is gone — confirm git still knows about it, then read branch from its list entry
                    const staleEntry = git.worktreeList(root).find((e) => e.path === worktreeDir);
                    if (!staleEntry) {
                        output.error(`Worktree not found: ${worktreeDir}`);
                        process.exit(1);
                    }
                    branchName = staleEntry.branch ?? null;
                }
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

                let result;
                try {
                    try {
                        result = await removeWorktree(root, name, {
                            force: opts.force,
                            deleteBranch: shouldDeleteBranch,
                        });
                    } catch (err) {
                        if (err instanceof DirtyWorktreeError) {
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
                            if (!forceConfirm) process.exit(1);
                            spinner.start("Removing worktree...");
                            result = await removeWorktree(root, name, {
                                force: true,
                                deleteBranch: shouldDeleteBranch,
                            });
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

                if (result?.branchDeleted) {
                    output.success("Branch deleted");
                }
            },
        );
}
