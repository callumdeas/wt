import type { Command } from "commander";
import { basename } from "node:path";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
import { pc } from "../lib/output.js";
import { findRepo, listRepos } from "../lib/registry.js";
import { requireRoot } from "../lib/root.js";

export function registerLs(program: Command): void {
    program
        .command("ls")
        .alias("list")
        .description("List all worktrees with branch info")
        .option("--repo <name>", "List worktrees for a specific registered repo")
        .option("--all", "List worktrees for all registered repos")
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
                    output.error(`Unknown repo: ${opts.repo}`);
                    process.exit(1);
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

    for (const entry of entries) {
        const marker = entry.dirname === currentDirname ? pc.green("●") : " ";
        const name = pc.bold(pc.cyan(entry.dirname.padEnd(maxLen)));
        const branch = pc.yellow(entry.branch);
        output.plain(`  ${marker} ${name}  →  ${branch}`);
    }
}
