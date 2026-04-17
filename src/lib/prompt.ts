/**
 * Thin wrappers around @inquirer/prompts that add Escape-key cancellation.
 *
 * Every prompt gets an AbortSignal injected into its context. When the user
 * presses Escape, the signal fires and the prompt rejects with AbortPromptError,
 * which the top-level handler in cli.ts catches for a clean exit.
 */

import { checkbox as _checkbox, confirm as _confirm, input as _input, select as _select } from "@inquirer/prompts";
import type { Context } from "@inquirer/type";

type PromptFn<Config, Value> = (config: Config, context?: Context) => Promise<Value>;

function withEscape<Config, Value>(fn: PromptFn<Config, Value>): PromptFn<Config, Value> {
    return (config: Config, context?: Context) => {
        const controller = new AbortController();

        const onKeypress = (_ch: string, key: { name: string }) => {
            if (key?.name === "escape") {
                controller.abort();
            }
        };

        process.stdin.on("keypress", onKeypress);

        return fn(config, { ...context, signal: controller.signal }).finally(() => {
            process.stdin.removeListener("keypress", onKeypress);
        });
    };
}

export const checkbox = withEscape(_checkbox) as typeof _checkbox;
export const select = withEscape(_select) as typeof _select;
export const confirm = withEscape(_confirm) as typeof _confirm;
export const input = withEscape(_input) as typeof _input;
