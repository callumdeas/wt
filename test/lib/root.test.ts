import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findRoot, requireRoot } from "../../src/lib/root.js";

const TEST_DIR = join(tmpdir(), "wt-test-root");

beforeAll(() => {
    // Create a fake bare repo structure
    mkdirSync(join(TEST_DIR, ".bare"), { recursive: true });
    mkdirSync(join(TEST_DIR, "main", "src", "deep"), { recursive: true });
});

afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("findRoot", () => {
    it("finds root from the worktree root directory", () => {
        expect(findRoot(join(TEST_DIR, "main"))).toBe(TEST_DIR);
    });

    it("finds root from a nested directory", () => {
        expect(findRoot(join(TEST_DIR, "main", "src", "deep"))).toBe(TEST_DIR);
    });

    it("returns null when no .bare found", () => {
        expect(findRoot(tmpdir())).toBeNull();
    });

    it("finds root from the root itself", () => {
        expect(findRoot(TEST_DIR)).toBe(TEST_DIR);
    });

    it("returns null without throwing when process.cwd() throws ENOENT (deleted cwd)", () => {
        const originalCwd = process.cwd;
        process.cwd = () => {
            const err = new Error("ENOENT: no such file or directory, uv_cwd") as Error & { code: string };
            err.code = "ENOENT";
            throw err;
        };
        try {
            expect(findRoot()).toBeNull();
        } finally {
            process.cwd = originalCwd;
        }
    });
});

describe("requireRoot", () => {
    it("returns root when found", () => {
        expect(requireRoot(join(TEST_DIR, "main"))).toBe(TEST_DIR);
    });

    it("throws when no .bare found", () => {
        expect(() => requireRoot(tmpdir())).toThrow("Not in a worktree-managed repository");
    });
});
