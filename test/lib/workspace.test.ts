import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    workspaceAdd,
    workspaceFilePath,
    workspaceRemove,
    workspaceReset,
    workspaceSync,
} from "../../src/lib/workspace.js";

const TEST_DIR = join(tmpdir(), "wt-test-workspace");
const MAIN_PATH = join(TEST_DIR, "main");
const FEATURE_PATH = join(TEST_DIR, "feature");

beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(join(TEST_DIR, ".bare"), { recursive: true });
    mkdirSync(MAIN_PATH, { recursive: true });
    mkdirSync(FEATURE_PATH, { recursive: true });
});

afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
});

function readWs() {
    const filePath = workspaceFilePath(TEST_DIR);
    return JSON.parse(readFileSync(filePath, "utf-8"));
}

describe("workspaceFilePath", () => {
    it("returns <root>/<basename>.code-workspace", () => {
        const filePath = workspaceFilePath(TEST_DIR);
        expect(filePath).toContain(".code-workspace");
    });
});

describe("workspaceAdd", () => {
    it("creates workspace file if missing", () => {
        workspaceAdd(TEST_DIR, MAIN_PATH);
        const ws = readWs();
        expect(ws.folders).toHaveLength(1);
        expect(ws.folders[0].path).toBe(MAIN_PATH);
        expect(ws.folders[0].name).toBe("main");
    });

    it("is idempotent", () => {
        workspaceAdd(TEST_DIR, MAIN_PATH);
        workspaceAdd(TEST_DIR, MAIN_PATH);
        const ws = readWs();
        expect(ws.folders).toHaveLength(1);
    });

    it("adds multiple entries", () => {
        workspaceAdd(TEST_DIR, MAIN_PATH);
        workspaceAdd(TEST_DIR, FEATURE_PATH);
        const ws = readWs();
        expect(ws.folders).toHaveLength(2);
    });

    it("prunes entries whose paths no longer exist on disk", () => {
        workspaceAdd(TEST_DIR, MAIN_PATH);
        rmSync(MAIN_PATH, { recursive: true, force: true });
        workspaceAdd(TEST_DIR, FEATURE_PATH);
        const ws = readWs();
        expect(ws.folders).toHaveLength(1);
        expect(ws.folders[0].path).toBe(FEATURE_PATH);
    });
});

describe("workspaceRemove", () => {
    it("removes an entry", () => {
        workspaceAdd(TEST_DIR, MAIN_PATH);
        workspaceAdd(TEST_DIR, FEATURE_PATH);
        workspaceRemove(TEST_DIR, FEATURE_PATH);
        const ws = readWs();
        expect(ws.folders).toHaveLength(1);
        expect(ws.folders[0].name).toBe("main");
    });

    it("no-ops when file does not exist", () => {
        workspaceRemove(TEST_DIR, "/path/to/nothing");
        // Should not throw
    });
});

describe("workspaceSync", () => {
    it("rebuilds from scratch", () => {
        workspaceAdd(TEST_DIR, MAIN_PATH);
        workspaceSync(TEST_DIR, [MAIN_PATH, FEATURE_PATH]);
        const ws = readWs();
        expect(ws.folders).toHaveLength(2);
        expect(ws.folders[0].name).toBe("main");
        expect(ws.folders[1].name).toBe("feature");
    });
});

describe("workspaceReset", () => {
    it("deletes the workspace file", () => {
        workspaceAdd(TEST_DIR, MAIN_PATH);
        expect(workspaceReset(TEST_DIR)).toBe(true);
        expect(existsSync(workspaceFilePath(TEST_DIR))).toBe(false);
    });

    it("returns false when no file exists", () => {
        expect(workspaceReset(TEST_DIR)).toBe(false);
    });
});
