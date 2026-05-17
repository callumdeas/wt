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
        });
    });

    it("reads .worktreerc.json", () => {
        writeFileSync(
            join(TEST_DIR, ".worktreerc.json"),
            JSON.stringify({
                postCreate: "npm ci",
                editor: "cursor",
            }),
        );

        const config = loadConfig(TEST_DIR);
        expect(config.postCreate).toBe("npm ci");
        expect(config.editor).toBe("cursor");
    });

    it("auto-migrates legacy .worktreerc", () => {
        writeFileSync(
            join(TEST_DIR, ".worktreerc"),
            ["# Worktree configuration", 'POST_CREATE="yarn install"', "EDITOR_CMD=cursor"].join("\n"),
        );

        const config = loadConfig(TEST_DIR);
        expect(config.postCreate).toBe("yarn install");
        expect(config.editor).toBe("cursor");

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
        writeFileSync(join(TEST_DIR, ".worktreerc"), "EDITOR_CMD=vim");
        expect(migrateIfNeeded(TEST_DIR)).toBe(true);

        const config = JSON.parse(readFileSync(join(TEST_DIR, ".worktreerc.json"), "utf-8"));
        expect(config.editor).toBe("vim");
    });
});
