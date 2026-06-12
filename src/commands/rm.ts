import { Separator } from "@inquirer/prompts";
import type { Command } from "commander";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import ora from "ora";
import type { MergedPR } from "../lib/gh.js";
import { mergedPRsForBranches } from "../lib/gh.js";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
import { exitWithError, pc, promptTheme } from "../lib/output.js";
import { checkbox, confirm } from "../lib/prompt.js";
import type { RegistryEntry } from "../lib/registry.js";
import { findRepo, listRepos } from "../lib/registry.js";
import { findRoot, requireRoot } from "../lib/root.js";
import { DirtyWorktreeError, removeWorktree } from "../lib/worktree-remove.js";

interface WorktreeItem {
    repo: RegistryEntry;
    dirname: string;
    path: string;
    branch: string;
    hasBranch: boolean;
    mergedPr: MergedPR | null;
}

function choiceValue(item: WorktreeItem): string {
    return `${item.repo.path}::${item.dirname}`;
}

function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";
    const diffMs = Date.now() - then;
    const days = Math.floor(diffMs / 86_400_000);
    if (days < 1) return "today";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
}

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
                if (name) {
                    // Non-interactive: name provided directly
                    const root = opts.repo
                        ? (() => {
                              const entry = findRepo(opts.repo);
                              if (!entry) exitWithError(`Unknown repo: ${opts.repo}`);
                              return entry!.path;
                          })()
                        : requireRoot();
                    await removeSingle(root, name, opts);
                    return;
                }

                // Interactive: build effective repo list
                let effectiveRepos: RegistryEntry[];

                if (opts.repo) {
                    const entry = findRepo(opts.repo);
                    if (!entry) exitWithError(`Unknown repo: ${opts.repo}`);
                    effectiveRepos = [entry!];
                } else {
                    const currentRoot = findRoot();
                    const repos = listRepos();
                    effectiveRepos =
                        repos.length > 0
                            ? repos
                            : currentRoot
                              ? [{ path: currentRoot, name: basename(currentRoot), addedAt: "" }]
                              : [];

                    if (effectiveRepos.length === 0) {
                        output.dim("  Register repos with: wt repos add [path]");
                        exitWithError("Not in a worktree-managed repository (no .bare found)");
                    }
                }

                const cwd = resolve(process.cwd());
                const items = buildItems(effectiveRepos, cwd);

                if (items.length === 0) {
                    output.info("No removable worktrees found (only default branches exist)");
                    process.exit(1);
                }

                // Annotate with merged-PR data (stale detection), querying only
                // the branches we actually have a worktree for.
                annotateMergedPRs(items);

                const selected = await pickWorktrees(items, effectiveRepos.length > 1);
                if (selected.length === 0) {
                    output.dim("Nothing selected.");
                    return;
                }

                await removeMultiple(selected, opts, cwd);
            },
        );
}

function annotateMergedPRs(items: WorktreeItem[]): void {
    const spinner = ora({ text: "Checking for merged PRs...", stream: process.stderr }).start();
    const byRepo = new Map<string, WorktreeItem[]>();
    for (const item of items) {
        const list = byRepo.get(item.repo.path) ?? [];
        list.push(item);
        byRepo.set(item.repo.path, list);
    }
    for (const [repoPath, list] of byRepo) {
        // Only worktrees on a real branch (not detached HEAD) can have a PR.
        const branches = [...new Set(list.filter((i) => i.hasBranch).map((i) => i.branch))];
        const merged = mergedPRsForBranches(repoPath, branches);
        for (const item of list) {
            if (item.hasBranch) item.mergedPr = merged.get(item.branch) ?? null;
        }
    }
    spinner.stop();
}

function buildItems(repos: RegistryEntry[], cwd: string): WorktreeItem[] {
    const items: WorktreeItem[] = [];
    for (const repo of repos) {
        const defBr = git.defaultBranch(repo.path);
        const entries = git.worktreeList(repo.path);
        for (const e of entries) {
            if (e.dirname === defBr || e.branch === defBr) continue;
            const wtAbs = resolve(e.path);
            if (cwd === wtAbs || cwd.startsWith(`${wtAbs}/`)) continue;
            items.push({
                repo,
                dirname: e.dirname,
                path: e.path,
                branch: e.branch || e.dirname,
                hasBranch: e.branch !== "",
                mergedPr: null,
            });
        }
    }
    return items;
}

async function pickWorktrees(items: WorktreeItem[], multiRepo: boolean): Promise<WorktreeItem[]> {
    const maxLen = Math.max(...items.map((i) => i.dirname.length));

    type Choice = { value: string; name: string; checked: boolean } | InstanceType<typeof Separator>;
    const choices: Choice[] = [];

    const byRepo = new Map<string, WorktreeItem[]>();
    for (const item of items) {
        const list = byRepo.get(item.repo.name) ?? [];
        list.push(item);
        byRepo.set(item.repo.name, list);
    }

    for (const [repoName, list] of byRepo) {
        if (multiRepo) {
            choices.push(new Separator(pc.magenta(`── ${repoName} ─`.padEnd(60, "─"))));
        }
        for (const item of list) {
            const staleTag = item.mergedPr
                ? ` ${pc.green("✓")} ${pc.dim("merged " + relativeTime(item.mergedPr.mergedAt))}`
                : "";
            choices.push({
                value: choiceValue(item),
                name: `${pc.cyan(item.dirname.padEnd(maxLen))}  ${pc.dim("→")}  ${pc.yellow(item.branch)}${staleTag}`,
                checked: item.mergedPr !== null,
            });
        }
    }

    const picked = await checkbox(
        {
            message: "🧹 Select worktrees to remove:",
            choices,
            pageSize: Math.min(20, choices.length),
            theme: promptTheme,
        },
        { output: process.stderr },
    );

    const pickedSet = new Set(picked);
    return items.filter((i) => pickedSet.has(choiceValue(i)));
}

async function removeMultiple(
    items: WorktreeItem[],
    opts: { force?: boolean; deleteBranch?: boolean; keepBranch?: boolean },
    cwd: string,
): Promise<void> {
    let shouldDeleteBranch: boolean;
    if (opts.deleteBranch) {
        shouldDeleteBranch = true;
    } else if (opts.keepBranch) {
        shouldDeleteBranch = false;
    } else {
        shouldDeleteBranch = await confirm(
            {
                message:
                    items.length === 1
                        ? `Delete branch '${items[0]!.branch}'?`
                        : `Delete branches for all ${items.length} selected worktrees?`,
                default: false,
                theme: promptTheme,
            },
            { output: process.stderr },
        );
    }

    let anyInsideWorktree: string | null = null;
    let removed = 0;
    let skipped = 0;

    for (const item of items) {
        const label = items.length === 1 ? item.dirname : `${item.repo.name}/${item.dirname}`;
        const resolvedWorktree = resolve(item.path);
        if (cwd === resolvedWorktree || cwd.startsWith(`${resolvedWorktree}/`)) {
            anyInsideWorktree = item.repo.path;
        }

        const spinner = ora({ text: `Removing ${label}...`, stream: process.stderr }).start();
        try {
            await removeWorktree(item.repo.path, item.dirname, {
                force: opts.force,
                deleteBranch: shouldDeleteBranch,
                quiet: items.length > 1,
            });
            spinner.succeed(`${label} ${pc.dim("removed")}`);
            removed++;
        } catch (err) {
            if (err instanceof DirtyWorktreeError) {
                spinner.stop();
                output.warn(`${label} has uncommitted changes`);
                const ok = await confirm(
                    {
                        message: `Force remove ${label}? (changes will be lost)`,
                        default: false,
                        theme: promptTheme,
                    },
                    { output: process.stderr },
                );
                if (!ok) {
                    skipped++;
                    continue;
                }
                const retrySpinner = ora({ text: `Removing ${label}...`, stream: process.stderr }).start();
                try {
                    await removeWorktree(item.repo.path, item.dirname, {
                        force: true,
                        deleteBranch: shouldDeleteBranch,
                        quiet: items.length > 1,
                    });
                    retrySpinner.succeed(`${label} ${pc.dim("removed")}`);
                    removed++;
                } catch (retryErr) {
                    retrySpinner.fail(`${label}: ${(retryErr as Error).message}`);
                    skipped++;
                }
            } else {
                spinner.fail(`${label}: ${(err as Error).message}`);
                skipped++;
            }
        }
    }

    if (items.length > 1) {
        output.blank();
        output.success(`Removed ${removed} worktree(s)` + (skipped ? `, skipped ${skipped}` : ""));
    } else if (removed === 1) {
        output.success("Worktree removed");
    }

    if (anyInsideWorktree) {
        process.stdout.write(anyInsideWorktree);
    }
}

async function removeSingle(
    root: string,
    name: string,
    opts: { force?: boolean; deleteBranch?: boolean; keepBranch?: boolean },
): Promise<void> {
    const worktreeDir = git.worktreeList(root).find((e) => e.dirname === name)?.path ?? join(root, name);
    const defBranch = git.defaultBranch(root);

    if (name === defBranch) {
        output.dim("  The default branch is protected. Use git directly if you really need this.");
        exitWithError(`Cannot remove the default branch worktree: ${pc.cyan(name)}`);
    }

    const cwd = resolve(process.cwd());
    const resolvedWorktree = resolve(worktreeDir);
    const insideWorktree = cwd === resolvedWorktree || cwd.startsWith(`${resolvedWorktree}/`);

    let branchName: string | null;
    if (existsSync(worktreeDir)) {
        branchName = git.currentBranch(worktreeDir);
    } else {
        const staleEntry = git.worktreeList(root).find((e) => e.path === worktreeDir);
        if (!staleEntry) exitWithError(`Worktree not found: ${worktreeDir}`);
        branchName = staleEntry!.branch ?? null;
    }

    let shouldDeleteBranch = false;
    if (branchName && branchName !== defBranch) {
        if (opts.deleteBranch) {
            shouldDeleteBranch = true;
        } else if (!opts.keepBranch) {
            shouldDeleteBranch = await confirm(
                { message: `Delete branch '${branchName}'?`, default: false, theme: promptTheme },
                { output: process.stderr },
            );
        }
    }

    const spinner = ora({ text: "Removing worktree...", stream: process.stderr }).start();
    let result;
    try {
        try {
            result = await removeWorktree(root, name, { force: opts.force, deleteBranch: shouldDeleteBranch });
        } catch (err) {
            if (err instanceof DirtyWorktreeError) {
                spinner.stop();
                output.warn("Worktree has uncommitted changes");
                const forceConfirm = await confirm(
                    { message: "Force remove anyway? (changes will be lost)", default: false, theme: promptTheme },
                    { output: process.stderr },
                );
                if (!forceConfirm) process.exit(1);
                spinner.start("Removing worktree...");
                result = await removeWorktree(root, name, { force: true, deleteBranch: shouldDeleteBranch });
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
}
