import { execFileSync, execSync } from "node:child_process";
import { bareDir } from "./git.js";
import * as output from "./output.js";

export interface MergedPR {
    number: number;
    title: string;
    mergedAt: string;
}

let ghAvailableCache: boolean | undefined;

/** Memoized check for the `gh` binary on PATH. */
export function isGhAvailable(): boolean {
    if (ghAvailableCache !== undefined) return ghAvailableCache;
    try {
        execSync("command -v gh", { stdio: "ignore" });
        ghAvailableCache = true;
    } catch {
        ghAvailableCache = false;
    }
    return ghAvailableCache;
}

const warnedRepos = new Set<string>();

function warnOnce(root: string, msg: string): void {
    if (warnedRepos.has(root)) return;
    warnedRepos.add(root);
    output.warn(msg);
}

/**
 * Return a map of branchName → merged PR metadata for the given repo.
 * Returns an empty map on any failure (no gh, no auth, no GitHub remote, etc.)
 * and warns once per repo.
 */
export function mergedPRsForRepo(root: string): Map<string, MergedPR> {
    const result = new Map<string, MergedPR>();
    if (!isGhAvailable()) {
        warnOnce(root, "gh CLI not found — skipping PR lookup. Install: https://cli.github.com");
        return result;
    }

    let raw: string;
    try {
        raw = execFileSync(
            "gh",
            ["pr", "list", "--state", "merged", "--limit", "200", "--json", "number,title,headRefName,mergedAt"],
            { cwd: bareDir(root), encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
        );
    } catch (err) {
        const stderr = (err as { stderr?: Buffer | string }).stderr?.toString() ?? "";
        if (stderr.includes("authentication") || stderr.includes("gh auth login")) {
            warnOnce(root, "gh not authenticated — run 'gh auth login'. Skipping PR lookup.");
        } else if (stderr.includes("no GitHub") || stderr.includes("Could not resolve")) {
            warnOnce(root, `No GitHub remote for ${root} — skipping PR lookup.`);
        } else {
            warnOnce(root, `gh pr list failed for ${root}: ${stderr.split("\n")[0] || (err as Error).message}`);
        }
        return result;
    }

    let parsed: Array<{ number: number; title: string; headRefName: string; mergedAt: string }>;
    try {
        parsed = JSON.parse(raw);
    } catch {
        warnOnce(root, `Could not parse gh output for ${root}`);
        return result;
    }

    for (const pr of parsed) {
        // If a branch was used for multiple PRs, prefer the most recently merged one.
        const existing = result.get(pr.headRefName);
        if (!existing || existing.mergedAt < pr.mergedAt) {
            result.set(pr.headRefName, { number: pr.number, title: pr.title, mergedAt: pr.mergedAt });
        }
    }
    return result;
}

/**
 * Reset memoization. Test-only.
 */
export function _resetGhCache(): void {
    ghAvailableCache = undefined;
    warnedRepos.clear();
}
