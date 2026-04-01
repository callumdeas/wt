import type { Command } from "commander";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadConfig } from "../lib/config.js";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
import { requireRoot } from "../lib/root.js";
import { workspaceFilePath, workspaceReset, workspaceSync } from "../lib/workspace.js";

export function registerWorkspace(program: Command): void {
    const ws = program.command("workspace").description("Manage the multi-root workspace file");

    ws.command("sync")
        .description("Rebuild workspace file from all existing worktrees")
        .action(() => {
            const root = requireRoot();
            const entries = git.worktreeList(root);
            const paths = entries.map((e) => e.path);

            workspaceSync(root, paths);

            const filePath = workspaceFilePath(root);
            console.log("Synced workspace file with existing worktrees:");
            for (const e of entries) {
                console.log(`  Added: ${e.dirname}`);
            }
            output.success(`Workspace file updated: ${filePath}`);
        });

    ws.command("open")
        .description("Open the workspace file in editor")
        .action(() => {
            const root = requireRoot();
            const config = loadConfig(root);
            const filePath = workspaceFilePath(root);

            if (!existsSync(filePath)) {
                output.error("Workspace file not found. Run 'wt workspace sync' first.");
                process.exit(1);
            }

            execSync(`${config.editor} "${filePath}"`, { stdio: "inherit" });
        });

    ws.command("reset")
        .description("Delete the workspace file")
        .action(() => {
            const root = requireRoot();
            const deleted = workspaceReset(root);
            if (deleted) {
                output.success(`Workspace file deleted: ${workspaceFilePath(root)}`);
            } else {
                console.log("No workspace file to delete.");
            }
        });
}
