import type { Command } from "commander";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { prepareLogFile, spawnBackground } from "../lib/background.js";
import { loadConfig } from "../lib/config.js";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
import { pc, promptTheme } from "../lib/output.js";
import { select } from "../lib/prompt.js";
import { requireRoot } from "../lib/root.js";

export function registerGet(program: Command): void {
    program
        .command("get")
        .description("Check out an existing branch into a worktree and cd into it")
        .argument("<pattern>", "Branch name or pattern to search for")
        .option("--first", "Auto-select first match (skip interactive selection)")
        .option("--exact", "Require exact branch name match (skip interactive selection)")
        .option(
            "--foreground",
            "Run post-create in foreground (blocks until done; auto-enabled in non-interactive sessions)",
        )
        .addHelpText(
            "after",
            `\n${pc.bold("Scripting notes:")}\n` +
                pc.dim(
                    "  Use --exact or --first to avoid interactive branch selection.\n" +
                        "  Outputs the worktree path to stdout for the shell wrapper.\n" +
                        "  In scripts, use `command wt get <branch>` to capture the path directly.\n" +
                        "  Without --foreground, post-create runs in background — the worktree may not\n" +
                        "  be fully set up (e.g. node_modules) when the command returns.\n" +
                        "  Non-interactive sessions (no TTY) auto-enable --foreground.",
                ),
        )
        .action(async (pattern: string, opts: { first?: boolean; exact?: boolean; foreground?: boolean }) => {
            const root = requireRoot();
            const config = loadConfig(root);

            // Fetch latest
            output.info("Fetching latest from origin...");
            git.fetch(root);

            // Find matching branches — prefer remote, fall back to local-only
            const remoteBranches = git.branchListRemote(root);
            let matches: string[];

            if (opts.exact) {
                matches = remoteBranches.filter((b) => b === pattern);
            } else {
                const lowerPattern = pattern.toLowerCase();
                matches = remoteBranches.filter((b) => b.toLowerCase().includes(lowerPattern));
            }

            if (matches.length === 0) {
                const localBranches = git.branchListLocal(root);
                if (opts.exact) {
                    matches = localBranches.filter((b) => b === pattern);
                } else {
                    const lowerPattern = pattern.toLowerCase();
                    matches = localBranches.filter((b) => b.toLowerCase().includes(lowerPattern));
                }
                if (matches.length > 0) {
                    output.dim("No remote branch found — matched local branch");
                }
            }

            if (matches.length === 0) {
                output.error(`No branch found matching: ${pattern}`);
                output.dim("Available remote branches:");
                remoteBranches.slice(0, 20).forEach((b) => output.dim(`  ${b}`));
                process.exit(1);
            }

            // Select branch
            let branchName: string;
            if (matches.length === 1) {
                branchName = matches[0];
            } else if (opts.first) {
                branchName = matches[0];
                output.info(`Multiple matches found, auto-selecting first: ${branchName}`);
            } else {
                branchName = await select(
                    {
                        message: "Multiple branches found:",
                        choices: matches.map((b) => ({ value: b, name: pc.cyan(b) })),
                        theme: promptTheme,
                    },
                    { output: process.stderr },
                );
            }

            // Extract directory name — try ticket pattern first
            let dirName: string;
            const ticketMatch = branchName.match(/([A-Z]+-\d+)/);
            if (ticketMatch) {
                dirName = ticketMatch[1];
            } else {
                dirName = branchName.replace(/\//g, "-");
            }

            const worktreeDir = join(root, dirName);

            if (existsSync(worktreeDir)) {
                output.error(`Worktree already exists at ${worktreeDir}`);
                output.dim(`Use: wt cd ${dirName}`);
                process.exit(1);
            }

            // Create worktree tracking the remote branch
            output.info(`Creating worktree at ${worktreeDir} for branch ${branchName}...`);

            if (git.branchExists(root, branchName)) {
                git.worktreeAdd(root, worktreeDir, branchName);
            } else {
                git.worktreeAdd(root, worktreeDir, branchName, { track: `origin/${branchName}` });
            }

            // Set upstream
            git.setUpstream(worktreeDir, branchName);

            output.success("Worktree created");
            output.dim(`  Branch:    ${branchName}`);
            output.dim(`  Directory: ${worktreeDir}`);

            // Run post-create
            if (config.postCreate) {
                const runForeground = opts.foreground || !process.stdin.isTTY;
                if (runForeground) {
                    output.info("Running post-create...");
                    output.dim(`  Command: ${config.postCreate}`);
                    execSync(config.postCreate, { cwd: worktreeDir, stdio: "inherit" });
                    output.success("Post-create complete");
                } else {
                    const logFile = prepareLogFile(root, dirName);
                    try {
                        spawnBackground({
                            cmd: config.postCreate,
                            cwd: worktreeDir,
                            logFile,
                            notifyTitle: "wt",
                            notifyMessage: `Setup complete for ${branchName}`,
                        });
                        output.info("Running post-create in background — you can start working now");
                        output.dim(`  Command: ${config.postCreate}`);
                        output.dim(`  Log:     ${logFile}`);
                    } catch {
                        output.warn("Could not start background setup — run wt setup manually");
                    }
                }
            }

            // Output path for shell wrapper to cd into
            process.stdout.write(worktreeDir);

            // If stdout is a TTY, the shell wrapper isn't capturing — hint the user
            if (process.stdout.isTTY) {
                output.dim(`\nRun wt init and source your shell config to auto-cd into worktrees`);
            }
        });
}
