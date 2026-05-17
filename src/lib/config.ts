import { execSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detectSetup, type SetupSuggestion } from "./detect-setup.js";
import * as output from "./output.js";
import { pc, promptTheme } from "./output.js";
import { confirm, input, select } from "./prompt.js";

export interface WtConfig {
    postCreate: string;
    editor: string;
    workspaceMode: boolean;
    preStart: string;
    startCmd: string;
}

const DEFAULTS: WtConfig = {
    postCreate: "",
    editor: "code",
    workspaceMode: true,
    preStart: "",
    startCmd: "",
};

const CONFIG_FILE = ".worktreerc.json";
const LEGACY_CONFIG_FILE = ".worktreerc";

function configPath(root: string): string {
    return join(root, CONFIG_FILE);
}

function legacyConfigPath(root: string): string {
    return join(root, LEGACY_CONFIG_FILE);
}

/**
 * Parse a legacy KEY=VALUE .worktreerc file into a WtConfig.
 */
function parseLegacy(content: string): Partial<WtConfig> {
    const config: Partial<WtConfig> = {};

    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;

        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        // Strip surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        switch (key) {
            case "POST_CREATE":
                config.postCreate = value;
                break;
            case "EDITOR_CMD":
                config.editor = value;
                break;
            case "WORKSPACE_MODE":
                config.workspaceMode = value === "true";
                break;
            case "PRE_START":
                config.preStart = value;
                break;
            case "START_CMD":
                config.startCmd = value;
                break;
        }
    }

    return config;
}

/**
 * Attempt to migrate a legacy .worktreerc to .worktreerc.json.
 * Returns true if migration occurred.
 */
export function migrateIfNeeded(root: string): boolean {
    const legacy = legacyConfigPath(root);
    const modern = configPath(root);

    if (!existsSync(legacy) || existsSync(modern)) return false;

    const content = readFileSync(legacy, "utf-8");
    const parsed = parseLegacy(content);
    const config: WtConfig = { ...DEFAULTS, ...parsed };

    writeFileSync(modern, JSON.stringify(config, null, 2) + "\n");
    renameSync(legacy, legacy + ".bak");

    output.info(`Migrated ${LEGACY_CONFIG_FILE} → ${CONFIG_FILE} (backup: ${LEGACY_CONFIG_FILE}.bak)`);
    return true;
}

/**
 * Load config from .worktreerc.json, auto-migrating from legacy if needed.
 * Returns defaults if no config file exists.
 */
export function loadConfig(root: string): WtConfig {
    migrateIfNeeded(root);

    const path = configPath(root);
    if (!existsSync(path)) return { ...DEFAULTS };

    const raw = JSON.parse(readFileSync(path, "utf-8"));

    return {
        postCreate: raw.postCreate ?? DEFAULTS.postCreate,
        editor: raw.editor ?? DEFAULTS.editor,
        workspaceMode: raw.workspaceMode ?? DEFAULTS.workspaceMode,
        preStart: raw.preStart ?? DEFAULTS.preStart,
        startCmd: raw.startCmd ?? DEFAULTS.startCmd,
    };
}

/**
 * Save config to .worktreerc.json.
 */
export function saveConfig(root: string, config: WtConfig): void {
    writeFileSync(configPath(root), JSON.stringify(config, null, 2) + "\n");
}

/**
 * Check if a config file exists (either modern or legacy).
 */
export function configExists(root: string): boolean {
    return existsSync(configPath(root)) || existsSync(legacyConfigPath(root));
}

const CUSTOM_CHOICE = "__custom__";
const SKIP_CHOICE = "__skip__";
const CHAIN_CHOICE = "__chain__";

/**
 * Build the choice list for the post-create select.
 *
 * Layout: [existing config (if any)] + [chained "all" if multi-ecosystem]
 *         + [each detected suggestion] + [custom…] + [skip].
 *
 * Inquirer's `description` field renders below the menu for the highlighted
 * row, which lets us show context (e.g. "detected pnpm-lock.yaml") without
 * cluttering the choice label.
 */
function buildPostCreateChoices(suggestions: SetupSuggestion[], existing: string) {
    const choices: Array<{ value: string; name: string; description?: string }> = [];

    if (existing) {
        choices.push({
            value: existing,
            name: `${pc.cyan(existing)} ${pc.dim("(current)")}`,
            description: "Keep the value already in .worktreerc.json",
        });
    }

    const ecosystems = new Set(suggestions.map((s) => s.ecosystem));
    if (ecosystems.size > 1) {
        const chained = suggestions.map((s) => s.command).join(" && ");
        choices.push({
            value: CHAIN_CHOICE,
            name: `${pc.cyan("Run all detected setups")} ${pc.dim(`(${ecosystems.size} ecosystems)`)}`,
            description: chained,
        });
    }

    for (const s of suggestions) {
        if (s.command === existing) continue; // already added at top
        choices.push({
            value: s.command,
            name: `${pc.cyan(s.label)}`,
            description: s.hint,
        });
    }

    choices.push({
        value: CUSTOM_CHOICE,
        name: pc.dim("Custom command…"),
        description: "Type your own command",
    });
    choices.push({
        value: SKIP_CHOICE,
        name: pc.dim("Skip (no post-create command)"),
        description: "Worktrees won't run anything automatically",
    });

    return choices;
}

async function promptPostCreate(worktreeDir: string | undefined, existing: string): Promise<string> {
    const stderrCtx = { output: process.stderr };
    const suggestions = worktreeDir ? detectSetup(worktreeDir) : [];

    // Greenfield repo with nothing to detect and no existing value: keep the
    // free-form input so users can type whatever they want.
    if (suggestions.length === 0 && !existing) {
        output.dim("  No package manifests detected — type a command or leave blank to skip.");
        return await input(
            {
                message: "Post-create command:",
                default: undefined,
                theme: promptTheme,
            },
            stderrCtx,
        );
    }

    if (suggestions.length > 0) {
        output.dim(`  Detected ${suggestions.length} install path${suggestions.length === 1 ? "" : "s"} in this repo.`);
    }

    const choice = await select(
        {
            message: "Post-create command:",
            choices: buildPostCreateChoices(suggestions, existing),
            default: existing || suggestions[0]?.command,
            theme: promptTheme,
        },
        stderrCtx,
    );

    if (choice === SKIP_CHOICE) return "";
    if (choice === CHAIN_CHOICE) {
        return suggestions.map((s) => s.command).join(" && ");
    }
    if (choice === CUSTOM_CHOICE) {
        return await input(
            {
                message: "Custom post-create command:",
                default: existing || undefined,
                theme: promptTheme,
            },
            stderrCtx,
        );
    }
    return choice;
}

/**
 * Interactive config wizard using @inquirer/prompts.
 *
 * Sectioned layout (Setup → Editor → Dev server → Summary) replaces the
 * old flat list of inputs. The post-create prompt auto-detects manifests
 * in the worktree and offers them as ranked select choices.
 *
 * @param root         Bare-repo root (where .worktreerc.json is saved)
 * @param worktreeDir  Path to a real worktree to scan for manifests.
 *                     Optional — without it, post-create falls back to free-form input.
 */
export async function interactiveConfig(root: string, worktreeDir?: string): Promise<WtConfig> {
    const existing = configExists(root) ? loadConfig(root) : DEFAULTS;
    const stderrCtx = { output: process.stderr };

    output.section("Setup", "What should run after a worktree is created (deps, codegen, etc.)");
    const postCreate = await promptPostCreate(worktreeDir, existing.postCreate);

    output.section("Editor", "How wt opens worktrees in your editor");
    const editor = await select(
        {
            message: "Editor:",
            choices: [
                { value: "code", name: `${pc.cyan("code")}   ${pc.dim("— VS Code")}` },
                { value: "cursor", name: `${pc.cyan("cursor")} ${pc.dim("— Cursor")}` },
                { value: "vim", name: `${pc.cyan("vim")}    ${pc.dim("— Vim")}` },
                { value: "nvim", name: `${pc.cyan("nvim")}   ${pc.dim("— Neovim")}` },
                { value: "zed", name: `${pc.cyan("zed")}    ${pc.dim("— Zed")}` },
            ],
            default: existing.editor,
            theme: promptTheme,
        },
        stderrCtx,
    );

    const workspaceMode = await confirm(
        {
            message: "Workspace mode? (one editor window covering all worktrees)",
            default: existing.workspaceMode,
            theme: promptTheme,
        },
        stderrCtx,
    );

    output.section("Dev server", "Optional — shortcuts for `wt start`. Skip if you don't use it.");
    const wantsDevServer = await confirm(
        {
            message: "Configure dev server commands?",
            default: Boolean(existing.preStart || existing.startCmd),
            theme: promptTheme,
        },
        stderrCtx,
    );

    let preStart = existing.preStart;
    let startCmd = existing.startCmd;
    if (wantsDevServer) {
        output.dim('  Pre-start runs before the dev server (e.g. free a port: "lsof -ti:8081 | xargs kill -9").');
        preStart = await input(
            {
                message: "Pre-start command:",
                default: existing.preStart || undefined,
                theme: promptTheme,
            },
            stderrCtx,
        );
        output.dim('  Start runs the dev server itself (e.g. "yarn dev", "pnpm start").');
        startCmd = await input(
            {
                message: "Start command:",
                default: existing.startCmd || undefined,
                theme: promptTheme,
            },
            stderrCtx,
        );
    }

    const config: WtConfig = { postCreate, editor, workspaceMode, preStart, startCmd };
    saveConfig(root, config);

    output.blank();
    output.success("Saved .worktreerc.json");
    output.summaryBox([
        { key: "post-create", value: postCreate },
        { key: "editor", value: editor },
        { key: "workspace", value: workspaceMode ? "enabled" : "disabled" },
        { key: "pre-start", value: preStart },
        { key: "start", value: startCmd },
    ]);

    return config;
}

export interface PostSetupOpts {
    config?: boolean;
    postCreate?: string;
    editor?: string;
    workspaceMode?: boolean;
    install?: boolean;
}

/**
 * Shared post-setup flow for clone and convert: create config, then
 * optionally run the post-create command in the worktree directory.
 */
export async function postSetupFlow(root: string, worktreeDir: string, opts: PostSetupOpts): Promise<void> {
    // Config creation
    if (opts.config === false) {
        // --no-config: skip entirely
    } else if (opts.postCreate !== undefined || opts.editor !== undefined || opts.workspaceMode !== undefined) {
        const config: WtConfig = {
            postCreate: opts.postCreate ?? "",
            editor: opts.editor ?? "code",
            workspaceMode: opts.workspaceMode ?? true,
            preStart: "",
            startCmd: "",
        };
        saveConfig(root, config);
        output.success("Created .worktreerc.json");
    } else {
        await interactiveConfig(root, worktreeDir);
    }

    // Run post-create if configured
    const config = loadConfig(root);
    if (config.postCreate) {
        if (opts.install === false) {
            output.dim("Skipping post-create command (--no-install)");
        } else if (opts.install === true) {
            output.dim(`Running: ${config.postCreate}`);
            execSync(config.postCreate, { cwd: worktreeDir, stdio: "inherit" });
        } else {
            const run = await confirm(
                {
                    message: `Run post-create command: ${config.postCreate}?`,
                    default: true,
                    theme: promptTheme,
                },
                { output: process.stderr },
            );
            if (run) {
                output.dim(`Running: ${config.postCreate}`);
                execSync(config.postCreate, { cwd: worktreeDir, stdio: "inherit" });
            }
        }
    }
}
