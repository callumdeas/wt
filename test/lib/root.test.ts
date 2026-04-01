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
});

describe("requireRoot", () => {
    it("returns root when found", () => {
        expect(requireRoot(join(TEST_DIR, "main"))).toBe(TEST_DIR);
    });

    it("throws when no .bare found", () => {
        expect(() => requireRoot(tmpdir())).toThrow("Not in a worktree-managed repository");
    });
});
