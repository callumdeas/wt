import type { Command } from "commander";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runPostCreate } from "../lib/background.js";
import { loadConfig } from "../lib/config.js";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
import { exitWithError, pc } from "../lib/output.js";
import { requireRoot } from "../lib/root.js";
import { copyUntrackedFromDefault } from "../lib/untracked.js";

/**
 * Resolve the start-point ref for a new worktree branch.
 * Prefers remote tracking branch; falls back to local branch.
 */
function resolveBase(root: string, base: string | undefined, defBranch: string): string {
    if (!base) return `origin/${defBranch}`;
    if (git.remoteBranchExists(root, base)) return `origin/${base}`;
    if (git.branchExists(root, base)) return base;
    exitWithError(`Branch "${base}" not found locally or on origin`);
}

export function registerNew(program: Command): void {
    program
        .command("new")
        .description("Create a new worktree with a new branch and cd into it")
        .argument("<branch>", "Branch name to create")
        .argument("[base]", "Base branch to branch from (defaults to the default branch)")
        .option(
            "--foreground",
            "Run post-create in foreground (blocks until done; auto-enabled in non-interactive sessions)",
        )
        .addHelpText(
            "after",
            `\n${pc.bold("Scripting notes:")}\n` +
                pc.dim(
                    "  Outputs the worktree path to stdout for the shell wrapper.\n" +
                        "  In scripts, use `command wt new <branch>` to capture the path directly.\n" +
                        "  Without --foreground, post-create and push run in background — the worktree\n" +
                        "  may not be fully set up (e.g. node_modules) when the command returns.\n" +
                        "  Non-interactive sessions (no TTY) auto-enable --foreground.",
                ) +
                `\n\n${pc.bold("Untracked files:")}\n` +
                pc.dim(
                    "  Gitignored and untracked files (e.g. .env, .env.local) are automatically\n" +
                        "  copied from the default branch worktree into the new worktree, so post-create\n" +
                        "  hooks have them available. Generated dirs (node_modules, dist, .next, etc.)\n" +
                        "  are excluded.",
                ),
        )
        .action((branch: string, base: string | undefined, opts: { foreground?: boolean }) => {
            const root = requireRoot();
            const config = loadConfig(root);
            const defBranch = git.defaultBranch(root);

            // Directory name: replace / with - to keep it flat
            const dirName = branch.replace(/\//g, "-");
            const worktreeDir = join(root, dirName);

            if (existsSync(worktreeDir)) {
                exitWithError(`Worktree already exists at ${worktreeDir}`);
            }

            // Fetch latest
            output.info("Fetching latest from origin...");
            git.fetch(root);

            // Resolve the start-point for the new branch
            const startPoint = resolveBase(root, base, defBranch);

            // Create worktree with new branch from the resolved base
            output.info(`Creating worktree at ${worktreeDir} with branch ${branch}...`);
            git.worktreeAdd(root, worktreeDir, branch, {
                newBranch: true,
                noTrack: true,
                track: startPoint,
            });

            // Configure upstream tracking before push — works even though origin/<branch>
            // doesn't exist yet (unlike git branch --set-upstream-to).
            git.configureTracking(worktreeDir, branch);

            output.success("Worktree created");
            output.dim(`  Branch:    ${branch}`);
            output.dim(`  Base:      ${startPoint}`);
            output.dim(`  Directory: ${worktreeDir}`);

            // Copy untracked files (e.g. .env) from the default branch worktree before post-create
            copyUntrackedFromDefault(root, defBranch, worktreeDir);

            // Post-create and push ordering:
            // git push triggers pre-push hooks (e.g. husky) that may need
            // dependencies installed by postCreate, so push runs after it.
            if (config.postCreate) {
                runPostCreate({
                    postCreate: config.postCreate,
                    worktreeDir,
                    root,
                    dirName,
                    branchName: branch,
                    foreground: opts.foreground,
                    onForegroundComplete: () => git.push(worktreeDir, branch, true),
                    backgroundCmd: `${config.postCreate}; git -C "${worktreeDir}" push -u origin "${branch}"`,
                    backgroundLabel: "post-create + push",
                });
            } else {
                // No postCreate — push immediately (no hooks needing setup)
                git.push(worktreeDir, branch, true);
            }

            // Output path for shell wrapper to cd into
            process.stdout.write(worktreeDir);

            // If stdout is a TTY, the shell wrapper isn't capturing — hint the user
            if (process.stdout.isTTY) {
                output.dim(`\nRun wt init and source your shell config to auto-cd into worktrees`);
            }
        });
}
