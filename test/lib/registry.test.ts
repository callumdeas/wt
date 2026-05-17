import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listRepos, loadRegistry, registerRepo, saveRegistry, unregisterRepo } from "../../src/lib/registry.js";

const TEST_CONFIG_DIR = join(tmpdir(), "wt-test-registry-config");

beforeEach(() => {
    rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    process.env["WT_CONFIG_HOME"] = TEST_CONFIG_DIR;
});

afterEach(() => {
    delete process.env["WT_CONFIG_HOME"];
});

afterAll(() => {
    rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
});

describe("loadRegistry", () => {
    it("returns empty registry when file is missing", () => {
        expect(loadRegistry()).toEqual({ repos: [] });
    });

    it("reads existing registry", () => {
        saveRegistry({ repos: [{ path: "/foo/bar", name: "bar", addedAt: "2026-01-01T00:00:00.000Z" }] });
        expect(loadRegistry().repos).toHaveLength(1);
        expect(loadRegistry().repos[0]!.name).toBe("bar");
    });
});

describe("registerRepo", () => {
    it("adds a new entry", () => {
        registerRepo("/tmp/my-repo");
        expect(loadRegistry().repos).toHaveLength(1);
        expect(loadRegistry().repos[0]!.name).toBe("my-repo");
    });

    it("is idempotent — same path not added twice", () => {
        registerRepo("/tmp/my-repo");
        registerRepo("/tmp/my-repo");
        expect(loadRegistry().repos).toHaveLength(1);
    });

    it("accepts a custom name override", () => {
        registerRepo("/tmp/my-repo", "custom-name");
        expect(loadRegistry().repos[0]!.name).toBe("custom-name");
    });

    it("creates intermediate directories", () => {
        registerRepo("/tmp/new-repo");
        const path = join(TEST_CONFIG_DIR, "wt", "registry.json");
        expect(existsSync(path)).toBe(true);
    });
});

describe("unregisterRepo", () => {
    it("removes by absolute path", () => {
        registerRepo("/tmp/my-repo");
        unregisterRepo("/tmp/my-repo");
        expect(loadRegistry().repos).toHaveLength(0);
    });

    it("removes by name", () => {
        registerRepo("/tmp/my-repo");
        unregisterRepo("my-repo");
        expect(loadRegistry().repos).toHaveLength(0);
    });

    it("is a no-op for unknown entries", () => {
        registerRepo("/tmp/my-repo");
        unregisterRepo("nonexistent");
        expect(loadRegistry().repos).toHaveLength(1);
    });
});

describe("listRepos", () => {
    it("filters out stale entries where .bare no longer exists", () => {
        const validRepo = join(tmpdir(), "wt-test-valid-repo");
        mkdirSync(join(validRepo, ".bare"), { recursive: true });

        registerRepo(validRepo);
        registerRepo("/tmp/ghost-repo-that-does-not-exist");

        const repos = listRepos();
        expect(repos).toHaveLength(1);
        expect(repos[0]!.path).toBe(validRepo);

        rmSync(validRepo, { recursive: true, force: true });
    });
});
