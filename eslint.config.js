import eslint from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

export default tseslint.config(
    { ignores: ["dist/**", "node_modules/**", "reports/**"] },
    eslint.configs.recommended,
    tseslint.configs.eslintRecommended,
    ...tseslint.configs.recommended,
    prettierConfig,
    {
        plugins: {
            unicorn: eslintPluginUnicorn,
        },
        rules: {
            "@typescript-eslint/no-require-imports": "error",
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    ignoreRestSiblings: true,
                },
            ],
            "unicorn/filename-case": [
                "error",
                {
                    case: "kebabCase",
                },
            ],
        },
    },
);
