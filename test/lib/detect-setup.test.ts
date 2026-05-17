import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectSetup } from "../../src/lib/detect-setup.js";

const TEST_DIR = join(tmpdir(), "wt-test-detect-setup");

beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
});

function touch(path: string, content = ""): void {
    writeFileSync(join(TEST_DIR, path), content);
}

describe("detectSetup", () => {
    it("returns nothing for an empty directory", () => {
        expect(detectSetup(TEST_DIR)).toEqual([]);
    });

    it("detects pnpm via pnpm-lock.yaml", () => {
        touch("pnpm-lock.yaml");
        touch("package.json", JSON.stringify({ name: "x" }));
        const out = detectSetup(TEST_DIR);
        expect(out).toHaveLength(1);
        expect(out[0].command).toBe("pnpm install");
        expect(out[0].ecosystem).toBe("node");
    });

    it("prefers pnpm over npm when multiple lockfiles exist", () => {
        touch("pnpm-lock.yaml");
        touch("package-lock.json");
        touch("package.json", JSON.stringify({ name: "x" }));
        const out = detectSetup(TEST_DIR);
        expect(out.map((s) => s.command)).toEqual(["pnpm install"]);
    });

    it("falls back to npm when only package.json is present", () => {
        touch("package.json", JSON.stringify({ name: "x" }));
        const out = detectSetup(TEST_DIR);
        expect(out[0].command).toBe("npm install");
        expect(out[0].hint).toMatch(/no lockfile/);
    });

    it("surfaces a setup script from package.json above bare install", () => {
        touch("pnpm-lock.yaml");
        touch("package.json", JSON.stringify({ scripts: { setup: "node bootstrap.js" } }));
        const out = detectSetup(TEST_DIR);
        expect(out[0].command).toBe("pnpm run setup");
        expect(out[1].command).toBe("pnpm install");
    });

    it("detects ruby via Gemfile.lock", () => {
        touch("Gemfile.lock");
        const out = detectSetup(TEST_DIR);
        expect(out).toEqual([expect.objectContaining({ command: "bundle install", ecosystem: "ruby" })]);
    });

    it("returns one entry per ecosystem when fullstack", () => {
        touch("pnpm-lock.yaml");
        touch("package.json", JSON.stringify({ name: "x" }));
        touch("Gemfile");
        const out = detectSetup(TEST_DIR);
        const ecosystems = out.map((s) => s.ecosystem);
        expect(ecosystems).toContain("node");
        expect(ecosystems).toContain("ruby");
    });

    it("ranks repo-authored bin/setup script first", () => {
        mkdirSync(join(TEST_DIR, "bin"));
        touch("bin/setup", "#!/bin/sh\nbundle install\n");
        touch("Gemfile");
        const out = detectSetup(TEST_DIR);
        expect(out[0].command).toBe("./bin/setup");
        expect(out[0].ecosystem).toBe("script");
    });

    it("detects Makefile setup target", () => {
        touch("Makefile", "setup:\n\techo hi\n\nbuild:\n\techo build\n");
        const out = detectSetup(TEST_DIR);
        expect(out[0].command).toBe("make setup");
    });

    it("dedupes identical commands across detectors", () => {
        // (Defensive: shouldn't happen with current detectors, but make sure
        //  the dedupe logic doesn't barf on duplicates.)
        touch("Gemfile");
        touch("Gemfile.lock");
        const out = detectSetup(TEST_DIR);
        expect(out.filter((s) => s.command === "bundle install")).toHaveLength(1);
    });

    it("handles malformed package.json gracefully", () => {
        touch("package.json", "{ not json");
        touch("yarn.lock");
        const out = detectSetup(TEST_DIR);
        expect(out[0].command).toBe("yarn install");
    });
});
