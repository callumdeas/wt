import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, migrateIfNeeded, saveConfig } from "../../src/lib/config.js";

const TEST_DIR = join(tmpdir(), "wt-test-config");

beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(join(TEST_DIR, ".bare"), { recursive: true });
});

afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("loadConfig", () => {
    it("returns defaults when no config exists", () => {
        const config = loadConfig(TEST_DIR);
        expect(config).toEqual({
            postCreate: "",
            editor: "code",
            workspaceMode: true,
            startCmd: "",
            startKillPort: null,
        });
    });

    it("reads .worktreerc.json", () => {
        writeFileSync(
            join(TEST_DIR, ".worktreerc.json"),
            JSON.stringify({
                postCreate: "npm ci",
                editor: "cursor",
                workspaceMode: false,
                startCmd: "yarn dev",
                startKillPort: 8081,
            }),
        );

        const config = loadConfig(TEST_DIR);
        expect(config.postCreate).toBe("npm ci");
        expect(config.editor).toBe("cursor");
        expect(config.workspaceMode).toBe(false);
        expect(config.startCmd).toBe("yarn dev");
        expect(config.startKillPort).toBe(8081);
    });

    it("auto-migrates legacy .worktreerc", () => {
        writeFileSync(
            join(TEST_DIR, ".worktreerc"),
            [
                "# Worktree configuration",
                'POST_CREATE="yarn install"',
                "EDITOR_CMD=cursor",
                "WORKSPACE_MODE=true",
                'START_CMD="yarn dev bundler"',
                "START_KILL_PORT=8081",
            ].join("\n"),
        );

        const config = loadConfig(TEST_DIR);
        expect(config.postCreate).toBe("yarn install");
        expect(config.editor).toBe("cursor");
        expect(config.workspaceMode).toBe(true);
        expect(config.startCmd).toBe("yarn dev bundler");
        expect(config.startKillPort).toBe(8081);

        // Verify migration artifacts
        expect(existsSync(join(TEST_DIR, ".worktreerc.json"))).toBe(true);
        expect(existsSync(join(TEST_DIR, ".worktreerc.bak"))).toBe(true);
        expect(existsSync(join(TEST_DIR, ".worktreerc"))).toBe(false);
    });
});

describe("saveConfig", () => {
    it("writes valid JSON", () => {
        saveConfig(TEST_DIR, {
            postCreate: "npm i",
            editor: "code",
            workspaceMode: true,
            startCmd: "",
            startKillPort: null,
        });

        const raw = readFileSync(join(TEST_DIR, ".worktreerc.json"), "utf-8");
        const parsed = JSON.parse(raw);
        expect(parsed.postCreate).toBe("npm i");
        expect(parsed.editor).toBe("code");
    });
});

describe("migrateIfNeeded", () => {
    it("returns false when no legacy config exists", () => {
        expect(migrateIfNeeded(TEST_DIR)).toBe(false);
    });

    it("returns false when modern config already exists", () => {
        writeFileSync(join(TEST_DIR, ".worktreerc"), 'POST_CREATE=""');
        writeFileSync(join(TEST_DIR, ".worktreerc.json"), "{}");
        expect(migrateIfNeeded(TEST_DIR)).toBe(false);
    });

    it("migrates and returns true", () => {
        writeFileSync(join(TEST_DIR, ".worktreerc"), "EDITOR_CMD=vim\nWORKSPACE_MODE=false");
        expect(migrateIfNeeded(TEST_DIR)).toBe(true);

        const config = JSON.parse(readFileSync(join(TEST_DIR, ".worktreerc.json"), "utf-8"));
        expect(config.editor).toBe("vim");
        expect(config.workspaceMode).toBe(false);
    });
});
