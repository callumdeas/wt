import { confirm } from "@inquirer/prompts";
import type { Command } from "commander";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { postSetupFlow } from "../lib/config.js";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";

const STAGING_DIR = "._wt_tmp";
const SKIP_ENTRIES = new Set([".bare", STAGING_DIR]);

export function registerConvert(program: Command): void {
    program
        .command("convert")
        .description("Convert an existing git clone into a bare worktree structure")
        .option("--no-config", "Skip .worktreerc.json creation")
        .option("--post-create <cmd>", "Set post-create command")
        .option("--editor <cmd>", "Set editor command (code, cursor, vim, nvim, zed)")
        .option("--workspace-mode", "Enable workspace mode")
        .option("--no-workspace-mode", "Disable workspace mode")
        .option("--install", "Run post-create after conversion")
        .option("--no-install", "Skip post-create after conversion")
        .action(
            async (opts: {
                config?: boolean;
                postCreate?: string;
                editor?: string;
                workspaceMode?: boolean;
                install?: boolean;
            }) => {
                const root = resolve(process.cwd());
                const bareDir = join(root, ".bare");
                const stagingDir = join(root, STAGING_DIR);

                // --- Validation ---
                if (!git.isNormalGitRepo(root)) {
                    output.error("Not a git repository (no .git directory found)");
                    process.exit(1);
                }

                if (existsSync(bareDir)) {
                    output.error("Already a wt-managed repository (.bare exists)");
                    process.exit(1);
                }

                if (!git.isCleanWorkingTree(root)) {
                    output.error("Working tree has uncommitted changes. Commit or stash before running wt convert.");
                    process.exit(1);
                }

                console.log();
                output.warn("This will restructure the repository into a bare worktree layout.");
                output.warn("Only the default branch worktree will be created.");
                output.warn("Use `wt get <branch>` afterwards to check out other branches.");
                console.log();

                const proceed = await confirm({
                    message: "Continue with conversion?",
                    default: true,
                });
                if (!proceed) process.exit(0);

                console.log();
                console.log("Converting to bare worktree structure...");

                // --- Structural conversion (.git → .bare, worktree creation) ---
                // Only this block triggers rollback on failure. Config and post-create
                // are handled separately since the conversion is already complete.
                let worktreeDir: string;
                let filesStaged = false;
                let worktreeCreated = false;
                try {
                    renameSync(join(root, ".git"), bareDir);

                    git.configSet(bareDir, "core.bare", "true");
                    git.configSet(bareDir, "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*");

                    console.log("Fetching remote refs...");
                    git.fetch(root);

                    // Ensure origin/HEAD is set so defaultBranch can detect non-standard defaults
                    git.remoteSetHead(root);

                    const defBranch = git.defaultBranch(root);
                    console.log(`Default branch detected: ${defBranch}`);

                    // --- Stage existing files out of root ---
                    const entries = readdirSync(root).filter((e) => !SKIP_ENTRIES.has(e));
                    mkdirSync(stagingDir, { recursive: true });
                    for (const entry of entries) {
                        renameSync(join(root, entry), join(stagingDir, entry));
                    }
                    filesStaged = true;

                    // --- Create worktree for default branch ---
                    worktreeDir = join(root, defBranch);
                    console.log(`Creating worktree at ${worktreeDir}...`);

                    try {
                        git.worktreeAdd(root, worktreeDir, defBranch);
                    } catch {
                        git.worktreeAdd(root, worktreeDir, defBranch, { track: `origin/${defBranch}` });
                    }
                    worktreeCreated = true;

                    // --- Clean up staging ---
                    rmSync(stagingDir, { recursive: true, force: true });
                } catch (err) {
                    // --- Rollback ---
                    output.warn("Conversion failed — rolling back...");

                    // Remove worktree registration if it was created
                    if (worktreeCreated) {
                        try {
                            git.worktreeRemove(root, worktreeDir!, true);
                        } catch {
                            // Best-effort: prune stale entries
                            try {
                                git.worktreePrune(root);
                            } catch {
                                /* best-effort */
                            }
                        }
                    }

                    // Restore staged files
                    if (filesStaged && existsSync(stagingDir)) {
                        try {
                            for (const entry of readdirSync(stagingDir)) {
                                renameSync(join(stagingDir, entry), join(root, entry));
                            }
                            rmSync(stagingDir, { recursive: true, force: true });
                        } catch {
                            output.error(`Could not restore files from ${STAGING_DIR}. Manual recovery may be needed.`);
                        }
                    }

                    // Restore .git
                    if (existsSync(bareDir) && !existsSync(join(root, ".git"))) {
                        try {
                            renameSync(bareDir, join(root, ".git"));
                            git.configSet(join(root, ".git"), "core.bare", "false");
                        } catch {
                            output.error("Could not restore .git directory. Manual recovery may be needed.");
                        }
                    }

                    output.error(`Conversion failed: ${(err as Error).message}`);
                    process.exit(1);
                }

                // --- Post-conversion steps (non-rollbackable) ---
                console.log();
                output.success("Repository converted");
                output.dim(`  Root:     ${root}`);
                output.dim(`  Bare:     ${bareDir}`);
                output.dim(`  Worktree: ${worktreeDir}`);
                console.log();

                await postSetupFlow(root, worktreeDir, opts);

                // --- Next steps ---
                console.log();
                output.success("Next steps:");
                output.dim(`  cd ${worktreeDir}`);
                output.dim(`  wt get <branch>          Check out branches you were working on`);
                output.dim(`  wt new <branch>          Create a new branch`);
                output.dim(`  wt ls                    List all worktrees`);
            },
        );
}
