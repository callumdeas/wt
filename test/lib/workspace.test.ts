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

beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(join(TEST_DIR, ".bare"), { recursive: true });
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
        workspaceAdd(TEST_DIR, "/path/to/main");
        const ws = readWs();
        expect(ws.folders).toHaveLength(1);
        expect(ws.folders[0].path).toBe("/path/to/main");
        expect(ws.folders[0].name).toBe("main");
    });

    it("is idempotent", () => {
        workspaceAdd(TEST_DIR, "/path/to/main");
        workspaceAdd(TEST_DIR, "/path/to/main");
        const ws = readWs();
        expect(ws.folders).toHaveLength(1);
    });

    it("adds multiple entries", () => {
        workspaceAdd(TEST_DIR, "/path/to/main");
        workspaceAdd(TEST_DIR, "/path/to/feature");
        const ws = readWs();
        expect(ws.folders).toHaveLength(2);
    });
});

describe("workspaceRemove", () => {
    it("removes an entry", () => {
        workspaceAdd(TEST_DIR, "/path/to/main");
        workspaceAdd(TEST_DIR, "/path/to/feature");
        workspaceRemove(TEST_DIR, "/path/to/feature");
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
        workspaceAdd(TEST_DIR, "/old/path");
        workspaceSync(TEST_DIR, ["/new/main", "/new/feature"]);
        const ws = readWs();
        expect(ws.folders).toHaveLength(2);
        expect(ws.folders[0].name).toBe("main");
        expect(ws.folders[1].name).toBe("feature");
    });
});

describe("workspaceReset", () => {
    it("deletes the workspace file", () => {
        workspaceAdd(TEST_DIR, "/path/to/main");
        expect(workspaceReset(TEST_DIR)).toBe(true);
        expect(existsSync(workspaceFilePath(TEST_DIR))).toBe(false);
    });

    it("returns false when no file exists", () => {
        expect(workspaceReset(TEST_DIR)).toBe(false);
    });
});
