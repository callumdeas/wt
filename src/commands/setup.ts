import type { Command } from "commander";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../lib/config.js";
import * as output from "../lib/output.js";
import { requireRoot } from "../lib/root.js";

export function registerSetup(program: Command): void {
    program
        .command("setup")
        .description("Run the post-create command in the current or specified worktree")
        .option("--dir <path>", "Worktree directory to run setup in (defaults to current directory)")
        .action((opts: { dir?: string }) => {
            const root = requireRoot();
            const config = loadConfig(root);

            if (!config.postCreate) {
                output.error("No postCreate command configured");
                output.dim("  Run wt config to set one up");
                process.exit(1);
            }

            const targetDir = opts.dir ? resolve(opts.dir) : process.cwd();

            if (!existsSync(targetDir)) {
                output.error(`Directory does not exist: ${targetDir}`);
                process.exit(1);
            }

            output.info(`Running post-create in ${targetDir}...`);
            output.dim(`  Command: ${config.postCreate}`);

            execSync(config.postCreate, { cwd: targetDir, stdio: "inherit" });

            output.success("Setup complete");
        });
}
