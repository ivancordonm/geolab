import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "coverage", "node_modules", "*.tsbuildinfo"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      react.configs.flat.recommended,
      react.configs.flat["jsx-runtime"],
    ],
    languageOptions: {
      globals: globals.browser,
    },
    settings: {
      react: { version: "detect" },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // react-three-fiber declares 3D scene props (geometry, transparent, side,
    // args, position, …) as intrinsic JSX attributes that eslint-plugin-react
    // does not know about. Disable the DOM-oriented unknown-property check for
    // the r3f scene components only.
    files: ["src/components/polyhedra/**/*.tsx"],
    rules: {
      "react/no-unknown-property": "off",
    },
  },
);
