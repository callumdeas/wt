import type { WorktreeEntry } from "../../src/lib/git.js";
import { groupWorktrees } from "../../src/lib/groups.js";

function entry(branch: string): WorktreeEntry {
    return { path: `/repo/${branch.replace("/", "-")}`, branch, dirname: branch.replace("/", "-") };
}

describe("groupWorktrees", () => {
    it("returns hasGroups=false when no prefix has 2+ entries", () => {
        const entries = [entry("main"), entry("feat/thing1"), entry("fix/auth")];
        const { hasGroups } = groupWorktrees(entries);
        expect(hasGroups).toBe(false);
    });

    it("returns hasGroups=true when a prefix has 2+ entries", () => {
        const entries = [entry("main"), entry("feat/thing1"), entry("feat/thing2")];
        const { hasGroups } = groupWorktrees(entries);
        expect(hasGroups).toBe(true);
    });

    it("groups entries by branch prefix", () => {
        const entries = [entry("main"), entry("feat/thing1"), entry("feat/thing2"), entry("fix/auth")];
        const { byKey } = groupWorktrees(entries);
        expect(byKey.get("")?.map((e) => e.branch)).toEqual(["main"]);
        expect(byKey.get("feat")?.map((e) => e.branch)).toEqual(["feat/thing1", "feat/thing2"]);
        expect(byKey.get("fix")?.map((e) => e.branch)).toEqual(["fix/auth"]);
    });

    it("puts ungrouped entries first in order", () => {
        const entries = [entry("feat/a"), entry("feat/b"), entry("main")];
        const { order } = groupWorktrees(entries);
        expect(order[0]).toBe("");
        expect(order[1]).toBe("feat");
    });

    it("sorts prefix groups alphabetically", () => {
        const entries = [entry("zz/a"), entry("zz/b"), entry("aa/x"), entry("aa/y")];
        const { order } = groupWorktrees(entries);
        expect(order).toEqual(["aa", "zz"]);
    });

    it("handles all entries having the same prefix", () => {
        const entries = [entry("feat/a"), entry("feat/b"), entry("feat/c")];
        const { order, byKey, hasGroups } = groupWorktrees(entries);
        expect(hasGroups).toBe(true);
        expect(order).toEqual(["feat"]);
        expect(byKey.get("feat")?.length).toBe(3);
    });

    it("handles empty input", () => {
        const { order, hasGroups } = groupWorktrees([]);
        expect(order).toEqual([]);
        expect(hasGroups).toBe(false);
    });
});
