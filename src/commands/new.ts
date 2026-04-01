import type { Command } from "commander";
import { execSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../lib/config.js";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
import { requireRoot } from "../lib/root.js";
import { workspaceAdd } from "../lib/workspace.js";

export function registerNew(program: Command): void {
    program
        .command("new")
        .description("Create a new worktree with a new branch from the default branch")
        .argument("<branch>", "Branch name to create")
        .action((branch: string) => {
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
            console.log("Fetching latest from origin...");
            git.fetch(root);

            // Create worktree with new branch from default branch
            console.log(`Creating worktree at ${worktreeDir} with branch ${branch}...`);
            git.worktreeAdd(root, worktreeDir, branch, {
                newBranch: true,
                track: `origin/${defBranch}`,
            });

            output.success("Worktree created");
            output.dim(`  Branch:    ${branch}`);
            output.dim(`  Directory: ${worktreeDir}`);

            // Copy .claude folder from default branch worktree if it exists
            const defaultWorktree = join(root, defBranch);
            const claudeDir = join(defaultWorktree, ".claude");
            if (existsSync(claudeDir)) {
                cpSync(claudeDir, join(worktreeDir, ".claude"), { recursive: true });
                output.dim(`  Copied:    .claude from ${defBranch}`);
            }

            // Run post-create command if configured
            if (config.postCreate) {
                console.log(`Running post-create: ${config.postCreate}`);
                execSync(config.postCreate, { cwd: worktreeDir, stdio: "inherit" });
            }

            // Set upstream
            git.push(worktreeDir, branch, true);

            // Add to workspace if enabled
            if (config.workspaceMode) {
                workspaceAdd(root, worktreeDir);
            }
        });
}
