import { cursorHide } from "@inquirer/ansi";
import {
    createPrompt,
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

interface WorktreeChoice {
    value: string;
    name: string;
}

export interface CrossRepoSelectConfig {
    repos: RegistryEntry[];
    worktreesByRepo: WorktreeChoice[][];
    initialRepoIdx: number;
    pageSize?: number;
}

const _crossRepoSelect = createPrompt<string, CrossRepoSelectConfig>((config, done) => {
    const { pageSize = 10 } = config;
    const [status, setStatus] = useState<"idle" | "done">("idle");
    const [repoIdx, setRepoIdx] = useState(config.initialRepoIdx);
    const [active, setActive] = useState(0);

    const items = useMemo(() => config.worktreesByRepo[repoIdx] ?? [], [repoIdx]);

    const prefix = usePrefix({ status });

    useKeypress((key, rl) => {
        if (status !== "idle") return;

        // KeypressEvent only declares name+ctrl; readline also sets shift for Shift+Tab
        const shiftKey = (key as { name: string; ctrl: boolean; shift?: boolean }).shift;

        if (isEnterKey(key)) {
            const selected = items[active];
            if (selected) {
                setStatus("done");
                done(selected.value);
            }
        } else if (isTabKey(key)) {
            const delta = shiftKey ? -1 : 1;
            const newIdx = (repoIdx + delta + config.repos.length) % config.repos.length;
            setRepoIdx(newIdx);
            setActive(0);
        } else if (isUpKey(key)) {
            rl.clearLine(0);
            setActive(Math.max(0, active - 1));
        } else if (isDownKey(key)) {
            rl.clearLine(0);
            setActive(Math.min(items.length - 1, active + 1));
        }
    });

    if (status === "done") {
        return `${prefix} ${pc.bold("📂 Select worktree:")} ${pc.cyan(items[active]?.name ?? "")}`;
    }

    // Tab bar — rendered as fixed header outside the paginated section
    const showTabBar = config.repos.length > 1;
    const tabBarLine = showTabBar
        ? "  " +
          config.repos.map((r, i) => (i === repoIdx ? pc.bold(pc.cyan(`[ ${r.name} ]`)) : pc.dim(r.name))).join("  ") +
          "  " +
          pc.dim("(tab/shift-tab)")
        : null;

    const separatorLine = showTabBar ? pc.dim("  " + "─".repeat(44)) : null;

    const page = usePagination({
        items,
        active,
        renderItem({ item, isActive }) {
            const cursor = isActive ? pc.cyan("❯") : " ";
            const name = isActive ? pc.bold(item.name) : item.name;
            return `${cursor} ${name}`;
        },
        pageSize,
        loop: false,
    });

    const helpLine = pc.dim("↑↓ navigate • ↵ select • esc cancel");

    return (
        [tabBarLine, separatorLine, `${prefix} ${pc.bold("📂 Select worktree:")}`, page, " ", helpLine]
            .filter(Boolean)
            .join("\n") + cursorHide
    );
});

/**
 * Cross-repo worktree selector with Tab-cycling between repos.
 * The tab bar is a fixed header above the scrollable worktree list.
 * Escape is handled by passing an AbortSignal via context.
 */
export async function crossRepoSelect(
    config: CrossRepoSelectConfig,
    context?: { output?: NodeJS.WritableStream; signal?: AbortSignal },
): Promise<string> {
    return _crossRepoSelect(config, context);
}
