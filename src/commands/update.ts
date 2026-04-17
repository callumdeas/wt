import type { Command } from "commander";
import { loadConfig } from "../lib/config.js";
import * as git from "../lib/git.js";
import * as output from "../lib/output.js";
import { requireRoot } from "../lib/root.js";

export function registerUpdate(program: Command): void {
    program
        .command("update")
        .description("Merge the latest default branch into the current branch")
        .action(() => {
            const root = requireRoot();
            loadConfig(root); // trigger migration if needed
            const defBranch = git.defaultBranch(root);

            output.info("Fetching latest from origin...");
            git.fetch(root);

            output.info(`Merging origin/${defBranch} into current branch...`);
            git.merge(process.cwd(), `origin/${defBranch}`);
        });
}
