import { confirm } from "@inquirer/prompts";
import type { Command } from "commander";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { WtConfig } from "../lib/config.js";
import { interactiveConfig, loadConfig, saveConfig } from "../lib/config.js";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";

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

                console.log(`Creating bare worktree structure in ${dir}...`);

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
                console.log("Fetching remote refs...");
                execSync(`git -C "${absDir}/.bare" fetch origin`, { stdio: "inherit" });

                // Detect default branch
                const defBranch = git.defaultBranch(absDir);
                console.log(`Default branch detected: ${defBranch}`);

                // Create worktree for default branch
                const worktreeDir = `${absDir}/${defBranch}`;
                console.log(`Creating worktree at ${worktreeDir}...`);

                try {
                    git.worktreeAdd(absDir, worktreeDir, defBranch);
                } catch {
                    // Branch may not exist locally yet, track from remote
                    git.worktreeAdd(absDir, worktreeDir, defBranch, { track: `origin/${defBranch}` });
                }

                console.log();
                output.success("Repository cloned");
                output.dim(`  Root:     ${absDir}`);
                output.dim(`  Bare:     ${absDir}/.bare`);
                output.dim(`  Worktree: ${worktreeDir}`);
                console.log();

                // Config creation
                if (opts.config === false) {
                    // --no-config: skip entirely
                } else if (
                    opts.postCreate !== undefined ||
                    opts.editor !== undefined ||
                    opts.workspaceMode !== undefined
                ) {
                    // Batch mode: create config from flags
                    const config: WtConfig = {
                        postCreate: opts.postCreate ?? "",
                        editor: opts.editor ?? "code",
                        workspaceMode: opts.workspaceMode ?? true,
                        startCmd: "",
                        startKillPort: null,
                    };
                    saveConfig(absDir, config);
                    console.log(`Created .worktreerc.json`);
                } else {
                    // Interactive config
                    await interactiveConfig(absDir);
                }

                // Run post-create if configured
                const config = loadConfig(absDir);
                if (config.postCreate) {
                    if (opts.install === false) {
                        console.log("Skipping post-create command (--no-install)");
                    } else if (opts.install === true) {
                        console.log(`Running: ${config.postCreate}`);
                        execSync(config.postCreate, { cwd: worktreeDir, stdio: "inherit" });
                    } else {
                        // Interactive
                        const run = await confirm({
                            message: `Run post-create command: ${config.postCreate}?`,
                            default: true,
                        });
                        if (run) {
                            console.log(`Running: ${config.postCreate}`);
                            execSync(config.postCreate, { cwd: worktreeDir, stdio: "inherit" });
                        }
                    }
                }
            },
        );
}
