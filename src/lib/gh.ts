import { execFileSync, execSync } from "node:child_process";
import { bareDir } from "./git.js";
import * as output from "./output.js";

export interface MergedPR {
    number: number;
    title: string;
    mergedAt: string;
}

/**
 * Hard cap on how long a single `gh` call may block. The calls are synchronous
 * (execFileSync), so without this the CLI's event loop — and any spinner —
 * freezes for as long as gh takes. gh can be slow or stall on network/auth, so
 * we bound it and treat a timeout as a soft failure.
 */
const GH_TIMEOUT_MS = 8000;

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

/** Classify a failed gh invocation and warn once per repo with a useful message. */
function warnGhFailure(root: string, context: string, err: unknown): void {
    const e = err as { stderr?: Buffer | string; signal?: string; code?: string };
    const stderr = e.stderr?.toString() ?? "";
    if (e.signal === "SIGTERM" || e.code === "ETIMEDOUT") {
        warnOnce(root, `gh timed out for ${root} — skipping PR lookup.`);
    } else if (stderr.includes("authentication") || stderr.includes("gh auth login")) {
        warnOnce(root, "gh not authenticated — run 'gh auth login'. Skipping PR lookup.");
    } else if (
        stderr.includes("no GitHub") ||
        stderr.includes("Could not resolve") ||
        stderr.includes("none of the git remotes")
    ) {
        warnOnce(root, `No GitHub remote for ${root} — skipping PR lookup.`);
    } else {
        warnOnce(root, `${context} failed for ${root}: ${stderr.split("\n")[0] || (err as Error).message}`);
    }
}

/** Resolve "owner/name" for a repo via gh, or null on any failure (warns once). */
function nameWithOwner(root: string): { owner: string; name: string } | null {
    let raw: string;
    try {
        raw = execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
            cwd: bareDir(root),
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: GH_TIMEOUT_MS,
        }).trim();
    } catch (err) {
        warnGhFailure(root, "gh repo view", err);
        return null;
    }
    const slash = raw.indexOf("/");
    if (slash < 0) {
        warnOnce(root, `Could not resolve GitHub repo for ${root} — skipping PR lookup.`);
        return null;
    }
    return { owner: raw.slice(0, slash), name: raw.slice(slash + 1) };
}

interface GraphQLResponse {
    data?: {
        repository?: Record<
            string,
            { nodes: Array<{ number: number; title: string; mergedAt: string | null }> }
        > | null;
    };
}

/**
 * Return a map of branchName → merged PR metadata, querying only the given
 * branches in a single GraphQL round trip (one aliased `pullRequests` field per
 * branch). Cost scales with the number of branches you ask about, not with the
 * repo's total PR count. Returns an empty map on any failure (no gh, no auth,
 * no GitHub remote, etc.) and warns once per repo.
 */
export function mergedPRsForBranches(root: string, branches: string[]): Map<string, MergedPR> {
    const result = new Map<string, MergedPR>();
    if (branches.length === 0) return result;
    if (!isGhAvailable()) {
        warnOnce(root, "gh CLI not found — skipping PR lookup. Install: https://cli.github.com");
        return result;
    }

    const repo = nameWithOwner(root);
    if (!repo) return result;

    // Build an aliased query: one `pullRequests(headRefName: $bN)` field per
    // branch. Branch names are passed as GraphQL variables (never interpolated
    // into the query text) so names containing quotes or other special
    // characters can't break or inject into the query.
    const varDecls = ["$owner: String!", "$name: String!", ...branches.map((_, i) => `$b${i}: String!`)].join(", ");
    const fields = branches
        .map(
            (_, i) =>
                `b${i}: pullRequests(headRefName: $b${i}, states: MERGED, first: 1, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes { number title mergedAt } }`,
        )
        .join("\n");
    const query = `query(${varDecls}) { repository(owner: $owner, name: $name) { ${fields} } }`;

    const args = ["api", "graphql", "-f", `query=${query}`, "-f", `owner=${repo.owner}`, "-f", `name=${repo.name}`];
    branches.forEach((branch, i) => args.push("-f", `b${i}=${branch}`));

    let raw: string;
    try {
        raw = execFileSync("gh", args, {
            cwd: bareDir(root),
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: GH_TIMEOUT_MS,
        });
    } catch (err) {
        warnGhFailure(root, "gh api graphql", err);
        return result;
    }

    let parsed: GraphQLResponse;
    try {
        parsed = JSON.parse(raw);
    } catch {
        warnOnce(root, `Could not parse gh output for ${root}`);
        return result;
    }

    const repository = parsed.data?.repository;
    if (!repository) return result;
    branches.forEach((branch, i) => {
        const node = repository[`b${i}`]?.nodes?.[0];
        if (node && node.mergedAt) {
            result.set(branch, { number: node.number, title: node.title, mergedAt: node.mergedAt });
        }
    });
    return result;
}

/**
 * Reset memoization. Test-only.
 */
export function _resetGhCache(): void {
    ghAvailableCache = undefined;
    warnedRepos.clear();
}
