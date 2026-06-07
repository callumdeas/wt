import { cursorHide } from "@inquirer/ansi";
import {
    createPrompt,
    isBackspaceKey,
    isDownKey,
    isEnterKey,
    isTabKey,
    isUpKey,
    useKeypress,
    useMemo,
    usePagination,
    usePrefix,
    useState,
} from "@inquirer/core";
import { pc } from "./output.js";
import type { RegistryEntry } from "./registry.js";

export interface WorktreeChoice {
    value: string;
    name: string;
    disabled?: boolean;
    /** True for group header rows (collapsible separators, not selectable as worktrees) */
    isGroupHeader?: boolean;
    /** Group prefix this item belongs to, or the header's own key */
    groupKey?: string;
    /** Number of items in the group — only set on group headers */
    groupCount?: number;
}

/**
 * Mutable ref shared with the caller's escape listener so it can decide
 * whether escape should abort the prompt or be handled internally
 * (e.g. to exit filter mode).
 */
export interface FilterModeRef {
    current: boolean;
}

export interface CrossRepoSelectConfig {
    repos: RegistryEntry[];
    worktreesByRepo: WorktreeChoice[][];
    initialRepoIdx: number;
    pageSize?: number;
    message?: string;
    actionLabel?: string;
    filterModeRef?: FilterModeRef;
}

const _crossRepoSelect = createPrompt<string, CrossRepoSelectConfig>((config, done) => {
    const { pageSize = 10, message = "📂 Select worktree:", actionLabel = "select" } = config;
    const [status, setStatus] = useState<"idle" | "done">("idle");
    const [repoIdx, setRepoIdx] = useState(config.initialRepoIdx);
    const [collapsed, setCollapsed] = useState<string[]>([]);

    const [filter, setFilter] = useState("");
    const [filterMode, setFilterMode] = useState(false);

    if (config.filterModeRef) config.filterModeRef.current = filterMode;

    const visibleIndices = useMemo(() => {
        if (!filter) return config.repos.map((_, i) => i);
        const lower = filter.toLowerCase();
        return config.repos.map((_, i) => i).filter((i) => config.repos[i]!.name.toLowerCase().includes(lower));
    }, [filter]);

    // Compute visible items for the current repo, respecting collapsed groups.
    const visibleItems = useMemo(() => {
        const all = config.worktreesByRepo[repoIdx] ?? [];
        if (collapsed.length === 0) return all;
        const cset = new Set(collapsed);
        return all.filter((item) => item.isGroupHeader || !item.groupKey || !cset.has(item.groupKey));
    }, [repoIdx, collapsed]);

    const isSelectable = (item: WorktreeChoice) => !item.disabled && !item.isGroupHeader;

    const firstSelectable = (list: WorktreeChoice[]) => Math.max(0, list.findIndex(isSelectable));
    const prevSelectable = (list: WorktreeChoice[], from: number) => {
        for (let i = from - 1; i >= 0; i--) if (!list[i]?.disabled) return i;
        return from;
    };
    const nextSelectable = (list: WorktreeChoice[], from: number) => {
        for (let i = from + 1; i < list.length; i++) if (!list[i]?.disabled) return i;
        return from;
    };

    const [active, setActive] = useState(firstSelectable(visibleItems));

    const prefix = usePrefix({ status });

    const toggleGroup = (groupKey: string) => {
        const isCollapsing = !collapsed.includes(groupKey);
        const newCollapsed = isCollapsing ? [...collapsed, groupKey] : collapsed.filter((k) => k !== groupKey);

        // Compute what visibleItems will look like after the state update.
        const all = config.worktreesByRepo[repoIdx] ?? [];
        const cset = new Set(newCollapsed);
        const newVisible =
            newCollapsed.length === 0
                ? all
                : all.filter((item) => item.isGroupHeader || !item.groupKey || !cset.has(item.groupKey));

        // Remap active to the same logical item in the new visible list.
        const currentItem = visibleItems[active];
        let newActive = active;
        if (currentItem) {
            const sameIdx = newVisible.findIndex(
                (i) => i.value === currentItem.value && i.isGroupHeader === currentItem.isGroupHeader,
            );
            if (sameIdx !== -1) {
                newActive = sameIdx;
            } else {
                // Active item was just hidden — move cursor to its group header.
                const headerIdx = newVisible.findIndex((i) => i.isGroupHeader && i.groupKey === groupKey);
                newActive = headerIdx !== -1 ? headerIdx : firstSelectable(newVisible);
            }
        }

        setCollapsed(newCollapsed);
        setActive(newActive);
    };

    const ensureActiveVisible = (newFilter: string) => {
        const lower = newFilter.toLowerCase();
        const matches = newFilter
            ? config.repos.map((_, i) => i).filter((i) => config.repos[i]!.name.toLowerCase().includes(lower))
            : config.repos.map((_, i) => i);
        if (matches.length === 0) return;
        if (matches.includes(repoIdx)) return;
        const newIdx = matches[0]!;
        setRepoIdx(newIdx);
        setActive(firstSelectable(config.worktreesByRepo[newIdx] ?? []));
    };

    useKeypress((key, rl) => {
        if (status !== "idle") return;

        const fullKey = key as { name: string; ctrl: boolean; shift?: boolean; sequence?: string };
        const shiftKey = fullKey.shift;

        if (filterMode) {
            if (isEnterKey(key)) {
                setFilterMode(false);
                return;
            }
            if (key.name === "escape") {
                setFilter("");
                setFilterMode(false);
                ensureActiveVisible("");
                return;
            }
            if (isBackspaceKey(key)) {
                rl.clearLine(0);
                const next = filter.slice(0, -1);
                setFilter(next);
                ensureActiveVisible(next);
                return;
            }
            const ch = fullKey.sequence;
            if (ch && ch.length === 1 && ch >= " " && ch <= "~") {
                rl.clearLine(0);
                const next = filter + ch;
                setFilter(next);
                ensureActiveVisible(next);
                return;
            }
            return;
        }

        if (isEnterKey(key)) {
            const selected = visibleItems[active];
            if (selected?.isGroupHeader && selected.groupKey) {
                toggleGroup(selected.groupKey);
            } else if (selected && isSelectable(selected)) {
                setStatus("done");
                done(selected.value);
            }
        } else if (fullKey.sequence === "/" || key.name === "slash") {
            setFilterMode(true);
        } else if (isTabKey(key)) {
            if (visibleIndices.length === 0) return;
            const currentVisiblePos = visibleIndices.indexOf(repoIdx);
            const basePos = currentVisiblePos === -1 ? 0 : currentVisiblePos;
            const delta = shiftKey ? -1 : 1;
            const newVisiblePos = (basePos + delta + visibleIndices.length) % visibleIndices.length;
            const newIdx = visibleIndices[newVisiblePos]!;
            const newItems = config.worktreesByRepo[newIdx] ?? [];
            setRepoIdx(newIdx);
            setActive(firstSelectable(newItems));
        } else if (isUpKey(key)) {
            rl.clearLine(0);
            setActive(prevSelectable(visibleItems, active));
        } else if (isDownKey(key)) {
            rl.clearLine(0);
            setActive(nextSelectable(visibleItems, active));
        }
    });

    if (status === "done") {
        return `${prefix} ${pc.bold(message)} ${pc.cyan(visibleItems[active]?.name ?? "")}`;
    }

    const showTabBar = config.repos.length > 1;
    const termWidth = (process.stderr as { columns?: number }).columns ?? 80;
    const tabBarLine = showTabBar
        ? buildTabBar({
              repos: config.repos,
              activeIdx: repoIdx,
              visibleIndices,
              termWidth,
              filter,
              filterMode,
          })
        : null;

    const separatorLine = showTabBar ? pc.dim("  " + "─".repeat(44)) : null;

    const page = usePagination({
        items: visibleItems,
        active,
        renderItem({ item, isActive }) {
            if (item.isGroupHeader) {
                const isCollapsed = item.groupKey ? collapsed.includes(item.groupKey) : false;
                const indicator = isCollapsed ? "▶" : "▼";
                const countStr = item.groupCount !== undefined ? pc.dim(` (${item.groupCount})`) : "";
                const label = `${indicator} ${item.name}${countStr}`;
                const cursor = isActive ? pc.cyan("❯") : " ";
                return `${cursor} ${isActive ? pc.bold(pc.cyan(label)) : pc.dim(label)}`;
            }
            if (item.disabled) {
                return `  ${pc.dim(`🔒 ${item.name}`)}`;
            }
            const cursor = isActive ? pc.cyan("❯") : " ";
            const name = isActive ? pc.bold(item.name) : item.name;
            return `${cursor} ${name}`;
        },
        pageSize,
        loop: false,
    });

    const hasGroups = visibleItems.some((i) => i.isGroupHeader);
    const helpLine = pc.dim(
        filterMode
            ? `type to filter • ↵ apply • esc clear`
            : hasGroups
              ? `↑↓ navigate • ↵ ${actionLabel}/expand • tab repo • / filter • esc cancel`
              : `↑↓ navigate • ↵ ${actionLabel} • tab repo • / filter • esc cancel`,
    );

    return (
        [tabBarLine, separatorLine, `${prefix} ${pc.bold(message)}`, page, " ", helpLine].filter(Boolean).join("\n") +
        cursorHide
    );
});

interface BuildTabBarArgs {
    repos: RegistryEntry[];
    activeIdx: number;
    visibleIndices: number[];
    termWidth: number;
    filter: string;
    filterMode: boolean;
}

/**
 * Render a single-line tab bar that fits within `termWidth`, centered on the
 * active repo. Truncated sides are marked with `…`. When a filter is active,
 * the matching subset is shown and a filter indicator is appended.
 *
 * Exported for unit tests.
 */
export function buildTabBar(args: BuildTabBarArgs): string {
    const { repos, activeIdx, visibleIndices, termWidth, filter, filterMode } = args;

    // Plain widths used for budgeting; coloring is applied separately.
    const filterRaw = filterMode ? `  /${filter}_` : filter ? `  /${filter}` : `  (tab • / filter)`;
    const filterDecorated = filterMode
        ? `  ${pc.cyan(`/${filter}_`)}`
        : filter
          ? `  ${pc.dim(`/${filter}`)}`
          : `  ${pc.dim("(tab • / filter)")}`;

    const margin = 2; // leading "  "
    const available = Math.max(20, termWidth - margin - filterRaw.length);

    if (visibleIndices.length === 0) {
        return "  " + pc.dim("(no matches)") + filterDecorated;
    }

    interface Token {
        width: number;
        colored: string;
    }
    const tokens: Token[] = visibleIndices.map((i) => {
        const r = repos[i]!;
        const isActive = i === activeIdx;
        if (isActive) {
            const raw = `[ ${r.name} ]`;
            return { width: raw.length, colored: pc.bold(pc.cyan(raw)) };
        }
        return { width: r.name.length, colored: pc.dim(r.name) };
    });

    let activePos = visibleIndices.indexOf(activeIdx);
    if (activePos === -1) activePos = 0;

    const SEP_WIDTH = 2; // "  " between tokens
    const ELLIPSIS_WIDTH = 1;

    let leftMost = activePos;
    let rightMost = activePos;
    let usedWidth = tokens[activePos]!.width;

    const ellWidth = (cond: boolean) => (cond ? ELLIPSIS_WIDTH + SEP_WIDTH : 0);

    let lastDir: "L" | "R" = "L"; // start by trying right
    while (true) {
        const canL = leftMost > 0;
        const canR = rightMost < tokens.length - 1;
        if (!canL && !canR) break;

        // Alternate direction to keep the active token centered when possible.
        const order: ("L" | "R")[] = lastDir === "L" ? ["R", "L"] : ["L", "R"];

        let expanded = false;
        for (const dir of order) {
            if (dir === "R" && canR) {
                const nextTok = tokens[rightMost + 1]!;
                const projected =
                    usedWidth +
                    SEP_WIDTH +
                    nextTok.width +
                    ellWidth(leftMost > 0) +
                    ellWidth(rightMost + 1 < tokens.length - 1);
                if (projected <= available) {
                    rightMost++;
                    usedWidth += SEP_WIDTH + nextTok.width;
                    lastDir = "R";
                    expanded = true;
                    break;
                }
            }
            if (dir === "L" && canL) {
                const prevTok = tokens[leftMost - 1]!;
                const projected =
                    usedWidth +
                    SEP_WIDTH +
                    prevTok.width +
                    ellWidth(leftMost - 1 > 0) +
                    ellWidth(rightMost < tokens.length - 1);
                if (projected <= available) {
                    leftMost--;
                    usedWidth += SEP_WIDTH + prevTok.width;
                    lastDir = "L";
                    expanded = true;
                    break;
                }
            }
        }
        if (!expanded) break;
    }

    const parts: string[] = [];
    if (leftMost > 0) parts.push(pc.dim("…"));
    for (let i = leftMost; i <= rightMost; i++) parts.push(tokens[i]!.colored);
    if (rightMost < tokens.length - 1) parts.push(pc.dim("…"));

    return "  " + parts.join("  ") + filterDecorated;
}

/**
 * Cross-repo worktree selector with Tab-cycling between repos.
 * The tab bar is a fixed, width-aware header above the scrollable worktree list.
 * `/` enters a filter mode that narrows the visible repos by name substring.
 * Escape is handled by passing an AbortSignal via context — callers should
 * skip aborting while `config.filterModeRef.current` is true so escape can be
 * used to clear the filter without cancelling the whole prompt.
 *
 * When group headers are present (items with `isGroupHeader: true`), pressing
 * Enter on a header collapses or expands that group. Navigation (↑↓) can land
 * on group headers; Enter on a regular item still selects it.
 */
export async function crossRepoSelect(
    config: CrossRepoSelectConfig,
    context?: { output?: NodeJS.WritableStream; signal?: AbortSignal },
): Promise<string> {
    return _crossRepoSelect(config, context);
}
