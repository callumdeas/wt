#!/usr/bin/env node
import { program } from "commander";
import updateNotifier from "update-notifier";
import pkg from "../package.json" with { type: "json" };
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
import { registerStart } from "./commands/start.js";
import { registerUpdate } from "./commands/update.js";
import { registerWorkspace } from "./commands/workspace.js";

if (pkg.version !== "0.0.0") {
    updateNotifier({ pkg }).notify();
}

program.name("wt").description("Git worktree manager for bare-repo workflows").version(pkg.version);

registerClone(program);
registerConvert(program);
registerNew(program);
registerGet(program);
registerLs(program);
registerCd(program);
registerInit(program);
registerRm(program);
registerUpdate(program);
registerOpen(program);
registerConfig(program);
registerWorkspace(program);
registerStart(program);

program.parse();
