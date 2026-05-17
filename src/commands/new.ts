import type { Command } from "commander";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { prepareLogFile, spawnBackground } from "../lib/background.js";
import { loadConfig } from "../lib/config.js";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
import { pc } from "../lib/output.js";
import { requireRoot } from "../lib/root.js";
import { workspaceAdd } from "../lib/workspace.js";

/**
 * Resolve the start-point ref for a new worktree branch.
 * Prefers remote tracking branch; falls back to local branch.
 */
function resolveBase(root: string, base: string | undefined, defBranch: string): string {
    if (!base) return `origin/${defBranch}`;
    if (git.remoteBranchExists(root, base)) return `origin/${base}`;
    if (git.branchExists(root, base)) return base;
    output.error(`Branch "${base}" not found locally or on origin`);
    process.exit(1);
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
                output.error(`Worktree already exists at ${worktreeDir}`);
                process.exit(1);
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

            // Add to workspace if enabled (synchronous — must complete before exit)
            if (config.workspaceMode) {
                workspaceAdd(root, worktreeDir);
            }

            // Post-create and push ordering:
            // git push triggers pre-push hooks (e.g. husky) that may need
            // dependencies installed by postCreate, so push runs after it.
            if (config.postCreate) {
                const runForeground = opts.foreground || !process.stdin.isTTY;
                if (runForeground) {
                    output.info("Running post-create...");
                    output.dim(`  Command: ${config.postCreate}`);
                    try {
                        execSync(config.postCreate, { cwd: worktreeDir, stdio: "inherit" });
                        output.success("Post-create complete");
                    } catch {
                        output.warn("Post-create failed — continuing with push");
                    }
                    git.push(worktreeDir, branch, true);
                } else {
                    const logFile = prepareLogFile(root, dirName);
                    const pushCmd = `git -C "${worktreeDir}" push -u origin "${branch}"`;
                    try {
                        spawnBackground({
                            cmd: `${config.postCreate}; ${pushCmd}`,
                            cwd: worktreeDir,
                            logFile,
                            notifyTitle: "wt",
                            notifyMessage: `Setup complete for ${branch}`,
                        });
                        output.info("Running post-create + push in background — you can start working now");
                        output.dim(`  Command: ${config.postCreate}`);
                        output.dim(`  Log:     ${logFile}`);
                        output.dim("  Run wt setup to re-run manually if needed");
                    } catch {
                        output.warn("Could not start background setup — run wt setup manually");
                    }
                }
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
