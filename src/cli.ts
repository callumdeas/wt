#!/usr/bin/env node
import { program } from "commander";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import updateNotifier from "update-notifier";
import { fileURLToPath } from "url";
import { registerCd } from "./commands/cd.js";
import { registerClone } from "./commands/clone.js";
import { registerConfig } from "./commands/config.js";
import { registerConvert } from "./commands/convert.js";
import { registerGet } from "./commands/get.js";
import { registerInit } from "./commands/init.js";
import { registerLs } from "./commands/ls.js";
import { registerNew } from "./commands/new.js";
import { registerOpen } from "./commands/open.js";
import { registerRm } from "./commands/rm.js";
import { registerSetup } from "./commands/setup.js";
import { registerStart } from "./commands/start.js";
import { registerUpdate } from "./commands/update.js";
import { registerWorkspace } from "./commands/workspace.js";
import { printBanner } from "./lib/banner.js";
import * as output from "./lib/output.js";
import { pc } from "./lib/output.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")) as { name: string; version: string };

if (pkg.version !== "0.0.0") {
    updateNotifier({ pkg }).notify();
}

program.name("wt").description("Git worktree manager for bare-repo workflows").version(pkg.version);

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

registerClone(program);
registerConvert(program);
registerNew(program);
registerGet(program);
registerLs(program);
registerCd(program);
registerInit(program);
registerRm(program);
registerSetup(program);
registerUpdate(program);
registerOpen(program);
registerConfig(program);
registerWorkspace(program);
registerStart(program);

// Show the banner when running bare `wt` with no subcommand
if (process.argv.length <= 2) {
    printBanner();
}

program.parseAsync().catch((err: unknown) => {
    const name = err instanceof Error ? err.name : "";

    if (name === "AbortPromptError" || name === "CancelPromptError") {
        // User pressed Escape — graceful exit
        output.dim("\nCancelled");
        process.exitCode = 0;
        return;
    }

    if (name === "ExitPromptError") {
        // User pressed Ctrl+C — POSIX convention: 128 + signal number
        output.dim("\nCancelled");
        process.exitCode = 130;
        return;
    }

    throw err;
});
