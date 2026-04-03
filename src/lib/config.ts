import { confirm, input, select } from "@inquirer/prompts";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

    console.log(`Migrated ${LEGACY_CONFIG_FILE} → ${CONFIG_FILE} (backup: ${LEGACY_CONFIG_FILE}.bak)`);
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

/**
 * Interactive config wizard using @inquirer/prompts.
 * Returns the created config.
 */
export async function interactiveConfig(root: string): Promise<WtConfig> {
    const existing = configExists(root) ? loadConfig(root) : DEFAULTS;

    const postCreate = await input({
        message: "Post-create command (run after creating a worktree):",
        default: existing.postCreate || undefined,
    });

    const editor = await select({
        message: "Editor command:",
        choices: [
            { value: "code", name: "VS Code (code)" },
            { value: "cursor", name: "Cursor (cursor)" },
            { value: "vim", name: "Vim (vim)" },
            { value: "nvim", name: "Neovim (nvim)" },
            { value: "zed", name: "Zed (zed)" },
        ],
        default: existing.editor,
    });

    const workspaceMode = await confirm({
        message: "Enable workspace mode? (single editor window for all worktrees)",
        default: existing.workspaceMode,
    });

    const preStart = await input({
        message:
            'Pre-start command (runs before dev server, e.g. "lsof -ti:8081 | xargs kill -9 2>/dev/null || true"):',
        default: existing.preStart || undefined,
    });

    const startCmd = await input({
        message: 'Start command (dev server, e.g. "yarn dev"):',
        default: existing.startCmd || undefined,
    });

    const config: WtConfig = { postCreate, editor, workspaceMode, preStart, startCmd };
    saveConfig(root, config);

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
        console.log("Created .worktreerc.json");
    } else {
        await interactiveConfig(root);
    }

    // Run post-create if configured
    const config = loadConfig(root);
    if (config.postCreate) {
        if (opts.install === false) {
            console.log("Skipping post-create command (--no-install)");
        } else if (opts.install === true) {
            console.log(`Running: ${config.postCreate}`);
            execSync(config.postCreate, { cwd: worktreeDir, stdio: "inherit" });
        } else {
            const run = await confirm({
                message: `Run post-create command: ${config.postCreate}?`,
                default: true,
            });
            if (run) {
                console.log(`Running: ${config.postCreate}`);
                execSync(config.postCreate, { cwd: worktreeDir, stdio: "inherit" });
            }
        }
    }
}
