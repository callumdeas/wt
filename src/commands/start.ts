import type { Command } from "commander";
import { execSync } from "node:child_process";
import { loadConfig } from "../lib/config.js";
import * as output from "../lib/output.js";
import { requireRoot } from "../lib/root.js";

export function registerStart(program: Command): void {
    program
        .command("start")
        .description("Run pre-start hook (if configured) then start the dev server")
        .action(() => {
            const root = requireRoot();
            const config = loadConfig(root);

            if (!config.startCmd) {
                output.error("No startCmd configured. Run: wt config --start-cmd 'yarn dev'");
                process.exit(1);
            }

            // Run pre-start hook if configured
            if (config.preStart) {
                output.info(`Running pre-start: ${config.preStart}`);
                execSync(config.preStart, { cwd: process.cwd(), stdio: "inherit" });
            }

            output.success(`Starting: ${config.startCmd}`);
            execSync(config.startCmd, { cwd: process.cwd(), stdio: "inherit" });
        });
}
