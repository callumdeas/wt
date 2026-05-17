import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const registry = process.env["WT_UPDATE_REGISTRY"] ?? "https://registry.npmjs.org";
const base = process.env["WT_CONFIG_HOME"] ?? process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config");
const cachePath = join(base, "wt", "update-check.json");

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10_000);

try {
    const res = await fetch(`${registry}/doubleut/latest`, { signal: controller.signal });
    if (!res.ok) process.exit(0);
    const { version } = (await res.json()) as { version: string };
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify({ latestVersion: version, checkedAt: Date.now() }));
} catch {
    // network or write errors are best-effort
} finally {
    clearTimeout(timeout);
}
