import type { Command } from "commander";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import type { CrossRepoSelectConfig } from "../lib/cross-repo-select.js";
import { crossRepoSelect } from "../lib/cross-repo-select.js";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
import { exitWithError, pc } from "../lib/output.js";
import type { RegistryEntry } from "../lib/registry.js";
import { listRepos } from "../lib/registry.js";
import { findRoot } from "../lib/root.js";

export function registerCd(program: Command): void {
    program
        .command("cd")
        .description("Print the path to a worktree (use shell wrapper for actual cd)")
        .argument("[name]", "Worktree directory name (interactive if omitted)")
        .option("--repo <name>", "Select a specific registered repo by name or path")
        .addHelpText(
            "after",
            `\n${pc.bold("Non-interactive usage (no prompts):")}\n` +
                pc.dim(
                    "  wt cd main                     # worktree by name in the current repo\n" +
                        "  wt cd --repo my-repo main      # worktree in a specific registered repo\n",
                ) +
                `\n${pc.bold("Interactive usage:")}\n` +
                pc.dim(
                    "  wt cd                          # picker within current repo\n" +
                        "  Tab / Shift-Tab cycles through registered repos.\n" +
                        "  Escape cancels.\n",
                ),
        )
        .action(async (name: string | undefined, opts: { repo?: string }) => {
            const currentRoot = findRoot();
            const repos = listRepos();

            // Determine starting repo index
            let activeIdx = 0;
            let adHocRoot: string | null = null; // current repo not yet in registry

            if (opts.repo) {
                const idx = findRepoIndex(repos, opts.repo);
                if (idx === -1) {
                    exitWithError(`Unknown repo: ${opts.repo}`);
                }
                activeIdx = idx;
            } else if (currentRoot) {
                const idx = repos.findIndex((r) => r.path === currentRoot);
                if (idx !== -1) {
                    activeIdx = idx;
                } else {
                    adHocRoot = currentRoot;
                }
            } else if (repos.length === 0) {
                output.dim("  Register repos with: wt repos add [path]");
                exitWithError("Not in a worktree-managed repository (no .bare found)");
            }

            // Effective list: registered repos, or ad-hoc fallback for unregistered current repo
            const effectiveRepos: RegistryEntry[] =
                adHocRoot !== null ? [{ path: adHocRoot, name: basename(adHocRoot), addedAt: "" }] : repos;

            if (effectiveRepos.length === 0) {
                exitWithError("No repositories available. Register one with: wt repos add [path]");
            }

            // Direct name argument — resolve without prompt
            if (name) {
                const root = effectiveRepos[activeIdx]!.path;
                const target = join(root, name);
                if (!existsSync(target)) {
                    exitWithError(`Worktree not found: ${target}`);
                }
                warnIfNoWrapper();
                process.stdout.write(target);
                return;
            }

            // Pre-load worktrees for all repos (fast — git worktree list is local)
            const worktreesByRepo = effectiveRepos.map((repo) => {
                const entries = git.worktreeList(repo.path);
                const maxLen = Math.max(...entries.map((e) => e.dirname.length));
                return entries.map((e) => ({
                    value: e.path,
                    name: `${pc.cyan(e.dirname.padEnd(maxLen))}  ${pc.dim("→")}  ${pc.yellow(e.branch)}`,
                }));
            });

            const firstRepo = effectiveRepos[activeIdx]!;
            if ((worktreesByRepo[activeIdx] ?? []).length === 0) {
                exitWithError(`No worktrees found in: ${firstRepo.name}`);
            }

            const filterModeRef = { current: false };
            const promptConfig: CrossRepoSelectConfig = {
                repos: effectiveRepos,
                worktreesByRepo,
                initialRepoIdx: activeIdx,
                filterModeRef,
            };

            // Escape cancellation — mirror the pattern from prompt.ts withEscape.
            // While the prompt is in filter-edit mode, escape is consumed by the
            // prompt to clear the filter rather than aborting the whole command.
            const controller = new AbortController();
            const onEscape = (_ch: string, key: { name: string }) => {
                if (key?.name === "escape" && !filterModeRef.current) controller.abort();
            };
            process.stdin.on("keypress", onEscape);

            try {
                const selected = await crossRepoSelect(promptConfig, {
                    output: process.stderr,
                    signal: controller.signal,
                });
                warnIfNoWrapper();
                process.stdout.write(selected);
            } finally {
                process.stdin.removeListener("keypress", onEscape);
            }
        });
}

function findRepoIndex(repos: RegistryEntry[], nameOrPath: string): number {
    const isAbsPath = nameOrPath.startsWith("/");
    return repos.findIndex((r) => r.name === nameOrPath || (isAbsPath && r.path === nameOrPath));
}

function warnIfNoWrapper(): void {
    if (process.stdout.isTTY) {
        output.blank();
        output.warn("Shell wrapper not active — cd will not happen.");
        output.dim("  Setup: wt init         (first time only)");
        output.dim("  Then:  source ~/.zshrc  (or open a new terminal)");
    }
}
