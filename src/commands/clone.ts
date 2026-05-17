import type { Command } from "commander";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { postSetupFlow } from "../lib/config.js";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
import { registerRepo } from "../lib/registry.js";

export function registerClone(program: Command): void {
    program
        .command("clone")
        .description("Clone a repository into a bare worktree structure")
        .argument("<url>", "Git repository URL")
        .argument("[directory]", "Target directory name")
        .option("--no-config", "Skip .worktreerc.json creation")
        .option("--post-create <cmd>", "Set post-create command")
        .option("--editor <cmd>", "Set editor command (code, cursor, vim, nvim, zed)")
        .option("--workspace-mode", "Enable workspace mode")
        .option("--no-workspace-mode", "Disable workspace mode")
        .option("--install", "Run post-create after clone")
        .option("--no-install", "Skip post-create after clone")
        .action(
            async (
                url: string,
                directory: string | undefined,
                opts: {
                    config?: boolean;
                    postCreate?: string;
                    editor?: string;
                    workspaceMode?: boolean;
                    install?: boolean;
                },
            ) => {
                const dir = directory ?? basename(url, ".git");
                const absDir = resolve(dir);

                if (existsSync(absDir)) {
                    output.error(`Directory '${dir}' already exists`);
                    process.exit(1);
                }

                output.info(`Creating bare worktree structure in ${dir}...`);

                // Create directory and clone bare
                mkdirSync(absDir, { recursive: true });
                try {
                    git.cloneBare(url, `${absDir}/.bare`);
                } catch {
                    output.error("Failed to clone repository");
                    execSync(`rm -rf "${absDir}"`);
                    process.exit(1);
                }

                // Configure remote fetch refs
                git.configSet(`${absDir}/.bare`, "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*");

                // Fetch to populate remote refs
                output.info("Fetching remote refs...");
                git.fetch(absDir);

                // Ensure origin/HEAD is set so defaultBranch can detect non-standard defaults
                git.remoteSetHead(absDir);

                // Detect default branch
                const defBranch = git.defaultBranch(absDir);
                output.info(`Default branch detected: ${defBranch}`);

                // Create worktree for default branch
                const worktreeDir = `${absDir}/${defBranch}`;
                output.info(`Creating worktree at ${worktreeDir}...`);

                try {
                    git.worktreeAdd(absDir, worktreeDir, defBranch);
                } catch {
                    // Branch may not exist locally yet, track from remote
                    git.worktreeAdd(absDir, worktreeDir, defBranch, { track: `origin/${defBranch}` });
                }

                output.blank();
                output.success("Repository cloned");
                output.dim(`  Root:     ${absDir}`);
                output.dim(`  Bare:     ${absDir}/.bare`);
                output.dim(`  Worktree: ${worktreeDir}`);
                output.blank();
                try {
                    registerRepo(absDir);
                } catch {
                    /* best-effort — never fail a clone */
                }

                await postSetupFlow(absDir, worktreeDir, opts);
            },
        );
}
