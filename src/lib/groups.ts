import type { WorktreeEntry } from "./git.js";

export interface WorktreeGroupMap {
    /** Group keys in display order; empty string = ungrouped/single-prefix items */
    order: string[];
    /** Map from group key to its entries */
    byKey: Map<string, WorktreeEntry[]>;
    /** True when at least one prefix has 2+ entries (real group exists) */
    hasGroups: boolean;
}

export function groupWorktrees(entries: WorktreeEntry[]): WorktreeGroupMap {
    const byKey = new Map<string, WorktreeEntry[]>();

    for (const entry of entries) {
        const slash = entry.branch.indexOf("/");
        const key = slash === -1 ? "" : entry.branch.slice(0, slash);
        const list = byKey.get(key) ?? [];
        list.push(entry);
        byKey.set(key, list);
    }

    const order: string[] = [];
    let hasGroups = false;

    // Ungrouped (no slash) first
    if (byKey.has("")) order.push("");

    // Prefixed entries sorted alphabetically
    const prefixes = [...byKey.keys()].filter((k) => k !== "").sort();
    for (const prefix of prefixes) {
        order.push(prefix);
        if ((byKey.get(prefix)?.length ?? 0) >= 2) hasGroups = true;
    }

    return { order, byKey, hasGroups };
}
