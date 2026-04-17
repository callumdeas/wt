import type { Command } from "commander";
import { basename } from "node:path";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
import { pc } from "../lib/output.js";
import { requireRoot } from "../lib/root.js";

export function registerLs(program: Command): void {
    program
        .command("ls")
        .alias("list")
        .description("List all worktrees with branch info")
        .action(() => {
            const root = requireRoot();
            const entries = git.worktreeList(root);

            if (entries.length === 0) {
                output.info("No worktrees found");
                return;
            }

            const repoName = basename(root);
            output.plain(pc.bold(pc.magenta(`🗺️  ${repoName} worktrees`)));
            output.blank();

            // Detect current worktree
            const cwd = process.cwd();
            let currentDirname = "";
            if (cwd.startsWith(root + "/") && cwd !== root) {
                currentDirname = cwd.replace(root + "/", "").split("/")[0];
            }

            // Find max name length for alignment
            const maxLen = Math.max(...entries.map((e) => e.dirname.length));

            for (const entry of entries) {
                const marker = entry.dirname === currentDirname ? pc.green("●") : " ";
                const name = pc.bold(pc.cyan(entry.dirname.padEnd(maxLen)));
                const branch = pc.yellow(entry.branch);
                output.plain(`  ${marker} ${name}  →  ${branch}`);
            }
        });
}
