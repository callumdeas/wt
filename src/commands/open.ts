import type { Command } from "commander";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../lib/config.js";
import * as output from "../lib/output.js";
import { requireRoot } from "../lib/root.js";
import { workspaceAdd, workspaceFilePath } from "../lib/workspace.js";

export function registerOpen(program: Command): void {
    program
        .command("open")
        .description("Open a worktree in the configured editor")
        .argument("[name]", "Worktree directory name (current worktree if omitted)")
        .action((name?: string) => {
            const root = requireRoot();
            const config = loadConfig(root);

            // Determine target
            let target: string;
            if (name) {
                target = join(root, name);
                if (!existsSync(target)) {
                    output.error(`Worktree not found: ${target}`);
                    process.exit(1);
                }
            } else {
                const cwd = process.cwd();
                if (cwd.startsWith(root + "/") && cwd !== root) {
                    target = cwd;
                } else {
                    // At repo root — open directly
                    execSync(`${config.editor} .`, { stdio: "inherit" });
                    return;
                }
            }

            if (config.workspaceMode) {
                workspaceAdd(root, target);
                const wsFile = workspaceFilePath(root);
                execSync(`${config.editor} "${wsFile}"`, { stdio: "inherit" });
            } else {
                execSync(`${config.editor} "${target}"`, { stdio: "inherit" });
            }
        });
}
