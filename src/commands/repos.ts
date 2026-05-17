import type { Command } from "commander";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import * as output from "../lib/output.js";
import { pc } from "../lib/output.js";
import { confirm } from "../lib/prompt.js";
import { listRepos, registerRepo, unregisterRepo } from "../lib/registry.js";
import { findRoot } from "../lib/root.js";

export function registerRepos(program: Command): void {
    const repos = program.command("repos").description("Manage registered repositories");

    repos.action(() => listAction());

    repos
        .command("list")
        .description("List all registered repositories")
        .action(() => listAction());

    repos
        .command("add")
        .description("Register a repository (default: current directory)")
        .argument("[path]", "Path to bare repo root (default: cwd)")
        .option("--name <alias>", "Override the display name")
        .action((repoPath: string | undefined, opts: { name?: string }) => {
            const target = resolve(repoPath ?? process.cwd());

            if (!existsSync(join(target, ".bare"))) {
                output.error(`Not a wt-managed repository (no .bare found): ${target}`);
                process.exit(1);
            }

            registerRepo(target, opts.name);
            output.success(`Registered: ${target}`);
        });

    repos
        .command("rm")
        .description("Remove a repository from the registry")
        .argument("<name-or-path>", "Name or path of repo to remove")
        .option("-y, --yes", "Skip confirmation")
        .action(async (target: string, opts: { yes?: boolean }) => {
            const all = listRepos();
            const abs = resolve(target);
            const match = all.find((r) => r.path === abs || r.name === target);

            if (!match) {
                output.error(`Not found in registry: ${target}`);
                process.exit(1);
            }

            if (!opts.yes) {
                const ok = await confirm(
                    { message: `Remove ${pc.cyan(match.name)} (${match.path})?`, default: false },
                    { output: process.stderr },
                );
                if (!ok) {
                    output.dim("Cancelled.");
                    return;
                }
            }

            unregisterRepo(match.path);
            output.success(`Removed: ${match.name}`);
        });
}

function listAction(): void {
    const repos = listRepos();
    const currentRoot = findRoot();

    if (repos.length === 0) {
        output.info("No repositories registered.");
        output.dim("  Use: wt repos add [path]");
        return;
    }

    output.plain(`${pc.magenta("📦 registered repositories")}\n`);

    const maxLen = Math.max(...repos.map((r) => r.name.length));
    for (const repo of repos) {
        const isCurrent = repo.path === currentRoot;
        const indicator = isCurrent ? pc.green("●") : " ";
        const name = isCurrent ? pc.bold(pc.cyan(repo.name.padEnd(maxLen))) : pc.cyan(repo.name.padEnd(maxLen));
        output.plain(`    ${indicator} ${name}  ${pc.dim(repo.path)}`);
    }
}
