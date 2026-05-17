import type { Command } from "commander";
import { existsSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import * as output from "../lib/output.js";
import { pc, promptTheme } from "../lib/output.js";
import { checkbox, confirm } from "../lib/prompt.js";
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

    repos
        .command("discover")
        .description("Scan a directory tree for wt-managed repos (.bare/) and register any new ones")
        .argument("[dir]", "Directory to scan (default: cwd)")
        .option("--depth <n>", "Max recursion depth", (v) => Number.parseInt(v, 10), 3)
        .option("-y, --yes", "Register every newly-found repo without prompting")
        .addHelpText(
            "after",
            `\n${pc.bold("Non-interactive example:")}\n${pc.dim("  wt repos discover ~/Repos --yes")}`,
        )
        .action(async (dir: string | undefined, opts: { depth: number; yes?: boolean }) => {
            const scanRoot = resolve(dir ?? process.cwd());
            if (!existsSync(scanRoot)) {
                output.error(`Directory not found: ${scanRoot}`);
                process.exit(1);
            }

            const found = scanForBareRepos(scanRoot, opts.depth);
            const existing = new Set(listRepos().map((r) => r.path));
            const candidates = found.filter((p) => !existing.has(p));

            if (candidates.length === 0) {
                output.info(found.length === 0 ? "No wt-managed repos found." : "Nothing new to register.");
                return;
            }

            output.plain(
                `${pc.magenta("📦 found")} ${pc.bold(String(candidates.length))} ${pc.magenta("unregistered repo(s)")}\n`,
            );

            let toRegister: string[];
            if (opts.yes) {
                toRegister = candidates;
            } else {
                toRegister = await checkbox(
                    {
                        message: "Select repos to register:",
                        choices: candidates.map((path) => ({
                            value: path,
                            name: `${pc.cyan(basename(path))}  ${pc.dim(path)}`,
                            checked: true,
                        })),
                        theme: promptTheme,
                    },
                    { output: process.stderr },
                );
            }

            for (const path of toRegister) registerRepo(path);
            output.success(`Registered ${toRegister.length} repo(s).`);
        });
}

const SKIP_DIRS = new Set(["node_modules"]);

function scanForBareRepos(root: string, maxDepth: number): string[] {
    const results: string[] = [];

    function walk(dir: string, depth: number): void {
        let entries: ReturnType<typeof readdirSync>;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }

        // A directory is a wt-managed repo if it contains a .bare/ subdirectory.
        // Once detected, don't descend further — the contents are worktrees, not separate repos.
        if (entries.some((e) => e.isDirectory() && e.name === ".bare")) {
            results.push(dir);
            return;
        }

        if (depth >= maxDepth) return;

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
            walk(join(dir, entry.name), depth + 1);
        }
    }

    walk(root, 0);
    return results;
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
