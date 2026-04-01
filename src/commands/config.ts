import { confirm } from "@inquirer/prompts";
import type { Command } from "commander";
import { execSync } from "node:child_process";
import { configExists, interactiveConfig, loadConfig, saveConfig } from "../lib/config.js";
import * as output from "../lib/output.js";
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
                    console.log(JSON.stringify(existing, null, 2));
                    return;
                }

                // Interactive mode
                if (configExists(root)) {
                    const current = loadConfig(root);
                    console.log("Current config:");
                    console.log(JSON.stringify(current, null, 2));
                    console.log();

                    const reconfigure = await confirm({ message: "Reconfigure?", default: true });
                    if (!reconfigure) return;
                }

                const config = await interactiveConfig(root);

                // Offer to run post-create
                if (config.postCreate && opts.install !== false) {
                    const run = await confirm({
                        message: `Run post-create command: ${config.postCreate}?`,
                        default: true,
                    });
                    if (run) {
                        console.log(`Running: ${config.postCreate}`);
                        execSync(config.postCreate, { cwd: process.cwd(), stdio: "inherit" });
                    }
                }
            },
        );
}
