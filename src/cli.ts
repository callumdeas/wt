#!/usr/bin/env node
import { program } from "commander";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { printBanner } from "./lib/banner.js";
import * as output from "./lib/output.js";
import { pc } from "./lib/output.js";
import { getUpdateNotification, spawnUpdateCheck } from "./lib/update-check.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")) as { name: string; version: string };
const currentVersion = process.env["WT_CURRENT_VERSION"] ?? pkg.version;

// Show update notification after the command — exit handler fires even when commands call process.exit()
const updateNotification = getUpdateNotification(currentVersion);
if (updateNotification) {
    process.on("exit", () => {
        try {
            process.stderr.write(`\n${updateNotification}\n\n`);
        } catch {
            // stderr write failure is silently ignored
        }
    });
}

// Spawn background update check (detached, honours 24h interval)
spawnUpdateCheck();

program.name("wt").description("Git worktree manager for bare-repo workflows").version(currentVersion);

program.configureHelp({
    styleTitle: (str) => pc.bold(str),
    styleCommandText: (str) => pc.bold(pc.cyan(str)),
    styleSubcommandText: (str) => pc.cyan(str),
    styleOptionText: (str) => pc.yellow(str),
    styleArgumentText: (str) => pc.magenta(str),
    styleDescriptionText: (str) => pc.dim(str),
});

program.hook("preAction", () => output.blank());
program.hook("postAction", () => output.blank());

// Only import the module for the subcommand being invoked.
// Falls back to loading all commands for --help, bare `wt`, or unknown subcommands
// so Commander can render full help / its own error messages.
const LOADERS = {
    clone: () => import("./commands/clone.js").then((m) => m.registerClone),
    convert: () => import("./commands/convert.js").then((m) => m.registerConvert),
    new: () => import("./commands/new.js").then((m) => m.registerNew),
    get: () => import("./commands/get.js").then((m) => m.registerGet),
    ls: () => import("./commands/ls.js").then((m) => m.registerLs),
    cd: () => import("./commands/cd.js").then((m) => m.registerCd),
    init: () => import("./commands/init.js").then((m) => m.registerInit),
    rm: () => import("./commands/rm.js").then((m) => m.registerRm),
    repos: () => import("./commands/repos.js").then((m) => m.registerRepos),
    clean: () => import("./commands/clean.js").then((m) => m.registerClean),
};

const ALIASES: Record<string, keyof typeof LOADERS> = { list: "ls", remove: "rm" };

const subArg = process.argv[2];
const subKey = subArg && !subArg.startsWith("-") ? (ALIASES[subArg] ?? subArg) : undefined;
const loader = subKey && subKey in LOADERS ? LOADERS[subKey as keyof typeof LOADERS] : undefined;

if (loader) {
    const register = await loader();
    register(program);
} else {
    const registers = await Promise.all(Object.values(LOADERS).map((l) => l()));
    for (const register of registers) register(program);
}

if (process.argv.length <= 2) {
    printBanner();
}

try {
    await program.parseAsync();
} catch (err: unknown) {
    const name = err instanceof Error ? err.name : "";
    if (name === "AbortPromptError" || name === "CancelPromptError") {
        output.dim("\nCancelled");
        process.exitCode = 0;
    } else if (name === "ExitPromptError") {
        output.dim("\nCancelled");
        process.exitCode = 130;
    } else {
        throw err;
    }
}
