import { Separator } from "@inquirer/prompts";
import type { Command } from "commander";
import { basename, resolve } from "node:path";
import ora from "ora";
import type { MergedPR } from "../lib/gh.js";
import { mergedPRsForRepo } from "../lib/gh.js";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
import { pc, promptTheme } from "../lib/output.js";
import { checkbox, confirm } from "../lib/prompt.js";
import type { RegistryEntry } from "../lib/registry.js";
import { listRepos } from "../lib/registry.js";
import { findRoot } from "../lib/root.js";
import { DirtyWorktreeError, removeWorktree } from "../lib/worktree-remove.js";

interface Candidate {
    repo: RegistryEntry;
    worktree: string;
    branch: string;
    pr: MergedPR;
}

function makeValue(repoPath: string, dirname: string): string {
    return `${repoPath}::${dirname}`;
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

export function registerClean(program: Command): void {
    program
        .command("clean")
        .description("Find worktrees with merged PRs and offer to remove them")
        .option("--repo <name>", "Limit to a single registered repo (by name or path)")
        .option("--all", "Skip the multi-select prompt and treat every eligible worktree as selected")
        .option("-y, --yes", "Skip the final 'Remove N worktrees?' confirmation")
        .option("--force", "Force-remove dirty worktrees without prompting")
        .option("--keep-branch", "Don't delete the local branch after removing the worktree")
        .option("--delete-branch", "Delete the local branch (this is the default)")
        .option("--dry-run", "List what would be removed and exit without deleting")
        .addHelpText(
            "after",
            `\n${pc.bold("Examples:")}\n` +
                pc.dim("  wt clean                          # interactive across all registered repos\n") +
                pc.dim("  wt clean --repo my-repo            # only one repo\n") +
                pc.dim("  wt clean --all --yes --force      # fully non-interactive: nuke everything merged"),
        )
        .action(
            async (opts: {
                repo?: string;
                all?: boolean;
                yes?: boolean;
                force?: boolean;
                keepBranch?: boolean;
                deleteBranch?: boolean;
                dryRun?: boolean;
            }) => {
                const repos = resolveRepos(opts.repo);
                if (repos.length === 0) return;

                const candidates = await collectCandidates(repos);
                if (candidates.length === 0) {
                    output.info("No merged worktrees found across " + repos.length + " repo(s).");
                    return;
                }

                const selected = opts.all === true ? candidates : await pickCandidates(candidates);
                if (selected.length === 0) {
                    output.dim("Nothing selected.");
                    return;
                }

                if (opts.dryRun) {
                    output.info(`[dry-run] Would remove ${selected.length} worktree(s):`);
                    for (const c of selected) {
                        output.plain(
                            `  ${pc.cyan(c.repo.name)}/${pc.cyan(c.worktree)}  ${pc.dim("→ #" + c.pr.number)}`,
                        );
                    }
                    return;
                }

                if (!opts.yes) {
                    const ok = await confirm(
                        {
                            message: `Remove ${selected.length} worktree(s)?`,
                            default: true,
                            theme: promptTheme,
                        },
                        { output: process.stderr },
                    );
                    if (!ok) {
                        output.dim("Cancelled.");
                        return;
                    }
                }

                const deleteBranch = opts.keepBranch ? false : true; // --delete-branch is the default
                let removed = 0;
                let skipped = 0;

                for (const c of selected) {
                    const label = `${c.repo.name}/${c.worktree}`;
                    const spinner = ora({ text: `Removing ${label}...`, stream: process.stderr }).start();

                    try {
                        await tryRemove(c, { force: opts.force === true, deleteBranch, spinner, label });
                        spinner.succeed(`${label} ${pc.dim("removed")}`);
                        removed += 1;
                    } catch (err) {
                        spinner.fail(`${label}: ${(err as Error).message}`);
                        skipped += 1;
                    }
                }

                output.blank();
                output.success(`Removed ${removed} worktree(s)` + (skipped ? `, skipped ${skipped}` : ""));
            },
        );
}

function resolveRepos(filter: string | undefined): RegistryEntry[] {
    const registered = listRepos();
    const currentRoot = findRoot();

    // Build the effective list: registered repos + current repo if it's wt-managed but not registered.
    let effective: RegistryEntry[] = [...registered];
    if (currentRoot && !registered.some((r) => r.path === currentRoot)) {
        effective.push({ path: currentRoot, name: basename(currentRoot), addedAt: "" });
        output.dim(`(using current repo ad-hoc — register it with: wt repos add)`);
    }

    if (effective.length === 0) {
        output.error("No wt-managed repos available.");
        output.dim("  Register one with: wt repos add [path]");
        output.dim("  Or scan a directory: wt repos discover [dir]");
        process.exit(1);
    }

    if (filter) {
        const abs = resolve(filter);
        const match = effective.find((r) => r.name === filter || r.path === abs);
        if (!match) {
            output.error(`Unknown repo: ${filter}`);
            output.dim(`  Available: ${effective.map((r) => r.name).join(", ")}`);
            process.exit(1);
        }
        effective = [match];
    }

    return effective;
}

async function collectCandidates(repos: RegistryEntry[]): Promise<Candidate[]> {
    const candidates: Candidate[] = [];
    const cwd = resolve(process.cwd());

    for (const repo of repos) {
        const spinner = ora({ text: `Checking ${repo.name}...`, stream: process.stderr }).start();
        try {
            const defBranch = git.defaultBranch(repo.path);
            const worktrees = git.worktreeList(repo.path).filter((wt) => {
                if (!wt.branch) return false; // detached HEAD
                if (wt.dirname === defBranch || wt.branch === defBranch) return false;
                const wtAbs = resolve(wt.path);
                if (cwd === wtAbs || cwd.startsWith(`${wtAbs}/`)) return false; // don't offer the cwd
                return true;
            });

            if (worktrees.length === 0) {
                spinner.stop();
                continue;
            }

            const merged = mergedPRsForRepo(repo.path);
            for (const wt of worktrees) {
                const pr = merged.get(wt.branch);
                if (pr) candidates.push({ repo, worktree: wt.dirname, branch: wt.branch, pr });
            }
            spinner.stop();
        } catch (err) {
            spinner.fail(`${repo.name}: ${(err as Error).message}`);
        }
    }

    return candidates;
}

async function pickCandidates(candidates: Candidate[]): Promise<Candidate[]> {
    const byRepo = new Map<string, Candidate[]>();
    for (const c of candidates) {
        const list = byRepo.get(c.repo.name) ?? [];
        list.push(c);
        byRepo.set(c.repo.name, list);
    }

    const maxBranchLen = Math.max(...candidates.map((c) => c.branch.length));

    type Choice = { value: string; name: string; checked: boolean } | InstanceType<typeof Separator>;
    const choices: Choice[] = [];
    for (const [repoName, list] of byRepo) {
        choices.push(new Separator(pc.magenta(`── ${repoName} ─`.padEnd(60, "─"))));
        for (const c of list) {
            const prLabel = `${pc.yellow("#" + c.pr.number)} ${pc.dim(c.pr.title.slice(0, 50))} ${pc.dim("(merged " + relativeTime(c.pr.mergedAt) + ")")}`;
            choices.push({
                value: makeValue(c.repo.path, c.worktree),
                name: `${pc.cyan(c.branch.padEnd(maxBranchLen))}  ${prLabel}`,
                checked: true,
            });
        }
    }

    const picked = await checkbox(
        {
            message: `Select worktrees to clean (${candidates.length} merged):`,
            choices,
            pageSize: Math.min(20, choices.length),
            theme: promptTheme,
            instructions: " ",
        },
        { output: process.stderr },
    );

    const pickedSet = new Set(picked);
    return candidates.filter((c) => pickedSet.has(makeValue(c.repo.path, c.worktree)));
}

interface TryRemoveOpts {
    force: boolean;
    deleteBranch: boolean;
    spinner: ReturnType<typeof ora>;
    label: string;
}

async function tryRemove(c: Candidate, opts: TryRemoveOpts): Promise<void> {
    try {
        await removeWorktree(c.repo.path, c.worktree, {
            force: opts.force,
            deleteBranch: opts.deleteBranch,
            quiet: true,
        });
    } catch (err) {
        if (err instanceof DirtyWorktreeError) {
            opts.spinner.stop();
            output.warn(`${opts.label} has uncommitted changes`);
            const ok = await confirm(
                {
                    message: `Force remove ${opts.label}? (changes will be lost)`,
                    default: false,
                    theme: promptTheme,
                },
                { output: process.stderr },
            );
            if (!ok) {
                throw new Error("skipped (dirty)");
            }
            opts.spinner.start(`Removing ${opts.label}...`);
            await removeWorktree(c.repo.path, c.worktree, {
                force: true,
                deleteBranch: opts.deleteBranch,
                quiet: true,
            });
        } else {
            throw err;
        }
    }
}
