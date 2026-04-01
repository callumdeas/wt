import type { Command } from "commander";
import { execSync } from "node:child_process";
import { loadConfig } from "../lib/config.js";
import * as output from "../lib/output.js";
import { requireRoot } from "../lib/root.js";

export function registerStart(program: Command): void {
    program
        .command("start")
        .description("Kill process on configured port and start the dev server")
        .action(() => {
            const root = requireRoot();
            const config = loadConfig(root);

            if (!config.startCmd) {
                output.error("No startCmd configured. Run: wt config --start-cmd 'yarn dev'");
                process.exit(1);
            }

            // Kill existing process on port if configured
            if (config.startKillPort) {
                try {
                    const pids = execSync(`lsof -ti:${config.startKillPort}`, { encoding: "utf-8" }).trim();
                    if (pids) {
                        output.info(`Killing process on port ${config.startKillPort}...`);
                        execSync(`echo "${pids}" | xargs kill -9`, { stdio: "inherit" });
                    }
                } catch {
                    // No process on port — that's fine
                }
            }

            output.success(`Starting: ${config.startCmd}`);
            execSync(config.startCmd, { cwd: process.cwd(), stdio: "inherit" });
        });
}
