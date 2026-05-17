import type { Command } from "commander";
import { execSync } from "node:child_process";
import { configExists, interactiveConfig, loadConfig, saveConfig } from "../lib/config.js";
import * as output from "../lib/output.js";
import { promptTheme } from "../lib/output.js";
import { confirm } from "../lib/prompt.js";
import { requireRoot } from "../lib/root.js";

export function registerConfig(program: Command): void {
    program
        .command("config")
        .description("Configure .worktreerc.json for the current repository")
        .option("--post-create <cmd>", "Set post-create command")
        .option("--editor <cmd>", "Set editor command (code, cursor, vim, nvim, zed)")
        .option("--workspace-mode", "Enable workspace mode")
        .option("--no-workspace-mode", "Disable workspace mode")
        .option("--pre-start <cmd>", "Set pre-start command (runs before dev server)")
        .option("--start-cmd <cmd>", "Set start command (dev server)")
        .option("--no-install", "Skip running post-create after config")
        .action(
            async (opts: {
                postCreate?: string;
                editor?: string;
                workspaceMode?: boolean;
                preStart?: string;
                startCmd?: string;
                install?: boolean;
            }) => {
                const root = requireRoot();

                // Check if any batch flags were provided
                const hasBatchFlags =
                    opts.postCreate !== undefined ||
                    opts.editor !== undefined ||
                    opts.workspaceMode !== undefined ||
                    opts.preStart !== undefined ||
                    opts.startCmd !== undefined;

                if (hasBatchFlags) {
                    // Batch mode: merge flags with existing config
                    const existing = loadConfig(root);

                    if (opts.postCreate !== undefined) existing.postCreate = opts.postCreate;
                    if (opts.editor !== undefined) existing.editor = opts.editor;
                    if (opts.workspaceMode !== undefined) existing.workspaceMode = opts.workspaceMode;
                    if (opts.preStart !== undefined) existing.preStart = opts.preStart;
                    if (opts.startCmd !== undefined) existing.startCmd = opts.startCmd;

                    saveConfig(root, existing);
                    output.success("Updated .worktreerc.json");
                    output.plain(JSON.stringify(existing, null, 2));
                    return;
                }

                // Interactive mode
                if (configExists(root)) {
                    const current = loadConfig(root);
                    output.info("Current config:");
                    output.plain(JSON.stringify(current, null, 2));
                    output.blank();

                    const reconfigure = await confirm(
                        { message: "Reconfigure?", default: true, theme: promptTheme },
                        { output: process.stderr },
                    );
                    if (!reconfigure) return;
                }

                // Scan the user's current worktree for manifests so the
                // post-create prompt can offer concrete suggestions instead
                // of a blind free-form input.
                const config = await interactiveConfig(root, process.cwd());

                // Offer to run post-create
                if (config.postCreate && opts.install !== false) {
                    const run = await confirm(
                        {
                            message: `Run post-create command: ${config.postCreate}?`,
                            default: true,
                            theme: promptTheme,
                        },
                        { output: process.stderr },
                    );
                    if (run) {
                        output.dim(`Running: ${config.postCreate}`);
                        execSync(config.postCreate, { cwd: process.cwd(), stdio: "inherit" });
                    }
                }
            },
        );
}
