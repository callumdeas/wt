import { select } from "@inquirer/prompts";
import type { Command } from "commander";
import { execSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../lib/config.js";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
import { requireRoot } from "../lib/root.js";
import { workspaceAdd } from "../lib/workspace.js";

export function registerGet(program: Command): void {
    program
        .command("get")
        .description("Check out an existing remote branch into a worktree")
        .argument("<pattern>", "Branch name or pattern to search for")
        .option("--first", "Auto-select first match when multiple branches found")
        .option("--exact", "Require exact branch name match")
        .action(async (pattern: string, opts: { first?: boolean; exact?: boolean }) => {
            const root = requireRoot();
            const config = loadConfig(root);
            const defBranch = git.defaultBranch(root);

            // Fetch latest
            console.log("Fetching latest from origin...");
            git.fetch(root);

            // Find matching remote branches
            const remoteBranches = git.branchListRemote(root);
            let matches: string[];

            if (opts.exact) {
                matches = remoteBranches.filter((b) => b === pattern);
            } else {
                const lowerPattern = pattern.toLowerCase();
                matches = remoteBranches.filter((b) => b.toLowerCase().includes(lowerPattern));
            }

            if (matches.length === 0) {
                output.error(`No remote branch found matching: ${pattern}`);
                console.log("Available remote branches:");
                remoteBranches.slice(0, 20).forEach((b) => console.log(`  ${b}`));
                process.exit(1);
            }

            // Select branch
            let branchName: string;
            if (matches.length === 1) {
                branchName = matches[0];
            } else if (opts.first) {
                branchName = matches[0];
                console.log(`Multiple matches found, auto-selecting first: ${branchName}`);
            } else {
                branchName = await select({
                    message: "Multiple branches found:",
                    choices: matches.map((b) => ({ value: b, name: b })),
                });
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
                console.log(`Use: wt cd ${dirName}`);
                process.exit(1);
            }

            // Create worktree tracking the remote branch
            console.log(`Creating worktree at ${worktreeDir} for branch ${branchName}...`);

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

            // Copy .claude folder
            const defaultWorktree = join(root, defBranch);
            const claudeDir = join(defaultWorktree, ".claude");
            if (existsSync(claudeDir)) {
                cpSync(claudeDir, join(worktreeDir, ".claude"), { recursive: true });
                output.dim(`  Copied:    .claude from ${defBranch}`);
            }

            // Run post-create
            if (config.postCreate) {
                console.log(`Running post-create: ${config.postCreate}`);
                execSync(config.postCreate, { cwd: worktreeDir, stdio: "inherit" });
            }

            // Add to workspace
            if (config.workspaceMode) {
                workspaceAdd(root, worktreeDir);
            }
        });
}
