import { buildTabBar } from "../../src/lib/cross-repo-select.js";
import type { RegistryEntry } from "../../src/lib/registry.js";

const ESC = String.fromCharCode(27);
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
const stripAnsi = (s: string): string => s.replace(ANSI_RE, "");

const makeRepos = (names: string[]): RegistryEntry[] =>
    names.map((name) => ({ name, path: `/tmp/${name}`, addedAt: "" }));

const visibleAll = (n: number): number[] => [...Array.from({ length: n }, (_, i) => i)];

describe("buildTabBar", () => {
    it("renders all repos when they comfortably fit", () => {
        const repos = makeRepos(["alpha", "beta", "gamma"]);
        const out = stripAnsi(
            buildTabBar({
                repos,
                activeIdx: 1,
                visibleIndices: visibleAll(3),
                termWidth: 200,
                filter: "",
                filterMode: false,
            }),
        );
        expect(out).toContain("alpha");
        expect(out).toContain("[ beta ]");
        expect(out).toContain("gamma");
        expect(out).not.toContain("…");
    });

    it("centers the active repo and adds ellipses on both sides when overflowing", () => {
        const repos = makeRepos([
            "web-app",
            "ml-pipeline",
            "futures",
            "docs-hub-with-a-longish-name",
            "cms-studio-with-a-longish-name",
            "backend-services",
            "mobile-app",
        ]);
        const out = stripAnsi(
            buildTabBar({
                repos,
                activeIdx: 3,
                visibleIndices: visibleAll(repos.length),
                termWidth: 80,
                filter: "",
                filterMode: false,
            }),
        );
        // Active token must be present, surrounded by ellipses on both sides.
        expect(out).toContain("[ docs-hub-with-a-longish-name ]");
        const before = out.split("[ docs-hub-with-a-longish-name ]")[0]!;
        const after = out.split("[ docs-hub-with-a-longish-name ]")[1]!;
        expect(before).toContain("…");
        expect(after).toContain("…");
        // Output must not exceed the terminal width.
        expect(out.length).toBeLessThanOrEqual(80);
    });

    it("never wraps mid-token (output stays within termWidth)", () => {
        const repos = makeRepos(
            "web-app ml-pipeline futures docs-hub cms-studio backend-services mobile-app web-frontend data-pipeline bff".split(
                " ",
            ),
        );
        for (let activeIdx = 0; activeIdx < repos.length; activeIdx++) {
            const out = stripAnsi(
                buildTabBar({
                    repos,
                    activeIdx,
                    visibleIndices: visibleAll(repos.length),
                    termWidth: 100,
                    filter: "",
                    filterMode: false,
                }),
            );
            expect(out.length).toBeLessThanOrEqual(100);
        }
    });

    it("omits left ellipsis when active is the first repo", () => {
        const repos = makeRepos([
            "docs-hub-with-a-longish-name",
            "cms-studio-with-a-longish-name",
            "backend-services",
            "mobile-app",
        ]);
        const out = stripAnsi(
            buildTabBar({
                repos,
                activeIdx: 0,
                visibleIndices: visibleAll(repos.length),
                termWidth: 60,
                filter: "",
                filterMode: false,
            }),
        );
        // Active is leftmost — only the right side should be truncated.
        const beforeActive = out.split("[ docs-hub-with-a-longish-name ]")[0]!;
        expect(beforeActive).not.toContain("…");
    });

    it("renders only filtered repos and shows the filter buffer when filtering", () => {
        const repos = makeRepos(["web-app", "ml-pipeline", "futures", "web-frontend"]);
        const out = stripAnsi(
            buildTabBar({
                repos,
                activeIdx: 0,
                visibleIndices: [0, 3], // both start with "web"
                termWidth: 120,
                filter: "web",
                filterMode: true,
            }),
        );
        expect(out).toContain("[ web-app ]");
        expect(out).toContain("web-frontend");
        expect(out).not.toContain("ml-pipeline");
        expect(out).not.toContain("futures");
        expect(out).toContain("/web_"); // active filter cursor indicator
    });

    it("shows a no-matches indicator when filter excludes everything", () => {
        const repos = makeRepos(["alpha", "beta"]);
        const out = stripAnsi(
            buildTabBar({
                repos,
                activeIdx: 0,
                visibleIndices: [],
                termWidth: 80,
                filter: "zzz",
                filterMode: true,
            }),
        );
        expect(out).toContain("(no matches)");
        expect(out).toContain("/zzz_");
    });

    it("falls back gracefully when termWidth is very small", () => {
        const repos = makeRepos(["alpha", "beta", "gamma"]);
        const out = stripAnsi(
            buildTabBar({
                repos,
                activeIdx: 1,
                visibleIndices: visibleAll(3),
                termWidth: 10,
                filter: "",
                filterMode: false,
            }),
        );
        // Should still render the active token even at minimum width.
        expect(out).toContain("[ beta ]");
    });
});
