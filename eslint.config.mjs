import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Build output, the standalone template scaffold (its own project), and deps are not ours to lint.
    ignores: ["dist", "release", "template", "node_modules"]
  },
  {
    // The renderer (React) source. tsc already covers type errors via `npm run build`; ESLint adds
    // the things tsc does not check — notably the React Hooks rules, the original reason for wiring
    // this up (exhaustive-deps had been silenced with disable comments that nothing enforced).
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.browser
    },
    plugins: {
      "react-hooks": reactHooks
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error"
    }
  }
);
