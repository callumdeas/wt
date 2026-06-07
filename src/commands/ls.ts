import type { Command } from "commander";
import { basename } from "node:path";
import * as git from "../lib/git.js";
import { groupWorktrees } from "../lib/groups.js";
import * as output from "../lib/output.js";
import { exitWithError, pc } from "../lib/output.js";
import { findRepo, listRepos } from "../lib/registry.js";
import { requireRoot } from "../lib/root.js";

export function registerLs(program: Command): void {
    program
        .command("ls")
        .alias("list")
        .description("List all worktrees with branch info")
        .option("--repo <name>", "List worktrees for a specific registered repo")
        .option("--all", "List worktrees for all registered repos")
        .addHelpText(
            "after",
            `\n${pc.bold("Examples:")}\n` +
                pc.dim(
                    "  wt ls                    # current repo\n" +
                        "  wt ls --repo my-repo     # specific registered repo\n" +
                        "  wt ls --all              # all registered repos\n",
                ),
        )
        .action((opts: { repo?: string; all?: boolean }) => {
            const cwd = process.cwd();

            if (opts.all) {
                const repos = listRepos();
                if (repos.length === 0) {
                    output.info("No registered repos found. Register one with: wt repos add [path]");
                    return;
                }
                for (let i = 0; i < repos.length; i++) {
                    if (i > 0) output.blank();
                    printRepoWorktrees(repos[i]!.path, cwd);
                }
                return;
            }

            let root: string;
            if (opts.repo) {
                const entry = findRepo(opts.repo);
                if (!entry) {
                    exitWithError(`Unknown repo: ${opts.repo}`);
                }
                root = entry.path;
            } else {
                root = requireRoot();
            }

            printRepoWorktrees(root, cwd);
        });
}

function printRepoWorktrees(root: string, cwd: string): void {
    const entries = git.worktreeList(root);

    if (entries.length === 0) {
        output.info("No worktrees found");
        return;
    }

    output.plain(pc.bold(pc.magenta(`🗺️  ${basename(root)} worktrees`)));
    output.blank();

    let currentDirname = "";
    if (cwd.startsWith(root + "/") && cwd !== root) {
        currentDirname = cwd.replace(root + "/", "").split("/")[0] ?? "";
    }

    const maxLen = Math.max(...entries.map((e) => e.dirname.length));
    const grouped = groupWorktrees(entries);

    if (!grouped.hasGroups) {
        for (const entry of entries) {
            const marker = entry.dirname === currentDirname ? pc.green("●") : " ";
            const name = pc.bold(pc.cyan(entry.dirname.padEnd(maxLen)));
            output.plain(`  ${marker} ${name}  →  ${pc.yellow(entry.branch)}`);
        }
        return;
    }

    let needBlank = false;
    for (const key of grouped.order) {
        const groupEntries = grouped.byKey.get(key) ?? [];
        const isRealGroup = key !== "" && groupEntries.length >= 2;

        if (isRealGroup) {
            if (needBlank) output.blank();
            output.plain(`  ${pc.bold(key)} ${pc.dim(`(${groupEntries.length})`)}`);
        }

        for (const entry of groupEntries) {
            const marker = entry.dirname === currentDirname ? pc.green("●") : " ";
            const name = pc.bold(pc.cyan(entry.dirname.padEnd(maxLen)));
            const indent = isRealGroup ? "    " : "  ";
            output.plain(`${indent}${marker} ${name}  →  ${pc.yellow(entry.branch)}`);
        }

        needBlank = true;
    }
}
