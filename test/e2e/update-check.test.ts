import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { GIT_ENV, makeTmpDir, runWt, waitForFile } from "./helpers.js";

/**
 * Full update-notification flow tests.
 *
 * Test 1 — background worker: run a command against a mock npm registry, wait for the
 * detached worker to write the cache, then assert its contents.
 *
 * Tests 2–3 — notification rendering: pre-populate the cache and assert that the
 * correct message (or absence of one) appears on stderr.
 */
describe("update notification", () => {
    let configDir: string;

    function env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
        return {
            ...GIT_ENV,
            WT_NO_UPDATE_CHECK: undefined,
            WT_CONFIG_HOME: configDir,
            WT_CURRENT_VERSION: "0.5.0",
            ...extra,
        };
    }

    function writeCacheFile(latestVersion: string): void {
        const dir = join(configDir, "wt");
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "update-check.json"), JSON.stringify({ latestVersion, checkedAt: Date.now() }));
    }

    beforeEach(() => {
        configDir = makeTmpDir("update-check");
    });

    afterEach(() => {
        rmSync(configDir, { recursive: true, force: true });
    });

    // 1. Full round-trip: worker hits mock registry and writes cache
    it("background worker fetches latest version and writes cache", async () => {
        const server = createServer((_, res) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ version: "99.99.99" }));
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const { port } = server.address() as AddressInfo;

        try {
            runWt(["--version"], {
                cwd: configDir,
                env: env({ WT_UPDATE_REGISTRY: `http://127.0.0.1:${port}` }),
            });

            const cachePath = join(configDir, "wt", "update-check.json");
            await waitForFile(cachePath, 3000);

            const cache = JSON.parse(readFileSync(cachePath, "utf-8")) as {
                latestVersion: string;
                checkedAt: number;
            };
            expect(cache.latestVersion).toBe("99.99.99");
            expect(typeof cache.checkedAt).toBe("number");
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    // 2. Notification appears when cached version is newer than current
    it("shows update notification when a newer version is cached", () => {
        writeCacheFile("99.99.99");
        const result = runWt(["--version"], { cwd: configDir, env: env() });
        expect(result.stderr).toContain("Update available");
        expect(result.stderr).toContain("0.5.0");
        expect(result.stderr).toContain("99.99.99");
    });

    // 3. No notification when already on the latest version
    it("does not show notification when current version matches the cached latest", () => {
        writeCacheFile("0.5.0");
        const result = runWt(["--version"], { cwd: configDir, env: env() });
        expect(result.stderr).not.toContain("Update available");
    });
});
