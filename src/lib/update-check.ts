import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pc } from "./output.js";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

const WORKER_PATH = join(dirname(fileURLToPath(import.meta.url)), "update-check-worker.js");

interface UpdateCache {
    latestVersion: string;
    checkedAt: number;
}

function cachePath(): string {
    const base = process.env["WT_CONFIG_HOME"] ?? process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config");
    return join(base, "wt", "update-check.json");
}

function readCache(): UpdateCache | null {
    const path = cachePath();
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(readFileSync(path, "utf-8")) as UpdateCache;
    } catch {
        return null;
    }
}

function newerThan(a: string, b: string): boolean {
    const parts = (v: string) => v.split(".").map((n) => Number.parseInt(n, 10));
    const [aMaj = 0, aMin = 0, aPat = 0] = parts(a);
    const [bMaj = 0, bMin = 0, bPat = 0] = parts(b);
    if (aMaj !== bMaj) return aMaj > bMaj;
    if (aMin !== bMin) return aMin > bMin;
    return aPat > bPat;
}

function isHomebrewInstall(): boolean {
    const bin = process.argv[1] ?? "";
    return bin.includes("/homebrew/") || bin.includes("/Cellar/") || bin.includes("/linuxbrew/");
}

export function getUpdateNotification(currentVersion: string): string | null {
    if (currentVersion === "0.0.0") return null;
    const cache = readCache();
    if (!cache || !newerThan(cache.latestVersion, currentVersion)) return null;
    const updateCmd = isHomebrewInstall() ? "brew upgrade wt" : "npm install -g doubleut";
    return (
        `  ${pc.yellow("↑")} Update available: ${pc.dim(currentVersion)} → ${pc.green(cache.latestVersion)}` +
        `  ${pc.dim("Run:")} ${updateCmd}`
    );
}

export function spawnUpdateCheck(): void {
    const cache = readCache();
    if (cache && Date.now() - cache.checkedAt < CHECK_INTERVAL_MS) return;
    try {
        spawn(process.execPath, [WORKER_PATH], { detached: true, stdio: "ignore" }).unref();
    } catch {
        // best-effort — don't crash if worker cannot be spawned
    }
}
